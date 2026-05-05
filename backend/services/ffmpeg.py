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

def export(project: dict, uploads_dir: Path) -> Path:
    ratio_filter = RATIO_FILTERS.get(project.get("aspectRatio", "16:9"), RATIO_FILTERS["16:9"])
    tracks = project.get("tracks", [])

    clips = []
    for track in tracks:
        for clip in track.get("clips", []):
            matches = list(uploads_dir.glob(f"{clip['fileId']}.*"))
            if matches:
                clips.append({**clip, "path": str(matches[0])})
    clips.sort(key=lambda c: c["startTime"])

    if not clips:
        raise ValueError("No clips to export")

    inputs = []
    filter_parts = []
    concat_parts = []

    for i, clip in enumerate(clips):
        ss = clip.get("sourceStart", 0)
        se = clip.get("sourceEnd", clip.get("duration", 0))
        inputs += ["-ss", str(ss), "-to", str(se), "-i", clip["path"]]
        filter_parts.append(f"[{i}:v]setpts=PTS-STARTPTS,{ratio_filter}[v{i}]")
        filter_parts.append(f"[{i}:a]asetpts=PTS-STARTPTS[a{i}]")
        concat_parts.append(f"[v{i}][a{i}]")

    n = len(clips)
    filter_complex = ";".join(filter_parts)
    filter_complex += f";{''.join(concat_parts)}concat=n={n}:v=1:a=1[vout][aout]"

    captions = project.get("captions", [])
    caption_style = project.get("captionStyle", "")
    if captions and caption_style and caption_style != "minimal":
        drawtext_filters = []
        for cap in captions:
            escaped = cap["text"].replace("'", "\\'").replace(":", "\\:")
            if caption_style == "subtitle":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=36:fontcolor=white:box=1:"
                    f"boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h*0.85:"
                    f"enable='between(t,{cap['startTime']},{cap['endTime']})'"
                )
            elif caption_style == "bold":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=52:fontcolor=white:"
                    f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.85:"
                    f"enable='between(t,{cap['startTime']},{cap['endTime']})'"
                )
            elif caption_style == "cinematic":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=40:fontcolor=white:"
                    f"x=(w-text_w)/2:y=(h-text_h)/2:"
                    f"enable='between(t,{cap['startTime']},{cap['endTime']})'"
                )
        if drawtext_filters:
            chained = "[vpre]" + "[vdt];[vdt]".join(drawtext_filters)
            filter_complex = filter_complex.replace(
                "[vout]", f"[vpre];{chained}[vout]", 1
            )

    out_path = OUT / f"{uuid.uuid4()}.mp4"
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-c:a", "aac",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-2000:]}")
    return out_path
