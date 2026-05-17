import re
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class SilenceRequest(BaseModel):
    fileId: str
    minSilence: float = 0.5   # seconds — minimum silence duration to detect
    threshold: float = -40.0  # dBFS — audio level considered silence


@router.post("/silence-detect")
async def detect_silence(req: SilenceRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")

    file_path = matches[0]
    threshold = max(-90.0, min(-20.0, req.threshold))
    min_duration = max(0.1, min(10.0, req.minSilence))

    cmd = [
        "ffmpeg", "-i", str(file_path),
        "-af", f"silencedetect=n={threshold}dB:d={min_duration}",
        "-f", "null", "-",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        output = result.stderr  # FFmpeg writes filter output to stderr
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Silence detection timed out")
    except Exception as exc:
        raise HTTPException(500, f"Silence detection failed: {exc}")

    starts = [float(m.group(1)) for m in re.finditer(r"silence_start:\s*([\d.]+)", output)]
    ends = [float(m.group(1)) for m in re.finditer(r"silence_end:\s*([\d.]+)", output)]

    ranges = []
    for i, start in enumerate(starts):
        if i < len(ends):
            ranges.append({"start": start, "end": ends[i]})

    return {"ranges": ranges}
