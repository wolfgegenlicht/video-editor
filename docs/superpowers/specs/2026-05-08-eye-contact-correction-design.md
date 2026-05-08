# Eye Contact Correction — Design Spec

**Date:** 2026-05-08  
**Status:** Approved for implementation

---

## Context

The Properties panel already has an "Eye Contact" button in the Effects section (`ClipPropertiesPanel.tsx` lines 246–256) but it is disabled with a "Soon" badge. This spec describes how to make it functional.

The feature uses the pre-trained warping CNN from [mvaibhav77/eye-contact-correction](https://github.com/mvaibhav77/eye-contact-correction) — adapted for server-side video-file processing — to synthetically redirect a speaker's gaze to appear they are looking at the camera.

---

## User Experience

1. User selects a video clip in the timeline.
2. In the Properties panel → Effects section, user toggles **Eye Contact** on.
3. A spinner appears: "Processing…" — the backend is correcting the clip frame-by-frame.
4. Once done, the preview **automatically switches** to playing the corrected video.
5. Export transparently uses the corrected video for that clip.
6. Toggling off reverts preview to the original; the corrected file stays cached (re-enabling skips reprocessing).

---

## Architecture

```
[Frontend toggle]
  → POST /eye-contact/process { fileId }
        └─ FFmpeg: decode → PNG frames
        └─ dlib: 68-point face landmarks per frame
        └─ TF warping model: correct gaze per frame
        └─ FFmpeg: re-encode corrected frames → MP4
        └─ store as new file (existing /files/:id route)
        └─ return { jobId }

  → poll GET /eye-contact/status/:jobId every 2s
        └─ { status, correctedFileId?, progress? }

[VideoPreview] uses eyeContactFileId ?? fileId as <video> src
[FFmpeg export] uses eyeContactFileId ?? fileId per clip input
```

---

## Data Model Changes

**`frontend/src/types/project.ts`** — add to `Clip`:
```typescript
eyeContact?: boolean        // whether correction is enabled
eyeContactFileId?: string   // corrected file's id (persisted/cached)
```

**`frontend/src/store/useProjectStore.ts`** — add ephemeral state (not persisted):
```typescript
eyeContactStatus: Record<string, 'processing' | 'done' | 'error'>
```

New store actions:
- `setClipEyeContact(clipId, enabled)` — sets `clip.eyeContact`, triggers processing job, updates ephemeral status. Uses `withHistory`.
- `setClipEyeContactFileId(clipId, fileId)` — sets `clip.eyeContactFileId` (called on job completion). Uses `withHistory`.
- `setEyeContactStatus(clipId, status)` — updates ephemeral `eyeContactStatus` map.

---

## Frontend Changes

### `frontend/src/types/project.ts`
Add `eyeContact?: boolean` and `eyeContactFileId?: string` to `Clip`.

### `frontend/src/store/useProjectStore.ts`
- Add `eyeContactStatus: Record<string, 'processing' | 'done' | 'error'>` to store state (excluded from localStorage persistence and history snapshots).
- Add `setClipEyeContact`, `setClipEyeContactFileId`, `setEyeContactStatus` actions.
- `setClipEyeContact(clipId, true)`:
  1. If `clip.eyeContactFileId` already exists → optimistically set `eyeContact = true` and status = 'done'; skip reprocessing. If playback fails (file missing from server), automatically fall back to reprocessing.
  2. Otherwise: set `eyeContact = true`, set status = 'processing', call `api.startEyeContactJob(fileId)`, poll until done, then call `setClipEyeContactFileId`.

### `frontend/src/lib/api.ts`
Add:
```typescript
startEyeContactJob(fileId: string): Promise<{ jobId: string }>
  // POST /eye-contact/process

getEyeContactStatus(jobId: string): Promise<{ status, correctedFileId?, progress? }>
  // GET /eye-contact/status/:jobId
```

### `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`
Replace the disabled Eye Contact button with an active 3-state control:
- **Off**: inactive button
- **Processing**: spinner icon + "Processing…" text, button disabled
- **On**: highlighted/active button

On error: show inline error text for 3s, revert to off.

### `frontend/src/components/Preview/VideoPreview.tsx`
When building the `<video>` src URL, use:
```typescript
const fileId = activeClip.eyeContact && activeClip.eyeContactFileId
  ? activeClip.eyeContactFileId
  : activeClip.fileId;
```

### `frontend/src/components/Preview/VideoPreview.tsx` + `backend/routes/export_.py`
Export: in the FFmpeg service, resolve `clip.eyeContactFileId ?? clip.fileId` for each clip's input file.

---

## Backend Changes

### New: `backend/services/gaze_correction/`
Adapted from [mvaibhav77/eye-contact-correction](https://github.com/mvaibhav77/eye-contact-correction):
- Copy `gaze_correction_system/` contents into `backend/services/gaze_correction/`
- Remove `win32api`/`win32gui` imports; replace `GetSystemMetrics` with config constant (e.g. `[1920, 1080]`)
- Migrate TF 1.x API calls to `tf.compat.v1` (disable eager execution at module level)
- Keep model weights at `backend/services/gaze_correction/weights/warping_model/`
- Keep `lm_feat/shape_predictor_68_face_landmarks.dat`

### New: `backend/services/eye_contact.py`
Exposes:
```python
def process_video(input_path: str, output_path: str) -> None:
    # 1. FFmpeg: decode input to frame sequence (PNG)
    # 2. Load dlib predictor + TF warping model (singleton, thread-safe)
    # 3. For each frame: detect landmarks → correct gaze → write corrected frame
    # 4. FFmpeg: encode corrected frames → MP4 at same resolution/fps as input
```

Job management:
```python
jobs: dict[str, JobState]   # in-memory, same pattern as Whisper transcription

class JobState:
    status: Literal['processing', 'done', 'error']
    corrected_file_id: str | None
    progress: float   # 0.0–1.0
    error: str | None
```

Background execution via `ThreadPoolExecutor` (same as `services/transcription.py`).

### New: `backend/routes/eye_contact.py`
```
POST /eye-contact/process   body: { file_id: str }
  → validate file exists
  → create job, submit to executor
  → return { job_id }

GET /eye-contact/status/:job_id
  → return { status, corrected_file_id?, progress, error? }
```

### Modified: `backend/main.py`
Register the new router.

### Modified: `backend/routes/export_.py` (or `services/ffmpeg.py`)
When iterating clips to build FFmpeg inputs, use `clip.eye_contact_file_id or clip.file_id`.

### Modified: `backend/requirements.txt`
Add:
```
tensorflow>=2.0
dlib
```

> **Note:** `dlib` requires `cmake` on the host. Document in README.

---

## Caching Behaviour

- `eyeContactFileId` is persisted in the `Project` (localStorage). If the user closes and reopens the editor, toggling eye contact back on checks whether the corrected file still exists on the server before reprocessing.
- The corrected file lives on disk alongside other uploaded files. When a clip is removed from the timeline, the frontend (which owns `eyeContactFileId`) issues an additional `DELETE /files/:eyeContactFileId` alongside the normal file deletion — no backend changes needed for cleanup.

---

## Verification

1. Upload a video of someone talking to camera but glancing off-screen.
2. Select the clip → Properties → toggle Eye Contact on.
3. Verify spinner appears and the backend `/eye-contact/process` request fires.
4. Poll `/eye-contact/status/:jobId` — verify progress increments.
5. On completion, verify preview automatically switches to the corrected video.
6. Export the project; verify the exported MP4 uses the corrected clip.
7. Toggle off → preview reverts to original. Toggle on again → no reprocessing (uses cached `eyeContactFileId`).
8. Delete the clip from the timeline → verify the corrected file is also cleaned up on the backend.
