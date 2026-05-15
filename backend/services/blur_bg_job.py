from __future__ import annotations

import atexit
import threading
import uuid
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from database import get_db
from services.background_blur import blur_background_clip

UPLOADS = Path(__file__).parent.parent / "uploads"
_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)
_jobs: dict[str, "_JobState"] = {}
_jobs_lock = threading.Lock()
_active_file_jobs: dict[str, str] = {}  # f"{file_id}:{intensity}" → job_id


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    blurred_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str, intensity: int) -> str:
    cache_key = f"{file_id}:{intensity}"
    with _jobs_lock:
        existing = _active_file_jobs.get(cache_key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(f"[blur-bg] re-using in-progress job {existing[:8]} for file {file_id[:8]}", flush=True)
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[cache_key] = job_id
    _executor.submit(_run_job, job_id, file_id, intensity, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _register_blurred_file(source_file_id: str, blurred_id: str, output_path: Path) -> None:
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT project_id, original_name, duration, width, height FROM files WHERE id = ?",
                (source_file_id,),
            ).fetchone()
            if not row:
                return
            blurred_name = Path(row["original_name"]).stem + "_blur.mp4"
            conn.execute(
                "INSERT OR IGNORE INTO files (id, project_id, original_name, duration, width, height, path) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (blurred_id, row["project_id"], blurred_name, row["duration"], row["width"], row["height"], str(output_path)),
            )
    except Exception as exc:
        print(f"[blur-bg] warning: could not register blurred file in DB — {exc}", flush=True)


def _run_job(job_id: str, file_id: str, intensity: int, state: _JobState) -> None:
    print(f"[blur-bg] job {job_id[:8]}: starting for file {file_id[:8]} intensity={intensity}", flush=True)
    cache_key = f"{file_id}:{intensity}"
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")
        input_path = str(matches[0])
        blurred_id = str(uuid.uuid4())
        temp_path = str(UPLOADS / f"tmp_{uuid.uuid4().hex}.mp4")
        output_path = UPLOADS / f"{blurred_id}.mp4"

        def progress_cb(p: float) -> None:
            state.progress = p * 0.9  # reserve last 10% for re-encode

        try:
            blur_background_clip(input_path, temp_path, 0.0, float("inf"), intensity, progress_cb)

            # Merge blurred video with original audio
            print(f"[blur-bg] job {job_id[:8]}: re-encoding with audio…", flush=True)
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", temp_path,
                    "-i", input_path,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "15",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg re-encode failed:\n{result.stderr[-2000:]}")
        finally:
            Path(temp_path).unlink(missing_ok=True)

        state.blurred_file_id = blurred_id
        _register_blurred_file(file_id, blurred_id, output_path)
        state.status = "done"
        state.progress = 1.0
        print(f"[blur-bg] job {job_id[:8]}: done → {blurred_id[:8]}", flush=True)
    except Exception as exc:
        state.error = str(exc)
        state.status = "error"
        print(f"[blur-bg] job {job_id[:8]}: ERROR — {exc}", flush=True)
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
