"""Render text-overlay assets (the belly-band shapes) as PNGs so the FFmpeg
export matches the browser preview pixel-for-pixel.

The preview (TextOverlayRenderer.tsx) draws each shape with CSS — box-family
(pill / rounded / rectangle) via border-radius, "tab" via a clip-path cutting
the top-right corner, and "accent" as a colored box with a contrasting stripe
on the left edge. FFmpeg's drawbox can only draw sharp rectangles and estimates
text width with a crude heuristic, so instead we bake the whole shape (rounded
background + text) into an RGBA PNG with PIL — using the same bundled font the
preview uses — then overlay it.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

_FONTS_DIR = Path(__file__).parent.parent / "fonts"

# Maps the overlay fontFamily values (shared with the caption picker) to the
# bundled TTF files. Keep in sync with frontend/src/lib/fonts.ts and the
# backend fonts/ directory.
_FONT_FILES = {
    "sans-serif": {"regular": "Inter-Regular.ttf", "bold": "Inter-Bold.ttf"},
    "serif": {"regular": "Merriweather-Regular.ttf", "bold": "Merriweather-Bold.ttf"},
    "monospace": {"regular": "JetBrainsMono-Regular.ttf", "bold": "JetBrainsMono-Bold.ttf"},
}


def font_path(font_family: str, bold: bool) -> str:
    """Absolute path to the bundled TTF for the given family/weight."""
    files = _FONT_FILES.get(font_family or "sans-serif", _FONT_FILES["sans-serif"])
    return str(_FONTS_DIR / files["bold" if bold else "regular"])


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        return (124, 58, 237, alpha)  # fallback: purple (#7c3aed)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


# Default corner radius as a percent of box height. Mirror of
# frontend/src/lib/overlayShapes.ts DEFAULT_RADIUS_PCT — keep in sync.
_DEFAULT_RADIUS_PCT = {
    "pill": 50,
    "rounded": 22,
    "rectangle": 0,
    "tab": 30,
    "accent": 8,
}


def render_shape_png(
    text: str,
    out_path: str,
    *,
    shape: str,
    font_family: str,
    bold: bool,
    fontsize: int,
    pad_h: int,
    pad_v: int,
    bg_hex: str,
    fg_hex: str,
    radius_pct: float | None = None,
    accent_hex: str = "#ffffff",
    stripe_w: int = 8,
) -> tuple[int, int]:
    """Render a shaped belly-band PNG and return its (width, height) in pixels.

    All sizes are already in output-resolution pixels (the caller scales by
    output_width / REFERENCE_WIDTH before calling). `radius_pct` is a percent of
    the box height (0–50 for box shapes; chamfer depth for "tab"); if None the
    shape's default is used. This mirrors the CSS preview in
    TextOverlayRenderer.tsx so export and preview match pixel-for-pixel.
    """
    fontsize = max(1, int(fontsize))
    font = ImageFont.truetype(font_path(font_family, bold), fontsize)

    # Measure text. textbbox gives tight glyph bounds; getmetrics gives the
    # font's line box (ascent+descent), matching the CSS line box.
    measure = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = measure.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    ascent, descent = font.getmetrics()
    line_h = ascent + descent

    box_w = int(text_w + 2 * pad_h)
    box_h = int(line_h + 2 * pad_v)

    if radius_pct is None:
        radius_pct = _DEFAULT_RADIUS_PCT.get(shape, 0)
    radius = int(max(0, min(radius_pct / 100 * box_h, box_h / 2)))

    img = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bg_rgba = _hex_to_rgba(bg_hex, 255)

    if shape == "tab":
        chamfer = int(max(0, min(radius_pct / 100 * box_h, box_h)))
        pts = [
            (0, 0),
            (box_w - 1 - chamfer, 0),
            (box_w - 1, chamfer),
            (box_w - 1, box_h - 1),
            (0, box_h - 1),
        ]
        draw.polygon(pts, fill=bg_rgba)
    elif shape == "accent":
        sw = int(max(1, min(stripe_w, box_w - 1)))
        # Whole box in the accent color, then the content box inset from the
        # left by the stripe width. Matches the CSS model (wrapper bg = accent,
        # inner content div inset left = background).
        draw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=radius,
                               fill=_hex_to_rgba(accent_hex, 255))
        draw.rounded_rectangle([sw, 0, box_w - 1, box_h - 1], radius=radius,
                               fill=bg_rgba)
    else:  # pill / rounded / rectangle
        draw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=radius,
                               fill=bg_rgba)

    # Horizontally centre; place the glyph line box at the vertical padding.
    tx = (box_w - text_w) // 2 - bbox[0]
    ty = pad_v
    draw.text((tx, ty), text, font=font, fill=_hex_to_rgba(fg_hex, 255))

    img.save(out_path)
    return box_w, box_h
