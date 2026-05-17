import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import services.reframe_analysis as svc

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


class AnalyzeRequest(BaseModel):
    fileId: str


@router.post("/reframe/analyze")
async def start_analyze(req: AnalyzeRequest):
    if not _UUID_RE.match(req.fileId):
        raise HTTPException(400, "Invalid fileId")
    matches = list(UPLOADS.glob(f"{req.fileId}.*"))
    if not matches:
        raise HTTPException(404, f"File {req.fileId} not found")
    job_id = svc.start_job(req.fileId)
    return {"jobId": job_id}


@router.get("/reframe/status/{job_id}")
async def get_status(job_id: str):
    state = svc.get_job(job_id)
    if state is None:
        raise HTTPException(404, "Job not found")

    response = {
        "status": state.status,
        "progress": state.progress,
    }

    # Only include trackPoints when analysis is done
    if state.status == "done":
        response["trackPoints"] = state.track_points

    if state.error:
        response["error"] = state.error

    return response


@router.delete("/reframe/jobs/{job_id}")
async def cancel_job(job_id: str):
    ok = svc.cancel_job(job_id)
    if not ok:
        raise HTTPException(404, "Job not found")
    return {"ok": True}
