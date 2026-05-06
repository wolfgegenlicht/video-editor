import subprocess, uuid
from pathlib import Path

OUT = Path(__file__).parent.parent / "out"
OUT.mkdir(exist_ok=True)

RATIO_FILTERS = {
    "16:9": "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "9:16": "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "1:1":  "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
    "4:3":  "scale=1440:1080:force_original_aspect_ratio=decrease,pad=1440:1080:(ow-iw)/2:(oh-ih)/2",
}

def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")

def export(project: dict, uploads_dir: Path) -> Path:
    ratio_filter = RATIO_FILTERS.get(project.get("aspectRatio", "16:9"), RATIO_FILTERS["16:9"])
    tracks = project.get("tracks", [])

    clips = []
    for track in tracks:
        if track.get("hidden"):
            continue
        for clip in track.get("clips", []):
            matches = list(uploads_dir.glob(f"{clip['fileId']}.*"))
            if matches:
                clips.append({**clip, "path": str(matches[0]), "track_muted": track.get("muted", False)})
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
        vf = f"[{i}:v]setpts=PTS/{speed}/TB,{ratio_filter}"

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
            color = ov.get("color", "#ffffff").lstrip("#")
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
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-3000:]}")
    return out_path
