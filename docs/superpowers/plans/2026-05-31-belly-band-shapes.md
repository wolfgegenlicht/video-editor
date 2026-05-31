# Belly-band Shape Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new belly-band shape styles (Rounded, Rectangle, Tab/cut-corner, Left accent bar) alongside the existing Pill, plus a corner-radius slider, with preview and FFmpeg export matching pixel-for-pixel.

**Architecture:** A shaped text overlay is baked into an RGBA PNG on export (PIL) and drawn with CSS in the preview. Both renderers share the same shape model: a `shape` enum + `cornerRadius` percent + `accentColor`. Pill/Rounded/Rectangle are one box family driven by the radius; Tab and Accent are structural. The FFmpeg overlay/slide/fade path is unchanged — it just consumes the PNG.

**Tech Stack:** React + TypeScript + Zustand (frontend), Python + FastAPI + Pillow (PIL) + FFmpeg (backend). No automated test suite exists; verification is `pnpm build` (TypeScript type-check), a standalone PIL render script, a Python import check, and manual preview/export comparison.

---

## File Structure

- **Create** `frontend/src/lib/overlayShapes.ts` — shared TS shape constants + `effectiveRadiusPct` helper (single source of truth for the frontend).
- **Modify** `frontend/src/types/project.ts` — widen `shape`, add `cornerRadius`, `accentColor`.
- **Modify** `frontend/src/components/Preview/TextOverlayRenderer.tsx` — generalize the shaped branch.
- **Modify** `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx` — Shape picker, radius slider, accent-color input.
- **Modify** `backend/services/overlay_render.py` — rename/generalize `render_pill_png` → `render_shape_png`.
- **Modify** `backend/services/ffmpeg.py` — route all shaped overlays through the PNG path; pass shape params.

The Python defaults (`DEFAULT_RADIUS_PCT`, stripe width) are duplicated in `overlay_render.py` because it is a separate language/process from the frontend; keep the two in sync (a comment in each points at the other).

---

### Task 1: Shape model — types + shared frontend constants

**Files:**
- Create: `frontend/src/lib/overlayShapes.ts`
- Modify: `frontend/src/types/project.ts:99-117`

- [ ] **Step 1: Create the shared shape helper**

Create `frontend/src/lib/overlayShapes.ts`:

```ts
// Shape model for belly-band text overlays. Kept in sync with the Python
// duplicate in backend/services/overlay_render.py (separate process/language).

export type OverlayShape = "pill" | "rounded" | "rectangle" | "tab" | "accent";

// Default corner radius as a percent of the box height. For "tab" this is the
// chamfer depth of the single cut corner; for box-family shapes it is the
// corner radius (50% => fully rounded pill, capped at height/2 by the renderer).
export const DEFAULT_RADIUS_PCT: Record<OverlayShape, number> = {
  pill: 50,
  rounded: 22,
  rectangle: 0,
  tab: 30,
  accent: 8,
};

// Width of the left accent stripe, in px at REFERENCE_WIDTH (1280). Callers
// scale by previewWidth/1280 (preview) or outputWidth/1280 (export).
export const ACCENT_STRIPE_REF_WIDTH = 8;

// Effective radius percent: an explicit cornerRadius overrides the shape default.
export function effectiveRadiusPct(shape: OverlayShape, cornerRadius?: number): number {
  return cornerRadius ?? DEFAULT_RADIUS_PCT[shape];
}
```

- [ ] **Step 2: Widen the TextOverlay type**

In `frontend/src/types/project.ts`, replace the current overlay shape line and add the two new optional fields. Change:

```ts
  shape?: "pill";
  animateIn?: "slide-up";
  animateOut?: "slide-down";
  animateDuration?: number;
  paddingH?: number;
  paddingV?: number;
```

to:

```ts
  shape?: "pill" | "rounded" | "rectangle" | "tab" | "accent";
  cornerRadius?: number;   // 0–50, percent of box height; overrides shape default
  accentColor?: string;    // left-stripe color, only used when shape === "accent"
  animateIn?: "slide-up";
  animateOut?: "slide-down";
  animateDuration?: number;
  paddingH?: number;
  paddingV?: number;
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm build`
Expected: build succeeds (no type errors). The new fields are optional, so existing code still compiles.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/overlayShapes.ts frontend/src/types/project.ts
git commit -m "feat(belly-band): add shape model types and shared constants"
```

---

### Task 2: Backend shape renderer (`render_shape_png`)

**Files:**
- Modify: `backend/services/overlay_render.py:40-85`

- [ ] **Step 1: Replace `render_pill_png` with `render_shape_png`**

In `backend/services/overlay_render.py`, replace the entire `render_pill_png` function (lines 40–85) with:

```python
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
```

- [ ] **Step 2: Render every shape and verify output**

Run (renders one PNG per shape to /tmp and asserts non-empty, positive dimensions):

```bash
cd backend && python - <<'PY'
from services.overlay_render import render_shape_png
import os
for shape in ["pill", "rounded", "rectangle", "tab", "accent"]:
    p = f"/tmp/shape_{shape}.png"
    w, h = render_shape_png(
        "Belly Band", p,
        shape=shape, font_family="sans-serif", bold=True, fontsize=48,
        pad_h=30, pad_v=12, bg_hex="#7c3aed", fg_hex="#ffffff",
        radius_pct=None, accent_hex="#ffffff", stripe_w=8,
    )
    assert w > 0 and h > 0, (shape, w, h)
    assert os.path.getsize(p) > 0, shape
    print(f"OK {shape}: {w}x{h} -> {p}")
print("ALL OK")
PY
```

Expected: five `OK <shape>: WxH` lines then `ALL OK`. Optionally open the PNGs to eyeball the shapes.

- [ ] **Step 3: Commit**

```bash
git add backend/services/overlay_render.py
git commit -m "feat(belly-band): generalize pill PNG renderer to all shapes"
```

---

### Task 3: Wire shapes into FFmpeg export

**Files:**
- Modify: `backend/services/ffmpeg.py:5` (import)
- Modify: `backend/services/ffmpeg.py:648-678` (pill branch)

- [ ] **Step 1: Update the import**

In `backend/services/ffmpeg.py` line 5, change:

```python
from services.overlay_render import font_path, render_pill_png
```

to:

```python
from services.overlay_render import font_path, render_shape_png
```

(The accent stripe reference width — 8px at REFERENCE_WIDTH — is passed as a literal in Step 2; no extra import needed.)

- [ ] **Step 2: Route all shaped overlays through the PNG path**

In `backend/services/ffmpeg.py`, change the branch condition and the render call. Replace:

```python
            if ov.get("shape") == "pill":
                anim_dur = max(0.001, min(ov.get("animateDuration", 0.4), (t1 - t0) / 2))
                pad_h = int(ov.get("paddingH", 20) * ov_scale)
                pad_v = int(ov.get("paddingV", 8) * ov_scale)
                fd, pill_path = tempfile.mkstemp(suffix="_pill.png")
                os.close(fd)
                box_w, box_h = render_pill_png(
                    ov["text"], pill_path,
                    font_family=family, bold=bold, fontsize=fs,
                    pad_h=pad_h, pad_v=pad_v,
                    bg_hex=ov.get("background", "#7c3aed"), fg_hex=ov.get("color", "#ffffff"),
                )
```

with:

```python
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
```

The remaining lines of that branch (`pill_png_files.append(...)` through `ops.append(("overlay", ...))`) are unchanged. The `else:` `drawtext` branch is unchanged and still handles plain text overlays (those with no `shape`).

- [ ] **Step 3: Verify the module imports cleanly**

Run: `cd backend && python -c "import services.ffmpeg; print('import OK')"`
Expected: `import OK` (no ImportError / NameError).

- [ ] **Step 4: Commit**

```bash
git add backend/services/ffmpeg.py
git commit -m "feat(belly-band): export all overlay shapes via PNG bake path"
```

---

### Task 4: Generalize the preview renderer

**Files:**
- Modify: `frontend/src/components/Preview/TextOverlayRenderer.tsx` (whole file)

- [ ] **Step 1: Rewrite the file to render all shapes**

Replace the entire contents of `frontend/src/components/Preview/TextOverlayRenderer.tsx` with:

```tsx
import type { CSSProperties } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { FONT_FAMILY_CSS } from "../../lib/fonts";
import { effectiveRadiusPct, ACCENT_STRIPE_REF_WIDTH } from "../../lib/overlayShapes";

interface Props { time: number }

const REFERENCE_WIDTH = 1280;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function pillProgress(time: number, startTime: number, endTime: number, animateDuration: number): number {
  const totalDur = endTime - startTime;
  if (totalDur <= 0) return 1;
  const dur = Math.min(animateDuration, totalDur / 2);
  const t = Math.min((time - startTime) / dur, (endTime - time) / dur, 1);
  return easeOutCubic(Math.max(0, t));
}

export default function TextOverlayRenderer({ time }: Props) {
  const { project, previewWidth } = useProjectStore();
  const scale = previewWidth / REFERENCE_WIDTH;
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => {
        if (o.shape) {
          const progress = pillProgress(time, o.startTime, o.endTime, o.animateDuration ?? 0.4);
          const pH = (o.paddingH ?? 20) * scale;
          const pV = (o.paddingV ?? 8) * scale;
          const fontPx = o.fontSize * scale;
          // Approximate box height (matches PIL ascent+descent ≈ 1.2× font size).
          const boxH = fontPx * 1.2 + 2 * pV;
          const radiusPct = effectiveRadiusPct(o.shape, o.cornerRadius);
          const radiusPx = Math.min((radiusPct / 100) * boxH, boxH / 2);
          const chamfer = Math.min((radiusPct / 100) * boxH, boxH);
          const stripeW = ACCENT_STRIPE_REF_WIDTH * scale;
          const isAccent = o.shape === "accent";
          const style: CSSProperties = {
            left: `${o.x}%`,
            top: `${o.y}%`,
            transform: `translate(-50%, -50%) translateY(${(1 - progress) * 30 * scale}px)`,
            opacity: progress,
            fontSize: fontPx,
            lineHeight: 1.2,
            fontFamily: FONT_FAMILY_CSS[o.fontFamily ?? "sans-serif"] ?? FONT_FAMILY_CSS["sans-serif"],
            color: o.color,
            fontWeight: o.fontWeight,
            background: isAccent ? (o.accentColor ?? "#ffffff") : o.background,
            padding: `${pV}px ${pH}px`,
            whiteSpace: "nowrap",
            maxWidth: "90%",
            overflow: "hidden",
            borderRadius: o.shape === "tab" ? 0 : radiusPx,
          };
          if (o.shape === "tab") {
            style.clipPath = `polygon(0 0, calc(100% - ${chamfer}px) 0, 100% ${chamfer}px, 100% 100%, 0 100%)`;
          }
          return (
            <div key={o.id} className="absolute pointer-events-none" style={style}>
              {isAccent && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: stripeW,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    background: o.background,
                    borderRadius: radiusPx,
                  }}
                />
              )}
              <span style={{ position: "relative" }}>{o.text}</span>
            </div>
          );
        }
        return (
          <div
            key={o.id}
            className="absolute pointer-events-none"
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              fontSize: o.fontSize * scale,
              fontFamily: FONT_FAMILY_CSS[o.fontFamily ?? "sans-serif"] ?? FONT_FAMILY_CSS["sans-serif"],
              color: o.color,
              fontWeight: o.fontWeight,
              background: o.background === "transparent" ? undefined : o.background,
              padding: o.background !== "transparent" ? `${2 * scale}px ${8 * scale}px` : undefined,
              borderRadius: o.background !== "transparent" ? 4 : undefined,
              transform: "translate(-50%, -50%)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
              whiteSpace: "pre-wrap",
              maxWidth: "90%",
              textAlign: "center",
            }}
          >
            {o.text}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Preview/TextOverlayRenderer.tsx
git commit -m "feat(belly-band): render all overlay shapes in preview"
```

---

### Task 5: Shape picker, radius slider, accent color in the properties panel

**Files:**
- Modify: `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

- [ ] **Step 1: Add imports and a SHAPES list**

At the top of `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`, add to the imports:

```ts
import { DEFAULT_RADIUS_PCT, type OverlayShape } from "../../lib/overlayShapes";
```

Below the existing `OVERLAY_FONTS` const, add:

```ts
const SHAPES: Array<{ value: OverlayShape; label: string }> = [
  { value: "pill", label: "Pill" },
  { value: "rounded", label: "Rounded" },
  { value: "rectangle", label: "Rectangle" },
  { value: "tab", label: "Tab" },
  { value: "accent", label: "Accent" },
];
```

- [ ] **Step 2: Add the Shape section + radius slider (and gate existing pill sections on any shape)**

Replace the existing Templates block:

```tsx
      {overlay.shape === "pill" && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Templates">
```

with a new Shape section followed by the Templates section, both gated on `overlay.shape` being truthy:

```tsx
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Shape">
            <div className="flex gap-1.5 flex-wrap mb-2">
              {SHAPES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => update({ shape: s.value, cornerRadius: DEFAULT_RADIUS_PCT[s.value] })}
                  className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                    overlay.shape === s.value
                      ? "border-[#0d9488] bg-[#0d9488]/10 text-[#0d9488]"
                      : "border-black/[0.1] bg-white text-[#6b6b78] hover:text-[#141416]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <SliderRow
              label={overlay.shape === "tab" ? "Cut corner" : "Corner radius"}
              value={overlay.cornerRadius ?? DEFAULT_RADIUS_PCT[overlay.shape]}
              min={0}
              max={50}
              step={1}
              onChange={(v) => update({ cornerRadius: v })}
              format={(v) => `${v}%`}
            />
            {overlay.shape === "accent" && (
              <div className="mt-2">
                <p className="text-xs text-[#6b6b78] mb-1">Accent color</p>
                <input
                  type="color"
                  aria-label="Accent color"
                  value={overlay.accentColor ?? "#ffffff"}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
                />
              </div>
            )}
          </Section>
          <div className="border-t border-black/[0.06]" />
          <Section title="Templates">
```

The Templates `Section` body (the `.map` over `PILL_PRESETS`) and its closing `</Section></>` are unchanged.

- [ ] **Step 3: Gate the Padding and Animation sections on any shape**

Change the Padding section guard from:

```tsx
      {overlay.shape === "pill" && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Padding">
```

to:

```tsx
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Padding">
```

And change the Animation section guard from:

```tsx
      {overlay.shape === "pill" && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Animation">
```

to:

```tsx
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Animation">
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx
git commit -m "feat(belly-band): add shape picker, radius slider, accent color controls"
```

---

### Task 6: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start both servers**

```bash
cd backend && uvicorn main:app --reload
```
and in another shell:
```bash
cd frontend && pnpm dev
```

- [ ] **Step 2: Verify preview for every shape**

In the browser: upload a clip, add a belly band (Timeline toolbar), select it. In the right panel Shape section, click through Pill → Rounded → Rectangle → Tab → Accent. Confirm:
- Pill is fully rounded; Rounded has soft corners; Rectangle is sharp.
- Tab shows one cut corner (top-right); dragging the "Cut corner" slider changes the chamfer size.
- Accent shows a left stripe; the Accent color input changes the stripe color.
- The corner-radius slider changes roundness for box-family and accent shapes.

- [ ] **Step 3: Verify export matches preview**

For at least Tab and Accent (the structural shapes), export the project (Header → Export) and scrub the rendered MP4 to the belly-band time. Confirm the exported shape, radius, stripe color, and position match the preview at the belly-band region.

- [ ] **Step 4: Verify backward compatibility**

Reload the app (so the project loads from localStorage). Confirm any pre-existing pill overlay still renders as a fully-rounded pill, unchanged.

- [ ] **Step 5: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "docs(belly-band): verification notes" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Shape set (pill/rounded/rectangle/tab/accent) → Task 1 (types), Task 2/4 (render), Task 5 (picker). ✓
- `cornerRadius` override + defaults → Task 1 (`effectiveRadiusPct`, `DEFAULT_RADIUS_PCT`), Task 2 (`_DEFAULT_RADIUS_PCT`), Task 5 (slider). ✓
- `accentColor` + left stripe → Task 1 (type), Task 2 (PIL accent draw), Task 4 (CSS stripe), Task 5 (color input). ✓
- Tab = one cut corner, slider = chamfer depth → Task 2 (polygon), Task 4 (clip-path), Task 5 (label "Cut corner"). ✓
- Export via PNG path, drawtext stays for plain text → Task 3 (`if ov.get("shape")` vs `else`). ✓
- Preview/export pixel-match contract (REFERENCE_WIDTH 1280) → both renderers scale identically; accent/tab share the same model. ✓
- Backward compat (existing `shape:"pill"`, no migration) → Task 1 optional fields; pill default radius 50% = height/2. ✓
- TimelineToolbar unchanged → confirmed in spec, no task needed. ✓

**Spec deviation (intentional):** the spec table listed `tab` default radius = 0, which would produce no visible cut. The plan uses `tab` default = 30 so the Tab shape is visibly chamfered out of the box. Box-family/accent defaults unchanged.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type/name consistency:** `render_shape_png` (Task 2) matches the import and call in Task 3. `OverlayShape`, `DEFAULT_RADIUS_PCT`, `ACCENT_STRIPE_REF_WIDTH`, `effectiveRadiusPct` (Task 1) match their uses in Tasks 4 and 5. `cornerRadius`/`accentColor`/`shape` field names consistent across types, renderers, panel, and ffmpeg. ✓
