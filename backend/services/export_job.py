import atexit
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from services.ffmpeg import export as ffmpeg_export

UPLOADS = Path(__file__).parent.parent / "uploads"
OUT = Path(__file__).parent.parent / "out"

_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)
_jobs: dict[str, "_JobState"] = {}
_jobs_lock = threading.Lock()
JOB_TTL = 3600  # seconds before completed/errored jobs are cleaned up


@dataclass
class _JobState:
    status: Literal["queued", "processing", "done", "error"] = "queued"
    progress: float = 0.0
    output_path: Optional[Path] = None
    filename: str = "export.mp4"
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)


def start_job(project: dict, options: dict, filename: str) -> str:
    with _jobs_lock:
        _cleanup_old_jobs()
        state = _JobState(filename=filename)
        job_id = str(uuid.uuid4())
        _jobs[job_id] = state
    _executor.submit(_run_job, job_id, project, options, filename, state)
    return job_id


def _cleanup_old_jobs() -> None:
    """Remove completed/errored jobs older than JOB_TTL. Must be called inside _jobs_lock."""
    for job_id, state in list(_jobs.items()):
        if state.status in ("done", "error") and time.time() - state.created_at > JOB_TTL:
            if state.output_path is not None:
                state.output_path.unlink(missing_ok=True)
            del _jobs[job_id]


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _run_job(job_id: str, project: dict, options: dict, filename: str, state: _JobState) -> None:
    state.status = "processing"
    progress_cb = lambda v: setattr(state, "progress", v)
    try:
        output_path = ffmpeg_export(project, UPLOADS, options, progress_cb)
        state.output_path = output_path   # set path first
        state.progress = 1.0             # then progress
        state.status = "done"            # status last — reader sees "done" only when all fields ready
        print(f"[export-job] {job_id[:8]}: done → {state.output_path.name}", flush=True)
    except Exception as exc:
        state.error = str(exc)           # set error message first
        state.status = "error"           # status last — reader sees "error" only when message is ready
        print(f"[export-job] {job_id[:8]}: ERROR — {exc}", flush=True)
