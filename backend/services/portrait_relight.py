"""Portrait relighting service using DPR (Deep Portrait Relighting).

DPR applies spherical-harmonic lighting changes to a video clip frame-by-frame.
It is CPU-compatible, uses bundled weights (trained_model_03.t7), and has no
CUDA-only dependencies. The NeRFFaceLighting+CropPose pipeline from the original
PortraitRelighting repo requires nvdiffrast (CUDA-only) and is not used.
"""
from __future__ import annotations

import atexit
import subprocess
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
_jobs_lock = threading.Lock()
_active_file_jobs: dict[str, str] = {}  # f"{file_id}:{preset}:{intensity:.2f}" → job_id

_dpr = None
_dpr_device = None
_dpr_lock = threading.Lock()

PRESETS = ("front", "ring", "window", "side_key")


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    relit_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def _get_dpr():
    """Lazy-load DPR model (thread-safe singleton)."""
    global _dpr, _dpr_device
    if _dpr is None:
        with _dpr_lock:
            if _dpr is None:
                import torch
                src = Path(__file__).parent / "portrait_relighting_src"
                # Add paths for DPR and the NeRFFaceLighting torch_utils it needs
                for p in [str(src), str(src / "third_party" / "NeRFFaceLighting")]:
                    if p not in sys.path:
                        sys.path.insert(0, p)

                from third_party.DPR.dpr import DPR  # type: ignore

                device = torch.device("cpu")
                dpr = DPR(device)
                dpr.eval()
                _dpr = dpr
                _dpr_device = device
                print("[portrait-relight] DPR model loaded on cpu", flush=True)
    return _dpr, _dpr_device


def _load_sh(preset: str) -> np.ndarray:
    """Load a (9,) float32 SH coefficient array for the given preset."""
    path = LIGHTING_DIR / f"{preset}.npy"
    if not path.exists():
        raise FileNotFoundError(f"Lighting preset file not found: {path}")
    coeffs = np.load(str(path))
    if coeffs.shape != (9,):
        raise ValueError(f"Expected SH shape (9,), got {coeffs.shape}")
    return coeffs.astype(np.float32)


def start_job(file_id: str, preset: str = "ring", intensity: float = 0.5) -> str:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset!r}")
    intensity = float(np.clip(intensity, 0.0, 1.0))
    cache_key = f"{file_id}:{preset}:{intensity:.2f}"
    with _jobs_lock:
        existing = _active_file_jobs.get(cache_key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(f"[portrait-relight] re-using in-progress job {existing[:8]} for {file_id[:8]}", flush=True)
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[cache_key] = job_id
    _executor.submit(_run_job, job_id, file_id, preset, intensity, cache_key, state)
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
                print(f"[portrait-relight] warning: source file {source_file_id} not found in DB — skipping registration", flush=True)
                return
            stem = Path(row["original_name"]).stem
            conn.execute(
                "INSERT OR IGNORE INTO files "
                "(id, project_id, original_name, duration, width, height, path) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    new_id,
                    row["project_id"],
                    f"{stem}_relit.mp4",
                    row["duration"],
                    row["width"],
                    row["height"],
                    output_path,
                ),
            )
    except Exception as exc:
        print(f"[portrait-relight] warning: could not register relit file in DB — {exc}", flush=True)


def _relight_frame(dpr, device, frame_bgr: np.ndarray, sh_t, intensity: float) -> np.ndarray:
    """Apply DPR relighting to a single BGR frame and blend with original."""
    import torch

    orig_h, orig_w = frame_bgr.shape[:2]

    # DPR processes at 512×512 internally; resize before and after
    frame_512 = cv2.resize(frame_bgr, (512, 512))
    frame_rgb = cv2.cvtColor(frame_512, cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1.0
    frame_t = torch.from_numpy(frame_rgb).permute(2, 0, 1).unsqueeze(0).to(device)

    with torch.no_grad():
        relit_t = dpr.exert_lighting(frame_t, sh_t)

    relit_512 = ((relit_t.squeeze(0).permute(1, 2, 0).cpu().numpy().clip(-1, 1) + 1) * 127.5).astype(np.uint8)
    relit_bgr = cv2.resize(cv2.cvtColor(relit_512, cv2.COLOR_RGB2BGR), (orig_w, orig_h))

    if intensity >= 0.99:
        return relit_bgr
    return cv2.addWeighted(relit_bgr, intensity, frame_bgr, 1.0 - intensity, 0)


def _run_job(
    job_id: str,
    file_id: str,
    preset: str,
    intensity: float,
    cache_key: str,
    state: _JobState,
) -> None:
    import torch

    print(f"[portrait-relight] job {job_id[:8]}: starting — file={file_id[:8]} preset={preset} intensity={intensity}", flush=True)
    video_only = str(UPLOADS / f"tmp_{uuid.uuid4().hex}_relit_noaudio.mp4")

    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")

        input_path = str(matches[0])
        relit_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{relit_id}.mp4")

        sh_np = _load_sh(preset)
        dpr, device = _get_dpr()
        sh_t = torch.from_numpy(sh_np).reshape(1, 9, 1, 1).to(device)

        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(video_only, fourcc, fps, (w, h))

        try:
            idx = 0
            while True:
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                blended = _relight_frame(dpr, device, frame_bgr, sh_t, intensity)
                writer.write(blended)
                idx += 1
                state.progress = (idx / total) * 0.9

            print(f"[portrait-relight] job {job_id[:8]}: re-encoding with audio…", flush=True)
            result_ffmpeg = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", video_only,
                    "-i", input_path,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "15",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest",
                    output_path,
                ],
                capture_output=True,
                text=True,
            )
            if result_ffmpeg.returncode != 0:
                raise RuntimeError(f"FFmpeg re-encode failed:\n{result_ffmpeg.stderr[-2000:]}")
        finally:
            cap.release()
            writer.release()
            Path(video_only).unlink(missing_ok=True)

        _register_file(file_id, relit_id, output_path)
        state.relit_file_id = relit_id
        state.progress = 1.0
        state.status = "done"
        print(f"[portrait-relight] job {job_id[:8]}: done → {relit_id[:8]}", flush=True)

    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[portrait-relight] job {job_id[:8]}: ERROR — {exc}", flush=True)
    finally:
        if Path(video_only).exists():
            Path(video_only).unlink(missing_ok=True)
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
