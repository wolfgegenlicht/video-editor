import os
import cv2
import numpy as np

_mp_seg = None
_MEDIAPIPE_AVAILABLE = False

try:
    import mediapipe as mp
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "selfie_segmentation"):
        _mp_seg = mp.solutions.selfie_segmentation
        _MEDIAPIPE_AVAILABLE = True
    else:
        print("[background_blur] WARNING: mediapipe>=0.10 detected but legacy solutions API unavailable — blur_background_clip will copy frames unchanged")
except ImportError:
    print("[background_blur] WARNING: mediapipe not installed — blur_background_clip will be a no-op")


def blur_background_clip(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    intensity: int = 25,
) -> None:
    """Pre-process a clip segment by blurring the background behind detected persons.

    Reads frames from source_start..source_end, runs MediaPipe selfie segmentation
    per frame, composites sharp foreground over blurred background, and writes
    video-only output to output_path. Audio is not included — FFmpeg adds it later.

    Falls back to copying original frames when MediaPipe is unavailable or when
    no person is detected in a frame.
    """
    if not _MEDIAPIPE_AVAILABLE:
        _copy_frames(input_path, output_path, source_start, source_end)
        return

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Seek to source_start
    cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

    # Kernel must be odd and >= 3
    k = max(3, int(intensity * 0.5) | 1)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    with _mp_seg.SelfieSegmentation(model_selection=1) as seg:
        while True:
            pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                break
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = seg.process(rgb)
            mask = result.segmentation_mask  # float32 H×W, 0=background 1=person

            if mask.max() < 0.05:
                # No person detected — write original frame unchanged
                out.write(frame)
                continue

            blurred = cv2.GaussianBlur(frame, (k, k), 0)
            mask_3ch = np.stack([mask, mask, mask], axis=-1)
            composite = (frame.astype(np.float32) * mask_3ch +
                         blurred.astype(np.float32) * (1.0 - mask_3ch))
            out.write(composite.astype(np.uint8))

    cap.release()
    out.release()


def _copy_frames(input_path: str, output_path: str, source_start: float, source_end: float) -> None:
    """Copy frames from source_start to source_end without modification."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    while True:
        pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        if pos_ms >= source_end * 1000.0 - (500.0 / fps):
            break
        ret, frame = cap.read()
        if not ret:
            break
        out.write(frame)

    cap.release()
    out.release()
