# Video Layer Transform

## Context

Users need to reposition, scale, and rotate the video layer independently from captions in the preview. Today the video fills the canvas statically with no spatial controls. This adds a Figma/Canva-style transform system: click the video to select it, then drag to move, drag corners to scale, drag the rotation handle to rotate. Captions and text overlays remain on their own layer above, unaffected.

---

## Design Decisions

| Question | Decision |
|---|---|
| Interaction | Click to select → bounding box + handles; click outside to deselect |
| Scope | Per clip — each clip stores its own transform |
| Capabilities | Move (X/Y) + Scale + Rotate |
| Overflow | Canvas clips rendering; handles render outside clip boundary so they stay reachable even when video is dragged off-canvas |
| Scale bounds | Min 1.0 (100%) — video always covers canvas. Max 5.0 (500%). |
| Move bounds | None — fully free |
| Rotate bounds | None — full ±360° |
| Video click | Selects clip (removes play-toggle from click; spacebar still handles play/pause) |

---

## Data Model

Add optional `transform` field to `Clip` in `frontend/src/types/project.ts`:

```ts
export interface ClipTransform {
  x: number;         // % offset from center, relative to canvas width  (e.g. 10 = shift right 10%)
  y: number;         // % offset from center, relative to canvas height (e.g. -5 = shift up 5%)
  scale: number;     // multiplier, min 1.0. 1.0 = fills canvas (object-cover baseline)
  rotation: number;  // degrees, free range
}

export interface Clip {
  // ... existing fields ...
  transform?: ClipTransform;
}
```

Default (no transform): `{ x: 0, y: 0, scale: 1, rotation: 0 }`.

---

## Store

Add one action to `frontend/src/store/useProjectStore.ts`, wrapped in `withHistory`:

```ts
setClipTransform(clipId: string, transform: Partial<ClipTransform>): void
```

Merges the partial transform into the existing clip transform (defaulting missing fields to 0/1). Follows the same pattern as `setClipAdjustment`.

---

## VideoPreview Restructure

**File:** `frontend/src/components/Preview/VideoPreview.tsx`

The current single-div canvas becomes a two-layer structure:

```
<div className={`relative ${ratioClass}`} style={{maxWidth}}>        ← outer wrapper (no overflow clip)
  <div className="absolute inset-0 bg-black overflow-hidden">         ← inner canvas (clips video)
    <video className="w-full h-full object-cover" style={transform} />
    <TextOverlayRenderer />
    <CaptionOverlay />
    {fadeOverlay}
  </div>
  {selectedClip && <VideoTransformOverlay clip={selectedClip} />}     ← handles (NOT clipped)
</div>
```

Key changes:
- `object-contain` → `object-cover` so scale=1.0 means "fill canvas edge to edge". **Behaviour note:** existing projects with mismatched-aspect-ratio clips will change from letterboxed to cropped. Acceptable trade-off for the transform system.
- CSS transform on video element: `translate(${x}%, ${y}%) scale(${scale}) rotate(${rotation}deg)` with `transform-origin: center center`. x/y are percentages of the video element's own dimensions (= canvas dimensions at scale 1.0).
- `onClick={toggle}` removed from video; play/pause stays on spacebar only
- `onPointerDown` on video body → `selectClip(activeClip.id)` (auto-opens Properties panel)
- `onPointerDown` on outer wrapper (self only) → `selectClip(null)` to deselect

---

## VideoTransformOverlay Component

**New file:** `frontend/src/components/Preview/VideoTransformOverlay.tsx`

Renders absolutely within the outer wrapper (not inside `overflow-hidden`). Mirrors the video's exact transform so handles align with the (possibly partially hidden) video.

```
position: absolute; inset: 0   ← same footprint as inner canvas
transform: same as video        ← handles rotate/scale/translate with it
pointer-events: none on the box, all on handles
```

**Handles:**
- **4 corner handles** (teal, 10×10px squares): scale on drag. Uniform scale from center. Clamp to `[1.0, 5.0]`.
- **Rotation handle** (violet circle, 9px): sits 24px above the top edge center, connected by a thin line. Drag computes angle delta from center of box.
- **Body drag**: `onPointerDown` on the box itself (not handles) initiates move. Updates X/Y in %.

**Drag pattern** (follows existing CaptionOverlay KaraokeOverlay pattern):
- `document.addEventListener('pointermove' / 'pointerup')` on drag start, removed on end
- Delta calculation uses the outer wrapper's `getBoundingClientRect()` for coordinate space
- All three interactions (move, scale, rotate) call `setClipTransform(clipId, {...})` on each frame

---

## Properties Panel

**File:** `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

Add a **Transform** section below the existing Video adjustments section:

| Field | Control | Range |
|---|---|---|
| X offset | Number input + `%` suffix | free |
| Y offset | Number input + `%` suffix | free |
| Scale | Number input + `%` suffix | 100–500 |
| Rotation | Number input + `°` suffix | free |
| Reset | Button | sets transform to defaults |

Follows the same slider/input pattern already used for brightness/contrast/saturation. Calls `setClipTransform` on change.

---

## FFmpeg Export

**File:** `backend/services/ffmpeg.py`

Per-clip transform applied in `filter_complex` after trim, before concat. Operations in order:

1. **Scale** the clip to `W*scale × H*scale` (oversizes it so there's room to pan)
2. **Rotate** using the `rotate` filter (with transparent fill so the crop step handles edges)
3. **Crop** back to canvas size `W×H`, with the crop origin offset by the x/y translation so the correct region of the scaled+rotated video is used

If a clip has no transform (or all values are identity: x=0, y=0, scale=1.0, rotation=0), skip these filters entirely to avoid unnecessary re-encoding overhead.

Exact FFmpeg filter parameters are an implementation detail — the spec defines the operations; the implementer works out the precise `filter_complex` syntax.

---

## Undo/Redo

`setClipTransform` uses `withHistory` so all transform operations (drag, numeric input, reset) are fully undoable via Ctrl+Z.

---

## Verification

1. Start dev server: `pnpm dev` in `frontend/`
2. Upload a video, place it on the timeline
3. Click the video in the preview — bounding box + handles appear; Properties panel opens to Transform section
4. Drag the body — video moves, handles track it
5. Drag the video off the canvas edge — handles remain visible outside the clip boundary
6. Try to scale below 100% — should clamp and not show black bars
7. Drag a corner handle — video scales uniformly from center
8. Drag the rotation handle — video rotates; drag off-canvas to confirm handles stay reachable
9. Edit X/Y/Scale/Rotation in the Properties panel — preview updates live
10. Click Reset — transform returns to default
11. Ctrl+Z — each transform step undoes correctly
12. Export — rendered MP4 reflects the transform (position/scale/rotation baked in)
