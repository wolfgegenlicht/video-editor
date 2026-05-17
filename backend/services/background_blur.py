import os
import threading
import cv2
import numpy as np
from typing import Callable, Optional

_MODEL_LOCK = threading.Lock()
_model = None
_device = None
_rvm_ready: Optional[bool] = None  # None = not yet checked


def _load_model() -> bool:
    """Lazy-initialize RobustVideoMatting. Returns True if ready."""
    global _model, _device, _rvm_ready
    if _rvm_ready is not None:
        return _rvm_ready
    with _MODEL_LOCK:
        if _rvm_ready is not None:
            return _rvm_ready
        try:
            import torch
            if torch.cuda.is_available():
                _device = torch.device("cuda")
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                _device = torch.device("mps")
            else:
                _device = torch.device("cpu")

            _local = os.path.join(os.path.dirname(__file__), "..", "models", "rvm_mobilenetv3.pth")
            if os.path.exists(_local):
                _model = torch.hub.load(
                    "PeterL1n/RobustVideoMatting", "mobilenetv3",
                    pretrained=False, trust_repo=True,
                )
                _model.load_state_dict(torch.load(_local, map_location="cpu"))
            else:
                _model = torch.hub.load(
                    "PeterL1n/RobustVideoMatting", "mobilenetv3",
                    trust_repo=True,
                )
            _model = _model.eval().to(_device)
            _rvm_ready = True
            print(f"[background_blur] RobustVideoMatting/MobileNetV3 ready on {_device}", flush=True)
        except Exception as exc:
            print(f"[background_blur] WARNING: RVM unavailable ({exc}) — blur will copy frames unchanged", flush=True)
            _rvm_ready = False
    return _rvm_ready


def blur_background_clip(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    intensity: int = 25,
    progress_cb: Optional[Callable[[float], None]] = None,
    mask_output_path: Optional[str] = None,
) -> None:
    """Run RVM inference, composite blurred background, and optionally save the alpha mask.

    The mask (grayscale video, one channel repeated 3×) is saved to mask_output_path
    when provided. Subsequent intensity changes can skip inference entirely by calling
    recomposite_from_mask() with the cached mask.

    Falls back to copying frames unchanged when RVM is unavailable.
    """
    if not _load_model():
        _copy_frames(input_path, output_path, source_start, source_end, progress_cb)
        return

    import torch

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

        cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

        k = max(3, int(intensity * 0.5) | 1)
        ds_ratio = 0.25 if max(w, h) >= 1000 else 0.5

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
        if not out.isOpened():
            raise RuntimeError(f"Could not open VideoWriter for: {output_path}")

        mask_out: Optional[cv2.VideoWriter] = None
        if mask_output_path:
            mask_out = cv2.VideoWriter(mask_output_path, fourcc, fps, (w, h))
            if not mask_out.isOpened():
                mask_out = None  # non-fatal — just skip mask saving

        rec = [None] * 4
        frame_idx = 0
        try:
            while True:
                pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                    break
                ret, frame = cap.read()
                if not ret:
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                src = (
                    torch.from_numpy(np.ascontiguousarray(rgb))
                    .permute(2, 0, 1)
                    .unsqueeze(0)
                    .float()
                    .div(255.0)
                    .to(_device)
                )

                with torch.no_grad():
                    _fgr, pha, *rec = _model(src, *rec, downsample_ratio=ds_ratio)

                alpha = pha.squeeze().cpu().numpy()  # H×W float32, 0–1

                if mask_out is not None:
                    alpha_u8 = (alpha * 255).clip(0, 255).astype(np.uint8)
                    mask_out.write(np.stack([alpha_u8, alpha_u8, alpha_u8], axis=-1))

                blurred = cv2.GaussianBlur(frame, (k, k), 0)
                mask_3ch = np.stack([alpha, alpha, alpha], axis=-1)
                composite = (
                    frame.astype(np.float32) * mask_3ch
                    + blurred.astype(np.float32) * (1.0 - mask_3ch)
                )
                out.write(composite.astype(np.uint8))

                frame_idx += 1
                if progress_cb is not None and total_frames > 0:
                    progress_cb(frame_idx / total_frames)
        finally:
            out.release()
            if mask_out is not None:
                mask_out.release()
    finally:
        cap.release()


def recomposite_from_mask(
    original_path: str,
    mask_path: str,
    output_path: str,
    intensity: int = 25,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> None:
    """Fast path: re-composite using a cached alpha mask at a new intensity.

    Skips RVM inference entirely — only Gaussian blur + composite, so this is
    typically 10–20× faster than a full re-process.
    """
    cap_orig = cv2.VideoCapture(original_path)
    cap_mask = cv2.VideoCapture(mask_path)
    if not cap_orig.isOpened():
        raise RuntimeError(f"Could not open original video: {original_path}")
    if not cap_mask.isOpened():
        raise RuntimeError(f"Could not open mask video: {mask_path}")
    try:
        fps = cap_orig.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap_orig.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap_orig.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap_orig.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

        k = max(3, int(intensity * 0.5) | 1)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
        if not out.isOpened():
            raise RuntimeError(f"Could not open VideoWriter for: {output_path}")

        frame_idx = 0
        try:
            while True:
                ret1, frame = cap_orig.read()
                ret2, mask_frame = cap_mask.read()
                if not ret1 or not ret2:
                    break

                alpha = mask_frame[:, :, 0].astype(np.float32) / 255.0
                blurred = cv2.GaussianBlur(frame, (k, k), 0)
                mask_3ch = np.stack([alpha, alpha, alpha], axis=-1)
                composite = (
                    frame.astype(np.float32) * mask_3ch
                    + blurred.astype(np.float32) * (1.0 - mask_3ch)
                )
                out.write(composite.astype(np.uint8))

                frame_idx += 1
                if progress_cb is not None and total_frames > 0:
                    progress_cb(frame_idx / total_frames)
        finally:
            out.release()
    finally:
        cap_orig.release()
        cap_mask.release()


def _copy_frames(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> None:
    """Copy frames unchanged — fallback when RVM is unavailable."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
        if not out.isOpened():
            raise RuntimeError(f"Could not open VideoWriter for: {output_path}")
        frame_idx = 0
        try:
            while True:
                pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                    break
                ret, frame = cap.read()
                if not ret:
                    break
                out.write(frame)
                frame_idx += 1
                if progress_cb is not None and total_frames > 0:
                    progress_cb(frame_idx / total_frames)
        finally:
            out.release()
    finally:
        cap.release()
