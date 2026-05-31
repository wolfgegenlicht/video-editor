import os, subprocess, tempfile, uuid, re, math
from pathlib import Path
from services.ass_generator import generate_ass
from services.background_blur import blur_background_clip
from services.overlay_render import font_path, render_shape_png

OUT = Path(__file__).parent.parent / "out"
OUT.mkdir(exist_ok=True)
_FONTS_DIR = str(Path(__file__).parent.parent / "fonts")

# Canvas dimensions per aspect ratio and resolution
CANVAS_SIZES: dict[str, dict[int, tuple[int, int]]] = {
    "16:9":  {1080: (1920, 1080), 720: (1280, 720), 480: (854, 480)},
    "9:16":  {1080: (1080, 1920), 720: (720, 1280), 480: (480, 854)},
    "1:1":   {1080: (1080, 1080), 720: (720, 720),  480: (480, 480)},
    "4:3":   {1080: (1440, 1080), 720: (960, 720),  480: (640, 480)},
}

def _has_audio(path: str) -> bool:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    return result.stdout.strip() == "audio"


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

def _make_x_expr(points: list[dict], source_start: float, speed: float) -> str:
    """Return an FFmpeg expression for the normalized x position as a function of t."""
    if not points:
        return "0.5"

    # Decimate to keep expression manageable
    if len(points) > 60:
        step = len(points) // 60
        points = points[::step][:60]

    if len(points) == 1:
        return f"{points[0]['x']:.6f}"

    def rec(i: int) -> str:
        if i >= len(points) - 1:
            return f"{points[-1]['x']:.6f}"
        t0 = max(0.0, (points[i]['t'] - source_start)) / speed
        t1 = max(0.0, (points[i + 1]['t'] - source_start)) / speed
        x0, x1 = points[i]['x'], points[i + 1]['x']
        # Skip duplicate timestamps to avoid division by zero
        if abs(t1 - t0) < 1e-9:
            return rec(i + 1)
        lerp = f"({x0:.6f}+({x1:.6f}-{x0:.6f})*(t-{t0:.6f})/({t1:.6f}-{t0:.6f}))"
        return f"if(lt(t,{t1:.6f}),{lerp},{rec(i + 1)})"

    return rec(0)


def _build_reframe_filter(track_points: list[dict], source_start: float, speed: float, canvas_w: int, canvas_h: int) -> str:
    """Return an ffmpeg filter string: scale to canvas height, then dynamic crop centered on face.

    track_points: list of {"t": float, "x": float} — source-absolute timestamps (seconds from start of source file), normalized x (0–1).
    source_start: clip's sourceStart offset in the source file (seconds).
    speed: clip playback speed.
    canvas_w, canvas_h: target canvas dimensions.
    """
    x_norm_expr = _make_x_expr(track_points, source_start, speed)
    x_pixel_expr = f"max(0,min(iw-{canvas_w},floor({x_norm_expr}*(iw-{canvas_w}))))"
    return f"scale=-2:{canvas_h},crop={canvas_w}:{canvas_h}:{x_pixel_expr}:0"


def _escape(text: str) -> str:
    for ch in ("\\", "'", ":", "%", "[", "]", ",", ";"):
        text = text.replace(ch, "\\" + ch)
    return text

def _build_pan_filter(pan: float) -> str:
    """Return a pan=stereo filter string for the given pan value (-1..1), or empty string."""
    if abs(pan) <= 0.01:
        return ""
    left_gain = max(0.0, min(1.0, 1.0 - pan))
    right_gain = max(0.0, min(1.0, 1.0 + pan))
    return f"pan=stereo|c0={left_gain:.4f}*c0|c1={right_gain:.4f}*c1"

def _kf_lerp_expr(t_offset: float, kf_times: list, kf_values: list) -> str:
    """Build a flat FFmpeg expression for linear keyframe interpolation.

    Uses a sum of gte()*lt() multiplications instead of nested if() calls so the
    expression depth stays O(1) regardless of keyframe count — nested if() hits
    FFmpeg's parser stack limit with ~10+ keyframes.

    t_offset  — absolute effect startTime (seconds); (t - t_offset) is the relative clock.
    kf_times  — list of floats, keyframe times relative to effect startTime, ascending.
    kf_values — list of floats, one value per keyframe.
    """
    n = len(kf_times)
    if n == 0:
        return "0"
    if n == 1:
        return f"{kf_values[0]:.4f}"

    T = f"(t-{t_offset:.4f})"
    terms = []

    # Before first keyframe: clamp to first value
    terms.append(f"lt({T},{kf_times[0]:.4f})*{kf_values[0]:.4f}")

    # Each half-open segment [t_i, t_{i+1})
    for i in range(n - 1):
        t0, t1 = kf_times[i], kf_times[i + 1]
        v0, v1 = kf_values[i], kf_values[i + 1]
        dt = t1 - t0
        if dt < 1e-6:
            lerp = f"{v0:.4f}"
        else:
            dv = v1 - v0
            lerp = f"({v0:.4f}+{dv:.4f}*(({T}-{t0:.4f})/{dt:.4f}))"
        terms.append(f"gte({T},{t0:.4f})*lt({T},{t1:.4f})*{lerp}")

    # After last keyframe: clamp to last value
    terms.append(f"gte({T},{kf_times[-1]:.4f})*{kf_values[-1]:.4f}")

    return "+".join(terms)

def _seg_lerp_expr(v0: float, v1: float, t0: float, t1: float) -> str:
    """Clamped linear expression from v0 at t0 to v1 at t1.

    Stays at v0 before t0 and v1 after t1 (max/min clamp), so the expression
    is safe to evaluate at any t without producing out-of-range values.
    """
    dt = t1 - t0
    if dt < 1e-6 or abs(v1 - v0) < 1e-6:
        return f"{v0:.4f}"
    return f"({v0:.4f}+{v1-v0:.4f}*max(0,min(1,(t-{t0:.4f})/{dt:.4f})))"


def _zoom_factor_expr(scale: float, st: float, et: float, ramp_in: float, ramp_out: float) -> str:
    """FFmpeg expression for the time-varying zoom factor at absolute time t.

    Returns a flat (no nesting) expression that evaluates to 1 outside [st, et]
    and ramps from 1 → scale → 1 inside the range. Always >= 1.
    """
    if abs(scale - 1.0) < 1e-6:
        return "1"
    dS = scale - 1.0
    parts: list[str] = []
    if ramp_in > 1e-6:
        t0, t1 = st, st + ramp_in
        parts.append(f"gte(t,{t0:.4f})*lt(t,{t1:.4f})*max(0,(t-{t0:.4f})/{ramp_in:.4f})")
    hold_s = st + ramp_in
    hold_e = et - ramp_out
    if hold_e > hold_s:
        parts.append(f"gte(t,{hold_s:.4f})*lt(t,{hold_e:.4f})")
    if ramp_out > 1e-6:
        t0, t1 = et - ramp_out, et
        parts.append(f"gte(t,{t0:.4f})*lt(t,{t1:.4f})*max(0,({t1:.4f}-t)/{ramp_out:.4f})")
    if not parts:
        return "1"
    return f"(1+{dS:.4f}*({'+'.join(parts)}))"


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
    audio_clips = []
    for track in tracks:
        if track.get("hidden"):
            continue
        if track.get("type") == "audio":
            # Collect audio-only clips for timeline-accurate mixing
            track_muted = track.get("muted", False)
            for clip in track.get("clips", []):
                if track_muted or clip.get("muted"):
                    continue
                # Enhanced audio file selection
                if clip.get("audioEnhanceEnabled") and clip.get("audioEnhanceFileId"):
                    file_id = clip["audioEnhanceFileId"]
                else:
                    file_id = (
                        clip.get("eyeContactFileId")
                        or clip["fileId"]
                    )
                matches = list(uploads_dir.glob(f"{file_id}.*"))
                if matches:
                    audio_clips.append({**clip, "path": str(matches[0]), "track_muted": False})
                else:
                    print(f"[ffmpeg export] WARNING: file not found for audio clip {file_id}, skipping")
            continue
        for clip in track.get("clips", []):
            # Enhanced audio file selection for video clips
            if clip.get("audioEnhanceEnabled") and clip.get("audioEnhanceFileId"):
                if clip.get("eyeContactFileId"):
                    print(f"[ffmpeg export] WARNING: clip {clip['id'][:8]} has both eye-contact and audio-enhance enabled; eye-contact correction will be dropped from export", flush=True)
                file_id = clip["audioEnhanceFileId"]
            else:
                file_id = (
                    clip.get("eyeContactFileId")
                    or clip["fileId"]
                )
            matches = list(uploads_dir.glob(f"{file_id}.*"))
            if matches:
                clips.append({**clip, "path": str(matches[0]), "track_muted": track.get("muted", False)})
            else:
                print(f"[ffmpeg export] WARNING: file not found for clip {file_id}, skipping")
    clips.sort(key=lambda c: c["startTime"])

    # Pre-process clips that have background blur enabled.
    # Creates temp video-only files; FFmpeg applies remaining effects on top.
    blur_temp_files: list[str] = []
    for clip in clips:
        if not clip.get("blurBackground"):
            continue
        original_ss = clip.get("sourceStart", 0)
        original_se = clip.get("sourceEnd", clip.get("duration", 0))
        intensity = int(clip.get("blurBackgroundIntensity") or 25)
        with tempfile.NamedTemporaryFile(delete=False, suffix="_blur_bg.mp4") as _tf:
            tmp_path = _tf.name
        try:
            blur_background_clip(clip["path"], tmp_path, original_ss, original_se, intensity)
            clip["path"] = tmp_path
            clip["sourceStart"] = 0.0
            clip["sourceEnd"] = original_se - original_ss
            blur_temp_files.append(tmp_path)
        except Exception as exc:
            print(f"[ffmpeg export] WARNING: blur_background_clip failed for clip {clip['id'][:8]}: {exc}, using original")

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
        reframe_data = clip.get("reframeData") or {}
        track_points = reframe_data.get("trackPoints", [])
        if clip.get("reframe") and track_points:
            track_points_in_range = [
                p for p in track_points
                if p["t"] >= ss - 0.1 and p["t"] <= se + 0.1
            ]
            active_filter = _build_reframe_filter(track_points_in_range, ss, speed, W, H)
        elif transform_filter:
            active_filter = transform_filter
        else:
            active_filter = ratio_filter
        vf = f"[{i}:v]setpts=(PTS-STARTPTS)/{speed:.6f},{active_filter}"

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
        has_audio = _has_audio(clip["path"])
        if not has_audio:
            # No audio stream — generate silence for the duration of the clip
            filter_parts.append(
                f"aevalsrc=0:s=44100:c=stereo,atrim=duration={clip_dur:.6f},asetpts=PTS-STARTPTS[a{i}]"
            )
        elif volume == 0 or clip.get("muted") or clip.get("track_muted"):
            filter_parts.append(f"[{i}:a]asetpts=PTS-STARTPTS,volume=0[a{i}]")
        else:
            af = f"[{i}:a]asetpts=PTS-STARTPTS,"
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
            # Pan filter (before volume)
            pan = clip.get("pan") or 0.0
            pan_filter = _build_pan_filter(pan)
            if pan_filter:
                af += pan_filter + ","
            af += f"volume={volume:.4f}"
            if fade_in > 0:
                af += f",afade=t=in:st=0:d={fade_in}"
            if fade_out > 0:
                af += f",afade=t=out:st={max(0, clip_dur - fade_out):.4f}:d={fade_out}"
            af += f"[a{i}]"
            filter_parts.append(af)
        concat_a.append(f"[a{i}]")

    n = len(clips)
    filter_complex = ";".join(filter_parts)
    concat_str = "".join(f"[v{i}][a{i}]" for i in range(n))
    filter_complex += f";{concat_str}concat=n={n}:v=1:a=1[vout_c][aout];[vout_c]null[vout]"

    # Audio-only track clips — delay them to timeline position and amix into main audio
    if audio_clips:
        audio_filter_parts = []
        for j, ac in enumerate(audio_clips):
            idx = n + j  # input index after all video clips
            ss_a = ac.get("sourceStart", 0)
            se_a = ac.get("sourceEnd", ac.get("duration", 0))
            speed_a = ac.get("speed", 1.0) or 1.0
            volume_a = ac.get("volume", 1.0)
            fade_in_a = ac.get("fadeIn", 0) or 0
            fade_out_a = ac.get("fadeOut", 0) or 0
            clip_dur_a = (se_a - ss_a) / speed_a
            start_ms = int(ac.get("startTime", 0) * 1000)

            inputs += ["-ss", str(ss_a), "-to", str(se_a), "-i", ac["path"]]

            af_a = f"[{idx}:a]asetpts=PTS-STARTPTS,"
            # atempo chain for speed
            if speed_a != 1.0:
                tempos = []
                s = speed_a
                while s > 2.0:
                    tempos.append("atempo=2.0")
                    s /= 2.0
                while s < 0.5:
                    tempos.append("atempo=0.5")
                    s *= 2.0
                tempos.append(f"atempo={s:.4f}")
                af_a += ",".join(tempos) + ","
            # Pan filter (before volume)
            pan_a = ac.get("pan") or 0.0
            pan_filter_a = _build_pan_filter(pan_a)
            if pan_filter_a:
                af_a += pan_filter_a + ","
            af_a += f"volume={volume_a:.4f},"
            if fade_in_a > 0:
                af_a += f"afade=t=in:st=0:d={fade_in_a},"
            if fade_out_a > 0:
                af_a += f"afade=t=out:st={max(0, clip_dur_a - fade_out_a):.4f}:d={fade_out_a},"
            af_a += f"adelay={start_ms}|{start_ms}:all=1[aa{idx}]"
            audio_filter_parts.append(af_a)

        filter_complex += ";" + ";".join(audio_filter_parts)

        # Amix main audio output with all audio-only clip streams
        audio_streams = "[aout]" + "".join(f"[aa{n + j}]" for j in range(len(audio_clips)))
        mix_count = 1 + len(audio_clips)
        filter_complex += f";{audio_streams}amix=inputs={mix_count}:duration=first:normalize=0[afinal]"

    # Captions — rendered via ASS subtitle file for proper word-wrap, font, and karaoke support
    captions = project.get("captions", [])
    ass_path = None
    if burn_captions and captions:
        style = project.get("captionTrackStyle", {})
        ass_content = generate_ass(captions, style, W, H,
                                   preview_w=options.get("preview_width", 720),
                                   caption_line_breaks=options.get("caption_line_breaks", {}))
        ass_fd, ass_path = tempfile.mkstemp(suffix=".ass")
        os.write(ass_fd, ass_content.encode("utf-8"))
        os.close(ass_fd)
        esc = ass_path.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")
        esc_fonts = _FONTS_DIR.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")
        filter_complex = filter_complex.replace(
            "[vout]",
            f"[vcap_pre];[vcap_pre]subtitles='{esc}':fontsdir={esc_fonts}[vout]",
            1,
        )

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
            region = eff.get("params", {}).get("region")
            in_lbl = "vpre_blur" if j == 0 else f"vblur{j}"
            out_lbl = f"vblur{j+1}" if j < len(blur_effects) - 1 else "vout"
            keyframes = eff.get("params", {}).get("keyframes") or []
            kf_with_region = [kf for kf in keyframes if kf.get("region")]
            if kf_with_region:
                kf_times = [kf["time"] for kf in kf_with_region]
                kf_x = [max(0.0, kf["region"]["x"] * W) for kf in kf_with_region]
                kf_y = [max(0.0, kf["region"]["y"] * H) for kf in kf_with_region]
                kf_w = [max(2.0, kf["region"]["width"] * W) for kf in kf_with_region]
                kf_h = [max(2.0, kf["region"]["height"] * H) for kf in kf_with_region]
                kf_r = [max(1.0, kf["intensity"]) for kf in kf_with_region]

                # Build one segment per keyframe interval so each filter chain uses
                # a simple 2-point linear expression (~60 chars) rather than a
                # full N-term summation — the latter causes FFmpeg's crop filter
                # evaluator to fail when there are many keyframes.
                segs: list[tuple] = []
                if kf_times[0] > 1e-6:
                    v = (kf_x[0], kf_y[0], kf_w[0], kf_h[0], kf_r[0])
                    segs.append((st, st + kf_times[0]) + v + v)
                for i in range(len(kf_times) - 1):
                    segs.append((
                        st + kf_times[i], st + kf_times[i + 1],
                        kf_x[i], kf_y[i], kf_w[i], kf_h[i], kf_r[i],
                        kf_x[i+1], kf_y[i+1], kf_w[i+1], kf_h[i+1], kf_r[i+1],
                    ))
                last = len(kf_times) - 1
                if kf_times[last] < (et - st) - 1e-6:
                    v = (kf_x[last], kf_y[last], kf_w[last], kf_h[last], kf_r[last])
                    segs.append((st + kf_times[last], et) + v + v)

                cur_in = in_lbl
                for s, seg in enumerate(segs):
                    t0a, t1a = seg[0], seg[1]
                    x0, y0, w0, h0, r0 = seg[2], seg[3], seg[4], seg[5], seg[6]
                    x1, y1, w1, h1, r1 = seg[7], seg[8], seg[9], seg[10], seg[11]
                    seg_out = out_lbl if s == len(segs) - 1 else f"vkfs{j}s{s}"

                    ex_e = _seg_lerp_expr(x0, x1, t0a, t1a)
                    ey_e = _seg_lerp_expr(y0, y1, t0a, t1a)
                    ew_e = f"trunc(min({W}-({ex_e}),max(2,{_seg_lerp_expr(w0, w1, t0a, t1a)}))/2)*2"
                    eh_e = f"trunc(min({H}-({ey_e}),max(2,{_seg_lerp_expr(h0, h1, t0a, t1a)}))/2)*2"
                    er_e = f"max(1,{_seg_lerp_expr(r0, r1, t0a, t1a)})"

                    b  = f"bkfb{j}_{s}"
                    bs = f"bkfs{j}_{s}"
                    bc = f"bkfc{j}_{s}"
                    parts.append(
                        f"[{cur_in}]split[{b}][{bs}];"
                        f"[{bs}]crop=w='{ew_e}':h='{eh_e}':x='{ex_e}':y='{ey_e}',"
                        f"boxblur=luma_radius='{er_e}':luma_power=1[{bc}];"
                        f"[{b}][{bc}]overlay=x='{ex_e}':y='{ey_e}':enable='between(t,{t0a:.4f},{t1a:.4f})'[{seg_out}]"
                    )
                    cur_in = seg_out
            elif region:
                rx = max(0, int(region.get("x", 0) * W))
                ry = max(0, int(region.get("y", 0) * H))
                rw = min(W - rx, max(2, int(region.get("width", 1) * W))); rw -= rw % 2
                rh = min(H - ry, max(2, int(region.get("height", 1) * H))); rh -= rh % 2
                feather = max(0.0, min(0.5, region.get("feather", 0) or 0))
                if feather > 0:
                    fw = max(1, int(feather * rw))
                    fh = max(1, int(feather * rh))
                    # feather via RGBA alpha gradient: pixel alpha ramps from 0 at each edge to 255 at fw/fh inward
                    alpha_expr = (
                        f"a='255*min("
                        f"min(X+0.5,{fw})/{fw},"
                        f"min(min({rw}-X-0.5,{fw})/{fw},"
                        f"min(min(Y+0.5,{fh})/{fh},"
                        f"min({rh}-Y-0.5,{fh})/{fh})))'"
                    )
                    parts.append(
                        f"[{in_lbl}]split[base{j}][bsrc{j}];"
                        f"[bsrc{j}]crop={rw}:{rh}:{rx}:{ry},boxblur=luma_radius={r}:luma_power=1,"
                        f"format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':{alpha_expr}[bcrop{j}];"
                        f"[base{j}][bcrop{j}]overlay={rx}:{ry}:enable='between(t,{st:.4f},{et:.4f})'[{out_lbl}]"
                    )
                else:
                    parts.append(
                        f"[{in_lbl}]split[base{j}][bsrc{j}];"
                        f"[bsrc{j}]crop={rw}:{rh}:{rx}:{ry},boxblur=luma_radius={r}:luma_power=1[bcrop{j}];"
                        f"[base{j}][bcrop{j}]overlay={rx}:{ry}:enable='between(t,{st:.4f},{et:.4f})'[{out_lbl}]"
                    )
            else:
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

    # Effect overlays (zoom — crop to anchor region then scale back to canvas)
    zoom_effs = [e for e in effect_overlays if e.get("type") == "zoom"] if not hidden_lanes.get("zoom") else []
    if zoom_effs:
        filter_complex = filter_complex.replace("[vout]", "[vpre_zoom]", 1)
        cur = "vpre_zoom"
        for j, eff in enumerate(zoom_effs):
            p = eff.get("params", {})
            scale_v = max(1.0, p.get("scale", 1.5))
            ramp_in = max(0.0, p.get("rampIn", 0.3))
            ramp_out = max(0.0, p.get("rampOut", 0.3))
            ax = max(0.0, min(1.0, p.get("anchorX", 0.5)))
            ay = max(0.0, min(1.0, p.get("anchorY", 0.5)))
            st = eff.get("startTime", 0)
            et = max(st + 0.01, eff.get("endTime", st))
            out_lbl = "vout" if j == len(zoom_effs) - 1 else f"vzoom{j+1}"

            s_e = _zoom_factor_expr(scale_v, st, et, ramp_in, ramp_out)
            # Crop a W/S × H/S region at the anchor, then scale back to W×H.
            # In the crop filter: ow/oh are the cropped output dimensions.
            cw = f"trunc({W}/({s_e})/2)*2"
            ch = f"trunc({H}/({s_e})/2)*2"
            cx = f"max(0,min({W}-ow,({W}-ow)*{ax:.4f}))"
            cy = f"max(0,min({H}-oh,({H}-oh)*{ay:.4f}))"
            filter_complex += (
                f"[{cur}]crop=w='{cw}':h='{ch}':x='{cx}':y='{cy}'[ztmp{j}];"
                f"[ztmp{j}]scale=w={W}:h={H}[{out_lbl}];"
            )
            cur = out_lbl

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

    # Text overlays — sizes stored at REFERENCE_WIDTH=1280; scale to output resolution.
    # The "pill" (belly-band) is baked into a rounded RGBA PNG via PIL so it matches
    # the preview's fully-rounded box, real font metrics, and chosen font exactly;
    # plain text uses drawtext with a matching shadow, optional box, and the same font.
    _REFERENCE_WIDTH = 1280
    text_overlays = project.get("textOverlays", [])
    pill_png_files: list[str] = []
    if text_overlays:
        ov_scale = W / _REFERENCE_WIDTH
        next_input_idx = inputs.count("-i")  # first free FFmpeg input slot
        pill_srcs: list[str] = []   # faded pill image-source statements ([idx:v]…[pfN])
        ops: list[tuple] = []       # ordered video ops threading the chain
        for ov in text_overlays:
            t0, t1 = ov["startTime"], ov["endTime"]
            enable = f"between(t,{t0},{t1})"
            px_x = int(ov["x"] / 100 * W)
            px_y = int(ov["y"] / 100 * H)
            fs = int(ov.get("fontSize", 32) * ov_scale)
            bold = ov.get("fontWeight") == "bold"
            family = ov.get("fontFamily", "sans-serif")
            color_raw = ov.get("color", "#ffffff").lstrip("#")
            color = color_raw if re.match(r'^[0-9a-fA-F]{6}$', color_raw) else "ffffff"

            if ov.get("shape"):
                anim_dur = max(0.001, min(ov.get("animateDuration", 0.4), (t1 - t0) / 2))
                pad_h = int(ov.get("paddingH", 20) * ov_scale)
                pad_v = int(ov.get("paddingV", 8) * ov_scale)
                # 8 = ACCENT_STRIPE_REF_WIDTH from frontend/src/lib/overlayShapes.ts
                stripe_w = max(1, int(8 * ov_scale))
                fd, pill_path = tempfile.mkstemp(suffix="_pill.png")
                os.close(fd)
                box_w, box_h = render_shape_png(
                    ov["text"], pill_path,
                    shape=ov["shape"],
                    font_family=family, bold=bold, fontsize=fs,
                    pad_h=pad_h, pad_v=pad_v,
                    bg_hex=ov.get("background", "#7c3aed"), fg_hex=ov.get("color", "#ffffff"),
                    radius_pct=ov.get("cornerRadius"),
                    accent_hex=ov.get("accentColor", "#ffffff"),
                    stripe_w=stripe_w,
                )
                pill_png_files.append(pill_path)
                idx = next_input_idx
                next_input_idx += 1
                inputs += ["-loop", "1", "-t", f"{t1}", "-i", pill_path]
                box_x = px_x - box_w // 2
                box_y = px_y - box_h // 2
                slide = int(30 * ov_scale)
                # easeOutCubic slide: offset = (1-p)^3 * slide on entry and exit
                slide_expr = (
                    f"if(lt(t-{t0},{anim_dur}),pow(1-(t-{t0})/{anim_dur}\\,3)*{slide},"
                    f"if(lt({t1}-t,{anim_dur}),pow(1-({t1}-t)/{anim_dur}\\,3)*{slide},0))"
                )
                pf = f"pf{idx}"
                pill_srcs.append(
                    f"[{idx}:v]format=rgba,"
                    f"fade=t=in:st={t0}:d={anim_dur:.4f}:alpha=1,"
                    f"fade=t=out:st={t1 - anim_dur:.4f}:d={anim_dur:.4f}:alpha=1[{pf}]"
                )
                ops.append(("overlay", pf, box_x, box_y, slide_expr, enable))
            else:
                escaped = _escape(ov["text"])
                ffont_esc = font_path(family, bold).replace("\\", "\\\\").replace(":", "\\:")
                shadow_y = max(1, round(1 * ov_scale))
                draw = (
                    f"drawtext=fontfile='{ffont_esc}':text='{escaped}':fontsize={fs}:"
                    f"fontcolor=0x{color}:x={px_x}-text_w/2:y={px_y}-text_h/2:"
                    f"shadowx=0:shadowy={shadow_y}:shadowcolor=black@0.6:"
                )
                bg = ov.get("background", "transparent")
                bg_raw = bg.lstrip("#")
                if bg != "transparent" and re.match(r'^[0-9a-fA-F]{6}$', bg_raw):
                    draw += f"box=1:boxcolor=0x{bg_raw}:boxborderw={max(1, round(8 * ov_scale))}:"
                draw += f"enable='{enable}'"
                ops.append(("drawtext", draw))

        if ops:
            stmts = list(pill_srcs)
            running = "vpre_ov"
            for k, op in enumerate(ops):
                out_lbl = "vout" if k == len(ops) - 1 else f"vov{k}"
                if op[0] == "drawtext":
                    stmts.append(f"[{running}]{op[1]}[{out_lbl}]")
                else:
                    _, pf, box_x, box_y, slide_expr, enable = op
                    stmts.append(
                        f"[{running}][{pf}]overlay=x={box_x}:"
                        f"y='{box_y}+({slide_expr})':enable='{enable}'[{out_lbl}]"
                    )
                running = out_lbl
            filter_complex = filter_complex.replace("[vout]", f"[vpre_ov];{';'.join(stmts)}", 1)

    total_duration = sum(
        (c.get("sourceEnd", c.get("duration", 0)) - c.get("sourceStart", 0)) / (c.get("speed", 1.0) or 1.0)
        for c in clips
    )

    audio_map = "[afinal]" if audio_clips else "[aout]"
    out_path = OUT / f"{uuid.uuid4()}.mp4"
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", audio_map,
        "-c:v", "libx264", "-preset", preset, "-c:a", "aac",
        str(out_path),
    ]
    time_re = re.compile(r"time=(\d+):(\d+):(\d+\.\d+)")
    try:
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
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)
        for _pill in pill_png_files:
            Path(_pill).unlink(missing_ok=True)
        for tmp in blur_temp_files:
            if os.path.exists(tmp):
                os.unlink(tmp)
    return out_path
