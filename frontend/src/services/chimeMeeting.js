import {
  ConsoleLogger,
  LogLevel,
  DefaultDeviceController,
  MeetingSessionConfiguration,
  DefaultMeetingSession,
} from 'amazon-chime-sdk-js';
import api from './api';

const logger = new ConsoleLogger('ChimeMeeting', LogLevel.WARN);
const deviceController = new DefaultDeviceController(logger);

/**
 * Fetch Chime meeting + attendee from backend. role = 'user' | 'investigator'
 */
export async function getChimeJoinInfo(sessionId, role = 'user') {
  const { data } = await api.get(`/chime/sessions/${sessionId}/join`, {
    params: { role },
  });
  if (!data.Meeting || !data.Attendee) {
    throw new Error('Invalid join response');
  }
  return data;
}

/**
 * Create DefaultMeetingSession from backend response. Use this session to start audio/video and bind tiles.
 */
export function createMeetingSession(Meeting, Attendee) {
  const configuration = new MeetingSessionConfiguration(Meeting, Attendee);
  return new DefaultMeetingSession(configuration, logger, deviceController);
}

/**
 * Start Chime server-side recording (call from investigator side).
 */
export async function startChimeRecording(sessionId) {
  const { data } = await api.post(`/chime/sessions/${sessionId}/recording/start`);
  return data;
}

/**
 * Stop Chime server-side recording.
 */
export async function stopChimeRecording(sessionId) {
  const { data } = await api.post(`/chime/sessions/${sessionId}/recording/stop`);
  return data;
}

export { logger, deviceController };
