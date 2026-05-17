# Face Restore & Portrait Relight — Design Spec

**Date:** 2026-05-15  
**Status:** Approved

---

## Context

Talking head recordings (webcam, consumer cameras) suffer from two common problems: compression artifacts / softness that make faces look cheap, and flat or unflattering indoor lighting. CodeFormer (face restoration) and PortraitRelighting (3D-aware relighting for portrait video) address both. Both are clip-level AI processing effects, following the same background-job pattern as the existing Eye Contact and Blur Background effects.

---

## Effect Chain

All clip-level AI effects form a chain where each step uses the previous step's output:

```
fileId
  → eyeContactFileId       (Eye Contact)
    → blurBackgroundFileId  (Blur Background)
      → faceRestoreFileId   (Face Restore / CodeFormer)
        → portraitRelightFileId (Portrait Relight)
```

Each toggle component watches the upstream `fileId`. When the upstream output changes (e.g. Eye Contact re-runs), downstream effects that are enabled automatically delete their stale output and re-queue with the new input.

---

## Backend

### `backend/services/face_restore.py`
New service following the `blur_bg` / `eye_contact` pattern exactly:

- `start_job(file_id: str, fidelity_weight: float = 0.7) → str` (returns job_id)
- `get_job(job_id: str) → _JobState | None`
- `_JobState`: `status`, `progress`, `restored_file_id`, `error`
- Processing: OpenCV frame loop → CodeFormer per-frame face detection + restoration → paste enhanced face back into frame → FFmpeg re-encode, mux original audio
- Output file: `/uploads/{uuid}_facerestored.mp4`, registered in SQLite

### `backend/routes/face_restore.py`
- `POST /face-restore/process` body `{ fileId, fidelityWeight }` → `{ jobId }`
- `GET /face-restore/status/{job_id}` → `{ status, progress, restoredFileId, error }`
- `DELETE /face-restore/files/{file_id}` — cleanup

### `backend/services/portrait_relight.py`
New service, same pattern:

- `start_job(file_id: str, preset: str = "ring", intensity: float = 0.5) → str`
- Presets `"front"` / `"ring"` / `"window"` / `"side_key"` → map to pre-defined lighting parameters accepted by the PortraitRelighting model (environment map path or light direction vector — exact API to be confirmed during implementation by reading the GhostCai/PortraitRelighting inference script)
- Intensity 0–1 is passed to the service; the frame loop blends `output = intensity * relit_frame + (1 - intensity) * original_frame` per-pixel before writing
- Output file: `/uploads/{uuid}_relit.mp4`, registered in SQLite

### `backend/routes/portrait_relight.py`
- `POST /portrait-relight/process` body `{ fileId, preset, intensity }` → `{ jobId }`
- `GET /portrait-relight/status/{job_id}` → `{ status, progress, relitFileId, error }`
- `DELETE /portrait-relight/files/{file_id}` — cleanup

### `backend/main.py`
Add two `include_router` calls for the new routers.

### `backend/routes/export_.py` (or `services/ffmpeg.py`)
Update the clip file-ID resolution to use the full chain:
```python
file_id = (
    clip.get("portraitRelightFileId")
    or clip.get("faceRestoreFileId")
    or clip.get("blurBackgroundFileId")
    or clip.get("eyeContactFileId")
    or clip["fileId"]
)
```

---

## Data Model

### `frontend/src/types/project.ts` — add to `Clip`
```typescript
faceRestore?: boolean;
faceRestoreFileId?: string;
faceRestoreStrength?: number;              // 0.0–1.0, default 0.7
portraitRelight?: boolean;
portraitRelightFileId?: string;
portraitRelightPreset?: "front" | "ring" | "window" | "side_key";  // default "ring"
portraitRelightIntensity?: number;         // 0.0–1.0, default 0.5
```

---

## Store

### `frontend/src/store/useProjectStore.ts`

**Ephemeral state** (not persisted, alongside `eyeContactStatus` / `blurBgStatus`):
```typescript
faceRestoreStatus: Record<string, "processing" | "done" | "error">
portraitRelightStatus: Record<string, "processing" | "done" | "error">
```

**Actions** (all Clip mutations use `withHistory`):
- `setClipFaceRestore(clipId, enabled)`
- `setClipFaceRestoreStrength(clipId, strength)`
- `setClipFaceRestoreFileId(clipId, fileId | null)`
- `setFaceRestoreStatus(clipId, status | undefined)`
- `setClipPortraitRelight(clipId, enabled)`
- `setClipPortraitRelightPreset(clipId, preset)`
- `setClipPortraitRelightIntensity(clipId, intensity)`
- `setClipPortraitRelightFileId(clipId, fileId | null)`
- `setPortraitRelightStatus(clipId, status | undefined)`

---

## API Layer

### `frontend/src/lib/api.ts` — add
```typescript
startFaceRestoreJob(fileId: string, fidelityWeight: number): Promise<{ jobId: string }>
getFaceRestoreStatus(jobId: string): Promise<{ status, progress, restoredFileId?, error? }>
deleteFaceRestoreFile(fileId: string): Promise<void>

startPortraitRelightJob(fileId: string, preset: string, intensity: number): Promise<{ jobId: string }>
getPortraitRelightStatus(jobId: string): Promise<{ status, progress, relitFileId?, error? }>
deletePortraitRelightFile(fileId: string): Promise<void>
```

---

## Frontend Components

Both components live in `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`, defined as inner functions alongside `EyeContactToggle` and `BlurBackgroundToggle`.

### `FaceRestoreToggle({ clip })`
- **Input file**: `clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId`
- **Upstream watch**: `useEffect` on `clip.blurBackgroundFileId` — when it changes and Face Restore is enabled, delete old output, clear `faceRestoreFileId`, re-queue
- **Toggle on**: start job → poll `/face-restore/status` every 2s → on done set `faceRestoreFileId`
- **Toggle off**: delete output file, clear `faceRestoreFileId`, clear status
- **Strength slider**: `accent-teal-500`, disabled (`pointer-events-none opacity-40`) while processing. On change: debounce 800ms → delete old output → re-queue
- **States**: idle (controls hidden), processing (progress bar + `%` text, slider disabled), done (`✓ Done` + compare toggle — same pattern as `EyeContactToggle`: hold to preview original, release to restore processed), error (`⚠ …`)

### `PortraitRelightToggle({ clip })`
- **Input file**: `clip.faceRestoreFileId ?? clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId`
- **Upstream watch**: `useEffect` on `clip.faceRestoreFileId` — re-queues when it changes (same pattern as BlurBackground watching `eyeContactFileId`)
- **Toggle on**: start job → poll every 2s
- **Toggle off**: delete output file, clear `portraitRelightFileId`
- **Preset buttons**: `Front` / `Ring` / `Window` / `Side Key`. Active preset: `bg-teal-100 text-teal-700 border-teal-300`. Changing preset: immediate re-queue (discrete choice, no debounce)
- **Intensity slider**: `accent-teal-500`, disabled while processing. On change: debounce 800ms → re-queue
- **States**: same as FaceRestoreToggle (idle / processing / done with compare toggle / error)

### `ClipPropertiesPanel.tsx` — injection point (line 711–716)
```tsx
{/* Effects */}
<div className="px-3 py-3 space-y-2">
  <p className="text-[10px] font-bold text-slate-400">Effects</p>
  <EyeContactToggle clip={clip} />
  <BlurBackgroundToggle clip={clip} />
  <FaceRestoreToggle clip={clip} />      {/* new */}
  <PortraitRelightToggle clip={clip} />  {/* new */}
</div>
```

No section header rename needed — "Effects" covers all four.

---

## Verification

1. Toggle Face Restore on a clip → progress bar appears → `✓ Done` → video plays with enhanced face quality
2. Drag Strength slider → 800ms debounce → job re-queues automatically
3. Enable Relight while Face Restore is done → Relight receives `faceRestoreFileId` as input (confirmed by network tab: `fileId` in POST body matches the restored file's ID)
4. Toggle Face Restore off while Relight is on → `faceRestoreFileId` cleared → Relight auto re-queues using original/blurBg file
5. Export → exported MP4 uses `portraitRelightFileId` as source (the full chain output)
6. Undo toggle → effect boolean reverts, fileId persists (no re-processing on undo)
