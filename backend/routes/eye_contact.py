from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import services.eye_contact as svc

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class ProcessRequest(BaseModel):
    fileId: str


@router.post("/eye-contact/process")
async def start_process(req: ProcessRequest):
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId)
    return {"jobId": job_id}


@router.get("/eye-contact/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")
    return {
        "status": state.status,
        "correctedFileId": state.corrected_file_id,
        "progress": state.progress,
        "error": state.error,
    }


@router.delete("/eye-contact/jobs/{job_id}")
async def cancel_job(job_id: str):
    ok = svc.cancel_job(job_id)
    if not ok:
        raise HTTPException(404, "Job not found or not processing")
    return {"ok": True}


@router.delete("/eye-contact/files/{file_id}")
async def delete_corrected_file(file_id: str):
    for match in UPLOADS.glob(f"{file_id}.*"):
        match.unlink(missing_ok=True)
    return {"ok": True}
