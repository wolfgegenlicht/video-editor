"""Portrait relighting service.

Uses the PortraitRelighting model (GhostCai/PortraitRelighting) to apply
lighting preset changes to a video clip frame-by-frame.

The model API (from portrait_relighting_src/example.py):
  - cropposer: ImageCropPoser — crops face and estimates camera params per frame
  - relighting: Relighting — the main model; accepts (img_tensor, cam_tensor, sh_tensor)
  - sh: shape (1, 9) float32 tensor — 9 greyscale SH coefficients L0..L2
  - img: (1, 3, H, W) tensor in [-1, 1] range, RGB
  - cam: camera parameter tensor extracted per-frame via cropposer.wild2all()

Intensity blends the relit output with the original frame.
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

# Lazy-loaded model components (loaded once, reused across jobs)
_cropposer = None
_relighting = None
_device = None
_model_lock = threading.Lock()

PRESETS = ("front", "ring", "window", "side_key")


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    relit_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def _get_models():
    """Lazy-load the PortraitRelighting model components (thread-safe singleton)."""
    global _cropposer, _relighting, _device
    if _relighting is None:
        with _model_lock:
            if _relighting is None:
                import torch
                src = Path(__file__).parent / "portrait_relighting_src"
                if str(src) not in sys.path:
                    sys.path.insert(0, str(src))

                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

                # MODEL CALL: load model components as shown in
                # portrait_relighting_src/example.py :: initialize_models()
                from third_party.wrappers import ImageCropPoser
                from networks.relighting import Relighting

                cropposer = ImageCropPoser(device).to(device)
                relighting = Relighting(device).to(device)
                relighting.load_state_dict(
                    torch.load(str(src / "checkpoints" / "model.pth"), map_location=device)
                )
                relighting.eval()
                cropposer.eval()

                _cropposer = cropposer
                _relighting = relighting
                _device = device
                print("[portrait-relight] models loaded on", device, flush=True)
    return _cropposer, _relighting, _device


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

        # Load SH preset
        sh_np = _load_sh(preset)  # shape (9,)

        # Lazy-load models
        cropposer, relighting, device = _get_models()

        # Prepare SH tensor — shape (1, 9)
        sh_tensor = torch.from_numpy(sh_np).unsqueeze(0).to(device)

        # Open source video
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(video_only, fourcc, fps, (w, h))

        # Temporal smoothing for camera params (matches example.py: 5-frame window)
        prev_cam_list: list = []
        relighting.reset()

        idx = 0
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break

            # Convert BGR frame → RGB tensor (1,3,H,W) in [-1,1]
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            img_tensor = (
                torch.from_numpy(frame_rgb)
                .permute(2, 0, 1)
                .unsqueeze(0)
                .float()
                .to(device)
                / 255.0
                * 2.0
                - 1.0
            )

            with torch.inference_mode():
                # MODEL CALL: extract camera params from raw frame via cropposer
                # (matches example.py :: perform_video_relighting)
                ret_crop = cropposer.wild2all(img_tensor)
                cam = ret_crop["cam"].to(device)

                # Temporal smoothing: average over last 5 camera estimates
                prev_cam_list.append(cam.cpu().numpy())
                if len(prev_cam_list) > 5:
                    prev_cam_list.pop(0)
                cam_avg = np.mean(prev_cam_list, axis=0)
                cam_tensor = torch.from_numpy(cam_avg).to(device)

                # MODEL CALL: relight the frame
                # video_forward returns a dict with key "image" → (1,3,H',W') in [-1,1]
                if device.type == "cuda":
                    with torch.cuda.amp.autocast():
                        result = relighting.video_forward(img_tensor, cam_tensor, sh_tensor)
                else:
                    result = relighting.video_forward(img_tensor, cam_tensor, sh_tensor)

                # Decode output tensor → numpy BGR uint8
                relit_tensor = result["image"]  # (1,3,H,W) in [-1,1]
                relit_np = (
                    ((relit_tensor + 1.0) / 2.0)
                    .clamp(0.0, 1.0)
                    .permute(0, 2, 3, 1)
                    .cpu()
                    .numpy()[0]
                )  # (H,W,3) RGB float32 [0,1]
                relit_np = (relit_np * 255.0).astype(np.uint8)

                # Resize relit output back to original frame size if model changed it
                if relit_np.shape[:2] != (h, w):
                    relit_np = cv2.resize(relit_np, (w, h), interpolation=cv2.INTER_LANCZOS4)

                relit_bgr = cv2.cvtColor(relit_np, cv2.COLOR_RGB2BGR)

            # Blend relit with original at given intensity
            blended = cv2.addWeighted(relit_bgr, intensity, frame_bgr, 1.0 - intensity, 0)
            writer.write(blended)

            idx += 1
            state.progress = (idx / total) * 0.9

        cap.release()
        writer.release()

        # Mux relit video with original audio, re-encoding to H.264 for browser compatibility
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
        Path(video_only).unlink(missing_ok=True)
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
