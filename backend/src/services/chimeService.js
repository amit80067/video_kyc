// Ensure root .env is loaded so AWS credentials are available to Chime SDK
const { s3 } = require('../config/aws');

const {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  GetMeetingCommand,
  CreateAttendeeCommand,
} = require('@aws-sdk/client-chime-sdk-meetings');
const {
  ChimeSDKMediaPipelinesClient,
  CreateMediaCapturePipelineCommand,
  DeleteMediaCapturePipelineCommand,
} = require('@aws-sdk/client-chime-sdk-media-pipelines');
const pool = require('../config/database');
const videoRecordingService = require('../services/videoRecordingService');

const region = process.env.AWS_REGION || 'ap-south-1';
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Chime: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set. Check .env');
}
const s3Bucket = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET || 'video-kyc1';
const chimeSinkPrefix = process.env.CHIME_RECORDING_PREFIX || 'chime-recordings';

const meetingsClient = new ChimeSDKMeetingsClient({ region });
const pipelinesClient = new ChimeSDKMediaPipelinesClient({ region });

/**
 * Get or create Chime meeting for a KYC session. Returns meeting + lets you create attendees.
 */
async function getOrCreateMeeting(sessionId) {
  const sessionRow = await pool.query(
    'SELECT id, chime_meeting_id, chime_meeting_arn FROM kyc_sessions WHERE session_id = $1',
    [sessionId]
  );
  if (sessionRow.rows.length === 0) {
    throw new Error('Session not found');
  }
  const session = sessionRow.rows[0];
  if (session.chime_meeting_id && session.chime_meeting_arn) {
    const meetingResp = await meetingsClient.send(
      new GetMeetingCommand({ MeetingId: session.chime_meeting_id })
    );
    return meetingResp.Meeting;
  }

  const externalMeetingId = `kyc-${sessionId}`;
  const createCmd = new CreateMeetingCommand({
    ClientRequestToken: `create-${sessionId}-${Date.now()}`,
    ExternalMeetingId: externalMeetingId,
    MediaRegion: region,
    MeetingHostId: `session-${session.id}`,
  });
  const { Meeting } = await meetingsClient.send(createCmd);
  if (!Meeting?.MeetingId) {
    throw new Error('Failed to create Chime meeting');
  }

  await pool.query(
    `UPDATE kyc_sessions SET chime_meeting_id = $1, chime_meeting_arn = $2, updated_at = NOW() WHERE session_id = $3`,
    [Meeting.MeetingId, Meeting.MeetingArn, sessionId]
  );
  return Meeting;
}

/**
 * Create an attendee for the session's Chime meeting. role = 'user' | 'investigator'
 */
async function createAttendee(sessionId, role) {
  const meeting = await getOrCreateMeeting(sessionId);
  const externalUserId = `${role}-${sessionId}-${Date.now()}`;
  const createAttendeeCmd = new CreateAttendeeCommand({
    MeetingId: meeting.MeetingId,
    ExternalUserId: externalUserId,
    Capabilities: {
      Audio: 'SendReceive',
      Video: 'SendReceive',
      Content: 'SendReceive',
    },
  });
  const { Attendee } = await meetingsClient.send(createAttendeeCmd);
  if (!Attendee?.AttendeeId || !Attendee?.JoinToken) {
    throw new Error('Failed to create Chime attendee');
  }
  return {
    AttendeeId: Attendee.AttendeeId,
    JoinToken: Attendee.JoinToken,
    ExternalUserId: Attendee.ExternalUserId,
    Meeting: meeting,
  };
}

/**
 * Start server-side recording (media capture pipeline) for the session's meeting. Output goes to S3.
 */
async function startRecording(sessionId) {
  const sessionRow = await pool.query(
    'SELECT id, chime_meeting_id, chime_meeting_arn, chime_media_pipeline_id FROM kyc_sessions WHERE session_id = $1',
    [sessionId]
  );
  if (sessionRow.rows.length === 0) throw new Error('Session not found');
  const session = sessionRow.rows[0];
  if (!session.chime_meeting_arn) throw new Error('No Chime meeting for this session');
  if (session.chime_media_pipeline_id) {
    return { MediaPipelineId: session.chime_media_pipeline_id, alreadyRunning: true };
  }

  const sinkArn = `arn:aws:s3:::${s3Bucket}`;
  const createPipelineCmd = new CreateMediaCapturePipelineCommand({
    SourceType: 'ChimeSdkMeeting',
    SourceArn: session.chime_meeting_arn,
    SinkType: 'S3Bucket',
    SinkArn: sinkArn,
    ClientRequestToken: `record-${sessionId}-${Date.now()}`.slice(0, 64),
    ChimeSdkMeetingConfiguration: {
      ArtifactsConfiguration: {
        // Audio mixed with composited video
        Audio: { MuxType: 'AudioWithCompositedVideo' },
        // Per AWS docs: when using CompositedVideo, Video and Content must be DISABLED
        Video: { State: 'Disabled' },
        Content: { State: 'Disabled' },
        CompositedVideo: {
          State: 'Enabled',
          Layout: 'GridView',
          Resolution: 'HD',
          GridViewConfiguration: {
            ContentShareLayout: 'PresenterOnly',
            PresenterOnlyConfiguration: { PresenterPosition: 'TopRight' },
          },
        },
      },
    },
  });
  const { MediaCapturePipeline } = await pipelinesClient.send(createPipelineCmd);
  if (!MediaCapturePipeline?.MediaPipelineId) {
    throw new Error('Failed to create Chime media capture pipeline');
  }

  await pool.query(
    `UPDATE kyc_sessions SET chime_media_pipeline_id = $1, updated_at = NOW() WHERE session_id = $2`,
    [MediaCapturePipeline.MediaPipelineId, sessionId]
  );
  return { MediaPipelineId: MediaCapturePipeline.MediaPipelineId, alreadyRunning: false };
}

/**
 * Stop server-side recording and clear pipeline id from session.
 */
async function stopRecording(sessionId) {
  const sessionRow = await pool.query(
    'SELECT id, chime_media_pipeline_id FROM kyc_sessions WHERE session_id = $1',
    [sessionId]
  );
  if (sessionRow.rows.length === 0) throw new Error('Session not found');
  const kycSessionId = sessionRow.rows[0].id;
  const pipelineId = sessionRow.rows[0].chime_media_pipeline_id;
  if (!pipelineId) {
    return { stopped: false, message: 'No active recording' };
  }

  await pipelinesClient.send(
    new DeleteMediaCapturePipelineCommand({ MediaPipelineId: pipelineId })
  );

  try {
    // Chime may take a few seconds to flush composited video to S3 after stop. Wait and retry.
    const delayMs = (ms) => new Promise((r) => setTimeout(r, ms));
    let s3Key = null;
    let videoObject = null;
    const maxAttempts = 5;
    const attemptDelayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await delayMs(attemptDelayMs);

      // Chime media capture writes to bucket under pipelineId (no custom prefix in API).
      const prefixesToTry = [
        `${pipelineId}/`,
        `${chimeSinkPrefix}/${pipelineId}/`,
      ];
      let allContents = [];
      for (const prefix of prefixesToTry) {
        let continuationToken;
        do {
          const listResp = await s3
            .listObjectsV2({
              Bucket: s3Bucket,
              Prefix: prefix,
              MaxKeys: 500,
              ContinuationToken: continuationToken,
            })
            .promise();
          if (listResp.Contents?.length) allContents = allContents.concat(listResp.Contents);
          continuationToken = listResp.NextContinuationToken;
        } while (continuationToken);
        if (allContents.length) break;
      }

      const isPlayable = (key) => key && !key.endsWith('/') && /\.(mp4|mkv|webm)$/i.test(key);
      const compositedMp4 = allContents.find(
        (o) => o.Key && o.Key.includes('composited-video') && o.Key.toLowerCase().endsWith('.mp4')
      );
      const anyMp4 = allContents.find((o) => o.Key && o.Key.toLowerCase().endsWith('.mp4'));
      const anyVideo = allContents.find((o) => isPlayable(o.Key));
      videoObject = compositedMp4 || anyMp4 || anyVideo;
      s3Key = videoObject?.Key || null;
      if (s3Key) break;
    }

    if (!s3Key) {
      console.warn(
        'Chime stopRecording: no playable video object found under pipeline',
        pipelineId,
        '; skipping video_recordings insert.'
      );
    } else {
      const videoUrl = `s3://${s3Bucket}/${s3Key}`;
      let hasRecordingTypeColumn = false;
      try {
        const colCheck = await pool.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = 'video_recordings' AND column_name = 'recording_type'`
        );
        hasRecordingTypeColumn = colCheck.rows.length > 0;
      } catch (e) {
        // ignore
      }
      if (hasRecordingTypeColumn) {
        await pool.query(
          `INSERT INTO video_recordings 
           (session_id, video_url, s3_key, file_size_bytes, recording_type, recording_started_at, recording_ended_at)
           VALUES ($1, $2, $3, $4, 'chime', NOW(), NOW())`,
          [kycSessionId, videoUrl, s3Key, videoObject.Size ?? null]
        );
      } else {
        await pool.query(
          `INSERT INTO video_recordings 
           (session_id, video_url, s3_key, file_size_bytes, recording_started_at, recording_ended_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [kycSessionId, videoUrl, s3Key, videoObject.Size ?? null]
        );
      }
    }
  } catch (err) {
    console.error('Chime stopRecording: failed to register video_recordings row:', err);
  }

  await pool.query(
    `UPDATE kyc_sessions SET chime_media_pipeline_id = NULL, updated_at = NOW() WHERE session_id = $1`,
    [sessionId]
  );
  return { stopped: true, MediaPipelineId: pipelineId };
}

/**
 * Get meeting info for frontend (join URL, meeting, attendee token). role = 'user' | 'investigator'
 */
async function getMeetingAndAttendee(sessionId, role) {
  const { Meeting, AttendeeId, JoinToken } = await createAttendee(sessionId, role);
  return {
    Meeting: {
      MeetingId: Meeting.MeetingId,
      MediaRegion: Meeting.MediaRegion,
      MediaPlacement: Meeting.MediaPlacement,
    },
    Attendee: {
      AttendeeId,
      JoinToken,
      ExternalUserId: `${role}-${sessionId}`,
    },
  };
}

module.exports = {
  getOrCreateMeeting,
  createAttendee,
  startRecording,
  stopRecording,
  getMeetingAndAttendee,
};
