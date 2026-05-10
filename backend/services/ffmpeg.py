import subprocess, uuid, re, math
from pathlib import Path

OUT = Path(__file__).parent.parent / "out"
OUT.mkdir(exist_ok=True)

# Canvas dimensions per aspect ratio and resolution
CANVAS_SIZES: dict[str, dict[int, tuple[int, int]]] = {
    "16:9":  {1080: (1920, 1080), 720: (1280, 720), 480: (854, 480)},
    "9:16":  {1080: (1080, 1920), 720: (720, 1280), 480: (480, 854)},
    "1:1":   {1080: (1080, 1080), 720: (720, 720),  480: (480, 480)},
    "4:3":   {1080: (1440, 1080), 720: (960, 720),  480: (640, 480)},
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

    identity = (abs(x) < 1e-6 and abs(y) < 1e-6 and abs(scale - 1.0) < 1e-6 and abs(rotation) < 1e-6)
    if identity:
        return ""

    scaled_w = round(W * scale / 2) * 2
    scaled_h = round(H * scale / 2) * 2

    # 1. Scale source to cover canvas * scale factor
    parts = [f"scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=increase,crop={scaled_w}:{scaled_h}"]

    # 2. Rotate (keeps dimensions; corners may show black fill)
    if abs(rotation) > 1e-6:
        r_rad = rotation * math.pi / 180
        parts.append(f"rotate={r_rad:.6f}:fillcolor=black:ow=iw:oh=ih")

    # 3. Crop to canvas with translation offset
    # crop origin = center of scaled video + x/y% offset - half canvas size
    crop_x = int(W * ((scale - 1) / 2 - x / 100))
    crop_y = int(H * ((scale - 1) / 2 - y / 100))
    # Clamp so crop window stays within scaled video bounds
    crop_x = max(0, min(scaled_w - W, crop_x))
    crop_y = max(0, min(scaled_h - H, crop_y))
    parts.append(f"crop={W}:{H}:{crop_x}:{crop_y}")

    return ",".join(parts)

def _escape(text: str) -> str:
    for ch in ("\\", "'", ":", "%", "[", "]", ",", ";"):
        text = text.replace(ch, "\\" + ch)
    return text

def export(project: dict, uploads_dir: Path, options: dict | None = None, progress_cb=None) -> Path:
    options = options or {}
    resolution = options.get("resolution", 1080)
    burn_captions = options.get("burn_captions", False)
    preset = options.get("preset", "fast")
    _VALID_PRESETS = {"ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"}
    if preset not in _VALID_PRESETS:
        preset = "fast"
    ratio = project.get("aspectRatio", "16:9")
    W, H = CANVAS_SIZES.get(ratio, CANVAS_SIZES["16:9"]).get(resolution, (1920, 1080))
    ratio_filter = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
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

        brightness = clip.get("brightness")
        contrast = clip.get("contrast")
        saturation = clip.get("saturation")
        needs_eq = (
            (brightness is not None and abs(brightness - 1.0) > 1e-4) or
            (contrast is not None and abs(contrast - 1.0) > 1e-4) or
            (saturation is not None and abs(saturation - 1.0) > 1e-4)
        )
        if needs_eq:
            ffmpeg_b = (brightness or 1.0) - 1.0   # CSS 0–2 → FFmpeg -1 to 1 (0=normal)
            ffmpeg_c = contrast or 1.0              # CSS 0–2 → FFmpeg same scale (1=normal)
            ffmpeg_s = saturation or 1.0            # CSS 0–2 → FFmpeg same scale (1=normal)
            vf += f",eq=brightness={ffmpeg_b:.4f}:contrast={ffmpeg_c:.4f}:saturation={ffmpeg_s:.4f}"

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
    concat_str = "".join(f"[v{i}][a{i}]" for i in range(n))
    filter_complex += f";{concat_str}concat=n={n}:v=1:a=1[vout_c][aout];[vout_c]null[vout]"

    # Captions
    captions = project.get("captions", [])
    if burn_captions and captions:
        style = project.get("captionTrackStyle", {})
        fs = int(style.get("fontSize", 36) * H / 1080)
        color_hex = style.get("color", "#ffffff").lstrip("#")
        color = color_hex if re.match(r'^[0-9a-fA-F]{6}$', color_hex) else "ffffff"
        outline_w = int(style.get("outlineWidth", 0))
        outline_hex = style.get("outlineColor", "#000000").lstrip("#")
        outline_color = outline_hex if re.match(r'^[0-9a-fA-F]{6}$', outline_hex) else "000000"
        cap_x_pct = style.get("x", 5) / 100
        cap_y_pct = style.get("y", 80) / 100
        bg_color = style.get("backgroundColor", "transparent")

        border_part = f":borderw={outline_w}:bordercolor=0x{outline_color}" if outline_w > 0 else ""
        if bg_color != "transparent":
            raw_bg = bg_color.lstrip("#")
            box_part = f":box=1:boxcolor=0x{raw_bg}@0.7:boxborderw=5" if re.match(r'^[0-9a-fA-F]{6}$', raw_bg) else ""
        else:
            box_part = ""
        shadow_part = ":shadowx=2:shadowy=2:shadowcolor=0x000000@0.7" if style.get("textShadow") else ""

        drawtext_filters = []
        for cap in captions:
            escaped = _escape(cap["text"])
            t_start, t_end = cap["startTime"], cap["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            drawtext_filters.append(
                f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}"
                f"{border_part}{box_part}{shadow_part}"
                f":x=w*{cap_x_pct:.4f}:y=h*{cap_y_pct:.4f}:enable='{enable}'"
            )
        if drawtext_filters:
            chained = "[vcap_pre]" + "[vcap];[vcap]".join(drawtext_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vcap_pre];{chained}[vout]", 1)

    # Effect overlays
    effect_overlays = project.get("effectOverlays", [])
    hidden_lanes = project.get("hiddenEffectLanes", {})

    fade_effects = [e for e in effect_overlays if e.get("type") == "fade"] if not hidden_lanes.get("fade") else []
    if fade_effects:
        parts = []
        for j, eff in enumerate(fade_effects):
            direction = eff.get("params", {}).get("direction", "in")
            st = eff.get("startTime", 0)
            dur = max(0.01, eff.get("endTime", st) - st)
            in_lbl = "vpre_fade" if j == 0 else f"vfade{j}"
            out_lbl = f"vfade{j+1}" if j < len(fade_effects) - 1 else "vout"
            parts.append(f"[{in_lbl}]fade=t={direction}:st={st:.4f}:d={dur:.4f}[{out_lbl}]")
        filter_complex = filter_complex.replace("[vout]", f"[vpre_fade];{';'.join(parts)}", 1)

    # Effect overlays (blur)
    blur_effects = [e for e in effect_overlays if e.get("type") == "blur"] if not hidden_lanes.get("blur") else []
    if blur_effects:
        parts = []
        for j, eff in enumerate(blur_effects):
            st = eff.get("startTime", 0)
            et = max(st + 0.01, eff.get("endTime", st))
            r = max(1, round(eff.get("params", {}).get("intensity", 10)))
            in_lbl = "vpre_blur" if j == 0 else f"vblur{j}"
            out_lbl = f"vblur{j+1}" if j < len(blur_effects) - 1 else "vout"
            parts.append(f"[{in_lbl}]boxblur=luma_radius={r}:luma_power=1:enable='between(t,{st:.4f},{et:.4f})'[{out_lbl}]")
        filter_complex = filter_complex.replace("[vout]", f"[vpre_blur];{';'.join(parts)}", 1)

    # Effect overlays (color grade)
    _GRADE_FFMPEG = {
        "warm":    lambda s, e, i: f"eq=saturation={1+0.4*i:.3f}:brightness={0.05*i:.3f}:enable='between(t,{s:.4f},{e:.4f})',hue=h={-10*i:.2f}:enable='between(t,{s:.4f},{e:.4f})'",
        "cool":    lambda s, e, i: f"eq=saturation={1-0.1*i:.3f}:brightness={0.05*i:.3f}:enable='between(t,{s:.4f},{e:.4f})',hue=h={20*i:.2f}:enable='between(t,{s:.4f},{e:.4f})'",
        "bw":      lambda s, e, i: f"hue=s={1-i:.3f}:enable='between(t,{s:.4f},{e:.4f})'",
        "vintage": lambda s, e, i: f"eq=saturation={1-0.15*i:.3f}:contrast={1+0.1*i:.3f}:brightness={-0.05*i:.3f}:enable='between(t,{s:.4f},{e:.4f})',hue=s={1-0.5*i:.3f}:enable='between(t,{s:.4f},{e:.4f})'",
    }
    grade_effects = [e for e in effect_overlays if e.get("type") == "colorgrade"] if not hidden_lanes.get("colorgrade") else []
    if grade_effects:
        parts = []
        for j, eff in enumerate(grade_effects):
            st = eff.get("startTime", 0)
            et = max(st + 0.01, eff.get("endTime", st))
            p = eff.get("params", {})
            grade_preset = p.get("preset", "warm")
            intensity = max(0.0, min(1.0, p.get("intensity", 0.8)))
            builder = _GRADE_FFMPEG.get(grade_preset)
            if not builder:
                continue
            in_lbl = "vpre_cg" if j == 0 else f"vcg{j}"
            out_lbl = f"vcg{j+1}" if j < len(grade_effects) - 1 else "vout"
            parts.append(f"[{in_lbl}]{builder(st, et, intensity)}[{out_lbl}]")
        if parts:
            filter_complex = filter_complex.replace("[vout]", f"[vpre_cg];{';'.join(parts)}", 1)

    # Clip transitions (cross dissolve — implemented as dip-to-black fade pairs)
    clip_transitions = project.get("clipTransitions", [])
    dissolve_transitions = [t for t in clip_transitions if t.get("type") == "dissolve"]
    if dissolve_transitions:
        dis_filters = []
        for tr in dissolve_transitions:
            at = tr.get("atTime", 0)
            dur = max(0.05, tr.get("duration", 0.5))
            half = dur / 2
            dis_filters.append(f"fade=t=out:st={max(0, at-half):.4f}:d={half:.4f}")
            dis_filters.append(f"fade=t=in:st={at:.4f}:d={half:.4f}")
        parts = []
        for j, f in enumerate(dis_filters):
            in_lbl = "vpre_dis" if j == 0 else f"vdis{j}"
            out_lbl = f"vdis{j+1}" if j < len(dis_filters) - 1 else "vout"
            parts.append(f"[{in_lbl}]{f}[{out_lbl}]")
        filter_complex = filter_complex.replace("[vout]", f"[vpre_dis];{';'.join(parts)}", 1)

    # Text overlays
    text_overlays = project.get("textOverlays", [])
    if text_overlays:
        ov_filters = []
        for ov in text_overlays:
            escaped = _escape(ov["text"])
            t_start, t_end = ov["startTime"], ov["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            px_x = int(ov["x"] / 100 * W)
            px_y = int(ov["y"] / 100 * H)
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

    total_duration = sum(
        (c.get("sourceEnd", c.get("duration", 0)) - c.get("sourceStart", 0)) / (c.get("speed", 1.0) or 1.0)
        for c in clips
    )

    out_path = OUT / f"{uuid.uuid4()}.mp4"
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", preset, "-c:a", "aac",
        str(out_path),
    ]
    time_re = re.compile(r"time=(\d+):(\d+):(\d+\.\d+)")
    try:
        proc = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
    except Exception as e:
        out_path.unlink(missing_ok=True)
        raise RuntimeError(f"FFmpeg launch failed: {e}")
    stderr_lines = []
    for line in proc.stderr:
        stderr_lines.append(line)
        m = time_re.search(line)
        if m and progress_cb and total_duration > 0:
            h_t, mn_t, s_t = int(m.group(1)), int(m.group(2)), float(m.group(3))
            progress_cb(min(0.99, (h_t * 3600 + mn_t * 60 + s_t) / total_duration))
    proc.wait()
    if proc.returncode != 0:
        out_path.unlink(missing_ok=True)
        raise RuntimeError(f"FFmpeg failed:\n{''.join(stderr_lines[-100:])}")
    return out_path
