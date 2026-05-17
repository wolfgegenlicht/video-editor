# Face Restore & Portrait Relight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CodeFormer face restoration and PortraitRelighting as clip-level AI effects in the video editor, surfaced as a new "Enhance" section in the clip properties panel.

**Architecture:** Two new background-job services (face_restore, portrait_relight) follow the exact pattern of blur_bg_job / eye_contact — frame-by-frame OpenCV processing, ThreadPoolExecutor, SQLite file registration, poll-based frontend. Effects chain: eye_contact → blur_bg → face_restore → portrait_relight; each toggle watches its upstream fileId and re-queues automatically when upstream changes.

**Tech Stack:** Python/FastAPI backend (CodeFormer via `codeformer-pip`, PortraitRelighting via `GhostCai/PortraitRelighting`), React/TypeScript frontend (Zustand store, Tailwind CSS).

**Parallelism:**
- **Wave 1 (run in parallel):** Task 1, Task 2, Task 3 — fully independent
- **Wave 2 (run in parallel after Wave 1):** Task 4, Task 5

**UI conventions for both toggle components (apply throughout Task 4):**
- Compare button: label is **"Original"** when showing processed output (click to preview original), **"Processed"** when showing original (click to return to processed). Mirror the `previewOriginalClipId` toggle from `BlurBackgroundToggle`.
- Add a **"Re-process"** button next to Compare (same style as in `BlurBackgroundToggle`). Calls the same `handleReprocess()` function that deletes the current output and re-runs `startJob()`.
- Both buttons (Compare + Re-process) live in the `isOn && clip.[effect]FileId` block that is already **below** the toggle label row and sliders — keep them there, do **not** move them above the sliders.

---

## Task 1: Backend — Face Restore Service + Route

**Files:**
- Create: `backend/services/face_restore.py`
- Create: `backend/routes/face_restore.py`

### Prerequisites

- [ ] **Install CodeFormer**

```bash
cd backend
pip install codeformer-pip
```

Verify:
```bash
python -c "from codeformer.app import inference_codeformer_app; print('ok')"
```

- [ ] **Create `backend/services/face_restore.py`**

```python
import atexit
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import cv2

from database import get_db

UPLOADS = Path(__file__).parent.parent / "uploads"
_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)

_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}
_jobs_lock = threading.Lock()

_codeformer = None
_codeformer_lock = threading.Lock()


def _get_codeformer():
    global _codeformer
    if _codeformer is None:
        with _codeformer_lock:
            if _codeformer is None:
                from codeformer.app import inference_codeformer_app
                _codeformer = inference_codeformer_app
    return _codeformer


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    restored_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str, fidelity_weight: float = 0.7) -> str:
    key = f"{file_id}:{fidelity_weight:.2f}"
    with _jobs_lock:
        existing = _active_file_jobs.get(key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[key] = job_id
    _executor.submit(_run_job, job_id, file_id, fidelity_weight, key, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _register_file(source_file_id: str, new_id: str, output_path: str) -> None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT project_id, original_name, duration, width, height FROM files WHERE id = ?",
            (source_file_id,),
        ).fetchone()
        if not row:
            return
        stem = Path(row["original_name"]).stem
        conn.execute(
            "INSERT OR IGNORE INTO files (id, project_id, original_name, duration, width, height, path) VALUES (?,?,?,?,?,?,?)",
            (new_id, row["project_id"], f"{stem}_facerestored.mp4", row["duration"], row["width"], row["height"], output_path),
        )


def _run_job(job_id: str, file_id: str, fidelity_weight: float, cache_key: str, state: _JobState) -> None:
    import subprocess, tempfile
    matches = list(UPLOADS.glob(f"{file_id}.*"))
    if not matches:
        state.status = "error"
        state.error = f"Source file {file_id} not found"
        return

    input_path = str(matches[0])
    restored_id = str(uuid.uuid4())
    output_path = str(UPLOADS / f"{restored_id}_facerestored.mp4")
    video_only = output_path.replace(".mp4", "_noaudio.mp4")

    try:
        restore_fn = _get_codeformer()
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(video_only, fourcc, fps, (w, h))

        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            restored = restore_fn(
                image=frame,
                background_enhance=False,
                face_upsample=False,
                upscale=1,
                codeformer_fidelity=fidelity_weight,
            )
            writer.write(restored)
            idx += 1
            state.progress = (idx / total) * 0.9

        cap.release()
        writer.release()

        # Mux original audio back
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_only, "-i", input_path,
             "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0?",
             "-shortest", output_path],
            check=True, capture_output=True,
        )
        Path(video_only).unlink(missing_ok=True)

        _register_file(file_id, restored_id, output_path)
        state.restored_file_id = restored_id
        state.progress = 1.0
        state.status = "done"
        print(f"[face-restore] job {job_id[:8]} done → {restored_id[:8]}", flush=True)

    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[face-restore] job {job_id[:8]} ERROR: {exc}", flush=True)
        Path(video_only).unlink(missing_ok=True)
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
```

- [ ] **Create `backend/routes/face_restore.py`**

```python
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import services.face_restore as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class ProcessRequest(BaseModel):
    fileId: str
    fidelityWeight: float = Field(default=0.7, ge=0.0, le=1.0)


@router.post("/face-restore/process")
async def start_process(req: ProcessRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId, req.fidelityWeight)
    return {"jobId": job_id}


@router.get("/face-restore/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "restoredFileId": state.restored_file_id,
        "progress": state.progress,
        "error": state.error,
    }


@router.delete("/face-restore/files/{file_id}")
async def delete_file(file_id: str):
    for match in UPLOADS.glob(f"{file_id}.*"):
        match.unlink(missing_ok=True)
    return {"ok": True}
```

- [ ] **Smoke-test the backend**

Start the backend (`cd backend && uvicorn main:app --reload`) and verify routes exist:
```bash
curl -s http://localhost:8000/face-restore/status/nonexistent | python3 -m json.tool
# Expected: {"detail": "Job not found"}
```

- [ ] **Commit**

```bash
git add backend/services/face_restore.py backend/routes/face_restore.py
git commit -m "feat(backend): add face_restore service and route (CodeFormer)"
```

---

## Task 2: Backend — Portrait Relight Service + Route

**Files:**
- Create: `backend/services/portrait_relight.py`
- Create: `backend/routes/portrait_relight.py`
- Create: `backend/assets/lighting/` directory with four `.npy` SH coefficient files

### Prerequisites

- [ ] **Install PortraitRelighting**

```bash
cd backend
pip install torch torchvision
git clone https://github.com/GhostCai/PortraitRelighting.git services/portrait_relighting_src
cd services/portrait_relighting_src && pip install -r requirements.txt
```

Download pretrained weights as described in the repo README. Place the checkpoint at `backend/services/portrait_relighting_src/checkpoints/`.

- [ ] **Read the inference API**

Open `backend/services/portrait_relighting_src/demo.py` (or equivalent). Identify:
1. How to load the model (class name, checkpoint loading call)
2. How to pass a lighting preset (SH coefficients, environment map path, or string preset)
3. The exact call signature for per-frame inference

Update the `_run_job` function below at the `# MODEL CALL` comment to match the actual API.

- [ ] **Create lighting preset files**

```bash
mkdir -p backend/assets/lighting
```

Create `backend/assets/lighting/generate_sh.py`:
```python
"""Generate SH coefficient presets for PortraitRelighting."""
import numpy as np

# 9 SH coefficients per channel (RGB), shape (27,) — L0..L2 spherical harmonics
# Front: even, flat lighting from camera direction
FRONT = np.array([
    0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # R
    0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # G
    0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # B
], dtype=np.float32)

# Ring: elevated frontal light — classic vlogger look
RING = np.array([
    0.9, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.9, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.9, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

# Window: light from camera-left (viewer's right), natural look
WINDOW = np.array([
    0.6, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.6, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.6, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

# Side Key: strong directional from camera-right — cinematic
SIDE_KEY = np.array([
    0.5, -0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.5, -0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.5, -0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

np.save("front.npy", FRONT)
np.save("ring.npy", RING)
np.save("window.npy", WINDOW)
np.save("side_key.npy", SIDE_KEY)
print("Saved: front.npy ring.npy window.npy side_key.npy")
```

Run it:
```bash
cd backend/assets/lighting && python generate_sh.py
```

**Note:** These are starting SH values. After running the model on test footage, tune values in `generate_sh.py` to match the visual targets for each preset and re-run. The important structure (27 floats) is fixed; only the coefficient values need tuning.

- [ ] **Create `backend/services/portrait_relight.py`**

```python
import atexit
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import cv2
import numpy as np

from database import get_db

UPLOADS = Path(__file__).parent.parent / "uploads"
LIGHTING_DIR = Path(__file__).parent.parent / "assets" / "lighting"
_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)

_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}
_jobs_lock = threading.Lock()

_model = None
_model_lock = threading.Lock()

PRESETS = ("front", "ring", "window", "side_key")


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                src = Path(__file__).parent / "portrait_relighting_src"
                sys.path.insert(0, str(src))
                # MODEL CALL: replace the two lines below with the actual
                # model-loading API from portrait_relighting_src/demo.py
                from model import RelightingModel  # adjust import to match repo
                _model = RelightingModel(checkpoint=str(src / "checkpoints" / "model.pth"))
    return _model


def _load_sh(preset: str) -> np.ndarray:
    path = LIGHTING_DIR / f"{preset}.npy"
    if not path.exists():
        raise FileNotFoundError(f"Lighting preset file not found: {path}")
    return np.load(str(path))


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    relit_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str, preset: str = "ring", intensity: float = 0.5) -> str:
    if preset not in PRESETS:
        preset = "ring"
    key = f"{file_id}:{preset}:{intensity:.2f}"
    with _jobs_lock:
        existing = _active_file_jobs.get(key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[key] = job_id
    _executor.submit(_run_job, job_id, file_id, preset, intensity, key, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _register_file(source_file_id: str, new_id: str, output_path: str) -> None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT project_id, original_name, duration, width, height FROM files WHERE id = ?",
            (source_file_id,),
        ).fetchone()
        if not row:
            return
        stem = Path(row["original_name"]).stem
        conn.execute(
            "INSERT OR IGNORE INTO files (id, project_id, original_name, duration, width, height, path) VALUES (?,?,?,?,?,?,?)",
            (new_id, row["project_id"], f"{stem}_relit.mp4", row["duration"], row["width"], row["height"], output_path),
        )


def _run_job(job_id: str, file_id: str, preset: str, intensity: float, cache_key: str, state: _JobState) -> None:
    import subprocess
    from pathlib import Path as P

    matches = list(UPLOADS.glob(f"{file_id}.*"))
    if not matches:
        state.status = "error"
        state.error = f"Source file {file_id} not found"
        return

    input_path = str(matches[0])
    relit_id = str(uuid.uuid4())
    output_path = str(UPLOADS / f"{relit_id}_relit.mp4")
    video_only = output_path.replace(".mp4", "_noaudio.mp4")

    try:
        model = _get_model()
        sh_coeffs = _load_sh(preset)
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(video_only, fourcc, fps, (w, h))

        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            # MODEL CALL: replace the next two lines with the actual inference
            # call from portrait_relighting_src/demo.py. The result must be a
            # BGR uint8 ndarray of shape (h, w, 3).
            relit_frame = model.infer(frame, sh_coeffs)  # adjust to actual API
            # Blend with original at given intensity
            blended = cv2.addWeighted(relit_frame, intensity, frame, 1.0 - intensity, 0)
            writer.write(blended)
            idx += 1
            state.progress = (idx / total) * 0.9

        cap.release()
        writer.release()

        subprocess.run(
            ["ffmpeg", "-y", "-i", video_only, "-i", input_path,
             "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0?",
             "-shortest", output_path],
            check=True, capture_output=True,
        )
        P(video_only).unlink(missing_ok=True)

        _register_file(file_id, relit_id, output_path)
        state.relit_file_id = relit_id
        state.progress = 1.0
        state.status = "done"
        print(f"[portrait-relight] job {job_id[:8]} done → {relit_id[:8]}", flush=True)

    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[portrait-relight] job {job_id[:8]} ERROR: {exc}", flush=True)
        P(video_only).unlink(missing_ok=True)
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
```

- [ ] **Create `backend/routes/portrait_relight.py`**

```python
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import services.portrait_relight as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class ProcessRequest(BaseModel):
    fileId: str
    preset: str = Field(default="ring", pattern="^(front|ring|window|side_key)$")
    intensity: float = Field(default=0.5, ge=0.0, le=1.0)


@router.post("/portrait-relight/process")
async def start_process(req: ProcessRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId, req.preset, req.intensity)
    return {"jobId": job_id}


@router.get("/portrait-relight/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "relitFileId": state.relit_file_id,
        "progress": state.progress,
        "error": state.error,
    }


@router.delete("/portrait-relight/files/{file_id}")
async def delete_file(file_id: str):
    for match in UPLOADS.glob(f"{file_id}.*"):
        match.unlink(missing_ok=True)
    return {"ok": True}
```

- [ ] **Commit**

```bash
git add backend/services/portrait_relight.py backend/routes/portrait_relight.py backend/assets/
git commit -m "feat(backend): add portrait_relight service and route"
```

---

## Task 3: Frontend Foundation — Types + API + Store

**Files:**
- Modify: `frontend/src/types/project.ts` (lines 52–61, after `blurBackgroundIntensity`)
- Modify: `frontend/src/lib/api.ts` (append at end)
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Add fields to `Clip` in `frontend/src/types/project.ts`**

After line 56 (`blurBackgroundIntensity?: number;`), add:

```typescript
  faceRestore?: boolean;
  faceRestoreFileId?: string;
  faceRestoreStrength?: number;
  portraitRelight?: boolean;
  portraitRelightFileId?: string;
  portraitRelightPreset?: "front" | "ring" | "window" | "side_key";
  portraitRelightIntensity?: number;
```

- [ ] **Add API functions to `frontend/src/lib/api.ts`**

Append at the end of the file:

```typescript
export interface FaceRestoreStatusResponse {
  status: "processing" | "done" | "error";
  restoredFileId?: string;
  progress?: number;
  error?: string;
}

export async function startFaceRestoreJob(fileId: string, fidelityWeight: number): Promise<{ jobId: string }> {
  const res = await fetch("/face-restore/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, fidelityWeight }),
  });
  if (!res.ok) throw new Error(`Face restore job failed: ${res.status}`);
  return res.json();
}

export async function getFaceRestoreStatus(jobId: string): Promise<FaceRestoreStatusResponse> {
  const res = await fetch(`/face-restore/status/${jobId}`);
  if (!res.ok) throw new Error(`Face restore status check failed: ${res.status}`);
  return res.json();
}

export async function deleteFaceRestoreFile(fileId: string): Promise<void> {
  const res = await fetch(`/face-restore/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete face restore file failed: ${res.status}`);
}

export interface PortraitRelightStatusResponse {
  status: "processing" | "done" | "error";
  relitFileId?: string;
  progress?: number;
  error?: string;
}

export async function startPortraitRelightJob(fileId: string, preset: string, intensity: number): Promise<{ jobId: string }> {
  const res = await fetch("/portrait-relight/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, preset, intensity }),
  });
  if (!res.ok) throw new Error(`Portrait relight job failed: ${res.status}`);
  return res.json();
}

export async function getPortraitRelightStatus(jobId: string): Promise<PortraitRelightStatusResponse> {
  const res = await fetch(`/portrait-relight/status/${jobId}`);
  if (!res.ok) throw new Error(`Portrait relight status check failed: ${res.status}`);
  return res.json();
}

export async function deletePortraitRelightFile(fileId: string): Promise<void> {
  const res = await fetch(`/portrait-relight/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete portrait relight file failed: ${res.status}`);
}
```

- [ ] **Add state + actions to `frontend/src/store/useProjectStore.ts`**

**3a. Add to the state interface** (alongside `eyeContactStatus` and `blurBgStatus` near line 65):

```typescript
  faceRestoreStatus: Record<string, "processing" | "done" | "error">;
  portraitRelightStatus: Record<string, "processing" | "done" | "error">;
```

**3b. Add to the actions interface** (alongside the blur/eye contact action signatures):

```typescript
  setClipFaceRestore: (clipId: string, enabled: boolean) => void;
  setClipFaceRestoreFileId: (clipId: string, fileId: string | null) => void;
  setClipFaceRestoreStrength: (clipId: string, strength: number) => void;
  setFaceRestoreStatus: (clipId: string, status: "processing" | "done" | "error" | undefined) => void;
  setClipPortraitRelight: (clipId: string, enabled: boolean) => void;
  setClipPortraitRelightFileId: (clipId: string, fileId: string | null) => void;
  setClipPortraitRelightPreset: (clipId: string, preset: "front" | "ring" | "window" | "side_key") => void;
  setClipPortraitRelightIntensity: (clipId: string, intensity: number) => void;
  setPortraitRelightStatus: (clipId: string, status: "processing" | "done" | "error" | undefined) => void;
```

**3c. Add to the initial state** (alongside `eyeContactStatus: {}` near line 244):

```typescript
  faceRestoreStatus: {},
  portraitRelightStatus: {},
```

**3d. Add to the cleanup when a clip is deleted** — find the block that spreads `eyeContactStatus` and `blurBgStatus` (near line 478) and extend it:

```typescript
const { [clipId]: _fr, ...restFr } = s.faceRestoreStatus;
const { [clipId]: _pr, ...restPr } = s.portraitRelightStatus;
return { eyeContactStatus: rest, blurBgStatus: restBb, faceRestoreStatus: restFr, portraitRelightStatus: restPr };
```

**3e. Add action implementations** — after `setBlurBgStatus` (near line 720), add:

```typescript
  setClipFaceRestore: (clipId, enabled) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, faceRestore: enabled } : c),
    })),
  })),

  setClipFaceRestoreFileId: (clipId, fileId) => {
    const faceRestoreFileId = fileId ?? undefined;
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, faceRestoreFileId } : c)),
        })),
      },
    }));
    const { project, activeProjectId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    if (activeProjectId) _scheduleSave(activeProjectId, project);
  },

  setClipFaceRestoreStrength: (clipId, strength) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, faceRestoreStrength: strength } : c),
    })),
  })),

  setFaceRestoreStatus: (clipId, status) => set((s) => {
    if (status === undefined) {
      const { [clipId]: _, ...rest } = s.faceRestoreStatus;
      return { faceRestoreStatus: rest };
    }
    return { faceRestoreStatus: { ...s.faceRestoreStatus, [clipId]: status } };
  }),

  setClipPortraitRelight: (clipId, enabled) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, portraitRelight: enabled } : c),
    })),
  })),

  setClipPortraitRelightFileId: (clipId, fileId) => {
    const portraitRelightFileId = fileId ?? undefined;
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, portraitRelightFileId } : c)),
        })),
      },
    }));
    const { project, activeProjectId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    if (activeProjectId) _scheduleSave(activeProjectId, project);
  },

  setClipPortraitRelightPreset: (clipId, preset) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, portraitRelightPreset: preset } : c),
    })),
  })),

  setClipPortraitRelightIntensity: (clipId, intensity) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, portraitRelightIntensity: intensity } : c),
    })),
  })),

  setPortraitRelightStatus: (clipId, status) => set((s) => {
    if (status === undefined) {
      const { [clipId]: _, ...rest } = s.portraitRelightStatus;
      return { portraitRelightStatus: rest };
    }
    return { portraitRelightStatus: { ...s.portraitRelightStatus, [clipId]: status } };
  }),
```

- [ ] **Type-check**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: no new type errors (existing errors unrelated to this change are OK).

- [ ] **Commit**

```bash
git add frontend/src/types/project.ts frontend/src/lib/api.ts frontend/src/store/useProjectStore.ts
git commit -m "feat(frontend): add faceRestore and portraitRelight types, API, and store actions"
```

---

## Task 4: Backend Integration + Frontend UI Components

**Depends on:** Tasks 1, 2, 3 complete

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/services/ffmpeg.py` (lines ~192–196)
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

### Part A — Register routes and update export

- [ ] **Register new routers in `backend/main.py`**

After line 13 (`from routes.blur_bg import router as blur_bg_router`), add:

```python
from routes.face_restore import router as face_restore_router
from routes.portrait_relight import router as portrait_relight_router
```

After line 32 (`app.include_router(blur_bg_router)`), add:

```python
app.include_router(face_restore_router)
app.include_router(portrait_relight_router)
```

- [ ] **Update file resolution in `backend/services/ffmpeg.py`**

Find the two occurrences of (around lines 192–196 and 180–182):
```python
file_id = clip.get("eyeContactFileId") or clip["fileId"]
```

Replace both with:
```python
file_id = (
    clip.get("portraitRelightFileId")
    or clip.get("faceRestoreFileId")
    or clip.get("eyeContactFileId")
    or clip["fileId"]
)
```

Also update the audio track equivalent (around line 182) the same way.

- [ ] **Commit backend integration**

```bash
git add backend/main.py backend/services/ffmpeg.py
git commit -m "feat(backend): register face-restore and portrait-relight routes; update export chain"
```

### Part B — FaceRestoreToggle component

- [ ] **Add `_pendingFaceRestoreJobs` map and `FaceRestoreToggle` to `ClipPropertiesPanel.tsx`**

Find the line `const _pendingBlurBgJobs = new Map<string, string>();` (near the top of the file, after imports). Add below it:

```typescript
const _pendingFaceRestoreJobs = new Map<string, string>();
```

Then add the full `FaceRestoreToggle` function **after** the closing `}` of `BlurBackgroundToggle` and **before** `export default function ClipPropertiesPanel`:

```typescript
function FaceRestoreToggle({ clip }: { clip: Clip }) {
  const {
    setClipFaceRestore, setClipFaceRestoreFileId, setClipFaceRestoreStrength,
    setFaceRestoreStatus, faceRestoreStatus,
    previewOriginalClipId, setPreviewOriginalClipId,
  } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevBlurFileIdRef = useRef(clip.blurBackgroundFileId);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.faceRestore && clip.faceRestoreFileId && !faceRestoreStatus[clip.id]) {
      setFaceRestoreStatus(clip.id, "done");
    }
    const pendingJobId = _pendingFaceRestoreJobs.get(clip.id);
    if (pendingJobId && faceRestoreStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevBlurFileIdRef.current;
    prevBlurFileIdRef.current = clip.blurBackgroundFileId;
    if (prev === clip.blurBackgroundFileId) return;
    if (!clip.faceRestore || !clip.faceRestoreFileId) return;
    if (faceRestoreStatus[clip.id] === "processing") return;
    api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
    setClipFaceRestoreFileId(clip.id, null);
    startJob();
  }, [clip.blurBackgroundFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = faceRestoreStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.faceRestore && (status === "done" || (!!clip.faceRestoreFileId && status !== "error"));
  const strength = clip.faceRestoreStrength ?? 0.7;
  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    try {
      while (mountedRef.current && polls < 900) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getFaceRestoreStatus(jobId);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.restoredFileId) {
          _pendingFaceRestoreJobs.delete(clipId);
          setClipFaceRestoreFileId(clipId, s.restoredFileId);
          setFaceRestoreStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Face restore done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        _pendingFaceRestoreJobs.delete(clip.id);
        setClipFaceRestore(clip.id, false);
        setFaceRestoreStatus(clip.id, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function startJob(fidelityWeight = strength) {
    setFaceRestoreStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    setErrorMsg(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId;
    const { jobId } = await api.startFaceRestoreJob(inputFileId, fidelityWeight).catch((e) => {
      setClipFaceRestore(clip.id, false);
      setFaceRestoreStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    _pendingFaceRestoreJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.faceRestore;
    setClipFaceRestore(clip.id, enabling);
    if (!enabling) {
      setFaceRestoreStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      if (clip.faceRestoreFileId) {
        api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
        setClipFaceRestoreFileId(clip.id, null);
      }
      return;
    }
    if (clip.faceRestoreFileId) {
      setFaceRestoreStatus(clip.id, "done");
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    if (clip.faceRestoreFileId) {
      api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
      setClipFaceRestoreFileId(clip.id, null);
    }
    await startJob();
  }

  function handleStrengthChange(value: number) {
    setClipFaceRestoreStrength(clip.id, value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!clip.faceRestore) return;
      if (clip.faceRestoreFileId) {
        api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
        setClipFaceRestoreFileId(clip.id, null);
      }
      await startJob(value);
    }, 800);
  }

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Face Restore</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle face restore"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span className={[
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            isOn ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")} />
        </button>
      </div>

      {isOn && (
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Strength</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{strength.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05} value={strength}
            onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
            disabled={isProcessing}
            className={["w-full accent-teal-500 h-1", isProcessing ? "opacity-40 pointer-events-none" : ""].join(" ")}
          />
        </div>
      )}

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">{pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}</p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI face restoration · removes compression artifacts</p>
          {isOn && clip.faceRestoreFileId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show processed" : "Preview original"}
                className={["text-[10px] transition-colors flex items-center gap-0.5", isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600"].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Processed" : "Original"}
              </button>
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
                  <path d="M11 5h2.5V2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Re-process
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Part C — PortraitRelightToggle component

- [ ] **Add `_pendingPortraitRelightJobs` map just below `_pendingFaceRestoreJobs`**

```typescript
const _pendingPortraitRelightJobs = new Map<string, string>();
```

- [ ] **Add `PortraitRelightToggle` after `FaceRestoreToggle` and before `export default`**

```typescript
const RELIGHT_PRESETS: { key: "front" | "ring" | "window" | "side_key"; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "ring", label: "Ring" },
  { key: "window", label: "Window" },
  { key: "side_key", label: "Side Key" },
];

function PortraitRelightToggle({ clip }: { clip: Clip }) {
  const {
    setClipPortraitRelight, setClipPortraitRelightFileId,
    setClipPortraitRelightPreset, setClipPortraitRelightIntensity,
    setPortraitRelightStatus, portraitRelightStatus,
    previewOriginalClipId, setPreviewOriginalClipId,
  } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevFaceRestoreFileIdRef = useRef(clip.faceRestoreFileId);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.portraitRelight && clip.portraitRelightFileId && !portraitRelightStatus[clip.id]) {
      setPortraitRelightStatus(clip.id, "done");
    }
    const pendingJobId = _pendingPortraitRelightJobs.get(clip.id);
    if (pendingJobId && portraitRelightStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevFaceRestoreFileIdRef.current;
    prevFaceRestoreFileIdRef.current = clip.faceRestoreFileId;
    if (prev === clip.faceRestoreFileId) return;
    if (!clip.portraitRelight || !clip.portraitRelightFileId) return;
    if (portraitRelightStatus[clip.id] === "processing") return;
    api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
    setClipPortraitRelightFileId(clip.id, null);
    startJob();
  }, [clip.faceRestoreFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = portraitRelightStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.portraitRelight && (status === "done" || (!!clip.portraitRelightFileId && status !== "error"));
  const preset = clip.portraitRelightPreset ?? "ring";
  const intensity = clip.portraitRelightIntensity ?? 0.5;
  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    try {
      while (mountedRef.current && polls < 900) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getPortraitRelightStatus(jobId);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.relitFileId) {
          _pendingPortraitRelightJobs.delete(clipId);
          setClipPortraitRelightFileId(clipId, s.relitFileId);
          setPortraitRelightStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Relight done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        _pendingPortraitRelightJobs.delete(clip.id);
        setClipPortraitRelight(clip.id, false);
        setPortraitRelightStatus(clip.id, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function startJob(p = preset, i = intensity) {
    setPortraitRelightStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    setErrorMsg(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.faceRestoreFileId ?? clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId;
    const { jobId } = await api.startPortraitRelightJob(inputFileId, p, i).catch((e) => {
      setClipPortraitRelight(clip.id, false);
      setPortraitRelightStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    _pendingPortraitRelightJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.portraitRelight;
    setClipPortraitRelight(clip.id, enabling);
    if (!enabling) {
      setPortraitRelightStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      if (clip.portraitRelightFileId) {
        api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
        setClipPortraitRelightFileId(clip.id, null);
      }
      return;
    }
    if (clip.portraitRelightFileId) {
      setPortraitRelightStatus(clip.id, "done");
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    if (clip.portraitRelightFileId) {
      api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
      setClipPortraitRelightFileId(clip.id, null);
    }
    await startJob();
  }

  async function handlePresetChange(p: typeof preset) {
    setClipPortraitRelightPreset(clip.id, p);
    if (!clip.portraitRelight) return;
    if (clip.portraitRelightFileId) {
      api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
      setClipPortraitRelightFileId(clip.id, null);
    }
    await startJob(p, intensity);
  }

  function handleIntensityChange(value: number) {
    setClipPortraitRelightIntensity(clip.id, value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!clip.portraitRelight) return;
      if (clip.portraitRelightFileId) {
        api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
        setClipPortraitRelightFileId(clip.id, null);
      }
      await startJob(preset, value);
    }, 800);
  }

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Relight</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle portrait relight"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span className={[
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            isOn ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")} />
        </button>
      </div>

      {isOn && (
        <>
          <div className="flex gap-1 flex-wrap">
            {RELIGHT_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => !isProcessing && handlePresetChange(key)}
                disabled={isProcessing}
                className={[
                  "px-2 py-0.5 rounded text-[10px] border transition-colors",
                  preset === key
                    ? "bg-teal-50 text-teal-700 border-teal-200"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
                  isProcessing ? "opacity-40 pointer-events-none" : "",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-600">Intensity</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{intensity.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={intensity}
              onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
              disabled={isProcessing}
              className={["w-full accent-teal-500 h-1", isProcessing ? "opacity-40 pointer-events-none" : ""].join(" ")}
            />
          </div>
        </>
      )}

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">{pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}</p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI portrait relighting · studio light from any room</p>
          {isOn && clip.portraitRelightFileId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show processed" : "Preview original"}
                className={["text-[10px] transition-colors flex items-center gap-0.5", isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600"].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Processed" : "Original"}
              </button>
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
                  <path d="M11 5h2.5V2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Re-process
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Part D — Wire up in panel

- [ ] **Add both toggles to the Effects section in `ClipPropertiesPanel.tsx` (line 714–715 area)**

```tsx
{/* Effects */}
<div className="px-3 py-3 space-y-2">
  <p className="text-[10px] font-bold text-slate-400">Effects</p>
  <EyeContactToggle clip={clip} />
  <BlurBackgroundToggle clip={clip} />
  <FaceRestoreToggle clip={clip} />
  <PortraitRelightToggle clip={clip} />
</div>
```

- [ ] **Type-check and lint**

```bash
cd frontend && pnpm build 2>&1 | head -40
```

Expected: clean build (no new errors).

- [ ] **Commit**

```bash
git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx backend/main.py backend/services/ffmpeg.py
git commit -m "feat(ui): add FaceRestoreToggle and PortraitRelightToggle to clip properties panel"
```

---

## Verification

- [ ] Start backend: `cd backend && uvicorn main:app --reload`
- [ ] Start frontend: `cd frontend && pnpm dev`
- [ ] Upload a talking head clip, select it in the timeline
- [ ] In clip properties, scroll to Effects — confirm Face Restore and Relight toggles appear
- [ ] Toggle Face Restore on → progress bar shows → `✓ Done` → video preview switches to restored version
- [ ] Drag Strength slider → 800ms later → job re-queues automatically
- [ ] Toggle Relight on (Face Restore done) → job uses `faceRestoreFileId` as input (verify in network tab: `fileId` in POST body = face restore output)
- [ ] Toggle Face Restore off while Relight is on → Relight auto re-queues on the next upstream file
- [ ] Export project → confirm exported MP4 uses `portraitRelightFileId` source
- [ ] Undo Face Restore toggle → effect reverts without re-processing
