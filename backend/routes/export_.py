from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

import services.export_job as svc

router = APIRouter()


class ExportOptions(BaseModel):
    resolution: int = 1080
    burn_captions: bool = False
    preset: str = "fast"
    preview_width: int = 720
    caption_line_breaks: dict[str, list[list[int]]] = {}


class ExportStartRequest(BaseModel):
    project: dict
    options: ExportOptions = ExportOptions()
    filename: str = "export.mp4"


@router.post("/export/start")
async def start_export(req: ExportStartRequest):
    job_id = svc.start_job(req.project, req.options.model_dump(), req.filename)
    return {"jobId": job_id, "filename": req.filename}


@router.get("/export/status/{job_id}")
async def export_status(job_id: str):
    state = svc.get_job(job_id)
    if not state:
        raise HTTPException(404, "Job not found")
    return {"status": state.status, "progress": state.progress, "error": state.error}


@router.get("/export/download/{job_id}")
async def download_export(job_id: str):
    state = svc.get_job(job_id)
    if not state or state.status != "done":
        raise HTTPException(404, "Export not ready")
    return FileResponse(
        str(state.output_path),
        filename=state.filename,
        media_type="video/mp4",
    )
