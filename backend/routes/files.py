from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"

@router.get("/files/{file_id}")
async def serve_file(file_id: str):
    matches = list(UPLOADS.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(404, "File not found")
    return FileResponse(str(matches[0]))
