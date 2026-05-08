# Effects Track — Design Spec

**Date:** 2026-05-08  
**Status:** Approved

## Context

The editor has no way to add time-based visual effects (e.g. zoom) to a video. The goal is an MVP effects track: users drag a "Zoom" effect from the right panel onto a dedicated timeline track, resize it to set duration, and configure its animation via the properties panel. Effects are time-based overlays — independent of clips, able to cross cut points.

---

## Data Model (`src/types/project.ts`)

```typescript
export type EffectType = "zoom"

export interface ZoomParams {
  scale: number    // 1.0–3.0; default 1.5
  rampIn: number   // seconds to ramp from 1× to scale; default 0.3
  rampOut: number  // seconds to ramp from scale back to 1×; default 0.3
}

export interface EffectOverlay {
  id: string
  type: EffectType
  startTime: number
  endTime: number
  params: ZoomParams
}
```

`Project` gets `effectOverlays: EffectOverlay[]` (default `[]`).

Hold duration is implicit: `(endTime - startTime) - rampIn - rampOut`. Constraint: `rampIn + rampOut` must not exceed effect duration — clamped silently on save.

---

## Store (`src/store/useProjectStore.ts`)

New ephemeral state field:
```typescript
selectedEffectOverlayId: string | null
```

New actions (all mutations use `withHistory`):
| Action | Behaviour |
|---|---|
| `addEffectOverlay(overlay)` | Appends with auto uuid |
| `moveEffectOverlay(id, newStartTime)` | Shifts start+end, preserves duration |
| `resizeEffectOverlay(id, newStartTime, newEndTime)` | Updates both bounds |
| `deleteEffectOverlay(id)` | Removes from array |
| `updateEffectOverlayParams(id, params)` | Merges params patch |
| `selectEffectOverlay(id \| null)` | Clears other selections, sets `rightPanelTab: "properties"` |

---

## Timeline (`src/components/Timeline/`)

New `EffectOverlayTrack.tsx` — rendered as a fixed-height row between the video track and the text overlay track. Each `EffectOverlay` is an absolutely positioned div:

- **Position/width:** `left = startTime * zoom`, `width = (endTime - startTime) * zoom`
- **Color:** violet (`bg-violet-600/30`, border `border-violet-500`)
- **Label:** "🔍 Zoom"
- **Drag to move:** mousedown → mousemove updates `startTime`/`endTime` via `moveEffectOverlay`
- **Drag edges to resize:** left/right 6px handle → `resizeEffectOverlay`
- **Click:** `selectEffectOverlay(id)`
- **Selected state:** white border + ring (same pattern as `TimelineClip`)

Track label area shows "FX" in the left gutter.

Drop target: the track itself accepts drops from the right panel Effects tab (`dragover` + `drop` events, reads `effectType` from `dataTransfer`). On drop, calls `addEffectOverlay` with `startTime` computed from drop X position and `zoom`.

---

## Right Panel (`src/components/RightPanel/`)

### Effects Tab (`EffectsTab.tsx`)

New tab added to `RightPanel.tsx` alongside Properties and Media. Shows a palette of available effects — MVP has only Zoom. Each item is draggable (`draggable`, sets `dataTransfer.setData("effectType", "zoom")`).

### Effect Properties Panel (`EffectPropertiesPanel.tsx`)

Shown when `selectedEffectOverlayId` is set (routing added to `RightPanel.tsx` — not ClipPropertiesPanel, since effect overlays are not clips). Contains:

| Control | Range | Default |
|---|---|---|
| Scale | 1.0–3.0 slider | 1.5 |
| Ramp In | 0–`(duration/2)` slider (seconds) | 0.3 |
| Ramp Out | 0–`(duration/2)` slider (seconds) | 0.3 |

Each slider calls `updateEffectOverlayParams` on change. Ramp In + Ramp Out are independently clamped to `duration / 2` so they can't sum past the total duration.

---

## Playback (`src/components/Preview/VideoPreview.tsx`)

At each render, compute `currentScale` from the active effect:

```typescript
function computeZoomScale(effect: EffectOverlay, t: number): number {
  const duration = effect.endTime - effect.startTime
  const { scale, rampIn, rampOut } = effect.params as ZoomParams
  const progress = t - effect.startTime

  if (progress < rampIn) {
    return 1 + (scale - 1) * easeInOut(progress / rampIn)
  }
  if (progress > duration - rampOut) {
    return 1 + (scale - 1) * easeInOut((effect.endTime - t) / rampOut)
  }
  return scale
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
```

Apply as CSS `transform: scale(currentScale)` on the video's outer wrapper div (not the `<video>` element itself). When no effect is active, transform is omitted. The transform origin is `center center`.

The existing CSS `filter` for brightness/contrast/saturation stays on the `<video>` element; the scale goes on the outer wrapper to avoid compositing conflicts.

---

## Files Changed

| File | Change |
|---|---|
| `src/types/project.ts` | Add `EffectType`, `ZoomParams`, `EffectOverlay`; add field to `Project` |
| `src/store/useProjectStore.ts` | Add `selectedEffectOverlayId` + 6 new actions |
| `src/components/Timeline/Timeline.tsx` | Render `<EffectOverlayTrack>` |
| `src/components/Timeline/EffectOverlayTrack.tsx` | **New** — drag/resize/select logic |
| `src/components/Preview/VideoPreview.tsx` | Compute + apply zoom transform |
| `src/components/RightPanel/RightPanel.tsx` | Add Effects tab |
| `src/components/RightPanel/EffectsTab.tsx` | **New** — draggable effect palette |
| `src/components/RightPanel/EffectPropertiesPanel.tsx` | **New** — scale/rampIn/rampOut sliders |
| `src/components/RightPanel/RightPanel.tsx` | Route `selectedEffectOverlayId` → `EffectPropertiesPanel` in Properties tab |

---

## Verification

1. Drag "Zoom" from right panel Effects tab → drop on FX track → effect block appears
2. Resize effect block by dragging edges
3. Click effect block → Properties panel shows scale + ramp sliders
4. Play video through the effect range → video zooms in, holds, zooms out
5. Effect spanning a clip cut plays through without interruption
6. Undo/redo works for add, move, resize, delete, param changes
7. Zoom correctly returns to 1× outside the effect range
