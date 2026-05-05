from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import FileResponse
from services.ffmpeg import export as ffmpeg_export

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"

@router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    matches = list(UPLOADS.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(404, "File not found")
    for f in matches:
        f.unlink()
    return {"deleted": file_id}

@router.post("/export")
async def export_project(project: dict = Body(...)):
    try:
        out_path = ffmpeg_export(project, UPLOADS)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return FileResponse(str(out_path), filename="export.mp4", media_type="video/mp4")
