import uuid, subprocess, json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 4 * 1024 ** 3  # 4 GB

def _probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise ValueError(result.stderr or "ffprobe failed")
    data = json.loads(result.stdout)
    video = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), None)
    audio = next((s for s in data.get("streams", []) if s["codec_type"] == "audio"), None)
    stream = video or audio
    stream_duration = float(stream.get("duration", 0)) if stream else 0
    format_duration = float(data.get("format", {}).get("duration", 0))
    duration = stream_duration or format_duration
    width = int(video["width"]) if video else 0
    height = int(video["height"]) if video else 0
    return {"duration": duration, "width": width, "height": height}

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    dest = UPLOADS / f"{file_id}{ext}"
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 4 GB)")
    dest.write_bytes(content)
    try:
        info = _probe(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Cannot probe file: {e}")
    return {"fileId": file_id, **info, "originalName": original_name}
