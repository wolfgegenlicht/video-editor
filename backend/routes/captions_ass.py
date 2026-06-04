"""Serve the caption ASS to the frontend so the PREVIEW can render captions with
libass (JASSUB) using the EXACT same subtitle the export burns. This is the single
source of truth for caption rendering — preview and export call the same
generate_ass(), so they match by construction. See generate_ass / ffmpeg.export.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from services.ass_generator import generate_ass
from services.ffmpeg import CANVAS_SIZES

router = APIRouter()


class CaptionAssRequest(BaseModel):
    captions: list[Any]
    style: dict
    aspectRatio: str = "16:9"
    # Preview always renders at the 1080p reference canvas; libass scales it to the
    # preview surface, and the export scales the same proportions to its own canvas.
    resolution: int = 1080


@router.post("/captions/ass")
def caption_ass(req: CaptionAssRequest):
    W, H = CANVAS_SIZES.get(req.aspectRatio, CANVAS_SIZES["16:9"]).get(req.resolution, (1920, 1080))
    # No caption_line_breaks: let generate_ass do its own wrapping so preview and
    # export wrap identically (both go through the same code path).
    ass = generate_ass(req.captions, req.style, W, H)
    return {"ass": ass, "width": W, "height": H}
