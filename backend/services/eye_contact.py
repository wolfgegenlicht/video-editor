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
_jobs: dict[str, "_JobState"] = {}
_jobs_lock = threading.Lock()


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    corrected_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str) -> str:
    job_id = str(uuid.uuid4())
    state = _JobState()
    with _jobs_lock:
        _jobs[job_id] = state
    _executor.submit(_run_job, job_id, file_id, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _run_job(job_id: str, file_id: str, state: _JobState) -> None:
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")
        input_path = str(matches[0])
        corrected_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{corrected_id}.mp4")
        _process_video(input_path, output_path, state)
        state.corrected_file_id = corrected_id
        state.status = "done"
        state.progress = 1.0
    except Exception as exc:
        state.status = "error"
        state.error = str(exc)


def _process_video(input_path: str, output_path: str, state: _JobState) -> None:
    corrector = get_corrector()
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    temp_path = str(UPLOADS / f"tmp_{uuid.uuid4().hex}.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(temp_path, fourcc, fps, (w, h))

    frame_idx = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            corrected = corrector.correct_frame(frame)
            writer.write(corrected)
            frame_idx += 1
            state.progress = (frame_idx / total_frames) * 0.9  # reserve last 10% for re-encode
    finally:
        cap.release()
        writer.release()

    # Merge corrected video with original audio track
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
    Path(temp_path).unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg re-encode failed:\n{result.stderr[-2000:]}")
