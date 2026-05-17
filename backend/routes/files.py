from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from database import get_db

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"

@router.get("/files/{file_id}")
async def serve_file(file_id: str):
    matches = list(UPLOADS.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(404, "File not found")
    return FileResponse(str(matches[0]))

@router.delete("/files/{file_id}")
def delete_file(file_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT path FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        Path(row["path"]).unlink(missing_ok=True)
        # Remove any cached blur mask tied to this source file
        (UPLOADS / f"{file_id}_blur_mask.mp4").unlink(missing_ok=True)
        conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
    return {"ok": True}
