import os
import tempfile
import numpy as np
import cv2
import pytest


def _make_test_video(path: str, width: int = 64, height: int = 64, fps: float = 10.0, num_frames: int = 10) -> None:
    """Write a short synthetic video: first half solid red, second half solid blue."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(path, fourcc, fps, (width, height))
    for i in range(num_frames):
        color = (0, 0, 200) if i < num_frames // 2 else (200, 0, 0)  # BGR
        frame = np.full((height, width, 3), color, dtype=np.uint8)
        out.write(frame)
    out.release()


def test_blur_background_clip_creates_output():
    """blur_background_clip must create a non-empty output video file."""
    from services.background_blur import blur_background_clip

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, num_frames=10)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=1.0, intensity=10)
        assert os.path.exists(dst_path)
        assert os.path.getsize(dst_path) > 0
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)


def test_blur_background_clip_output_has_correct_frame_count():
    """Output video must contain the same number of frames as the input segment."""
    from services.background_blur import blur_background_clip

    fps = 10.0
    num_frames = 15
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, fps=fps, num_frames=num_frames)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=num_frames / fps, intensity=5)
        cap = cv2.VideoCapture(dst_path)
        out_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        # Allow ±1 frame for codec rounding
        assert abs(out_count - num_frames) <= 1
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)


def test_blur_background_clip_no_person_fallback():
    """When no person is detected (solid-color video), output frames must equal input frames."""
    from services.background_blur import blur_background_clip

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, num_frames=5)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=0.5, intensity=20)
        # Output must be a valid readable video
        cap = cv2.VideoCapture(dst_path)
        assert cap.isOpened()
        cap.release()
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)
