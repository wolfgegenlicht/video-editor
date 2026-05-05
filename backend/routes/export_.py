from pathlib import Path
from fastapi import APIRouter, HTTPException

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
