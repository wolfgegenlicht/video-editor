import atexit
import json
import re
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from database import get_db

UPLOADS = Path(__file__).parent.parent / "uploads"
_executor = ThreadPoolExecutor(max_workers=1)  # one enhancement job at a time
atexit.register(_executor.shutdown, wait=False)
_jobs: dict[str, "_JobState"] = {}
_active_file_jobs: dict[str, str] = {}  # f"{file_id}:{enhance_type}" → job_id for in-progress jobs
_jobs_lock = threading.Lock()


@dataclass
class _JobState:
    status: Literal["processing", "done", "error"] = "processing"
    enhanced_file_id: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None
    cancelled: bool = False


def start_job(file_id: str, enhance_type: str) -> str:
    key = f"{file_id}:{enhance_type}"
    with _jobs_lock:
        # Re-use an existing in-progress job for the same file+type instead of queuing a duplicate
        existing = _active_file_jobs.get(key)
        if existing and _jobs.get(existing, _JobState()).status == "processing":
            print(f"[audio-enhance] re-using in-progress job {existing[:8]} for file {file_id[:8]} ({enhance_type})", flush=True)
            return existing
        job_id = str(uuid.uuid4())
        state = _JobState()
        _jobs[job_id] = state
        _active_file_jobs[key] = job_id
    _executor.submit(_run_job, job_id, file_id, enhance_type, state)
    return job_id


def get_job(job_id: str) -> Optional[_JobState]:
    with _jobs_lock:
        return _jobs.get(job_id)


def cancel_job(job_id: str) -> None:
    with _jobs_lock:
        state = _jobs.get(job_id)
        if state and state.status == "processing":
            state.cancelled = True


def _register_enhanced_file(source_file_id: str, enhanced_id: str, output_path: str) -> None:
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT project_id, original_name, duration, width, height FROM files WHERE id = ?",
                (source_file_id,),
            ).fetchone()
            if not row:
                return
            enhanced_name = Path(row["original_name"]).stem + "_enhanced.mp4"
            conn.execute(
                "INSERT OR IGNORE INTO files (id, project_id, original_name, duration, width, height, path) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (enhanced_id, row["project_id"], enhanced_name, row["duration"], row["width"], row["height"], output_path),
            )
    except Exception as exc:
        print(f"[audio-enhance] warning: could not register enhanced file in DB — {exc}", flush=True)


def _apply_loudnorm(input_wav: str, output_wav: str) -> None:
    """Apply two-pass loudnorm. Falls back to single-pass if JSON parsing fails."""
    # Pass 1: measure
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", input_wav,
            "-af", "loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    stderr = result.stderr

    # Extract JSON block from stderr
    measured_I = measured_TP = measured_LRA = measured_thresh = None
    try:
        match = re.search(r'\{[^{}]*"input_i"\s*:', stderr)
        if match:
            # Find the full JSON object starting from the match
            start = match.start()
            # Find balanced braces
            depth = 0
            end = start
            for i, ch in enumerate(stderr[start:], start):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            json_str = stderr[start:end]
            data = json.loads(json_str)
            measured_I = data.get("input_i")
            measured_TP = data.get("input_tp")
            measured_LRA = data.get("input_lra")
            measured_thresh = data.get("input_thresh")
    except Exception as exc:
        print(f"[audio-enhance] loudnorm JSON parse failed: {exc}; falling back to single-pass", flush=True)

    if measured_I is not None and measured_TP is not None and measured_LRA is not None and measured_thresh is not None:
        # Pass 2: apply with measured values for accurate linear normalization
        af = (
            f"loudnorm=I=-23:TP=-1.5:LRA=11"
            f":measured_I={measured_I}:measured_TP={measured_TP}"
            f":measured_LRA={measured_LRA}:measured_thresh={measured_thresh}"
            f":linear=true"
        )
        result2 = subprocess.run(
            ["ffmpeg", "-y", "-i", input_wav, "-af", af, output_wav],
            capture_output=True,
            text=True,
        )
        if result2.returncode != 0:
            raise RuntimeError(f"FFmpeg loudnorm pass 2 failed:\n{result2.stderr[-2000:]}")
    else:
        # Single-pass fallback
        result_fb = subprocess.run(
            ["ffmpeg", "-y", "-i", input_wav, "-af", "loudnorm", output_wav],
            capture_output=True,
            text=True,
        )
        if result_fb.returncode != 0:
            raise RuntimeError(f"FFmpeg loudnorm single-pass failed:\n{result_fb.stderr[-2000:]}")


def _check_cancelled(state: _JobState, job_id: str) -> None:
    if state.cancelled:
        raise RuntimeError(f"Job {job_id[:8]} was cancelled")


def _run_job(job_id: str, file_id: str, enhance_type: str, state: _JobState) -> None:
    print(f"[audio-enhance] job {job_id[:8]}: starting for file {file_id[:8]} ({enhance_type})", flush=True)
    tmp_dir = tempfile.mkdtemp(dir=str(UPLOADS))
    tmp_files: list[str] = []
    key = f"{file_id}:{enhance_type}"
    try:
        # Step 1: Find input file
        matches = list(UPLOADS.glob(f"{file_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Source file {file_id} not found in uploads")
        input_path = str(matches[0])

        # Step 2: Initial progress
        state.progress = 0.05
        _check_cancelled(state, job_id)

        # Step 3: Extract audio as WAV at 48 kHz
        tmp_wav = str(Path(tmp_dir) / "input.wav")
        tmp_files.append(tmp_wav)
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "48000",
                tmp_wav,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg audio extraction failed:\n{result.stderr[-2000:]}")

        # Step 4
        state.progress = 0.15
        _check_cancelled(state, job_id)

        enhanced_wav = str(Path(tmp_dir) / "enhanced.wav")
        tmp_files.append(enhanced_wav)

        # Step 5: normalize
        if enhance_type == "normalize":
            print(f"[audio-enhance] job {job_id[:8]}: applying loudnorm", flush=True)
            _apply_loudnorm(tmp_wav, enhanced_wav)

        # Step 6: denoise / clarity
        elif enhance_type in ("denoise", "clarity"):
            print(f"[audio-enhance] job {job_id[:8]}: running DeepFilterNet", flush=True)
            import soundfile as sf
            from df.enhance import enhance, init_df

            model, df_state, _ = init_df()
            audio, sr = sf.read(tmp_wav)
            state.progress = 0.3
            _check_cancelled(state, job_id)

            enhanced_audio = enhance(model, df_state, audio)
            state.progress = 0.85
            sf.write(enhanced_wav, enhanced_audio, sr)
            print(f"[audio-enhance] job {job_id[:8]}: DeepFilterNet done", flush=True)

            if enhance_type == "clarity":
                # Also apply loudnorm after denoising
                _check_cancelled(state, job_id)
                loudnorm_wav = str(Path(tmp_dir) / "loudnorm.wav")
                tmp_files.append(loudnorm_wav)
                print(f"[audio-enhance] job {job_id[:8]}: applying loudnorm for clarity", flush=True)
                _apply_loudnorm(enhanced_wav, loudnorm_wav)
                # Rename loudnorm_wav → enhanced_wav
                Path(loudnorm_wav).replace(Path(enhanced_wav))
        else:
            raise ValueError(f"Unknown enhance_type: {enhance_type!r}")

        # Step 7
        state.progress = 0.90
        _check_cancelled(state, job_id)

        # Step 8: Determine output format and mux
        enhanced_id = str(uuid.uuid4())
        output_path = str(UPLOADS / f"{enhanced_id}.mp4")

        has_video_result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                input_path,
            ],
            capture_output=True,
            text=True,
        )
        has_video = has_video_result.stdout.strip() == "video"

        if has_video:
            # Mux enhanced audio with original video
            mux_result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", input_path,
                    "-i", enhanced_wav,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-shortest",
                    output_path,
                ],
                capture_output=True,
                text=True,
            )
            if mux_result.returncode != 0:
                raise RuntimeError(f"FFmpeg mux failed:\n{mux_result.stderr[-2000:]}")
        else:
            # Audio-only output
            audio_result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", enhanced_wav,
                    "-c:a", "aac",
                    output_path,
                ],
                capture_output=True,
                text=True,
            )
            if audio_result.returncode != 0:
                raise RuntimeError(f"FFmpeg audio encode failed:\n{audio_result.stderr[-2000:]}")

        # Step 9: Register in DB
        _register_enhanced_file(file_id, enhanced_id, output_path)

        # Step 10: Done
        state.enhanced_file_id = enhanced_id
        state.status = "done"
        state.progress = 1.0
        print(f"[audio-enhance] job {job_id[:8]}: done → {enhanced_id[:8]}", flush=True)

    except Exception as exc:
        state.status = "error"
        state.error = str(exc)
        print(f"[audio-enhance] job {job_id[:8]}: ERROR — {exc}", flush=True)
    finally:
        # Step 11: Clean up temp files
        import shutil
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
        with _jobs_lock:
            if _active_file_jobs.get(key) == job_id:
                del _active_file_jobs[key]
