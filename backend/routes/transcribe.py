import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from services.transcription import transcribe

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

class TranscribeRequest(BaseModel):
    fileId: str

    @field_validator("fileId")
    @classmethod
    def must_be_uuid(cls, v: str) -> str:
        if not UUID_RE.fullmatch(v):
            raise ValueError("fileId must be a valid UUID")
        return v

@router.post("/transcribe")
def transcribe_file(req: TranscribeRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, "File not found")
    segments = transcribe(matches[0])
    return {"segments": segments}
