# AWS Chime SDK – Video Call & Recording

## 1. Database migration

Run once:

```bash
psql -U your_user -d your_database -f database/migrations/add_chime_meeting_columns.sql
```

Or run the SQL in your DB client: adds `chime_meeting_id`, `chime_meeting_arn`, `chime_media_pipeline_id` to `kyc_sessions`.

## 2. Backend (.env)

Already used for S3/Chime:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (e.g. `ap-south-1`)
- `S3_BUCKET_NAME` or `S3_BUCKET` – bucket where Chime recording files are stored

Optional:

- `CHIME_RECORDING_PREFIX` – S3 prefix for Chime recordings (default: `chime-recordings`)

Ensure the IAM user has these permissions (attach policy or add to your role):

**Chime SDK:**
- `chime:CreateMeeting`, `chime:GetMeeting`, `chime:DeleteMeeting`
- `chime:CreateAttendee`
- `chime:CreateMediaCapturePipeline`, `chime:DeleteMediaCapturePipeline`

**S3 (for recording output):**
- `s3:PutObject`, `s3:GetObject`, `s3:AbortMultipartUpload`, `s3:ListBucket` on the bucket used for Chime (e.g. `video-kyc1`).

**Region:** Chime meeting region and S3 bucket region should match (e.g. both `ap-south-1`).

## 3. Frontend – Enable Chime

In the frontend `.env` (or `.env.local`):

```env
REACT_APP_USE_CHIME=true
```

Then rebuild and run the frontend. When this is set:

- **User (join link):** joins the call via Chime (no WebRTC/Socket.io).
- **Investigator (dashboard):** joins via Chime; server-side recording starts when they join and stops when they leave.

If `REACT_APP_USE_CHIME` is not set or not `true`, the app keeps using the existing WebRTC + client-side recording flow.

## 4. API (for reference)

- `GET /api/chime/sessions/:sessionId/join?role=user|investigator` – returns Chime meeting + attendee (join token). No auth for `role=user`; investigator uses auth.
- `POST /api/chime/sessions/:sessionId/recording/start` – start server-side recording (investigator auth).
- `POST /api/chime/sessions/:sessionId/recording/stop` – stop recording (investigator auth).

## 5. Recording output

Chime writes the meeting capture to the S3 bucket configured in backend env. Path/prefix may follow Chime’s default or use `CHIME_RECORDING_PREFIX`. Check that bucket (and optional prefix) for recording files after a call.
