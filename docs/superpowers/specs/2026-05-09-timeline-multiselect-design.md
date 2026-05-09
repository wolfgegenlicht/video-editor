# Timeline Multi-select Design

**Date:** 2026-05-09  
**Status:** Approved

## Context

The timeline currently only supports single-item selection. Users need to select and move multiple timeline items together — for example, to shift a clip and its matching effect overlay in sync, or to bulk-move everything on several tracks. Two selection entry points are needed: precise item-by-item selection (Cmd+click) and spatial selection (rubber-band drag), plus a fast whole-track selection via the track label area.

## Scope

All timeline item types participate in multi-select: video/audio clips, effect overlays, text overlays, captions, and clip transitions.

---

## Selection Mechanisms

### 1. Cmd+click on any item
Toggles that item in/out of the current multi-selection. Existing selection is preserved. Works on every item type.

### 2. Rubber-band drag
Mousedown on empty timeline background (no item under cursor) + drag draws a semi-transparent blue selection rectangle. On mouseup, all items whose time range overlaps the rectangle's time range AND whose track row overlaps the rectangle's vertical range are added to `selectedItemIds`. The existing single-select fields are cleared.

### 3. Track label click
Clicking the label strip on the left side of any track row selects all items in that track (replaces current selection). Cmd+click on a track label toggles all items in that track.

### 4. Shift+click track label (range select)
Clicking label of track A, then Shift+clicking label of track B, selects all items in every track row between A and B (inclusive). `lastClickedTrackIndex` in Timeline local state tracks the anchor.

### Deselect
Any plain (no modifier) click on an item or on empty timeline space clears `selectedItemIds` and restores normal single-select behavior.

---

## State

### New store field
```typescript
selectedItemIds: Set<string>   // IDs of all multi-selected items
```

### Existing single-select fields stay untouched
`selectedClipId`, `selectedOverlayId`, `selectedCaptionId`, `selectedEffectOverlayId`, `selectedTransitionId` continue to drive the Properties panel. When a single item is selected normally, both the appropriate single-select field AND `selectedItemIds = new Set([id])` are set. When multi-select is active (size > 1), single-select fields are cleared and the Properties panel shows "N items selected".

---

## Movement

When a drag starts on any item that is in `selectedItemIds` and `selectedItemIds.size > 1`:
- All selected items shift by the same time delta
- Each item stays in its own track (time-only shift, no cross-track movement)
- `*Live()` store actions used during drag for smooth feedback; a single `withHistory`-wrapped action commits on mouseup
- Items clamp to `max(0, startTime + delta)` — if the leftmost item in the selection would go negative, the whole group stops at the boundary

### New store actions needed
- `toggleItemSelection(id: string)` — add/remove from `selectedItemIds`
- `setSelectedItemIds(ids: Set<string>)` — replace selection set
- `clearMultiSelection()` — empty the set
- `moveSelectedItemsLive(delta: number)` — shift all selected items' time positions (no history)
- `moveSelectedItems(delta: number)` — same, wrapped in `withHistory`

`moveSelectedItems` resolves each ID to its item type by scanning `project.tracks[].clips`, `project.effectOverlays`, `project.textOverlays`, `project.captions`, and `project.clipTransitions`.

---

## Visual Feedback

- Selected items (any type) show a uniform blue ring: `ring-2 ring-blue-400`
- Rubber-band rectangle: absolutely-positioned `div` with `bg-blue-500/10 border border-blue-400` 
- Track label highlighted with blue tint when its track is fully selected

---

## Properties Panel

| Selection state | Right panel |
|---|---|
| 0 items | Collapsed (existing behavior) |
| 1 item | Normal Properties panel (existing behavior) |
| 2+ items | Shows "N items selected" message, no properties |

---

## Files to Modify

| File | Changes |
|---|---|
| `frontend/src/store/useProjectStore.ts` | Add `selectedItemIds`, 5 new actions, sync with existing select actions |
| `frontend/src/types/project.ts` | No changes |
| `frontend/src/components/Timeline/Timeline.tsx` | Rubber-band state + rendering, track label click/shift-click handlers, `lastClickedTrackIndex` state |
| `frontend/src/components/Timeline/TimelineTrack.tsx` | Cmd+click on clips → `toggleItemSelection`, drag of multi-selected clip → `moveSelectedItemsLive/moveSelectedItems`, blue ring on selected clips |
| `frontend/src/components/Timeline/EffectOverlayTrack.tsx` | Same Cmd+click and multi-drag pattern for effects |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Cmd+click → `toggleItemSelection`, blue ring |
| `frontend/src/components/Timeline/CaptionTimelineTrack.tsx` | Cmd+click → `toggleItemSelection`, blue ring |
| `frontend/src/components/Timeline/TransitionHandle.tsx` | Cmd+click → `toggleItemSelection`, blue ring |
| `frontend/src/components/RightPanel/RightPanel.tsx` or properties panels | "N items selected" state |

---

## Out of Scope

- Cross-track drag of multi-selected items (items stay in their own tracks)
- Delete of multi-selected items (separate feature)
- Copy/paste of multi-selected items
