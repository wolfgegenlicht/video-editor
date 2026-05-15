import re

_FONT_MAP = {
    "sans-serif": "Inter",
    "serif": "Merriweather",
    "monospace": "JetBrains Mono",
}

# Average character width as fraction of fontsize, per font.
# Used to estimate chars-per-line for karaoke word wrapping.
_CHAR_WIDTH = {
    "Inter": 0.50,
    "Merriweather": 0.53,
    "JetBrains Mono": 0.61,
}

_TRANS_S = 0.300  # 300 ms scroll duration (matches 9 frames at 30fps)


def _hex_to_ass(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip("#")
    if not re.match(r"^[0-9a-fA-F]{6}$", h):
        return f"&H{alpha:02X}FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}"


def _to_bgr(hex_color: str) -> str:
    """Return BBGGRR string for ASS inline \\c override."""
    h = hex_color.lstrip("#")
    if not re.match(r"^[0-9a-fA-F]{6}$", h):
        return "FFFFFF"
    return h[4:6] + h[2:4] + h[0:2]


def _ts(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    cs = round((s % 1) * 100)
    return f"{h}:{m:02d}:{int(s):02d}.{cs:02d}"


def generate_ass(captions: list, style: dict, W: int, H: int,
                 preview_w: int = 720,
                 caption_line_breaks: dict | None = None) -> str:
    font_family = style.get("fontFamily", "sans-serif")
    fontname = _FONT_MAP.get(font_family, font_family)
    fontsize = int(style.get("fontSize", 32) * W / preview_w)
    bold = -1 if style.get("fontWeight") == "bold" else 0
    spacing = round(style.get("letterSpacing", 0) * W / preview_w)

    color = style.get("color", "#ffffff")
    highlight_color = style.get("highlightColor", "#fde047")

    outline_w = round(style.get("outlineWidth", 0) * W / preview_w)
    outline_c = _hex_to_ass(style.get("outlineColor", "#000000"))
    # CSS text-shadow is "0 2px 8px rgba(0,0,0,0.8)": no x-offset, 2px y-offset, 8px blur.
    # ASS has no per-direction blur in the style header, so we use inline override tags
    # (\xshad0 \yshad{n} \blur{n}) which libass honours and which only blur borders/shadows,
    # not the main text fill — matching the CSS behaviour exactly.
    if style.get("textShadow"):
        _shadow_y = max(1, round(2 * W / preview_w))
        _shadow_blur = max(1, round(8 * W / preview_w))
        shadow_override = f"{{\\xshad0\\yshad{_shadow_y}\\blur{_shadow_blur}}}"
        shadow_style_val = _shadow_y
    else:
        shadow_override = ""
        shadow_style_val = 0

    bg_color = style.get("backgroundColor", "transparent")
    if bg_color != "transparent":
        border_style = 3
        back_c = _hex_to_ass(bg_color, alpha=0x26)
    else:
        border_style = 1
        back_c = "&H80000000"

    align_map = {"left": 7, "center": 8, "right": 9}
    alignment = align_map.get(style.get("textAlign", "center"), 8)

    x_pct = style.get("x", 10) / 100
    y_pct = style.get("y", 78) / 100
    box_w_pct = style.get("boxW", 80) / 100
    box_h_pct = style.get("boxH", 18) / 100

    margin_l = int(x_pct * W)
    margin_r = int(W - (x_pct + box_w_pct) * W)
    margin_v = int(y_pct * H)

    clip_x1 = margin_l
    clip_y1 = margin_v
    clip_x2 = int((x_pct + box_w_pct) * W)

    # Scale the hardcoded CSS padding("4px 8px") on the preview <p> to ASS pixels
    padding_h_ass = round(8 * W / preview_w)
    padding_v_ass = round(4 * W / preview_w)

    # Anchor sits inside the horizontal padding (matches preview text area)
    _text_x1 = clip_x1 + padding_h_ass
    _text_x2 = clip_x2 - padding_h_ass
    _anchor_x_map = {7: _text_x1, 8: (_text_x1 + _text_x2) // 2, 9: _text_x2}
    anchor_x = _anchor_x_map.get(alignment, (_text_x1 + _text_x2) // 2)

    # ── Karaoke layout constants ────────────────────────────────────────────
    box_w_px = int(box_w_pct * W)
    box_h_px = int(box_h_pct * H)
    char_w = _CHAR_WIDTH.get(fontname, 0.50) * (1.08 if bold == -1 else 1.0)
    chars_per_line = max(10, int((box_w_px - 2 * padding_h_ass) / (fontsize * char_w)))
    lh = int(fontsize * 1.35)                    # line height — only used for max_visible
    max_visible = max(1, int((box_h_px - padding_v_ass) / lh))

    # slot_h: line spacing matches CSS lineHeight:1.35 — lines packed from top,
    # not spread to fill the box.  Clip covers exactly max_visible slots.
    slot_h: float = lh

    kara_clip_y2 = clip_y1 + padding_v_ass + max_visible * lh
    kara_clip = f"{{\\clip({clip_x1},{clip_y1},{clip_x2},{kara_clip_y2})}}"

    # ASS style: PrimaryColour = highlight (spoken), SecondaryColour = base (unspoken)
    primary = _hex_to_ass(highlight_color)
    secondary = _hex_to_ass(color)

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "WrapStyle: 1",
        f"PlayResX: {W}",
        f"PlayResY: {H}",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{fontname},{fontsize},{primary},{secondary},{outline_c},{back_c},"
        f"{bold},0,0,0,100,100,{spacing},0,{border_style},{outline_w},{shadow_style_val},"
        f"{alignment},{margin_l},{margin_r},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    base_bgr = _to_bgr(color)
    hl_bgr = _to_bgr(highlight_color)

    for cap in captions:
        t_start = cap["startTime"]
        t_end = cap["endTime"]
        words = cap.get("words") or []

        if words:
            # Use browser-measured line breaks when available; fall back to estimation
            cap_id = cap.get("id", "")
            pre_breaks = (caption_line_breaks or {}).get(cap_id)
            if pre_breaks:
                wrapped_lines: list[list[int]] = [list(line) for line in pre_breaks]
            else:
                wrapped_lines = []
                cur_line: list[int] = []
                cur_chars = 0
                for wi2, w2 in enumerate(words):
                    wlen = len(w2["text"]) + 1
                    if cur_chars + wlen > chars_per_line and cur_line:
                        wrapped_lines.append(cur_line)
                        cur_line = [wi2]
                        cur_chars = wlen
                    else:
                        cur_line.append(wi2)
                        cur_chars += wlen
                if cur_line:
                    wrapped_lines.append(cur_line)

            word_to_line: dict[int, int] = {}
            for li, lw in enumerate(wrapped_lines):
                for wi2 in lw:
                    word_to_line[wi2] = li

            def _line_text(line_idx: int, active_wi: int, pre: bool = False) -> str:
                """Build ASS text for a single wrapped line."""
                if line_idx < 0 or line_idx >= len(wrapped_lines):
                    return "{\\q2}"
                parts: list[str] = ["{\\q2}"]
                for wi2 in wrapped_lines[line_idx]:
                    w_text = words[wi2]["text"]
                    if wi2 < len(words) - 1:
                        w_text += " "
                    if pre or wi2 > active_wi:
                        parts.append(f"{{\\c&H{base_bgr}&\\1a&H00&}}{w_text}")
                    elif wi2 < active_wi:
                        parts.append(f"{{\\c&H{base_bgr}&\\1a&H99&}}{w_text}")
                    else:
                        parts.append(f"{{\\c&H{hl_bgr}&\\1a&H00&}}{w_text}")
                return "".join(parts)

            def _slot_y(p: int) -> int:
                """Y coordinate for display position p (0 = top slot)."""
                return int(clip_y1 + padding_v_ass + p * slot_h)

            def _dlg(t_s: float, t_e: float, motion: str, text: str) -> str:
                return (
                    f"Dialogue: 0,{_ts(t_s)},{_ts(t_e)},Default,,0,0,0,,"
                    f"{kara_clip}{shadow_override}{motion}{text}"
                )

            # Pre-caption gap: all lines in base color before first word is spoken
            if words[0]["start"] > t_start:
                for p in range(max_visible):
                    if p >= len(wrapped_lines):
                        break
                    pos = f"{{\\pos({anchor_x},{_slot_y(p)})}}"
                    lines.append(_dlg(t_start, words[0]["start"], pos, _line_text(p, 0, pre=True)))

            for wi, word in enumerate(words):
                w_end = words[wi + 1]["start"] if wi + 1 < len(words) else t_end
                L = word_to_line[wi]
                prev_L = word_to_line.get(wi - 1, L) if wi > 0 else L
                new_line = prev_L < L

                if new_line:
                    # Each visible line (plus the exiting and entering lines) gets its
                    # own \move event.  p=0 is the exiting line (prev_L); p=1 is the
                    # first line of the new window (L, where wi is active); p>1 are
                    # subsequent visible lines.  All move up by one slot_h.
                    avail = w_end - word["start"]
                    t_anim_ms = int(min(_TRANS_S, avail) * 1000)
                    for p in range(max_visible + 1):
                        actual_line = prev_L + p
                        if actual_line >= len(wrapped_lines) and p > 0:
                            break
                        y_from = _slot_y(p)
                        y_to   = _slot_y(p - 1)   # p=0 → _slot_y(-1) = clip_y1 - slot_h (exit top)
                        move = f"{{\\move({anchor_x},{y_from},{anchor_x},{y_to},0,{t_anim_ms})}}"
                        lines.append(_dlg(word["start"], w_end, move, _line_text(actual_line, wi)))
                else:
                    # Emit one event per visible line at its fixed slot position.
                    for p in range(max_visible):
                        actual_line = L + p
                        if actual_line >= len(wrapped_lines):
                            break
                        pos = f"{{\\pos({anchor_x},{_slot_y(p)})}}"
                        lines.append(_dlg(word["start"], w_end, pos, _line_text(actual_line, wi)))

        else:
            lines.append(
                f"Dialogue: 0,{_ts(t_start)},{_ts(t_end)},Default,,0,0,0,,{shadow_override}{cap['text']}"
            )

    return "\n".join(lines)
