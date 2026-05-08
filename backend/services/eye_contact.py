import atexit
import threading
import uuid
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import cv2

from services.gaze_correction.corrector import get_corrector

UPLOADS = Path(__file__).parent.parent / "uploads"
_executor = ThreadPoolExecutor(max_workers=1)   # one correction job at a time
atexit.register(_executor.shutdown, wait=False)
_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}  # file_id → job_id for in-progress jobs
_jobs_lock = threading.Lock()


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    corrected_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str) -> str:
    with _jobs_lock:
        # Re-use an existing in-progress job for the same file instead of queuing a duplicate
        existing = _active_file_jobs.get(file_id)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(f"[eye-contact] re-using in-progress job {existing[:8]} for file {file_id[:8]}", flush=True)
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[file_id] = job_id
    _executor.submit(_run_job, job_id, file_id, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _run_job(job_id: str, file_id: str, state: _JobState) -> None:
    print(f"[eye-contact] job {job_id[:8]}: starting for file {file_id[:8]}", flush=True)
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")
        input_path = str(matches[0])
        corrected_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{corrected_id}.mp4")
        _process_video(input_path, output_path, state, job_id)
        state.corrected_file_id = corrected_id
        state.status = "done"
        state.progress = 1.0
        print(f"[eye-contact] job {job_id[:8]}: done → {corrected_id[:8]}", flush=True)
    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[eye-contact] job {job_id[:8]}: ERROR — {exc}", flush=True)
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(file_id) == job_id:
                del _active_file_jobs[file_id]


def _process_video(input_path: str, output_path: str, state: _JobState, job_id: str = "") -> None:
    corrector = get_corrector()
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    if not cap.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {input_path}")

    temp_path = str(UPLOADS / f"tmp_{uuid.uuid4().hex}.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(temp_path, fourcc, fps, (w, h))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("OpenCV VideoWriter failed to open")

    tag = f"[eye-contact] job {job_id[:8]}:" if job_id else "[eye-contact]"
    print(f"{tag} processing {total_frames} frames at {fps:.1f}fps ({w}×{h})", flush=True)
    last_logged_pct = -1
    frame_idx = 0
    frames_with_faces = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            corrected, faces = corrector.correct_frame(frame)
            if faces:
                frames_with_faces += 1
            writer.write(corrected)
            frame_idx += 1
            state.progress = (frame_idx / total_frames) * 0.9  # reserve last 10% for re-encode
            pct = int(state.progress * 100)
            if pct // 10 > last_logged_pct // 10:
                print(f"{tag} {pct}% (faces so far: {frames_with_faces}/{frame_idx})", flush=True)
                last_logged_pct = pct
    finally:
        cap.release()
        writer.release()
    print(f"{tag} face detection: {frames_with_faces}/{frame_idx} frames had detectable faces", flush=True)

    # Merge corrected video with original audio track
    print(f"{tag} re-encoding with audio…", flush=True)
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", temp_path,
                "-i", input_path,
                "-c:v", "libx264", "-preset", "fast",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0?",  # optional audio stream (some clips have none)
                "-shortest",
                output_path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg re-encode failed:\n{result.stderr[-2000:]}")
    finally:
        Path(temp_path).unlink(missing_ok=True)
