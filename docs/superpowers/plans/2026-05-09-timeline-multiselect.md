# Timeline Multi-select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select to the timeline so users can Cmd+click items, rubber-band drag across the timeline, or click track labels to select multiple items and move them together.

**Architecture:** Parallel selection layer — new `selectedItemIds: Set<string>` field added to the Zustand store alongside (not replacing) the existing single-select fields (`selectedClipId` etc.). Existing fields continue to drive the Properties panel. Four mechanisms feed `selectedItemIds`: Cmd+click items, rubber-band drag on empty timeline, track label click, and Shift+click track label range select.

**Tech Stack:** React, TypeScript, Zustand (existing store pattern), Tailwind CSS. No new dependencies. Dev server: `pnpm dev` in `frontend/`. No automated test suite — verify manually in browser.

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/store/useProjectStore.ts` | Add `selectedItemIds`, 5 new actions, sync existing select actions |
| `frontend/src/components/Timeline/Timeline.tsx` | Rubber-band state + render, track label click, shift-click range select |
| `frontend/src/components/Timeline/TimelineClip.tsx` | Cmd+click toggle, multi-select drag |
| `frontend/src/components/Timeline/EffectOverlayTrack.tsx` | Cmd+click toggle, multi-select drag in EffectBlock |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Cmd+click toggle, blue ring |
| `frontend/src/components/Timeline/CaptionTimelineTrack.tsx` | Cmd+click toggle, blue ring |
| `frontend/src/components/Timeline/TransitionHandle.tsx` | Cmd+click toggle, blue ring |
| `frontend/src/components/RightPanel/RightPanel.tsx` | "N items selected" panel state |

---

## Task 1: Store — `selectedItemIds` state + basic actions + sync

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Add `selectedItemIds` to the `ProjectStore` interface**

  In `useProjectStore.ts`, find the `interface ProjectStore {` block (starts around line 53). Add these lines after `eyeContactStatus`:

  ```typescript
  selectedItemIds: Set<string>;
  toggleItemSelection: (id: string) => void;
  setSelectedItemIds: (ids: Set<string>) => void;
  selectMultiple: (ids: Set<string>) => void;
  ```

- [ ] **Step 2: Add initial state value**

  In the `create<ProjectStore>((set, get) => ({` block, find `eyeContactStatus: {},` (around line 191) and add after it:

  ```typescript
  selectedItemIds: new Set<string>(),
  ```

- [ ] **Step 3: Add the three new actions**

  Find `deselectAll: () => set(...)` (around line 619) and add after it:

  ```typescript
  toggleItemSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedItemIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedItemIds: next };
    }),
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  selectMultiple: (ids) =>
    set({
      selectedItemIds: ids,
      selectedClipId: null,
      selectedCaptionId: null,
      selectedOverlayId: null,
      selectedEffectOverlayId: null,
      selectedTransitionId: null,
      rightPanelTab: ids.size > 0 ? ("properties" as const) : null,
    }),
  ```

- [ ] **Step 4: Sync `selectClip` with `selectedItemIds`**

  Find the existing `selectClip` line (around line 617):
  ```typescript
  selectClip: (selectedClipId) => set(selectedClipId ? { selectedClipId, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, rightPanelTab: "properties" as const } : { selectedClipId }),
  ```
  Replace with:
  ```typescript
  selectClip: (id) =>
    set(
      id
        ? { selectedClipId: id, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedClipId: null, selectedItemIds: new Set() }
    ),
  ```

- [ ] **Step 5: Sync `selectOverlay`, `selectCaption`, `selectEffectOverlay`, `selectTransition`, `deselectAll`**

  Find `selectOverlay` (line ~515):
  ```typescript
  selectOverlay: (selectedOverlayId) => set(selectedOverlayId ? { selectedOverlayId, selectedClipId: null, selectedCaptionId: null, selectedEffectOverlayId: null, rightPanelTab: "properties" as const } : { selectedOverlayId }),
  ```
  Replace with:
  ```typescript
  selectOverlay: (id) =>
    set(
      id
        ? { selectedOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedOverlayId: null, selectedItemIds: new Set() }
    ),
  ```

  Find `selectCaption` (line ~618):
  ```typescript
  selectCaption: (selectedCaptionId) => set(selectedCaptionId ? { selectedCaptionId, selectedClipId: null, selectedOverlayId: null, selectedEffectOverlayId: null, rightPanelTab: "properties" as const } : { selectedCaptionId }),
  ```
  Replace with:
  ```typescript
  selectCaption: (id) =>
    set(
      id
        ? { selectedCaptionId: id, selectedClipId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedCaptionId: null, selectedItemIds: new Set() }
    ),
  ```

  Find `selectEffectOverlay` (lines ~580-585):
  ```typescript
  selectEffectOverlay: (id) =>
    set(
      id
        ? { selectedEffectOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedTransitionId: null, rightPanelTab: "properties" as const }
        : { selectedEffectOverlayId: null }
    ),
  ```
  Replace the false branch:
  ```typescript
  selectEffectOverlay: (id) =>
    set(
      id
        ? { selectedEffectOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedEffectOverlayId: null, selectedItemIds: new Set() }
    ),
  ```

  Find `selectTransition` (lines ~602-607):
  ```typescript
  selectTransition: (id) =>
    set(
      id
        ? { selectedTransitionId: id, selectedEffectOverlayId: null, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, rightPanelTab: "properties" as const }
        : { selectedTransitionId: null }
    ),
  ```
  Replace:
  ```typescript
  selectTransition: (id) =>
    set(
      id
        ? { selectedTransitionId: id, selectedEffectOverlayId: null, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedTransitionId: null, selectedItemIds: new Set() }
    ),
  ```

  Find `deselectAll` (line ~619):
  ```typescript
  deselectAll: () => set({ selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null }),
  ```
  Replace:
  ```typescript
  deselectAll: () => set({ selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set() }),
  ```

- [ ] **Step 6: Verify in browser**

  Start `pnpm dev` in `frontend/`. Open the app. Click a clip — it should select as normal. Click another clip while holding Cmd — nothing happens yet (that's Task 4), but no errors. Check browser console for TypeScript errors.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/store/useProjectStore.ts
  git commit -m "feat: add selectedItemIds to store with toggle/selectMultiple actions"
  ```

---

## Task 2: Store — `getItemStartTime` helper + movement actions

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Export `getItemStartTime` helper**

  Find the `findClip` function (around line 145). Add this function directly after it:

  ```typescript
  export function getItemStartTime(project: Project, id: string): number {
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip.startTime;
    }
    const effect = project.effectOverlays.find((e) => e.id === id);
    if (effect) return effect.startTime;
    const overlay = project.textOverlays.find((o) => o.id === id);
    if (overlay) return overlay.startTime;
    const caption = project.captions.find((c) => c.id === id);
    if (caption) return caption.startTime;
    const transition = (project.clipTransitions ?? []).find((t) => t.id === id);
    if (transition) return transition.atTime;
    return 0;
  }
  ```

- [ ] **Step 2: Add `moveSelectedItemsLive` and `moveSelectedItems` to the interface**

  In `interface ProjectStore {`, find the `selectMultiple` line you added in Task 1 and add below it:

  ```typescript
  moveSelectedItemsLive: (moves: Array<{ id: string; newStartTime: number }>) => void;
  moveSelectedItems: (moves: Array<{ id: string; newStartTime: number }>) => void;
  ```

- [ ] **Step 3: Implement `moveSelectedItemsLive`**

  In the store implementation, find the `selectMultiple` action you added in Task 1 and add after it:

  ```typescript
  moveSelectedItemsLive: (moves) =>
    set((s) => {
      const map = new Map(moves.map((m) => [m.id, m.newStartTime]));
      const p = s.project;
      return {
        project: {
          ...p,
          tracks: p.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) =>
              map.has(clip.id) ? { ...clip, startTime: map.get(clip.id)! } : clip
            ),
          })),
          effectOverlays: p.effectOverlays.map((e) => {
            if (!map.has(e.id)) return e;
            const dur = e.endTime - e.startTime;
            const ns = map.get(e.id)!;
            return { ...e, startTime: ns, endTime: ns + dur };
          }),
          textOverlays: p.textOverlays.map((o) => {
            if (!map.has(o.id)) return o;
            const dur = o.endTime - o.startTime;
            const ns = map.get(o.id)!;
            return { ...o, startTime: ns, endTime: ns + dur };
          }),
          captions: p.captions.map((c) => {
            if (!map.has(c.id)) return c;
            const dur = c.endTime - c.startTime;
            const ns = map.get(c.id)!;
            return { ...c, startTime: ns, endTime: ns + dur };
          }),
          clipTransitions: (p.clipTransitions ?? []).map((t) =>
            map.has(t.id) ? { ...t, atTime: map.get(t.id)! } : t
          ),
        },
      };
    }),
  ```

- [ ] **Step 4: Implement `moveSelectedItems`**

  Directly after `moveSelectedItemsLive`:

  ```typescript
  moveSelectedItems: (moves) =>
    withHistory(set, get, (p) => {
      const map = new Map(moves.map((m) => [m.id, m.newStartTime]));
      return {
        ...p,
        tracks: p.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            map.has(clip.id) ? { ...clip, startTime: map.get(clip.id)! } : clip
          ),
        })),
        effectOverlays: p.effectOverlays.map((e) => {
          if (!map.has(e.id)) return e;
          const dur = e.endTime - e.startTime;
          const ns = map.get(e.id)!;
          return { ...e, startTime: ns, endTime: ns + dur };
        }),
        textOverlays: p.textOverlays.map((o) => {
          if (!map.has(o.id)) return o;
          const dur = o.endTime - o.startTime;
          const ns = map.get(o.id)!;
          return { ...o, startTime: ns, endTime: ns + dur };
        }),
        captions: p.captions.map((c) => {
          if (!map.has(c.id)) return c;
          const dur = c.endTime - c.startTime;
          const ns = map.get(c.id)!;
          return { ...c, startTime: ns, endTime: ns + dur };
        }),
        clipTransitions: (p.clipTransitions ?? []).map((t) =>
          map.has(t.id) ? { ...t, atTime: map.get(t.id)! } : t
        ),
      };
    }),
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  Run `pnpm build` in `frontend/`. Expect no errors related to the store.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/store/useProjectStore.ts
  git commit -m "feat: add moveSelectedItems actions and getItemStartTime helper"
  ```

---

## Task 3: Visual blue ring for multi-selected items

When `selectedItemIds.size > 1`, all items in the set get a blue ring. Single-selected items keep their existing colors.

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineClip.tsx`
- Modify: `frontend/src/components/Timeline/EffectOverlayTrack.tsx`
- Modify: `frontend/src/components/Timeline/TextOverlayTrack.tsx`
- Modify: `frontend/src/components/Timeline/CaptionTimelineTrack.tsx`
- Modify: `frontend/src/components/Timeline/TransitionHandle.tsx`

- [ ] **Step 1: `TimelineClip.tsx` — add blue ring for multi-selected clips**

  At line 18, change the destructuring from:
  ```typescript
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, files, playheadTime, selectedClipId } = useProjectStore();
  ```
  To:
  ```typescript
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, files, playheadTime, selectedClipId, selectedItemIds } = useProjectStore();
  ```

  At line 20 (after `const isSelected = selectedClipId === clip.id;`), add:
  ```typescript
  const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(clip.id);
  ```

  Find the main `<div className={...}` block (lines 111-124) that renders the clip. It currently ends with:
  ```
  : "bg-teal-500 border border-teal-600"
          }`}
  ```
  Add a multi-select ring by appending to the template literal:
  ```typescript
  ${isMultiSelected ? " ring-2 ring-blue-400" : ""}
  ```
  The full className should become (showing just the closing part):
  ```typescript
  : "bg-teal-500 border border-teal-600"
          }
          ${isMultiSelected ? "ring-2 ring-blue-400" : ""}`}
  ```

- [ ] **Step 2: `EffectOverlayTrack.tsx` — blue ring for multi-selected effects**

  In `EffectBlock`, find the `useProjectStore` import at line 164:
  ```typescript
  const { moveEffectOverlayLive, moveEffectOverlay } = useProjectStore();
  ```
  Change to:
  ```typescript
  const { moveEffectOverlayLive, moveEffectOverlay, selectedItemIds } = useProjectStore();
  ```

  After `const theme = getTheme(effect.type);` (line ~167), add:
  ```typescript
  const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(effect.id);
  ```

  Find the `<div className={...}` of the block (line ~225):
  ```typescript
  className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing ${selected ? theme.selected : theme.base}`}
  ```
  Change to:
  ```typescript
  className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing ${selected ? theme.selected : theme.base} ${isMultiSelected ? "ring-2 ring-blue-400" : ""}`}
  ```

- [ ] **Step 3: `TextOverlayTrack.tsx` — blue ring for multi-selected overlays**

  Change the `useProjectStore` destructuring at line 6:
  ```typescript
  const { project, selectOverlay, selectedOverlayId } = useProjectStore();
  ```
  To:
  ```typescript
  const { project, selectOverlay, selectedOverlayId, selectedItemIds } = useProjectStore();
  ```

  In the map, after the existing `isSelected` check in the className (line ~22), update the className:
  ```typescript
  className={`absolute top-1 bottom-1 rounded bg-amber-400 border flex items-center overflow-hidden select-none cursor-pointer hover:bg-amber-500 group
    ${selectedOverlayId === o.id ? "border-white ring-2 ring-amber-300 bg-amber-500" : "border-amber-500"}
    ${selectedItemIds.size > 1 && selectedItemIds.has(o.id) ? "ring-2 ring-blue-400" : ""}`}
  ```

- [ ] **Step 4: `CaptionTimelineTrack.tsx` — blue ring for multi-selected captions**

  Change line 11:
  ```typescript
  const { project, selectedCaptionId, selectCaption } = useProjectStore();
  ```
  To:
  ```typescript
  const { project, selectedCaptionId, selectCaption, selectedItemIds } = useProjectStore();
  ```

  Update the caption div className to append:
  ```typescript
  ${selectedItemIds.size > 1 && selectedItemIds.has(cap.id) ? "ring-2 ring-blue-400" : ""}
  ```

- [ ] **Step 5: `TransitionHandle.tsx` — blue ring for multi-selected transitions**

  Change line 11:
  ```typescript
  const { selectedTransitionId, selectTransition, removeClipTransition, updateClipTransition } = useProjectStore();
  ```
  To:
  ```typescript
  const { selectedTransitionId, selectTransition, removeClipTransition, updateClipTransition, selectedItemIds } = useProjectStore();
  ```

  In the outer `<div`, add to className:
  ```typescript
  ${selectedItemIds.size > 1 && selectedItemIds.has(transition.id) ? "ring-2 ring-blue-400" : ""}
  ```

- [ ] **Step 6: Verify visually**

  In `pnpm dev`: open browser, temporarily add a hardcoded `selectedItemIds` initialization in the store (e.g., two clip IDs) to see blue rings render. Remove after confirming.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/Timeline/TimelineClip.tsx \
           frontend/src/components/Timeline/EffectOverlayTrack.tsx \
           frontend/src/components/Timeline/TextOverlayTrack.tsx \
           frontend/src/components/Timeline/CaptionTimelineTrack.tsx \
           frontend/src/components/Timeline/TransitionHandle.tsx
  git commit -m "feat: blue ring on multi-selected timeline items"
  ```

---

## Task 4: Cmd+click to toggle item selection

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineClip.tsx`
- Modify: `frontend/src/components/Timeline/EffectOverlayTrack.tsx`
- Modify: `frontend/src/components/Timeline/TextOverlayTrack.tsx`
- Modify: `frontend/src/components/Timeline/CaptionTimelineTrack.tsx`
- Modify: `frontend/src/components/Timeline/TransitionHandle.tsx`

- [ ] **Step 1: `TimelineClip.tsx` — Cmd+click toggles**

  Add `toggleItemSelection` to the destructuring at line 18:
  ```typescript
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, toggleItemSelection, files, playheadTime, selectedClipId, selectedItemIds } = useProjectStore();
  ```

  In `startDrag`, at the very top of the function body (before `e.stopPropagation()`):
  ```typescript
  function startDrag(e: React.MouseEvent, type: "move" | "trim-left" | "trim-right") {
    if (type === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(clip.id);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    // ... rest of existing code unchanged
  ```

- [ ] **Step 2: `EffectOverlayTrack.tsx` — Cmd+click toggles effects**

  Add `toggleItemSelection` to `EffectBlock`'s `useProjectStore` destructuring:
  ```typescript
  const { moveEffectOverlayLive, moveEffectOverlay, selectedItemIds, toggleItemSelection } = useProjectStore();
  ```

  In `EffectBlock.startDrag`, add at the top of the function body:
  ```typescript
  function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
    if (mode === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(effect.id);
      return;
    }
    e.stopPropagation();
    onSelect();
    // ... rest of existing code unchanged
  ```

- [ ] **Step 3: `TextOverlayTrack.tsx` — Cmd+click toggles overlays**

  Add `toggleItemSelection` to destructuring:
  ```typescript
  const { project, selectOverlay, selectedOverlayId, selectedItemIds, toggleItemSelection } = useProjectStore();
  ```

  Find the item `onMouseDown` handler (line ~24):
  ```typescript
  onMouseDown={(e) => { e.stopPropagation(); selectOverlay(o.id); }}
  ```
  Replace with:
  ```typescript
  onMouseDown={(e) => {
    e.stopPropagation();
    if (e.metaKey) { toggleItemSelection(o.id); return; }
    selectOverlay(o.id);
  }}
  ```

- [ ] **Step 4: `CaptionTimelineTrack.tsx` — Cmd+click toggles captions**

  Add `toggleItemSelection` to destructuring:
  ```typescript
  const { project, selectedCaptionId, selectCaption, selectedItemIds, toggleItemSelection } = useProjectStore();
  ```

  Find the caption item `onClick` handler (line ~29):
  ```typescript
  onClick={() => {
    selectCaption(cap.id);
    seek(cap.startTime);
  }}
  ```
  Replace with:
  ```typescript
  onMouseDown={(e) => {
    if (e.metaKey) { e.stopPropagation(); toggleItemSelection(cap.id); }
  }}
  onClick={(e) => {
    if (e.metaKey) return;
    selectCaption(cap.id);
    seek(cap.startTime);
  }}
  ```

- [ ] **Step 5: `TransitionHandle.tsx` — Cmd+click toggles transitions**

  Add `toggleItemSelection` to destructuring:
  ```typescript
  const { selectedTransitionId, selectTransition, removeClipTransition, updateClipTransition, selectedItemIds, toggleItemSelection } = useProjectStore();
  ```

  Find the outer div's `onMouseDown` (line ~54):
  ```typescript
  onMouseDown={(e) => { e.stopPropagation(); selectTransition(transition.id); }}
  ```
  Replace with:
  ```typescript
  onMouseDown={(e) => {
    e.stopPropagation();
    if (e.metaKey) { toggleItemSelection(transition.id); return; }
    selectTransition(transition.id);
  }}
  ```

- [ ] **Step 6: Verify in browser**

  Cmd+click two different clips — both should show blue rings. Cmd+click one again — its ring should disappear. Cmd+click an effect, then a clip — both selected across item types.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/Timeline/TimelineClip.tsx \
           frontend/src/components/Timeline/EffectOverlayTrack.tsx \
           frontend/src/components/Timeline/TextOverlayTrack.tsx \
           frontend/src/components/Timeline/CaptionTimelineTrack.tsx \
           frontend/src/components/Timeline/TransitionHandle.tsx
  git commit -m "feat: Cmd+click toggles timeline items in/out of multi-selection"
  ```

---

## Task 5: Multi-select drag — move all selected items together

When dragging an item that is part of a multi-selection (size > 1), all selected items shift by the same time delta. Trim handles ignore multi-select (only the one clip gets trimmed).

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineClip.tsx`
- Modify: `frontend/src/components/Timeline/EffectOverlayTrack.tsx`

- [ ] **Step 1: Add imports to `TimelineClip.tsx`**

  Add `moveSelectedItemsLive`, `moveSelectedItems` to the store destructuring (line 18):
  ```typescript
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, toggleItemSelection, moveSelectedItemsLive, moveSelectedItems, files, playheadTime, selectedClipId, selectedItemIds } = useProjectStore();
  ```

  Add this import at the top of the file:
  ```typescript
  import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";
  ```
  (Replace the existing `import { useProjectStore }` line.)

- [ ] **Step 2: Modify `startDrag` in `TimelineClip.tsx` to handle multi-select move**

  The `startDrag` function currently starts with the Cmd+click guard (from Task 4), then `e.stopPropagation()`, `selectClip(clip.id)`, and sets up `dragStartX.current` etc. Modify the "move" drag to detect multi-select and delegate:

  ```typescript
  function startDrag(e: React.MouseEvent, type: "move" | "trim-left" | "trim-right") {
    if (type === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(clip.id);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);

    dragStartX.current = e.clientX;
    dragStartTime.current = clip.startTime;
    dragStartDuration.current = clip.duration;
    dragStartSourceStart.current = clip.sourceStart;
    dragStartSourceEnd.current = clip.sourceEnd;

    // Snapshot multi-select state at drag start
    const { selectedItemIds: ids, project } = useProjectStore.getState();
    const isMultiDrag = type === "move" && ids.has(clip.id) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(project, id)]))
      : new Map<string, number>();
    let lastMoves: Array<{ id: string; newStartTime: number }> = [];

    function onMove(ev: MouseEvent) {
      const dt = (ev.clientX - dragStartX.current) / zoom;

      if (isMultiDrag) {
        lastMoves = [...ids].map((id) => ({
          id,
          newStartTime: Math.max(0, (origPositions.get(id) ?? 0) + dt),
        }));
        moveSelectedItemsLive(lastMoves);
        return;
      }

      if (type === "move") {
        moveClip(clip.id, trackId, Math.max(0, dragStartTime.current + dt));
      } else if (type === "trim-left") {
        const minStart = Math.max(0, dragStartTime.current - dragStartSourceStart.current);
        const newStart = Math.max(minStart, Math.min(
          dragStartTime.current + dragStartDuration.current - 0.1,
          dragStartTime.current + dt
        ));
        const trimmed = newStart - dragStartTime.current;
        trimClip(clip.id, newStart, dragStartDuration.current - trimmed, dragStartSourceStart.current + trimmed, dragStartSourceEnd.current);
      } else {
        const maxDuration = file ? file.duration - dragStartSourceStart.current : dragStartDuration.current + 60;
        const newDuration = Math.max(0.1, Math.min(maxDuration, dragStartDuration.current + dt));
        trimClip(clip.id, dragStartTime.current, newDuration, dragStartSourceStart.current, dragStartSourceStart.current + newDuration);
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (isMultiDrag && lastMoves.length > 0) {
        moveSelectedItems(lastMoves);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  ```

- [ ] **Step 3: Add imports and modify `EffectBlock` for multi-select drag**

  At the top of `EffectOverlayTrack.tsx`, add `getItemStartTime` to the store import:
  ```typescript
  import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";
  ```

  In `EffectBlock`'s `useProjectStore` destructuring, add the new actions:
  ```typescript
  const { moveEffectOverlayLive, moveEffectOverlay, selectedItemIds, toggleItemSelection, moveSelectedItemsLive, moveSelectedItems } = useProjectStore();
  ```

  Modify `EffectBlock.startDrag` to handle multi-select move (keep existing alt-duplicate and resize logic untouched):

  ```typescript
  function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
    if (mode === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(effect.id);
      return;
    }
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const origStart = effect.startTime;
    const origEnd = effect.endTime;
    let lastStart = origStart;
    let lastEnd = origEnd;

    // Snapshot multi-select state at drag start
    const { selectedItemIds: ids, project } = useProjectStore.getState();
    const isMultiDrag = mode === "move" && ids.has(effect.id) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(project, id)]))
      : new Map<string, number>();
    let lastMoves: Array<{ id: string; newStartTime: number }> = [];

    const isAltDuplicate = !isMultiDrag && e.altKey && mode === "move";
    let cloneId: string | null = null;
    if (isAltDuplicate) {
      const clone: EffectOverlay = { ...effect, id: crypto.randomUUID() };
      cloneId = clone.id;
      onDuplicate(clone);
    }

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (isMultiDrag) {
        lastMoves = [...ids].map((id) => ({
          id,
          newStartTime: Math.max(0, (origPositions.get(id) ?? 0) + dt),
        }));
        moveSelectedItemsLive(lastMoves);
        return;
      }
      if (mode === "move") {
        lastStart = Math.max(0, origStart + dt);
        lastEnd = lastStart + (origEnd - origStart);
        if (cloneId) {
          moveEffectOverlayLive(cloneId, lastStart);
        } else {
          onMove(lastStart);
        }
      } else if (mode === "left") {
        lastStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.1));
        lastEnd = origEnd;
        onResize(lastStart, lastEnd);
      } else {
        lastStart = origStart;
        lastEnd = Math.max(origStart + 0.1, origEnd + dt);
        onResize(lastStart, lastEnd);
      }
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (isMultiDrag && lastMoves.length > 0) {
        moveSelectedItems(lastMoves);
        return;
      }
      if (cloneId) {
        moveEffectOverlay(cloneId, lastStart);
      } else if (mode === "move") {
        onMoveCommit(lastStart);
      } else {
        onResizeCommit(lastStart, lastEnd);
      }
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
  ```

- [ ] **Step 4: Verify in browser**

  Cmd+click two clips. Drag one — both should move together, maintaining their time gap. Release — undo (Ctrl+Z) should snap both back. Verify trim handles still trim only that one clip even when multi-selected.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/Timeline/TimelineClip.tsx \
           frontend/src/components/Timeline/EffectOverlayTrack.tsx
  git commit -m "feat: multi-selected items move together when dragged"
  ```

---

## Task 6: Track label click + Shift+click range select

Clicking the label strip of a track selects all items in that track. Shift+click on another label selects all items in all tracks in between.

**Files:**
- Modify: `frontend/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Add `selectMultiple` and `lastClickedTrackIndex` state**

  In `Timeline.tsx`, update the store destructuring at line 49:
  ```typescript
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden, setTrackLabel, setEffectLaneHidden, selectMultiple } = useProjectStore();
  ```

  Add a new piece of local state after the existing `useState` calls (e.g. after line 55):
  ```typescript
  const [lastClickedTrackIndex, setLastClickedTrackIndex] = useState<number | null>(null);
  ```

- [ ] **Step 2: Add `trackRowKeys` and `getItemsInRow` helpers**

  Add these two helpers inside the `Timeline` component, after the `activeLanes` calculation (around line 147):

  ```typescript
  const trackRowKeys = [
    ...project.tracks.map((t) => t.id),
    ...(project.textOverlays.length > 0 ? ["text"] : []),
    ...(project.captions.length > 0 ? ["captions"] : []),
    ...activeLanes.map((type) => `fx-${type}`),
  ];

  function getItemsInRow(key: string): string[] {
    const track = project.tracks.find((t) => t.id === key);
    if (track) return track.clips.map((c) => c.id);
    if (key === "text") return project.textOverlays.map((o) => o.id);
    if (key === "captions") return project.captions.map((c) => c.id);
    if (key.startsWith("fx-")) {
      const type = key.slice(3) as EffectType;
      return project.effectOverlays.filter((e) => e.type === type).map((e) => e.id);
    }
    return [];
  }
  ```

- [ ] **Step 3: Add `onTrackLabelClick` handler**

  Directly after `getItemsInRow`:

  ```typescript
  function onTrackLabelClick(e: React.MouseEvent, rowIndex: number) {
    e.stopPropagation();
    if (e.shiftKey && lastClickedTrackIndex !== null) {
      const from = Math.min(lastClickedTrackIndex, rowIndex);
      const to = Math.max(lastClickedTrackIndex, rowIndex);
      const ids: string[] = [];
      for (let i = from; i <= to; i++) ids.push(...getItemsInRow(trackRowKeys[i]));
      selectMultiple(new Set(ids));
    } else if (e.metaKey) {
      const current = new Set(useProjectStore.getState().selectedItemIds);
      const rowIds = getItemsInRow(trackRowKeys[rowIndex]);
      const allIn = rowIds.every((id) => current.has(id));
      if (allIn) rowIds.forEach((id) => current.delete(id));
      else rowIds.forEach((id) => current.add(id));
      selectMultiple(current);
      setLastClickedTrackIndex(rowIndex);
    } else {
      selectMultiple(new Set(getItemsInRow(trackRowKeys[rowIndex])));
      setLastClickedTrackIndex(rowIndex);
    }
  }
  ```

- [ ] **Step 4: Wire up click handlers on track label divs**

  In the label column rendering (starting around line 203), each track label `<div>` currently looks like:
  ```tsx
  <div
    key={track.id}
    className="relative flex items-center gap-1.5 px-2 border-b border-slate-100"
    style={{ height: trackH(track.id) }}
    onContextMenu={(e) => openContextMenu(track.id, e)}
  >
  ```
  Add an `onClick` handler and cursor. Use `project.tracks.indexOf(track)` for the row index:
  ```tsx
  <div
    key={track.id}
    className="relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-pointer hover:bg-slate-100 select-none"
    style={{ height: trackH(track.id) }}
    onContextMenu={(e) => openContextMenu(track.id, e)}
    onClick={(e) => onTrackLabelClick(e, trackRowKeys.indexOf(track.id))}
  >
  ```

  For the `text` label div (around line 250), add:
  ```tsx
  onClick={(e) => onTrackLabelClick(e, trackRowKeys.indexOf("text"))}
  ```
  Plus `cursor-pointer hover:bg-slate-100 select-none` to its className.

  For the `captions` label div (around line 260), add:
  ```tsx
  onClick={(e) => onTrackLabelClick(e, trackRowKeys.indexOf("captions"))}
  ```

  For each effect lane label div (around line 272), add:
  ```tsx
  onClick={(e) => onTrackLabelClick(e, trackRowKeys.indexOf(`fx-${effectType}`))}
  ```

- [ ] **Step 5: Verify in browser**

  Click a track label → all clips/items in that track should get blue rings. Shift+click another track label → all items in both tracks (and any between) should be selected. Cmd+click a label → toggles that whole track.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/components/Timeline/Timeline.tsx
  git commit -m "feat: track label click selects track, shift+click range-selects tracks"
  ```

---

## Task 7: Rubber-band drag select

Drag on empty timeline background draws a blue selection rectangle. On release, items overlapping the rectangle are added to `selectedItemIds`.

**Files:**
- Modify: `frontend/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Add rubber-band state and scroll ref**

  In `Timeline.tsx`, add after existing state declarations:
  ```typescript
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  ```

  The `rubberBand` coordinates are in content-div space (accounting for scroll), so they can be used directly for both rendering and hit detection.

- [ ] **Step 2: Compute track row Y ranges**

  Add this helper inside the `Timeline` component, after `getItemsInRow`:

  ```typescript
  const RULER_H = 24;
  function getTrackRowYRanges(): Array<{ key: string; top: number; bottom: number }> {
    let y = RULER_H;
    const ranges: Array<{ key: string; top: number; bottom: number }> = [];
    for (const track of project.tracks) {
      const h = trackH(track.id);
      ranges.push({ key: track.id, top: y, bottom: y + h });
      y += h;
    }
    if (project.textOverlays.length > 0) {
      const h = trackH("text");
      ranges.push({ key: "text", top: y, bottom: y + h });
      y += h;
    }
    if (project.captions.length > 0) {
      const h = trackH("captions");
      ranges.push({ key: "captions", top: y, bottom: y + h });
      y += h;
    }
    for (const type of activeLanes) {
      const h = trackH(`fx-${type}`);
      ranges.push({ key: `fx-${type}`, top: y, bottom: y + h });
      y += h;
    }
    return ranges;
  }
  ```

- [ ] **Step 3: Add mousedown handler for rubber-band**

  Add this function inside `Timeline`:

  ```typescript
  function onContentMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const scrollLeft = scrollEl.scrollLeft;
    const x1 = e.clientX - rect.left + scrollLeft;
    const y1 = e.clientY - rect.top;

    let moved = false;
    let x2 = x1;
    let y2 = y1;

    function onMouseMove(ev: MouseEvent) {
      x2 = ev.clientX - rect.left + scrollLeft;
      y2 = ev.clientY - rect.top;
      if (!moved && (Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3)) moved = true;
      if (moved) setRubberBand({ x1, y1, x2, y2 });
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setRubberBand(null);
      if (!moved) return;

      const selTimeStart = Math.min(x1, x2) / zoom;
      const selTimeEnd = Math.max(x1, x2) / zoom;
      const selYTop = Math.min(y1, y2);
      const selYBot = Math.max(y1, y2);
      const rowRanges = getTrackRowYRanges();
      const ids: string[] = [];

      for (const row of rowRanges) {
        if (row.bottom <= selYTop || row.top >= selYBot) continue;
        const rowItems = getItemsInRow(row.key);
        const track = project.tracks.find((t) => t.id === row.key);
        if (track) {
          for (const clip of track.clips) {
            if (clip.startTime < selTimeEnd && clip.startTime + clip.duration > selTimeStart) ids.push(clip.id);
          }
        } else if (row.key === "text") {
          for (const o of project.textOverlays) {
            if (o.startTime < selTimeEnd && o.endTime > selTimeStart) ids.push(o.id);
          }
        } else if (row.key === "captions") {
          for (const c of project.captions) {
            if (c.startTime < selTimeEnd && c.endTime > selTimeStart) ids.push(c.id);
          }
        } else if (row.key.startsWith("fx-")) {
          const type = row.key.slice(3) as EffectType;
          for (const e of project.effectOverlays) {
            if (e.type === type && e.startTime < selTimeEnd && e.endTime > selTimeStart) ids.push(e.id);
          }
        }
        void rowItems;
      }

      if (ids.length > 0) selectMultiple(new Set(ids));
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
  ```

- [ ] **Step 4: Wire up the scroll ref and mousedown to the scrollable div**

  Find the scrollable container div (around line 299):
  ```tsx
  <div
    className="flex-1 overflow-x-auto overflow-y-hidden relative"
    onWheel={handleWheelZoom}
  >
  ```
  Add the `ref`:
  ```tsx
  <div
    ref={scrollAreaRef}
    className="flex-1 overflow-x-auto overflow-y-hidden relative"
    onWheel={handleWheelZoom}
  >
  ```

  Find the inner content div (line ~303):
  ```tsx
  <div style={{ width: totalWidth, position: "relative" }}>
  ```
  Add the mousedown handler:
  ```tsx
  <div style={{ width: totalWidth, position: "relative" }} onMouseDown={onContentMouseDown}>
  ```

- [ ] **Step 5: Render the rubber-band rectangle**

  Inside the content div, before the closing `</div>` (after the playhead div, around line 328), add:

  ```tsx
  {rubberBand && (() => {
    const scrollLeft = scrollAreaRef.current?.scrollLeft ?? 0;
    const left = Math.min(rubberBand.x1, rubberBand.x2);
    const top = Math.min(rubberBand.y1, rubberBand.y2);
    const width = Math.abs(rubberBand.x2 - rubberBand.x1);
    const height = Math.abs(rubberBand.y2 - rubberBand.y1);
    return (
      <div
        className="absolute pointer-events-none z-20 border border-blue-400 bg-blue-400/10"
        style={{ left, top, width, height }}
      />
    );
  })()}
  ```

  Note: the `left` coordinate here is in content space (not adjusted for scroll) because the rubber-band div is inside the content div which is already scrolled. No adjustment needed.

- [ ] **Step 6: Verify in browser**

  Drag across two clips on the timeline — a blue rectangle should appear, and on release both clips should be selected (blue rings). Drag over an area with no items — nothing should be selected.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/Timeline/Timeline.tsx
  git commit -m "feat: rubber-band drag select on timeline"
  ```

---

## Task 8: Properties panel — "N items selected" message

**Files:**
- Modify: `frontend/src/components/RightPanel/RightPanel.tsx`

- [ ] **Step 1: Add `selectedItemIds` to the store destructuring**

  In `RightPanel.tsx`, find line 53:
  ```typescript
  const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId, selectedTransitionId } = useProjectStore();
  ```
  Change to:
  ```typescript
  const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId, selectedTransitionId, selectedItemIds } = useProjectStore();
  ```

- [ ] **Step 2: Add multi-select guard in the properties render**

  Find the properties content block (lines 75-83):
  ```tsx
  {rightPanelTab === "properties" ? (
    selectedEffectOverlayId ? <EffectPropertiesPanel />
    : selectedTransitionId ? <TransitionPropertiesPanel />
    : <ClipPropertiesPanel />
  ) : ...}
  ```
  Replace with:
  ```tsx
  {rightPanelTab === "properties" ? (
    selectedItemIds.size > 1 ? (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400 p-6">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="text-[13px] font-medium">{selectedItemIds.size} items selected</span>
        <span className="text-[11px] text-center">Drag any selected item to move them all</span>
      </div>
    ) : selectedEffectOverlayId ? <EffectPropertiesPanel />
    : selectedTransitionId ? <TransitionPropertiesPanel />
    : <ClipPropertiesPanel />
  ) : ...}
  ```

- [ ] **Step 3: Verify in browser**

  Cmd+click two clips — the Properties panel should open and show "2 items selected". Cmd+click a third — "3 items selected". Click any single item without Cmd — Properties panel shows that item's properties.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/RightPanel/RightPanel.tsx
  git commit -m "feat: properties panel shows N items selected for multi-selection"
  ```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Cmd+click toggles items — Task 4
- ✅ Rubber-band drag select — Task 7
- ✅ Track label click → select whole track — Task 6
- ✅ Shift+click track label range select — Task 6
- ✅ Move selected items together (time-only, relative positions) — Task 5
- ✅ All item types (clips, effects, overlays, captions, transitions) — Tasks 3–5
- ✅ Blue ring visual — Task 3
- ✅ Properties panel "N items selected" — Task 8
- ✅ Plain click clears multi-select (via existing `selectClip` sync in Task 1)

**Type consistency:**
- `selectedItemIds: Set<string>` used consistently across all tasks
- `moves: Array<{ id: string; newStartTime: number }>` used in Tasks 2 and 5
- `getItemStartTime(project, id)` exported from store, imported in Tasks 2 and 5
- `selectMultiple(ids: Set<string>)` used in Tasks 6 and 7
- `toggleItemSelection(id: string)` used in Tasks 4 and 6

**Potential issues:**
- Zustand and `Set<string>`: Zustand 4.x handles plain Set mutations correctly via `set()`. No immer needed.
- `useProjectStore.getState()` inside `startDrag` closures correctly reads state at drag-start time (not stale render state).
- The rubber-band `left` position for the rendered rect is in content-div space — correct since the div itself is inside the scrollable content div.
