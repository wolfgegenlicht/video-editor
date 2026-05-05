import uuid, subprocess, json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"
UPLOADS.mkdir(exist_ok=True)

def _probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(path)],
        capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    stream = video or audio
    duration = float(stream.get("duration", 0)) if stream else 0
    width = int(video["width"]) if video else 0
    height = int(video["height"]) if video else 0
    return {"duration": duration, "width": width, "height": height}

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix
    dest = UPLOADS / f"{file_id}{ext}"
    content = await file.read()
    dest.write_bytes(content)
    try:
        info = _probe(dest)
    except Exception:
        raise HTTPException(400, "Cannot probe file — is FFmpeg installed?")
    return {"fileId": file_id, **info, "originalName": file.filename}
