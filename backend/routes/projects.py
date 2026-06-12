import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_db
from pathlib import Path

router = APIRouter()
UPLOADS = Path(__file__).parent.parent / "uploads"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_default_project(project_id: str, name: str) -> dict:
    return {
        "id": project_id,
        "name": name,
        "aspectRatio": "16:9",
        "captionStyle": "minimal",
        "tracks": [{"id": str(uuid.uuid4()), "type": "video", "clips": []}],
        "captions": [],
    }


def _row_to_file(row) -> dict:
    return {
        "fileId": row["id"],
        "originalName": row["original_name"],
        "duration": row["duration"],
        "width": row["width"],
        "height": row["height"],
    }


class CreateProjectBody(BaseModel):
    name: str


class SaveProjectBody(BaseModel):
    project: dict


class RenameProjectBody(BaseModel):
    name: str


@router.get("/projects")
def list_projects():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC"
        ).fetchall()
    return [{"id": r["id"], "name": r["name"], "updated_at": r["updated_at"]} for r in rows]


@router.post("/projects")
def create_project(body: CreateProjectBody):
    project_id = str(uuid.uuid4())
    now = _now()
    project = _make_default_project(project_id, body.name)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, project_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, body.name, json.dumps(project), now, now),
        )
    return {"project": project, "files": []}


def _collect_file_ids(project: dict) -> set[str]:
    ids: set[str] = set()
    processed_fields = ("blurBackgroundFileId",)
    for track in project.get("tracks", []):
        for clip in track.get("clips", []):
            if fid := clip.get("fileId"):
                ids.add(fid)
            for field in processed_fields:
                if fid := clip.get(field):
                    ids.add(fid)
    return ids


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT project_json FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        file_rows = conn.execute(
            "SELECT * FROM files WHERE project_id = ?", (project_id,)
        ).fetchall()
    project = json.loads(row["project_json"])
    missing = [fid for fid in _collect_file_ids(project) if not list(UPLOADS.glob(f"{fid}.*"))]
    return {
        "project": project,
        "files": [_row_to_file(f) for f in file_rows],
        "missingFileIds": missing,
    }


@router.put("/projects/{project_id}")
def save_project(project_id: str, body: SaveProjectBody):
    now = _now()
    name = body.project.get("name", "")
    with get_db() as conn:
        result = conn.execute(
            "UPDATE projects SET project_json = ?, name = ?, updated_at = ? WHERE id = ?",
            (json.dumps(body.project), name, now, project_id),
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Project not found")
    return {"ok": True}


@router.patch("/projects/{project_id}/name")
def rename_project(project_id: str, body: RenameProjectBody):
    now = _now()
    with get_db() as conn:
        result = conn.execute(
            "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
            (body.name, now, project_id),
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Project not found")
    return {"ok": True}


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    with get_db() as conn:
        file_rows = conn.execute(
            "SELECT path FROM files WHERE project_id = ?", (project_id,)
        ).fetchall()
        for f in file_rows:
            Path(f["path"]).unlink(missing_ok=True)
        result = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if result.rowcount == 0:
            raise HTTPException(404, "Project not found")
    return {"ok": True}
