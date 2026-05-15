from __future__ import annotations

import atexit
import threading
import uuid
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import cv2
import torch

from database import get_db

UPLOADS = Path(__file__).parent.parent / "uploads"
_executor = ThreadPoolExecutor(max_workers=1)
atexit.register(_executor.shutdown, wait=False)

_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}  # f"{file_id}:{fidelity_weight:.2f}" → job_id
_jobs_lock = threading.Lock()

_components = None
_components_lock = threading.Lock()


def _get_components() -> dict:
    global _components
    if _components is None:
        with _components_lock:
            if _components is None:
                # Import already-initialised singletons from codeformer.app
                # (module-level weight download + model load happens on first import)
                from codeformer.app import codeformer_net  # type: ignore
                from codeformer.basicsr.utils import img2tensor, tensor2img  # type: ignore
                from torchvision.transforms.functional import normalize
                from codeformer.facelib.utils.face_restoration_helper import FaceRestoreHelper  # type: ignore
                # Derive device from where the model weights actually live — codeformer.app's
                # 'device' variable may point to MPS while the weights were loaded on CPU,
                # causing a type mismatch on Apple Silicon.
                device = next(codeformer_net.parameters()).device
                _components = {
                    "net": codeformer_net,
                    "device": device,
                    "img2tensor": img2tensor,
                    "tensor2img": tensor2img,
                    "normalize": normalize,
                    "FaceRestoreHelper": FaceRestoreHelper,
                }
    return _components


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    restored_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


def start_job(file_id: str, fidelity_weight: float = 0.7) -> str:
    key = f"{file_id}:{fidelity_weight:.2f}"
    with _jobs_lock:
        existing = _active_file_jobs.get(key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(f"[face-restore] re-using in-progress job {existing[:8]} for file {file_id[:8]}", flush=True)
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[key] = job_id
    _executor.submit(_run_job, job_id, file_id, fidelity_weight, key, state)
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
                return
            stem = Path(row["original_name"]).stem
            conn.execute(
                "INSERT OR IGNORE INTO files (id, project_id, original_name, duration, width, height, path) VALUES (?,?,?,?,?,?,?)",
                (new_id, row["project_id"], f"{stem}_facerestored.mp4", row["duration"], row["width"], row["height"], output_path),
            )
    except Exception as exc:
        print(f"[face-restore] warning: could not register restored file in DB — {exc}", flush=True)


def _restore_frame(comps: dict, frame_bgr, fidelity_weight: float, face_helper) -> object:
    net = comps["net"]
    device = comps["device"]
    img2tensor = comps["img2tensor"]
    tensor2img = comps["tensor2img"]
    normalize = comps["normalize"]

    face_helper.clean_all()
    face_helper.read_image(frame_bgr)
    num_faces = face_helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    if num_faces == 0:
        return frame_bgr

    face_helper.align_warp_face()

    for cropped_face in face_helper.cropped_faces:
        face_t = img2tensor(cropped_face / 255.0, bgr2rgb=True, float32=True)
        normalize(face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
        face_t = face_t.unsqueeze(0).to(device)
        try:
            with torch.no_grad():
                output = net(face_t, w=fidelity_weight, adain=True)[0]
                restored_face = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
        except RuntimeError:
            restored_face = tensor2img(face_t, rgb2bgr=True, min_max=(-1, 1))
        face_helper.add_restored_face(restored_face.astype("uint8"))

    face_helper.get_inverse_affine(None)
    return face_helper.paste_faces_to_input_image(upsample_img=None, draw_box=False)


def _run_job(job_id: str, file_id: str, fidelity_weight: float, cache_key: str, state: _JobState) -> None:
    print(f"[face-restore] job {job_id[:8]}: starting for file {file_id[:8]} fidelity={fidelity_weight}", flush=True)
    video_only = None
    try:
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")

        input_path = str(matches[0])
        restored_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{restored_id}.mp4")
        video_only = str(UPLOADS / f"{restored_id}_noaudio.mp4")

        comps = _get_components()
        FaceRestoreHelper = comps["FaceRestoreHelper"]
        device = comps["device"]

        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(video_only, fourcc, fps, (w, h))

        try:
            face_helper = FaceRestoreHelper(
                1, face_size=512, crop_ratio=(1, 1),
                det_model="retinaface_resnet50", save_ext="png",
                use_parse=True, device=device,
            )
            idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                restored = _restore_frame(comps, frame, fidelity_weight, face_helper)
                writer.write(restored)
                idx += 1
                state.progress = (idx / total) * 0.9

            print(f"[face-restore] job {job_id[:8]}: muxing audio…", flush=True)
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", video_only,
                    "-i", input_path,
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest",
                    output_path,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg mux failed:\n{result.stderr[-2000:]}")
        finally:
            cap.release()
            writer.release()
            Path(video_only).unlink(missing_ok=True)
            video_only = None

        _register_file(file_id, restored_id, output_path)
        state.restored_file_id = restored_id
        state.progress = 1.0
        state.status = "done"
        print(f"[face-restore] job {job_id[:8]} done → {restored_id[:8]}", flush=True)

    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[face-restore] job {job_id[:8]} ERROR: {exc}", flush=True)
    finally:
        if video_only:
            Path(video_only).unlink(missing_ok=True)
        with _jobs_lock:
            if _active_file_jobs.get(cache_key) == job_id:
                del _active_file_jobs[cache_key]
