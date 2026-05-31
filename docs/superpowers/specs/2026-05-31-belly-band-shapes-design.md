# Belly-band shape styles — Design

**Date:** 2026-05-31
**Status:** Approved (design)

## Goal

The belly-band text overlay currently supports a single shape: a fully-rounded
"pill". Add a small set of additional shape styles the user can choose from in
the properties panel, plus a corner-radius control. The preview and the FFmpeg
export must continue to match pixel-for-pixel at the 1280px reference width.

## Shape set

Five shapes, grouped into two families:

- **Box family** (differ only by corner radius): **Pill**, **Rounded**,
  **Rectangle**. Driven by a single shared corner-radius slider; the three
  buttons are quick presets (max / medium / zero radius).
- **Structural shapes**: **Tab** (one chamfered/cut corner, top-right) and
  **Accent bar** (solid box with a contrasting vertical stripe on the left edge).

Out of scope (not selected): underline, outline/stroke, brackets, two/more cut
corners, configurable cut-corner position.

## Data model (`frontend/src/types/project.ts`)

Extend `TextOverlay`. All fields optional so existing pill overlays in
`localStorage` keep working unchanged.

```ts
shape?: "pill" | "rounded" | "rectangle" | "tab" | "accent";  // was: "pill"
cornerRadius?: number;   // 0–50, percent of box height. Overrides shape default.
accentColor?: string;    // stripe color; only used when shape === "accent"
```

### Effective radius

`effectiveRadiusPct = cornerRadius ?? DEFAULT_RADIUS[shape]`

| shape      | default radius % |
|------------|------------------|
| pill       | 50 (→ height/2)  |
| rounded    | 22               |
| rectangle  | 0                |
| tab        | 0                |
| accent     | 8                |

`radiusPx = clamp(effectiveRadiusPct/100 * boxHeight, 0, boxHeight/2)`.

- **Box family** uses `radiusPx` as the corner radius of all four corners.
- **Tab** ignores the box radius for shape; instead the slider value drives the
  **chamfer depth** of the single cut corner (top-right). Chamfer depth in px =
  `effectiveRadiusPct/100 * boxHeight` (or a sensible cap), reusing the same
  slider. The other three corners are square.
- **Accent** keeps the box `radiusPx` on the outer box. A left vertical stripe
  is drawn in `accentColor` (default `#ffffff`); the stripe rounds only its left
  corners (matching the box's left radius) and is square on its right edge.
  Stripe width: a fixed reference width (e.g. 8px at 1280 reference) scaled by
  `output_width / 1280`.

## Rendering

Two renderers must stay in sync (the REFERENCE_WIDTH=1280 contract).

### Preview — `frontend/src/components/Preview/TextOverlayRenderer.tsx`

Generalize the current `o.shape === "pill"` branch to cover all shapes:

- Compute `radiusPx` from the effective radius and the rendered box height.
- **Box family**: set `borderRadius: radiusPx`.
- **Tab**: apply `clipPath: polygon(...)` cutting the top-right corner by the
  chamfer depth; keep `borderRadius` for non-tab corners at the box value
  (clip-path + small radius is acceptable; if they conflict visually, the
  chamfer wins and other corners stay square to match PIL).
- **Accent**: render the box, plus an absolutely-positioned inner stripe `div`
  at `left:0`, full height, `width: stripeWidthPx`, with
  `borderTopLeftRadius`/`borderBottomLeftRadius` = box radius.
- Slide-up entry / slide-down exit + opacity fade animation is unchanged and
  applies to every shape (same `pillProgress` easing).

### Export — `backend/services/overlay_render.py`

Rename/generalize `render_pill_png` → `render_shape_png(...)` accepting:
`shape`, `radius_px` (already scaled), `accent_hex`, plus existing
`text/font/fontsize/pad_h/pad_v/bg_hex/fg_hex`. Returns `(width, height)`.

- **Box family**: `ImageDraw.rounded_rectangle` with `radius=radius_px`.
- **Tab**: `ImageDraw.polygon` for the chamfered outline (top-right cut by the
  chamfer depth), filled with `bg_hex`. Text drawn the same way as today.
- **Accent**: draw the rounded box, then draw the left stripe as a
  `rounded_rectangle` of `accent_hex` spanning `[0, stripe_w]` with the same
  radius (left corners round, right edge effectively square because it's
  overlapped by the box interior). Stripe width scaled by caller.
- Antialiasing: render at the same scale used today; if polygon edges look
  jagged compared to `rounded_rectangle`, supersample (draw 2× then downscale)
  — decide during implementation, only if needed.

### Export wiring — `backend/services/ffmpeg.py`

The pill branch already: computes scaled `pad_h/pad_v/fontsize`, calls the
render function, gets `(box_w, box_h)`, loops the PNG as an input, and overlays
with the slide/fade expression. Changes:

- Apply this branch to **all** shapes (not just `shape == "pill"`), since every
  shape is now a baked PNG.
- Compute `radius_px` from `cornerRadius`/shape defaults × `ov_scale`.
- Pass `shape`, `radius_px`, `accent_hex` (scaled stripe width derived inside
  `overlay_render` or passed in) to `render_shape_png`.
- The plain-text (`drawtext`) branch remains for overlays with **no** `shape`
  (i.e. `shape` undefined → regular text overlay). Only shaped overlays go
  through the PNG path.

## Controls — `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

Shown only when the overlay has a `shape` (shaped belly-band):

1. New **Shape** section above the existing color Templates: five buttons
   (Pill, Rounded, Rectangle, Tab, Accent). Clicking a button sets `shape` and
   resets `cornerRadius` to that shape's default. Active button is highlighted.
2. **Corner radius** slider (0–50, `%`), present for all shapes. For tab it
   controls chamfer depth; label can stay "Corner radius".
3. **Accent color** color input, shown only when `shape === "accent"`.
4. Existing sections unchanged: color Templates, Style (font/size/bg/text
   color), Padding, Position, Animation.

## Creation — `frontend/src/components/Timeline/TimelineToolbar.tsx`

`handleAddBellyBand` is unchanged — keeps creating `shape: "pill"`. Users switch
shape via the panel. (Defaults `cornerRadius`/`accentColor` left undefined so
shape defaults apply.)

## Backward compatibility

- Existing overlays with `shape: "pill"` and no `cornerRadius` render exactly as
  before (pill default radius = 50% = height/2).
- Plain text overlays (no `shape`) are untouched.
- No store migration required; all new fields are optional with defaults.

## Testing / verification

No automated test suite exists. Manual verification:

1. Add a belly band, cycle through all five shapes in the preview.
2. For each shape, confirm the corner-radius slider behaves (box family rounds;
   tab chamfer grows/shrinks).
3. Set an accent color on the Accent shape; confirm the left stripe.
4. Export and compare the rendered MP4 frame against the preview for each shape
   (pixel-match check at the belly-band region).
5. Confirm a pre-existing pill project (loaded from localStorage) still renders
   identically.
