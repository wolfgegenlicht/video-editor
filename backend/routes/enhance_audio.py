from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import services.audio_enhance as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class EnhanceRequest(BaseModel):
    fileId: str
    enhanceType: str


@router.post("/enhance-audio/start")
async def start_enhance(req: EnhanceRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId, req.enhanceType)
    return {"jobId": job_id}


@router.get("/enhance-audio/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "progress": state.progress,
        "enhancedFileId": state.enhanced_file_id,
        "error": state.error,
    }


@router.delete("/enhance-audio/cancel/{job_id}")
async def cancel_enhance(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    svc.cancel_job(job_id)
    return {"ok": True}
