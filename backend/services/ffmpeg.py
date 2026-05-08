import subprocess, uuid, re
from pathlib import Path

OUT = Path(__file__).parent.parent / "out"
OUT.mkdir(exist_ok=True)

# Canvas dimensions per aspect ratio
CANVAS_SIZES: dict[str, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1":  (1080, 1080),
    "4:3":  (1440, 1080),
}

# Base scale filter: cover (fills canvas, crops excess) instead of contain+pad
RATIO_FILTERS = {
    "16:9": "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
    "9:16": "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "1:1":  "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080",
    "4:3":  "scale=1440:1080:force_original_aspect_ratio=increase,crop=1440:1080",
}

def _build_transform_filter(transform: dict, W: int, H: int) -> str:
    """Return an ffmpeg filter string that applies the clip transform.

    Operations: scale-to-cover-at-scale-factor → rotate → crop-to-canvas-with-offset.
    Returns empty string for identity transforms (skip to avoid re-encode overhead).
    """
    x = transform.get("x", 0)
    y = transform.get("y", 0)
    scale = max(1.0, min(5.0, transform.get("scale", 1.0)))
    rotation = transform.get("rotation", 0)

    identity = (x == 0 and y == 0 and scale == 1.0 and rotation == 0)
    if identity:
        return ""

    scaled_w = int(W * scale)
    scaled_h = int(H * scale)

    # 1. Scale source to cover canvas * scale factor
    parts = [f"scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=increase,crop={scaled_w}:{scaled_h}"]

    # 2. Rotate (keeps dimensions; corners may show black fill)
    if rotation != 0:
        r_rad = rotation * 3.14159265358979 / 180
        parts.append(f"rotate={r_rad:.6f}:fillcolor=black:ow=iw:oh=ih")

    # 3. Crop to canvas with translation offset
    # crop origin = center of scaled video + x/y% offset - half canvas size
    crop_x = int(W * ((scale - 1) / 2 + x / 100))
    crop_y = int(H * ((scale - 1) / 2 + y / 100))
    # Clamp so crop window stays within scaled video bounds
    crop_x = max(0, min(scaled_w - W, crop_x))
    crop_y = max(0, min(scaled_h - H, crop_y))
    parts.append(f"crop={W}:{H}:{crop_x}:{crop_y}")

    return ",".join(parts)

def _escape(text: str) -> str:
    for ch in ("\\", "'", ":", "%", "[", "]", ",", ";"):
        text = text.replace(ch, "\\" + ch)
    return text

def export(project: dict, uploads_dir: Path) -> Path:
    ratio_filter = RATIO_FILTERS.get(project.get("aspectRatio", "16:9"), RATIO_FILTERS["16:9"])
    W, H = CANVAS_SIZES.get(project.get("aspectRatio", "16:9"), CANVAS_SIZES["16:9"])
    tracks = project.get("tracks", [])

    clips = []
    for track in tracks:
        if track.get("hidden"):
            continue
        if track.get("type") == "audio":
            # Audio-only tracks require timeline-accurate mixing; skip for now.
            # The corresponding video track clip has volume=0 (muted) when audio is detached.
            continue
        for clip in track.get("clips", []):
            file_id = clip.get("eyeContactFileId") or clip["fileId"]
            matches = list(uploads_dir.glob(f"{file_id}.*"))
            if matches:
                clips.append({**clip, "path": str(matches[0]), "track_muted": track.get("muted", False)})
            else:
                print(f"[ffmpeg export] WARNING: file not found for clip {file_id}, skipping")
    clips.sort(key=lambda c: c["startTime"])

    if not clips:
        raise ValueError("No clips to export")

    inputs = []
    filter_parts = []
    concat_v = []
    concat_a = []

    for i, clip in enumerate(clips):
        ss = clip.get("sourceStart", 0)
        se = clip.get("sourceEnd", clip.get("duration", 0))
        speed = clip.get("speed", 1.0) or 1.0
        volume = clip.get("volume", 1.0) if not clip.get("muted") and not clip.get("track_muted") else 0.0
        fade_in = clip.get("fadeIn", 0) or 0
        fade_out = clip.get("fadeOut", 0) or 0
        clip_dur = (se - ss) / speed

        inputs += ["-ss", str(ss), "-to", str(se), "-i", clip["path"]]

        # Video filter chain
        clip_transform = clip.get("transform") or {}
        transform_filter = _build_transform_filter(clip_transform, W, H)
        active_filter = transform_filter if transform_filter else ratio_filter
        vf = f"[{i}:v]setpts=PTS/{speed}/TB,{active_filter}"

        if fade_in > 0:
            vf += f",fade=t=in:st=0:d={fade_in}"
        if fade_out > 0:
            vf += f",fade=t=out:st={max(0, clip_dur - fade_out)}:d={fade_out}"
        vf += f"[v{i}]"
        filter_parts.append(vf)
        concat_v.append(f"[v{i}]")

        # Audio filter chain
        # atempo supports 0.5–2.0 per filter; chain for extremes
        if volume == 0 or clip.get("muted") or clip.get("track_muted"):
            filter_parts.append(f"[{i}:a]volume=0[a{i}]")
        else:
            af = f"[{i}:a]"
            # Handle speed with atempo (chain if outside 0.5–2 range)
            if speed != 1.0:
                tempos = []
                s = speed
                while s > 2.0:
                    tempos.append("atempo=2.0")
                    s /= 2.0
                while s < 0.5:
                    tempos.append("atempo=0.5")
                    s *= 2.0
                tempos.append(f"atempo={s:.4f}")
                af += ",".join(tempos) + ","
            af += f"volume={volume:.4f}[a{i}]"
            filter_parts.append(af)
        concat_a.append(f"[a{i}]")

    n = len(clips)
    filter_complex = ";".join(filter_parts)
    concat_str = "".join(concat_v) + "".join(concat_a)
    filter_complex += f";{concat_str}concat=n={n}:v=1:a=1[vout][aout]"

    # Captions
    captions = project.get("captions", [])
    caption_style = project.get("captionStyle", "")
    if captions and caption_style and caption_style not in ("minimal", "karaoke"):
        drawtext_filters = []
        for cap in captions:
            escaped = _escape(cap["text"])
            t_start, t_end = cap["startTime"], cap["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            if caption_style == "subtitle":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=36:fontcolor=white:box=1:"
                    f"boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h*0.85:enable='{enable}'"
                )
            elif caption_style == "bold":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=52:fontcolor=white:"
                    f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.85:enable='{enable}'"
                )
            elif caption_style == "cinematic":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=40:fontcolor=white:"
                    f"x=(w-text_w)/2:y=(h-text_h)/2:enable='{enable}'"
                )
        if drawtext_filters:
            chained = "[vpre]" + "[vdt];[vdt]".join(drawtext_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vpre];{chained}[vout]", 1)

    # Text overlays
    text_overlays = project.get("textOverlays", [])
    if text_overlays:
        ratio = project.get("aspectRatio", "16:9")
        res = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "4:3": (1440, 1080)}.get(ratio, (1920, 1080))
        ov_filters = []
        for ov in text_overlays:
            escaped = _escape(ov["text"])
            t_start, t_end = ov["startTime"], ov["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            px_x = int(ov["x"] / 100 * res[0])
            px_y = int(ov["y"] / 100 * res[1])
            fs = ov.get("fontSize", 32)
            color_raw = ov.get("color", "#ffffff").lstrip("#")
            color = color_raw if re.match(r'^[0-9a-fA-F]{6}$', color_raw) else "ffffff"
            bold = 1 if ov.get("fontWeight") == "bold" else 0
            ov_filters.append(
                f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}:bold={bold}:"
                f"x={px_x}-text_w/2:y={px_y}-text_h/2:enable='{enable}'"
            )
        if ov_filters:
            chained = "[vpre2]" + "[vov];[vov]".join(ov_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vpre2];{chained}[vout]", 1)

    out_path = OUT / f"{uuid.uuid4()}.mp4"
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
        str(out_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except subprocess.TimeoutExpired:
        out_path.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg export timed out after 30 minutes")
    if result.returncode != 0:
        out_path.unlink(missing_ok=True)
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-3000:]}")
    return out_path
