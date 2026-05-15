from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import services.portrait_relight as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class ProcessRequest(BaseModel):
    fileId: str
    preset: str = Field(default="ring", pattern="^(front|ring|window|side_key)$")
    intensity: float = Field(default=0.5, ge=0.0, le=1.0)


@router.post("/portrait-relight/process")
async def start_process(req: ProcessRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId, req.preset, req.intensity)
    return {"jobId": job_id}


@router.get("/portrait-relight/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "relitFileId": state.relit_file_id,
        "progress": state.progress,
        "error": state.error,
    }


@router.delete("/portrait-relight/files/{file_id}")
async def delete_file(file_id: str):
    for match in UPLOADS.glob(f"{file_id}.*"):
        match.unlink(missing_ok=True)
    return {"ok": True}
