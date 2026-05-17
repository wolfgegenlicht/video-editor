# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based video editor with a React/TypeScript frontend and a Python/FastAPI backend. The frontend handles the editing UI and timeline; the backend handles file storage, transcription (Whisper), and FFmpeg-based export.

## Development Commands

### Frontend (`frontend/`)

Must run from the `frontend/` directory:

```bash
cd frontend
pnpm dev        # Start dev server at http://localhost:5173
pnpm build      # Type-check + build to dist/
pnpm lint       # Run ESLint
```

No test suite exists yet.

### Backend (`backend/`)

Must run from the `backend/` directory:

```bash
cd backend
uvicorn main:app --reload   # Start API server at http://localhost:8000
```

Dependencies: `pip install -r requirements.txt`. Also requires `ffmpeg` and `ffprobe` on PATH.

## Layout

Descript-style 3-column layout:

```
┌────────────────────────────────────────────────────────────────┐
│  Header (project name, export button)                          │
├──────────────┬─────────────────────────────┬───────────────────┤
│  [≡] strip   │                             │  content panel    │
│  + Transcript│   VIDEO PREVIEW             │  + [⚙] [📁] strip │
│  panel       │   (flex-1, centered)        │                   │
│  (~280px,    │                             │  Properties or    │
│  collapsible)│                             │  Media            │
│              │                             │  (~260px,         │
│              │                             │  collapsible)     │
├──────────────┴─────────────────────────────┴───────────────────┤
│  TIMELINE                                                       │
└────────────────────────────────────────────────────────────────┘
```

- **Left panel** (`LeftPanel.tsx`): 60px icon strip + collapsible transcript panel. Toggle via the Transcript icon.
- **Right panel** (`RightPanel.tsx`): 60px icon strip on far right + collapsible content panel with Properties / Media tabs. Auto-opens to Properties when a timeline item is clicked.
- **Transcript** flows as continuous prose (no per-segment block wrappers). Words from all caption segments are rendered inline; paragraph breaks appear only for pauses >1.5s.

## Architecture

### Data Flow

The frontend is the source of truth for project state. The backend is stateless between requests — it stores uploaded files on disk and performs CPU-bound work (transcription, FFmpeg export) on demand.

### Frontend State (`src/store/useProjectStore.ts`)

Single Zustand store holds the entire `Project` (tracks, clips, captions, aspect ratio, caption style) plus ephemeral state (`files`, `playheadTime`, `zoom`). Project state is auto-persisted to `localStorage` on every mutation. Undo/redo is implemented as two stacks (`history`/`future`) that snapshot the full `Project` object; `files` (runtime upload metadata) is never persisted.

The `withHistory` helper wraps every project-mutating action — always use it when adding new mutations so undo/redo stays consistent.

Key store fields beyond the basics:
- `rightPanelTab: "properties" | "media" | null` — null = collapsed. Set to `"properties"` automatically by `selectClip`, `selectCaption`, `selectOverlay`.
- `transcriptSelection: { startTime, endTime } | null` — word-range drag selection in the transcript.
- `selectedClipId / selectedCaptionId / selectedOverlayId` — what's selected in the timeline.

### Data Model (`src/types/project.ts`)

```
Project
  tracks: Track[]         — ordered list of tracks (currently "video" and "audio" types)
    clips: Clip[]         — each clip references a fileId and carries timeline position + source trim range
  captions: Caption[]     — flat list of timed caption segments, each with word-level timestamps
  textOverlays: TextOverlay[]
  aspectRatio / captionTrackStyle — project-level settings
```

`Clip.startTime` / `Clip.duration` are the **timeline** positions (seconds). `Clip.sourceStart` / `Clip.sourceEnd` are the trim points within the source file. The video preview syncs `video.currentTime` to `sourceStart + (playheadTime - startTime)`.

`Clip` also carries optional visual/playback properties: `speed`, `volume`, `fadeIn`, `fadeOut`, `brightness`, `contrast`, `saturation`. Brightness/contrast/saturation are applied as CSS `filter` on the `<video>` element in `VideoPreview.tsx`.

`Caption` has `words?: CaptionWord[]` (word-level timestamps from Whisper). Word-level data is required for transcript editing and karaoke highlighting.

`UploadedFile` (id, originalName, duration, width, height) lives only in `store.files` — it's not part of the serialized `Project`.

### Key Store Actions

| Action | Description |
|---|---|
| `deleteTimeRange(start, end)` | Splice-edit: trims/removes clips overlapping range, shifts subsequent clips left, removes overlapping caption **segments**, shifts subsequent segments. `withHistory`. |
| `cutWord(captionId, wordIndex)` | Cut-mode word delete: trims clips for just that word's slot (using next word's start as end point, since Whisper `word.end` values are unreliable), removes only that word from the caption segment (other words in the segment remain), shifts all subsequent word and caption timestamps. `withHistory`. |
| `splitClip(clipId, atTime)` | Splits a clip at a timeline position into two clips. |
| `setClipAdjustment(clipId, key, value)` | Sets brightness/contrast/saturation on a clip. |
| `selectClip / selectCaption / selectOverlay` | Selects an item and auto-opens the right panel to Properties. |

### API Layer (`src/lib/api.ts`)

All endpoints proxied by Vite's custom `backendProxy` plugin in `vite.config.ts` to avoid CORS in dev:

| Endpoint | Method | Purpose |
|---|---|---|
| `/upload` | POST | Upload file → returns `UploadedFile` metadata |
| `/files/:id` | GET | Stream the raw file for `<video>` playback |
| `/files/:id` | DELETE | Remove file from disk |
| `/transcribe` | POST | Run Whisper on a file → returns `TranscriptSegment[]` with word-level timestamps |
| `/export` | POST | Accept full `Project` JSON → return rendered MP4 |

### Backend Structure

- `routes/upload.py` — file ingestion; uses `ffprobe` to extract duration/dimensions
- `routes/files.py` — file serving (FileResponse) and deletion
- `routes/transcribe.py` — delegates to `services/transcription.py`
- `routes/export_.py` — delegates to `services/ffmpeg.py`
- `services/transcription.py` — lazy-loads `faster-whisper` model (singleton, thread-safe); uses `base` model on CPU with `int8`. Returns word-level timestamps (`word_timestamps=True`).
- `services/ffmpeg.py` — builds an FFmpeg `filter_complex` that trims clips (`-ss`/`-to` per input), scales/pads to the target aspect ratio, concatenates them, and optionally burns captions via `drawtext`.
- `services/eye_contact.py` — background job queue (one job at a time via ThreadPoolExecutor). Runs `GazeCorrector` frame-by-frame, then re-encodes with FFmpeg to merge corrected video with original audio (`-crf 15`). Job state (`processing` / `done` / `error` + `progress` 0–1) polled by the frontend every 2s.
- `services/gaze_correction/corrector.py` — the actual eye contact correction. Uses dlib for face detection (at `_DETECT_SCALE=0.5` resolution for speed) + 68-point landmarks, then finds iris centre via dark-pixel centroid in the eye patch (`_iris_offset`), maps offset to gaze angle, and runs the FLX/DeepWarp TF1 model. L and R eye sessions run in parallel threads. TF inference runs every `_INFER_EVERY_N=3` frames with cached patches reused for intermediate frames (reduce to 2 if fast head movements cause shimmer). Output blended back with Lanczos upsampling + Gaussian-feathered mask.

### Transcript Panel (`src/components/LeftPanel/TranscriptTab.tsx`)

- All words from all caption segments flow inline in one `<div>` — no per-segment block wrappers. Paragraph gaps (`h-[0.7em]`) appear only for pauses >1.5s between segments.
- **Click** a word → seek to that word's start time.
- **Drag** across words → sets `transcriptSelection` (blue highlight). The "Delete" bar in `LeftPanel.tsx` then calls `deleteTimeRange`.
- **Double-click** → inline edit. Typing a space creates multiple words (time range split evenly).
- **✂ cut mode toggle**: when active, the × hover button on each word calls `cutWord` instead of caption-only `deleteWord`.
- Active word at playhead: yellow highlight. Past words: gray. Selected range: blue.
- Caption segment active-word check uses strict `<` for `endTime` (`playheadTime < cap.endTime`) to avoid double-highlighting at segment boundaries where adjacent segments share a boundary timestamp.

### Caption Overlay (`src/components/Preview/CaptionOverlay.tsx`)

- Uses `project.captions.find((c) => time >= c.startTime && time < c.endTime)` — strict `<` to avoid showing the wrong segment at boundary timestamps.
- Karaoke mode: word-level highlight colour sweeps through the segment. Words scroll vertically within a fixed box.

### Playback Architecture

`usePlayback` hook owns a `videoRef` and drives `store.playheadTime` via `requestAnimationFrame`. The `VideoPreview` component picks the active clip by comparing `playheadTime` against each clip's `[startTime, startTime+duration)` window and seeks the `<video>` element to the correct source position. `useKeyboardShortcuts` is mounted once in `App` and reads store state directly via `useProjectStore.getState()` (not reactive) to avoid stale closures.

### Timeline Zoom

`store.zoom` is pixels-per-second. All timeline pixel math uses `time * zoom`. The timeline scrolls horizontally and supports pinch/Ctrl+wheel zoom.

## Known Quirks

- **Whisper word `end` timestamps are unreliable.** The last word of a Whisper segment often has its `end` set to the segment's `endTime` rather than the actual audio end. Never use `word.end` as a cut point — use `words[i+1].start` (next word's start) instead. `cutWord` already does this.
- The dev server may run on `:5175` instead of `:5173` if another process holds that port.
