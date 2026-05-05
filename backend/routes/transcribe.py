from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.transcription import transcribe

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"

class TranscribeRequest(BaseModel):
    fileId: str

@router.post("/transcribe")
async def transcribe_file(req: TranscribeRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, "File not found")
    segments = transcribe(matches[0])
    return {"segments": segments}
