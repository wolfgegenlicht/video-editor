# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based video editor with a React/TypeScript frontend and a Python/FastAPI backend. The frontend handles the editing UI and timeline; the backend handles file storage, transcription (Whisper), and FFmpeg-based export.

## Development Commands

### Frontend (`frontend/`)

```bash
pnpm dev        # Start dev server at http://localhost:5173
pnpm build      # Type-check + build to dist/
pnpm lint       # Run ESLint
```

No test suite exists yet.

### Backend (`backend/`)

```bash
uvicorn main:app --reload   # Start API server at http://localhost:8000
```

Dependencies: `pip install -r requirements.txt`. Also requires `ffmpeg` and `ffprobe` on PATH.

## Architecture

### Data Flow

The frontend is the source of truth for project state. The backend is stateless between requests — it stores uploaded files on disk and performs CPU-bound work (transcription, FFmpeg export) on demand.

### Frontend State (`src/store/useProjectStore.ts`)

Single Zustand store holds the entire `Project` (tracks, clips, captions, aspect ratio, caption style) plus ephemeral state (`files`, `playheadTime`, `zoom`). Project state is auto-persisted to `localStorage` on every mutation. Undo/redo is implemented as two stacks (`history`/`future`) that snapshot the full `Project` object; `files` (runtime upload metadata) is never persisted.

The `withHistory` helper wraps every project-mutating action — always use it when adding new mutations so undo/redo stays consistent.

### Data Model (`src/types/project.ts`)

```
Project
  tracks: Track[]         — ordered list of tracks (currently only "video" type used)
    clips: Clip[]         — each clip references a fileId and carries timeline position + source trim range
  captions: Caption[]     — flat list of timed caption segments
  aspectRatio / captionStyle — project-level settings
```

`Clip.startTime` / `Clip.duration` are the **timeline** positions (seconds). `Clip.sourceStart` / `Clip.sourceEnd` are the trim points within the source file. The video preview syncs `video.currentTime` to `sourceStart + (playheadTime - startTime)`.

`UploadedFile` (id, originalName, duration, width, height) lives only in `store.files` — it's not part of the serialized `Project`.

### API Layer (`src/lib/api.ts`)

Four endpoints, all proxied by Vite's custom `backendProxy` plugin in `vite.config.ts` to avoid CORS in dev:

| Endpoint | Method | Purpose |
|---|---|---|
| `/upload` | POST | Upload file → returns `UploadedFile` metadata |
| `/files/:id` | GET | Stream the raw file for `<video>` playback |
| `/files/:id` | DELETE | Remove file from disk |
| `/transcribe` | POST | Run Whisper on a file → returns `TranscriptSegment[]` |
| `/export` | POST | Accept full `Project` JSON → return rendered MP4 |

### Backend Structure

- `routes/upload.py` — file ingestion; uses `ffprobe` to extract duration/dimensions
- `routes/files.py` — file serving (FileResponse) and deletion
- `routes/transcribe.py` — delegates to `services/transcription.py`
- `routes/export_.py` — delegates to `services/ffmpeg.py`
- `services/transcription.py` — lazy-loads `faster-whisper` model (singleton, thread-safe); uses `base` model on CPU with `int8`
- `services/ffmpeg.py` — builds an FFmpeg `filter_complex` that trims clips (`-ss`/`-to` per input), scales/pads to the target aspect ratio, concatenates them, and optionally burns captions via `drawtext`. The "minimal" caption style is rendered entirely in the frontend overlay and skipped during export.

### Playback Architecture

`usePlayback` hook owns a `videoRef` and drives `store.playheadTime` via `requestAnimationFrame`. The `VideoPreview` component picks the active clip by comparing `playheadTime` against each clip's `[startTime, startTime+duration)` window and seeks the `<video>` element to the correct source position. `useKeyboardShortcuts` is mounted once in `App` and reads store state directly via `useProjectStore.getState()` (not reactive) to avoid stale closures.

### Timeline Zoom

`store.zoom` is pixels-per-second. All timeline pixel math uses `time * zoom`. The timeline scrolls horizontally and supports pinch/Ctrl+wheel zoom.
