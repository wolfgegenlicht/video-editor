import atexit
import os
import cv2
import numpy as np

_segmenter = None
_MEDIAPIPE_AVAILABLE = False

# Model lives at backend/models/selfie_segmenter_landscape.tflite
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "selfie_segmenter_landscape.tflite")

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision

    if os.path.exists(_MODEL_PATH):
        _base_options = mp_tasks.BaseOptions(model_asset_path=os.path.abspath(_MODEL_PATH))
        _options = mp_vision.ImageSegmenterOptions(
            base_options=_base_options,
            output_category_mask=True,  # category 0=background, 1=person
        )
        _segmenter = mp_vision.ImageSegmenter.create_from_options(_options)
        atexit.register(_segmenter.close)
        _MEDIAPIPE_AVAILABLE = True
    else:
        print(
            "[background_blur] WARNING: model file not found at "
            f"{_MODEL_PATH!r} — blur_background_clip will copy frames unchanged. "
            "Download selfie_segmenter_landscape.tflite to backend/models/."
        )
except (ImportError, AttributeError) as _exc:
    print(f"[background_blur] WARNING: mediapipe Tasks API unavailable ({_exc}) — blur_background_clip will copy frames unchanged")


def blur_background_clip(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    intensity: int = 25,
) -> None:
    """Pre-process a clip segment by blurring the background behind detected persons.

    Reads frames from source_start..source_end, runs MediaPipe ImageSegmenter
    (Tasks API, selfie_segmenter_landscape model) per frame, composites sharp
    foreground over blurred background, and writes video-only output to
    output_path. Audio is not included — FFmpeg adds it later.

    Falls back to copying original frames when MediaPipe is unavailable or when
    no person is detected in a frame.
    """
    if not _MEDIAPIPE_AVAILABLE or _segmenter is None:
        _copy_frames(input_path, output_path, source_start, source_end)
        return

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Seek to source_start
        cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

        # Kernel must be odd and >= 3
        k = max(3, int(intensity * 0.5) | 1)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
        if not out.isOpened():
            raise RuntimeError(f"Could not open VideoWriter for: {output_path}")
        try:
            while True:
                pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                    break
                ret, frame = cap.read()
                if not ret:
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = _segmenter.segment(mp_image)

                # category_mask is an mp.Image; numpy_view() gives uint8 (H, W, 1) or (H, W)
                raw_mask = result.category_mask.numpy_view()
                if raw_mask.ndim == 3:
                    raw_mask = raw_mask[:, :, 0]  # collapse channel dim

                # 1 = person, 0 = background
                mask = (raw_mask == 1).astype(np.float32)

                if mask.max() < 0.05:
                    # No person detected — write original frame unchanged
                    out.write(frame)
                    continue

                blurred = cv2.GaussianBlur(frame, (k, k), 0)
                mask_3ch = np.stack([mask, mask, mask], axis=-1)
                composite = (frame.astype(np.float32) * mask_3ch +
                             blurred.astype(np.float32) * (1.0 - mask_3ch))
                out.write(composite.astype(np.uint8))
        finally:
            out.release()
    finally:
        cap.release()


def _copy_frames(input_path: str, output_path: str, source_start: float, source_end: float) -> None:
    """Copy frames from source_start to source_end without modification."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
        if not out.isOpened():
            raise RuntimeError(f"Could not open VideoWriter for: {output_path}")
        try:
            while True:
                pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                    break
                ret, frame = cap.read()
                if not ret:
                    break
                out.write(frame)
        finally:
            out.release()
    finally:
        cap.release()
