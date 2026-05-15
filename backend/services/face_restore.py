from __future__ import annotations

import atexit
import threading
import uuid
import subprocess
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
_active_file_jobs: dict[str, str] = {}  # f"{file_id}:{fidelity_weight:.2f}" → job_id
_jobs_lock = threading.Lock()

_codeformer = None
_codeformer_lock = threading.Lock()


def _get_codeformer():
    global _codeformer
    if _codeformer is None:
        with _codeformer_lock:
            if _codeformer is None:
                from codeformer.app import inference_app
                _codeformer = inference_app
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
            print(f"[face-restore] re-using in-progress job {existing[:8]} for file {file_id[:8]}", flush=True)
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
    try:
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
    except Exception as exc:
        print(f"[face-restore] warning: could not register restored file in DB — {exc}", flush=True)


def _run_job(job_id: str, file_id: str, fidelity_weight: float, cache_key: str, state: _JobState) -> None:
    print(f"[face-restore] job {job_id[:8]}: starting for file {file_id[:8]} fidelity={fidelity_weight}", flush=True)
    video_only = None
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")

        input_path = str(matches[0])
        restored_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{restored_id}.mp4")
        video_only = str(UPLOADS / f"{restored_id}_noaudio.mp4")

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
            print(f"[face-restore] job {job_id[:8]}: muxing audio…", flush=True)
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", video_only,
                    "-i", input_path,
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest",
                    output_path,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg mux failed:\n{result.stderr[-2000:]}")
        finally:
            if video_only:
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
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
