"""
Face-tracking analysis service for Smart Reframe.

Samples a video at 2 fps (0.5× resolution) using dlib's frontal face detector,
produces a smoothed, decimated list of normalised x-centre keypoints.

Public API
----------
start_job(file_id)  -> job_id
get_job(job_id)     -> Optional[_JobState]
cancel_job(job_id)  -> bool
"""

import atexit
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

import cv2
import dlib

UPLOADS = Path(__file__).parent.parent / "uploads"

_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)

_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}   # file_id → job_id (in-progress only)
_cancel_flags: dict[str, threading.Event] = {}
_jobs_lock = threading.Lock()

# Lazy-loaded dlib detector (shared, thread-safe for read-only use after init)
_detector: Optional[dlib.fhog_object_detector] = None
_detector_lock = threading.Lock()

# Analysis constants
_SAMPLE_FPS = 2.0          # frames analysed per second of source video
_SCALE = 0.5               # downscale factor for speed
_EMA_ALPHA = 0.15          # exponential moving average smoothing factor
_DECIMATE_THRESHOLD = 0.005  # emit keypoint when |Δx| > 0.5%
_FORCE_KEYPOINT_SEC = 2.0  # always emit at least one keypoint per N seconds


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    progress: float = 0.0
    track_points: list[dict] = field(default_factory=list)
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_job(file_id: str) -> str:
    """Submit a face-tracking analysis job; returns job_id (de-duplicates in-progress)."""
    with _jobs_lock:
        existing = _active_file_jobs.get(file_id)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(
                f"[reframe] re-using in-progress job {existing[:8]} for file {file_id[:8]}",
                flush=True,
            )
            return existing

        job_id = str(uuid.uuid4())
        state = _JobState()
        cancel_event = threading.Event()
        _jobs[job_id] = state
        _cancel_flags[job_id] = cancel_event
        _active_file_jobs[file_id] = job_id

    _executor.submit(_run_job, job_id, file_id, state, cancel_event)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    """Return the current state for *job_id*, or None if unknown."""
    with _jobs_lock:
        return _jobs.get(job_id)


def cancel_job(job_id: str) -> bool:
    """Signal the worker to stop early. Returns True if the job existed."""
    with _jobs_lock:
        event = _cancel_flags.get(job_id)
        if event is None:
            return False
        event.set()
        return True


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_detector() -> dlib.fhog_object_detector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = dlib.get_frontal_face_detector()
    return _detector


def _run_job(
    job_id: str,
    file_id: str,
    state: _JobState,
    cancel_event: threading.Event,
) -> None:
    print(f"[reframe] job {job_id[:8]}: starting for file {file_id[:8]}", flush=True)
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")
        _analyse_video(str(matches[0]), state, job_id, cancel_event)
        if cancel_event.is_set():
            state.status = "error"
            state.error = "cancelled"
            print(f"[reframe] job {job_id[:8]}: cancelled", flush=True)
        else:
            state.status = "done"
            state.progress = 1.0
            print(
                f"[reframe] job {job_id[:8]}: done — {len(state.track_points)} keypoints",
                flush=True,
            )
    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[reframe] job {job_id[:8]}: ERROR — {exc}", flush=True)
    finally:
        with _jobs_lock:
            if _active_file_jobs.get(file_id) == job_id:
                del _active_file_jobs[file_id]
            _cancel_flags.pop(job_id, None)


def _analyse_video(
    input_path: str,
    state: _JobState,
    job_id: str,
    cancel_event: threading.Event,
) -> None:
    detector = _get_detector()
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {input_path}")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_ms = cap.get(cv2.CAP_PROP_FRAME_COUNT) / source_fps * 1000.0
    if total_ms <= 0:
        # Fallback: read duration from CAP_PROP_POS_AVI_RATIO trick
        cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 1.0)
        total_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 0.0)
    total_sec = total_ms / 1000.0

    tag = f"[reframe] job {job_id[:8]}:"
    print(f"{tag} duration={total_sec:.1f}s source_fps={source_fps:.1f}", flush=True)

    # Build list of sample timestamps (milliseconds)
    sample_interval_ms = 1000.0 / _SAMPLE_FPS
    sample_times_ms: list[float] = []
    t_ms = 0.0
    while t_ms <= total_ms + 1:
        sample_times_ms.append(t_ms)
        t_ms += sample_interval_ms

    n_samples = len(sample_times_ms)
    if n_samples == 0:
        state.track_points = [{"t": 0.0, "x": 0.5}]
        return

    # --- Pass 1: collect raw x values at each sample timestamp ---
    raw: list[tuple[float, Optional[float]]] = []  # (t_sec, x_norm or None)

    try:
        for idx, ts_ms in enumerate(sample_times_ms):
            if cancel_event.is_set():
                return

            cap.set(cv2.CAP_PROP_POS_MSEC, ts_ms)
            ret, frame = cap.read()
            if not ret:
                raw.append((ts_ms / 1000.0, None))
                state.progress = (idx + 1) / n_samples * 0.9
                continue

            h, w = frame.shape[:2]
            small_w = max(1, int(w * _SCALE))
            small_h = max(1, int(h * _SCALE))
            small = cv2.resize(frame, (small_w, small_h))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            dets = detector(gray, 0)
            if dets:
                # Pick the largest detection (most likely the primary subject)
                best = max(dets, key=lambda r: (r.right() - r.left()) * (r.bottom() - r.top()))
                cx = (best.left() + best.right()) / 2.0 / small_w
                cx = max(0.0, min(1.0, cx))
                raw.append((ts_ms / 1000.0, cx))
            else:
                raw.append((ts_ms / 1000.0, None))

            state.progress = (idx + 1) / n_samples * 0.9
    finally:
        cap.release()

    # --- Pass 2: fill no-face frames via carry-forward ---
    has_any = any(x is not None for _, x in raw)
    if not has_any:
        # No faces found at all — single centre keypoint
        state.track_points = [{"t": 0.0, "x": 0.5}]
        return

    # Single-pass fill: leading no-face frames use the first real detection value
    first_valid_x = next((x for _, x in raw if x is not None), 0.5)
    filled: list[tuple[float, float]] = []
    last_x = first_valid_x
    for t, x in raw:
        if x is not None:
            last_x = x
        filled.append((t, last_x))

    # --- Pass 3: exponential moving average smoothing ---
    smoothed: list[tuple[float, float]] = []
    ema = filled[0][1]
    for t, x in filled:
        ema = _EMA_ALPHA * x + (1.0 - _EMA_ALPHA) * ema
        smoothed.append((t, ema))

    # --- Pass 4: decimate — emit keypoints only on significant change or time gap ---
    keypoints: list[dict] = []
    last_kp_x: float = smoothed[0][1]
    last_kp_t: float = smoothed[0][0] - _FORCE_KEYPOINT_SEC  # ensure first point is emitted

    for t, x in smoothed:
        dx = abs(x - last_kp_x)
        dt = t - last_kp_t
        if dx > _DECIMATE_THRESHOLD or dt >= _FORCE_KEYPOINT_SEC:
            keypoints.append({"t": round(t, 4), "x": round(x, 6)})
            last_kp_x = x
            last_kp_t = t

    # Always ensure last point is included
    if smoothed:
        last_t, last_x = smoothed[-1]
        if not keypoints or keypoints[-1]["t"] != round(last_t, 4):
            keypoints.append({"t": round(last_t, 4), "x": round(last_x, 6)})

    state.track_points = keypoints
    print(
        f"{tag} raw={n_samples} → keypoints={len(keypoints)} "
        f"(faces detected in {sum(1 for _, x in raw if x is not None)}/{n_samples} samples)",
        flush=True,
    )
