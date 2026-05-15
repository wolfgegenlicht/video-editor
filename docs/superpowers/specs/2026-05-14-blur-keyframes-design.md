# Blur Region Keyframes — Design Spec

**Date:** 2026-05-14  
**Status:** Approved for implementation

---

## Context

The blur region effect currently has static properties (x, y, width, height, intensity, feather). When users need to blur a moving subject in video (faces, licence plates, sensitive text in zoomed footage), they must create multiple separate blur effects and manually position each one — a tedious workflow. This feature adds keyframe animation so a single blur effect can track a moving subject by interpolating all properties between user-defined points in time.

---

## User-Facing Behaviour

- A blur effect can have zero or more keyframes. Zero keyframes = static behaviour (no change from today).
- **Adding a keyframe:** click "+ Add" in the properties panel while the playhead is inside the effect's time range. The current interpolated state (position, size, intensity, feather) is snapshotted.
- **Auto-create on drag:** while the effect is in keyframe mode (≥ 1 keyframe), dragging the blur region in the video preview automatically upserts a keyframe at the current playhead time.
- **Removing a keyframe:** click the × button next to any keyframe row in the properties panel. All deletes are undoable.
- **Interpolation:** linear between adjacent keyframes. Values clamp to the first/last keyframe outside the keyframe range.
- **Navigation:** ◀ ▶ buttons in the properties panel jump the playhead to the previous/next keyframe time.
- **Timeline diamonds:** amber ◆ diamonds appear on the effect bar at each keyframe position. Clicking one jumps the playhead to that keyframe.
- **Editing a keyframe's values:** move the playhead to a keyframe (within 50 ms), then drag the region or adjust the intensity/feather sliders — the active keyframe updates. The active keyframe row in the properties panel is highlighted.

---

## Data Model (`src/types/project.ts`)

```typescript
export interface BlurKeyframe {
  time: number;       // seconds relative to effect.startTime; array always sorted ascending
  intensity: number;  // blur radius in px
  region?: BlurRegion; // normalised 0-1; absent only for full-frame blurs (no region)
}
```

`BlurParams` gains one optional field:

```typescript
export interface BlurParams {
  intensity: number;
  region?: BlurRegion;
  keyframes?: BlurKeyframe[]; // present & non-empty → keyframe mode
}
```

Every `BlurKeyframe` snapshots the complete current state. When the user adds their first keyframe, `intensity` and `region` (if present) are copied from `BlurParams`. For full-frame blurs (no region), keyframes animate `intensity` only; `region` stays absent on every keyframe.

---

## Interpolation Utility (`src/lib/blurKeyframes.ts`)

```typescript
export function interpolateBlurAt(
  keyframes: BlurKeyframe[],
  relativeTime: number,
  base: BlurParams,
): BlurParams
```

- **No keyframes** → returns `base` unchanged.
- **Before first keyframe** → returns first keyframe values.
- **After last keyframe** → returns last keyframe values.
- **Between two adjacent keyframes** → lerp all numeric fields: `intensity`, `region.x`, `region.y`, `region.width`, `region.height`, `region.feather`. Formula: `a + (b - a) * ((t - t0) / (t1 - t0))`.

---

## Store Actions (`src/store/useProjectStore.ts`)

Both wrapped with `withHistory` for undo/redo:

| Action | Description |
|---|---|
| `addOrUpdateBlurKeyframe(effectId, keyframe)` | If a keyframe within 50 ms of `keyframe.time` exists, replace it; otherwise insert and re-sort by time. |
| `deleteBlurKeyframe(effectId, keyframeIndex)` | Remove keyframe at the given index. |

---

## Component Changes

### `src/lib/blurKeyframes.ts` *(new file)*
Interpolation utility only — no React, no store imports.

### `src/components/Preview/VideoPreview.tsx`
When computing effective blur params for a given effect overlay, check for keyframes:
```ts
const params = keyframes?.length
  ? interpolateBlurAt(keyframes, playheadTime - effect.startTime, effect.params)
  : effect.params;
```

### `src/components/Preview/BlurRegionEditor.tsx`
On drag end:
- If effect has no keyframes: call `updateEffectOverlayParams` as before (static mode).
- If effect has keyframes: call `addOrUpdateBlurKeyframe` with `{ time: playheadTime - effect.startTime, ...currentRegionAndIntensity }`.

### `src/components/RightPanel/EffectPropertiesPanel.tsx`
For blur effects, add a **Keyframes section** above the sliders:

```
KEYFRAMES (N)                          [+ Add]
┌─────────────────────────────────────────┐
│  0:10   x:.12 y:.34 w:.28 h:.18 b:10  ×│
│◆ 0:22   x:.50 y:.34 w:.28 h:.18 b:10  ×│  ← highlighted (active)
│  1:05   x:.74 y:.34 w:.28 h:.18 b:10  ×│
└─────────────────────────────────────────┘
                 [◀]  2/3  [▶]
```

- Active keyframe = playhead within 50 ms of a keyframe time. Highlighted with `bg-sky-50 border border-sky-200`.
- Sliders (blur amount, feather): if at an active keyframe, call `addOrUpdateBlurKeyframe` on change; otherwise call `addOrUpdateBlurKeyframe` at current time (auto-create).
- Clicking a keyframe row jumps the playhead to `effect.startTime + keyframe.time`.
- × deletes that keyframe (`deleteBlurKeyframe`).

### `src/components/Timeline/EffectOverlayTrack.tsx`
Render amber diamonds for each keyframe inside the effect bar:
- Position: `left = (effect.startTime + kf.time) * zoom` px from the track left edge, clamped inside the bar.
- The diamond at the active keyframe (playhead within 50 ms) gets a `ring-2 ring-amber-300` outline.
- Click → set store `playheadTime` to `effect.startTime + kf.time`.

---

## Backend Changes (`backend/services/ffmpeg.py`)

Extend the existing blur filter block (lines ~300–342) with a keyframe branch.

**If `effect.params.keyframes` is absent or empty:** existing code path, no change.

**If keyframes present:** build FFmpeg `if()` expressions for the animated `crop` and `boxblur` parameters.

Helper to build a nested linear-interpolation expression for a single property over N keyframes:
```python
def _kf_expr(times, values, default):
    """Produce nested if(lt(t,t1),lerp01,if(lt(t,t2),lerp12,...,vN)) expression."""
```

The crop filter becomes:
```
crop=w='round(expr_w)':h='round(expr_h)':x='round(expr_x)':y='round(expr_y)'
```

The boxblur radius becomes:
```
boxblur=luma_radius='max(1,round(expr_r))':luma_power=1
```

Note: pixel values are computed by multiplying normalised coordinates by `W` or `H` inside the expression (e.g. `expr_x` already incorporates `* W`). Width/height are rounded down to the nearest even number to keep chroma subsampling valid.

The `enable='between(t,startTime,endTime)'` on the overlay remains unchanged.

---

## Scope / Not In This Spec

- Easing curves (bezier interpolation) — linear only for now.
- Keyframes on non-blur effects (fade, colour grade, etc.) — not in scope.
- Copy/paste keyframes between effects — not in scope.

---

## Verification

1. **Static blur still works** — create a blur with no keyframes, export, confirm no regression.
2. **Add keyframes via "+ Add"** — place playhead at 0 s, add keyframe; move playhead to 2 s, drag blur region, confirm diamond appears at 2 s in timeline.
3. **Interpolation in preview** — scrub between two keyframes, confirm blur region visually moves smoothly.
4. **Delete keyframe** — click ×, confirm diamond disappears and undo restores it.
5. **Navigate ◀ ▶** — confirm playhead jumps to adjacent keyframe times.
6. **Export with keyframes** — export a project with a keyframed blur, open output in a video player, confirm region animates.
7. **Export without keyframes** — confirm existing blur export unchanged.
