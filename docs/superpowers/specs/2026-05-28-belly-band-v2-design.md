# Belly Band v2 — Design Spec

**Date:** 2026-05-28
**Status:** Approved

## Context

Following the initial belly band implementation (pill overlay with slide-up animation), this spec adds four improvements: timeline drag interactions (move + resize), font size control, style template presets, and full animated export rendering so the exported MP4 matches the browser preview as closely as possible.

---

## 1. Timeline Drag Interactions

**Files:**
- `frontend/src/store/useProjectStore.ts` — add `trimTextOverlayLive`
- `frontend/src/components/Timeline/TextOverlayTrack.tsx` — add move drag + resize handles

### Store: `trimTextOverlayLive`

A single new live-preview action (no history, mirrors the pattern of `trimClipLive`):

```typescript
trimTextOverlayLive: (id: string, startTime: number, endTime: number) => void;
```

Implementation (live set, no `withHistory`):

```typescript
trimTextOverlayLive: (id, startTime, endTime) =>
  set((s) => ({
    project: {
      ...s.project,
      textOverlays: s.project.textOverlays.map((o) =>
        o.id === id ? { ...o, startTime, endTime } : o
      ),
    },
  })),
```

The commit on mouseup reuses the existing `updateTextOverlay(id, { startTime, endTime })` which wraps with `withHistory`.

### TextOverlayTrack: Move drag

The overlay block's `onMouseDown` initiates a move drag when the user clicks the body (not the edge handles). During drag, calls `moveSelectedItemsLive([{ id, newStartTime }])`. On `mouseup` (document-level listener), calls `moveSelectedItems([{ id, newStartTime }])`. Clamps `newStartTime` to `≥ 0`.

### TextOverlayTrack: Resize handles

Left and right 6px edge handles inside each overlay block (`cursor-ew-resize`). `onMouseDown` on a handle initiates a trim drag:
- **Left handle**: adjusts `startTime`, clamps so `endTime - startTime ≥ 0.5`
- **Right handle**: adjusts `endTime`, clamps so `endTime - startTime ≥ 0.5`

Live calls `trimTextOverlayLive`. On mouseup calls `updateTextOverlay(id, { startTime, endTime })`.

---

## 2. Font Size in Properties Panel

**File:** `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

Add a `SliderRow` for `fontSize` in the Style section:

```tsx
<SliderRow
  label="Font size"
  value={overlay.fontSize}
  min={10}
  max={72}
  step={1}
  onChange={(v) => update({ fontSize: v })}
  format={(v) => `${v}px`}
/>
```

---

## 3. Style Templates

**File:** `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

For pill overlays (`overlay.shape === "pill"`), render a Templates row above the Style section. Five preset swatches as 24×24px circles:

```typescript
const PILL_PRESETS = [
  { label: "Purple", background: "#7c3aed", color: "#ffffff", fontWeight: "bold" as const },
  { label: "Dark",   background: "#1a1a2e", color: "#ffffff", fontWeight: "bold" as const },
  { label: "White",  background: "#ffffff", color: "#111111", fontWeight: "bold" as const },
  { label: "Teal",   background: "#0d9488", color: "#ffffff", fontWeight: "bold" as const },
  { label: "Warm",   background: "#d97706", color: "#ffffff", fontWeight: "bold" as const },
];
```

Clicking a swatch calls `update({ background, color, fontWeight })`. Swatches have a white ring when active (background matches current overlay background).

Rendered as:
```tsx
{overlay.shape === "pill" && (
  <>
    <div className="border-t border-black/[0.06]" />
    <Section title="Templates">
      <div className="flex gap-2 flex-wrap">
        {PILL_PRESETS.map((p) => (
          <button
            key={p.label}
            title={p.label}
            onClick={() => update({ background: p.background, color: p.color, fontWeight: p.fontWeight })}
            className="w-6 h-6 rounded-full border-2 cursor-pointer transition-all"
            style={{
              background: p.background,
              borderColor: overlay.background === p.background ? "#fff" : "transparent",
              boxShadow: overlay.background === p.background ? "0 0 0 1px #0d9488" : "0 0 0 1px rgba(0,0,0,0.15)",
            }}
          />
        ))}
      </div>
    </Section>
  </>
)}
```

---

## 4. Export Rendering (FFmpeg)

**File:** `backend/services/ffmpeg.py`

Extend the existing text overlays section (`# Text overlays`, currently lines 624–643) to differentiate pill vs plain overlays.

### Plain text overlays

Unchanged — continue rendering with the existing `drawtext` filter.

### Pill overlays (`shape == "pill"`)

Emit two chained filters per overlay:

**a) Background box (`drawbox`)**

Pre-compute dimensions in Python:
```python
char_w = font_size * 0.55
box_w = int(len(text) * char_w + 40)   # 20px horizontal padding each side
box_h = font_size + 20                  # 10px vertical padding each side
box_x = int(ov["x"] / 100 * W) - box_w // 2
box_y_base = int(ov["y"] / 100 * H) - box_h // 2
anim_dur = ov.get("animateDuration", 0.4)
t0, t1 = ov["startTime"], ov["endTime"]
slide = 30  # pixels, matches renderer

# FFmpeg expression for animated y (slide up on in, slide down on out)
slide_expr = (
  f"if(lt(t-{t0},{anim_dur}),"
  f"  round(({anim_dur}-(t-{t0}))/{anim_dur}*{slide}),"
  f"  if(lt({t1}-t,{anim_dur}),"
  f"    round(({t1}-t)/{anim_dur}*{slide}),"
  f"    0))"
)
bg_color = ov.get("background", "#7c3aed").lstrip("#")
```

Filter string:
```python
f"drawbox=x={box_x}:y={box_y_base}+{slide_expr}:w={box_w}:h={box_h}:"
f"color=0x{bg_color}@0.95:t=fill:enable='between(t,{t0},{t1})'"
```

**b) Text (`drawtext`)**

```python
alpha_expr = (
  f"if(lt(t-{t0},{anim_dur}),(t-{t0})/{anim_dur},"
  f"if(lt({t1}-t,{anim_dur}),({t1}-t)/{anim_dur},1))"
)
text_y = f"{int(ov['y']/100*H)}-text_h/2+{slide_expr}"
```

Filter string:
```python
f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}:"
f"x={px_x}-text_w/2:y={text_y}:"
f"alpha='{alpha_expr}':enable='between(t,{t0},{t1})'"
```

### Filter chaining

The two filters per pill overlay are chained sequentially, same as multiple plain `drawtext` filters are chained today. The existing chaining logic in `ffmpeg.py` handles this.

**Note:** The pill background is a rectangle in export — `drawbox` has no border-radius. The rounded pill shape is CSS-only in the browser preview.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `frontend/src/store/useProjectStore.ts` | Add `trimTextOverlayLive` action |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Add move drag + left/right resize handles |
| `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx` | Add font size slider, style template swatches |
| `backend/services/ffmpeg.py` | Extend text overlay section for pill rendering + animation |

---

## Verification

1. **Timeline move**: Drag a belly band clip — it moves; release — it snaps and registers as one undo step.
2. **Timeline resize**: Drag the left or right edge — duration changes; clips can't go below 0.5s.
3. **Font size**: Slider in properties panel changes text size live in preview.
4. **Templates**: Click each swatch — pill color updates immediately; active swatch has teal ring.
5. **Export**: Export a project with a belly band. In the output MP4, the pill slides up at `startTime`, holds, then slides down before `endTime`. Text fades in/out matching the slide timing.
6. **Regression**: Plain text overlays ("T" button) render in export exactly as before. All existing clip drag/resize behavior is unchanged.
