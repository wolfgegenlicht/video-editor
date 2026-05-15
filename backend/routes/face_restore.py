from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import services.face_restore as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class ProcessRequest(BaseModel):
    fileId: str
    fidelityWeight: float = Field(default=0.7, ge=0.0, le=1.0)


@router.post("/face-restore/process")
async def start_process(req: ProcessRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId, req.fidelityWeight)
    return {"jobId": job_id}


@router.get("/face-restore/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "restoredFileId": state.restored_file_id,
        "progress": state.progress,
        "error": state.error,
    }


@router.delete("/face-restore/files/{file_id}")
async def delete_file(file_id: str):
    for match in UPLOADS.glob(f"{file_id}.*"):
        match.unlink(missing_ok=True)
    return {"ok": True}
