# Effects Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-based Effects track to the timeline where users can drag a Zoom effect from the right panel, resize it, and configure zoom scale + ramp-in/ramp-out durations.

**Architecture:** `EffectOverlay` objects live in `project.effectOverlays[]` — the same pattern as `textOverlays[]`. A new `EffectOverlayTrack` renders them on the timeline with drag/resize. `VideoPreview` reads the active effect at `playheadTime` and applies a CSS `transform: scale()` to a wrapper around the `<video>` element.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/types/project.ts` | Modify | Add `EffectType`, `ZoomParams`, `EffectOverlay`; extend `Project` |
| `frontend/src/store/useProjectStore.ts` | Modify | Add `selectedEffectOverlayId`, 6 actions, extend `rightPanelTab` type |
| `frontend/src/components/Timeline/EffectOverlayTrack.tsx` | **Create** | Renders effect blocks; drag-to-move, edge-resize, drop target |
| `frontend/src/components/Timeline/Timeline.tsx` | Modify | Add FX label row + `<EffectOverlayTrack>` in scrollable area |
| `frontend/src/components/Preview/VideoPreview.tsx` | Modify | Compute zoom scale from active effect; apply to video wrapper |
| `frontend/src/components/RightPanel/EffectsTab.tsx` | **Create** | Draggable "Zoom" effect palette |
| `frontend/src/components/RightPanel/EffectPropertiesPanel.tsx` | **Create** | Scale / ramp-in / ramp-out sliders |
| `frontend/src/components/RightPanel/RightPanel.tsx` | Modify | Add Effects tab to strip; route properties content |

---

### Task 1: Extend the data types

**Files:**
- Modify: `frontend/src/types/project.ts`

- [ ] **Step 1: Add effect types after the `TextOverlay` interface**

  Open `frontend/src/types/project.ts`. After the closing `}` of `TextOverlay`, insert:

  ```typescript
  export type EffectType = "zoom";

  export interface ZoomParams {
    scale: number;   // 1.0–3.0
    rampIn: number;  // seconds to ramp from 1× to scale
    rampOut: number; // seconds to ramp from scale back to 1×
  }

  export interface EffectOverlay {
    id: string;
    type: EffectType;
    startTime: number;
    endTime: number;
    params: ZoomParams;
  }
  ```

- [ ] **Step 2: Add `effectOverlays` to the `Project` interface**

  Inside the `Project` interface (currently ends with `captionSourceFileId?: string;`), add after `textOverlays: TextOverlay[];`:

  ```typescript
  effectOverlays: EffectOverlay[];
  ```

- [ ] **Step 3: Verify TypeScript is happy**

  ```bash
  cd frontend && pnpm build 2>&1 | head -30
  ```

  Expected: errors only about `makeDefaultProject` missing `effectOverlays` (fixed in Task 2). No other new errors.

---

### Task 2: Add store state and actions

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Update the import line to include new types**

  Find the line at the top of the store:
  ```typescript
  import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay } from "../types/project";
  ```
  Replace with:
  ```typescript
  import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay, EffectOverlay, ZoomParams } from "../types/project";
  ```

- [ ] **Step 2: Extend `rightPanelTab` type and add `selectedEffectOverlayId` to the interface**

  Find in the `ProjectStore` interface:
  ```typescript
  rightPanelTab: "properties" | "media" | null;
  ```
  Replace with:
  ```typescript
  rightPanelTab: "properties" | "media" | "effects" | null;
  selectedEffectOverlayId: string | null;
  ```

  Find `setRightPanelTab: (tab: "properties" | "media" | null) => void;` and replace with:
  ```typescript
  setRightPanelTab: (tab: "properties" | "media" | "effects" | null) => void;
  ```

- [ ] **Step 3: Add 6 new action signatures to the `ProjectStore` interface**

  After `selectOverlay: (id: string | null) => void;`, add:
  ```typescript
  addEffectOverlay: (overlay: Omit<EffectOverlay, "id">) => void;
  moveEffectOverlay: (id: string, newStartTime: number) => void;
  resizeEffectOverlay: (id: string, newStartTime: number, newEndTime: number) => void;
  deleteEffectOverlay: (id: string) => void;
  updateEffectOverlayParams: (id: string, params: Partial<ZoomParams>) => void;
  selectEffectOverlay: (id: string | null) => void;
  ```

- [ ] **Step 4: Add `effectOverlays: []` to `makeDefaultProject`**

  Find `makeDefaultProject`:
  ```typescript
  function makeDefaultProject(): Project {
    return {
      id: uuid(),
      name: "Untitled Project",
      aspectRatio: "16:9",
      captionTrackStyle: makeDefaultCaptionStyle(),
      tracks: [{ id: uuid(), type: "video", clips: [] }],
      captions: [],
      textOverlays: [],
    };
  }
  ```
  Replace with:
  ```typescript
  function makeDefaultProject(): Project {
    return {
      id: uuid(),
      name: "Untitled Project",
      aspectRatio: "16:9",
      captionTrackStyle: makeDefaultCaptionStyle(),
      tracks: [{ id: uuid(), type: "video", clips: [] }],
      captions: [],
      textOverlays: [],
      effectOverlays: [],
    };
  }
  ```

- [ ] **Step 5: Add initial state value**

  Inside the `create<ProjectStore>((set, get) => ({` block, find:
  ```typescript
  selectedOverlayId: null,
  selectedCaptionId: null,
  ```
  Add after:
  ```typescript
  selectedEffectOverlayId: null,
  ```

- [ ] **Step 6: Implement the 6 new actions**

  Find the `selectOverlay` implementation (it's a `set(...)` call). After it, add:

  ```typescript
  addEffectOverlay: (overlay) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: [...p.effectOverlays, { ...overlay, id: uuid() }],
  })),

  moveEffectOverlay: (id, newStartTime) => withHistory(set, get, (p) => {
    const effect = p.effectOverlays.find((e) => e.id === id);
    if (!effect) return p;
    const duration = effect.endTime - effect.startTime;
    return {
      ...p,
      effectOverlays: p.effectOverlays.map((e) =>
        e.id === id ? { ...e, startTime: newStartTime, endTime: newStartTime + duration } : e
      ),
    };
  }),

  resizeEffectOverlay: (id, newStartTime, newEndTime) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.map((e) =>
      e.id === id ? { ...e, startTime: newStartTime, endTime: newEndTime } : e
    ),
  })),

  deleteEffectOverlay: (id) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.filter((e) => e.id !== id),
  })),

  updateEffectOverlayParams: (id, params) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.map((e) =>
      e.id === id ? { ...e, params: { ...e.params, ...params } } : e
    ),
  })),

  selectEffectOverlay: (id) =>
    set(
      id
        ? { selectedEffectOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, rightPanelTab: "properties" as const }
        : { selectedEffectOverlayId: null }
    ),
  ```

- [ ] **Step 7: Add migration guards for old projects without `effectOverlays`**

  In `openProject` (around line 563), the `normalized` object currently reads:
  ```typescript
  const normalized: Project = {
    ...project,
    textOverlays: project.textOverlays ?? [],
    captionTrackStyle: { ... },
  };
  ```
  Add `effectOverlays` after `textOverlays`:
  ```typescript
  const normalized: Project = {
    ...project,
    textOverlays: project.textOverlays ?? [],
    effectOverlays: (project as any).effectOverlays ?? [],
    captionTrackStyle: { ... },
  };
  ```

  In `loadFromJson` (around line 616), the `project` object currently reads:
  ```typescript
  const project: Project = {
    ...parsed,
    textOverlays: parsed.textOverlays ?? [],
    captionTrackStyle: { ... },
  };
  ```
  Add the same guard:
  ```typescript
  const project: Project = {
    ...parsed,
    textOverlays: parsed.textOverlays ?? [],
    effectOverlays: (parsed as any).effectOverlays ?? [],
    captionTrackStyle: { ... },
  };
  ```

- [ ] **Step 8: Verify no TypeScript errors**

  ```bash
  cd frontend && pnpm build 2>&1 | head -30
  ```
  Expected: 0 new errors.

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/types/project.ts frontend/src/store/useProjectStore.ts
  git commit -m "feat: add EffectOverlay types and store actions"
  ```

---

### Task 3: Create EffectOverlayTrack component

**Files:**
- Create: `frontend/src/components/Timeline/EffectOverlayTrack.tsx`

- [ ] **Step 1: Create the file**

  Create `frontend/src/components/Timeline/EffectOverlayTrack.tsx` with the full content:

  ```tsx
  import { useProjectStore } from "../../store/useProjectStore";
  import type { EffectOverlay } from "../../types/project";

  interface Props {
    zoom: number;
    totalWidth: number;
    height: number;
  }

  export default function EffectOverlayTrack({ zoom, totalWidth, height }: Props) {
    const effectOverlays = useProjectStore((s) => s.project.effectOverlays);
    const selectedEffectOverlayId = useProjectStore((s) => s.selectedEffectOverlayId);
    const { addEffectOverlay, moveEffectOverlay, resizeEffectOverlay, deleteEffectOverlay, selectEffectOverlay } =
      useProjectStore();

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      const effectType = e.dataTransfer.getData("effectType");
      if (effectType !== "zoom") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const startTime = Math.max(0, (e.clientX - rect.left) / zoom);
      addEffectOverlay({
        type: "zoom",
        startTime,
        endTime: startTime + 3,
        params: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
      });
    }

    return (
      <div
        className="border-b border-slate-100 relative bg-violet-50"
        style={{ width: totalWidth, height }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={() => selectEffectOverlay(null)}
      >
        {effectOverlays.map((effect) => (
          <EffectBlock
            key={effect.id}
            effect={effect}
            zoom={zoom}
            selected={effect.id === selectedEffectOverlayId}
            onSelect={() => selectEffectOverlay(effect.id)}
            onMove={(newStart) => moveEffectOverlay(effect.id, newStart)}
            onResize={(newStart, newEnd) => resizeEffectOverlay(effect.id, newStart, newEnd)}
            onDelete={() => deleteEffectOverlay(effect.id)}
          />
        ))}
      </div>
    );
  }

  function EffectBlock({
    effect,
    zoom,
    selected,
    onSelect,
    onMove,
    onResize,
    onDelete,
  }: {
    effect: EffectOverlay;
    zoom: number;
    selected: boolean;
    onSelect: () => void;
    onMove: (newStart: number) => void;
    onResize: (newStart: number, newEnd: number) => void;
    onDelete: () => void;
  }) {
    const left = effect.startTime * zoom;
    const width = Math.max((effect.endTime - effect.startTime) * zoom, 8);

    function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
      e.stopPropagation();
      onSelect();
      const startX = e.clientX;
      const origStart = effect.startTime;
      const origEnd = effect.endTime;
      const duration = origEnd - origStart;

      function onMouseMove(ev: MouseEvent) {
        const dt = (ev.clientX - startX) / zoom;
        if (mode === "move") {
          onMove(Math.max(0, origStart + dt));
        } else if (mode === "left") {
          const newStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.1));
          onResize(newStart, origEnd);
        } else {
          const newEnd = Math.max(origStart + 0.1, origEnd + dt);
          onResize(origStart, newEnd);
        }
      }
      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }

    return (
      <div
        className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing
          ${selected
            ? "bg-violet-400/40 border border-white ring-2 ring-violet-400"
            : "bg-violet-400/25 border border-violet-400 hover:bg-violet-400/35"}`}
        style={{ left, width }}
        onMouseDown={(e) => startDrag(e, "move")}
        onContextMenu={(e) => { e.preventDefault(); onDelete(); }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "left"); }}
        />
        <span className="px-2 text-[10px] text-violet-700 font-semibold truncate flex-1 pointer-events-none">
          🔍 Zoom
        </span>
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "right"); }}
        />
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  cd frontend && pnpm build 2>&1 | grep "EffectOverlayTrack"
  ```
  Expected: no errors mentioning this file.

---

### Task 4: Wire EffectOverlayTrack into Timeline

**Files:**
- Modify: `frontend/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Import the new component**

  Add to the imports at the top of `Timeline.tsx`:
  ```typescript
  import EffectOverlayTrack from "./EffectOverlayTrack";
  ```

- [ ] **Step 2: Add the FX label row in the track labels area**

  The label area renders one div per track, then conditional divs for `textOverlays` and `captions`. After the `captions` label block, add:

  ```tsx
  <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("fx") }}>
    <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
    <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">fx</span>
    <div
      className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
      onMouseDown={(e) => onTrackResizeDown("fx", e)}
    />
  </div>
  ```

  Note: the FX label shows always (not conditionally), so the track is always visible as a drop target.

- [ ] **Step 3: Add `<EffectOverlayTrack>` in the scrollable area**

  In the scrollable `<div style={{ width: totalWidth, ... }}>`, after `<CaptionTimelineTrack .../>`, add:

  ```tsx
  <EffectOverlayTrack zoom={zoom} totalWidth={totalWidth} height={trackH("fx")} />
  ```

- [ ] **Step 4: Update `DEFAULT_TRACK_H` fallback for "fx"**

  The `trackH` helper uses `trackHeights[key] ?? DEFAULT_TRACK_H` where `DEFAULT_TRACK_H = 40`. The "fx" key will use 40px by default — no change needed. Verify `trackH("fx")` returns `40` when no resize has happened.

- [ ] **Step 5: Start dev server and verify visually**

  ```bash
  cd frontend && pnpm dev
  ```

  Open http://localhost:5173. Verify:
  - A violet "FX" label row appears below Captions in the timeline label column
  - A violet-tinted empty track row appears in the scrollable area

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/components/Timeline/EffectOverlayTrack.tsx frontend/src/components/Timeline/Timeline.tsx
  git commit -m "feat: add EffectOverlayTrack to timeline"
  ```

---

### Task 5: Apply zoom effect in VideoPreview

**Files:**
- Modify: `frontend/src/components/Preview/VideoPreview.tsx`

- [ ] **Step 1: Import effect types**

  Add to the existing imports in `VideoPreview.tsx`:
  ```typescript
  import type { EffectOverlay, ZoomParams } from "../../types/project";
  ```

- [ ] **Step 2: Add easing and scale computation helpers**

  Add these two pure functions **above** the `VideoPreview` component (before `const RATIO_CLASSES`):

  ```typescript
  function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function computeZoomScale(effect: EffectOverlay, playheadTime: number): number {
    const { startTime, endTime, params } = effect;
    const { scale, rampIn, rampOut } = params as ZoomParams;
    const duration = endTime - startTime;
    const progress = playheadTime - startTime;
    if (rampIn > 0 && progress < rampIn) {
      return 1 + (scale - 1) * easeInOut(progress / rampIn);
    }
    if (rampOut > 0 && progress > duration - rampOut) {
      return 1 + (scale - 1) * easeInOut((endTime - playheadTime) / rampOut);
    }
    return scale;
  }
  ```

- [ ] **Step 3: Read `effectOverlays` from store and compute active scale**

  Inside `VideoPreview`, the current first line reads:
  ```typescript
  const { project, files, playheadTime, isPlaying } = useProjectStore();
  ```
  Replace with:
  ```typescript
  const { project, files, playheadTime, isPlaying } = useProjectStore();
  const effectOverlays = useProjectStore((s) => s.project.effectOverlays);
  ```

  Then add, after the `effectiveMuted` line:
  ```typescript
  const activeEffect = effectOverlays.find(
    (e) => playheadTime >= e.startTime && playheadTime < e.endTime
  ) ?? null;
  const zoomScale = activeEffect ? computeZoomScale(activeEffect, playheadTime) : 1;
  ```

- [ ] **Step 4: Wrap the `<video>` element in a zoom div**

  Currently the JSX inside the outer `<div className={`relative bg-black ...`}>` starts with:
  ```tsx
  {activeFile ? (
    <video
      ref={videoRef}
      ...
    />
  ) : files.length === 0 ? (
  ```

  Wrap only the `<video>` in a positioning div that carries the scale transform:
  ```tsx
  {activeFile ? (
    <div
      className="absolute inset-0"
      style={zoomScale !== 1 ? { transform: `scale(${zoomScale})`, transformOrigin: "center center" } : undefined}
    >
      <video
        ref={videoRef}
        key={activeFile.id}
        src={fileUrl(activeFile.id)}
        className="w-full h-full object-contain"
        muted={effectiveMuted}
        onClick={toggle}
        style={activeClip && (activeClip.brightness !== undefined || activeClip.contrast !== undefined || activeClip.saturation !== undefined)
          ? { filter: `brightness(${activeClip.brightness ?? 1}) contrast(${activeClip.contrast ?? 1}) saturate(${activeClip.saturation ?? 1})` }
          : undefined}
      />
    </div>
  ) : files.length === 0 ? (
  ```

  Also add `overflow: hidden` to the outer container div so zoomed video is clipped at the edges. Find:
  ```tsx
  <div
    className={`relative bg-black ${ratioClass} max-h-full`}
    style={{ maxWidth: "min(100%, 720px)" }}
  >
  ```
  Change to:
  ```tsx
  <div
    className={`relative bg-black ${ratioClass} max-h-full overflow-hidden`}
    style={{ maxWidth: "min(100%, 720px)" }}
  >
  ```

- [ ] **Step 5: Verify in dev server**

  - Add a clip to the timeline
  - In the browser console, call `useProjectStore.getState().addEffectOverlay({ type: "zoom", startTime: 0, endTime: 5, params: { scale: 2, rampIn: 1, rampOut: 1 } })`
  - Play the video — it should zoom in over 1s, hold at 2×, zoom out over 1s
  - Captions/text overlays should NOT scale (they're outside the zoom wrapper)

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/components/Preview/VideoPreview.tsx
  git commit -m "feat: apply zoom effect transform in VideoPreview"
  ```

---

### Task 6: Create EffectsTab (drag palette)

**Files:**
- Create: `frontend/src/components/RightPanel/EffectsTab.tsx`

- [ ] **Step 1: Create the file**

  Create `frontend/src/components/RightPanel/EffectsTab.tsx`:

  ```tsx
  export default function EffectsTab() {
    function handleDragStart(e: React.DragEvent, effectType: string) {
      e.dataTransfer.setData("effectType", effectType);
      e.dataTransfer.effectAllowed = "copy";
    }

    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Video Effects</p>
        <p className="text-[11px] text-slate-400">Drag an effect onto the FX track in the timeline.</p>

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "zoom")}
          className="flex items-center gap-3 p-3 rounded-lg border border-violet-200 bg-violet-50 cursor-grab active:cursor-grabbing hover:bg-violet-100 transition-colors select-none"
        >
          <span className="text-xl">🔍</span>
          <div>
            <p className="text-xs font-semibold text-violet-800">Zoom</p>
            <p className="text-[11px] text-violet-500">Zooms in, holds, zooms out</p>
          </div>
        </div>
      </div>
    );
  }
  ```

---

### Task 7: Create EffectPropertiesPanel (sliders)

**Files:**
- Create: `frontend/src/components/RightPanel/EffectPropertiesPanel.tsx`

- [ ] **Step 1: Create the file**

  Create `frontend/src/components/RightPanel/EffectPropertiesPanel.tsx`:

  ```tsx
  import { useProjectStore } from "../../store/useProjectStore";
  import type { ZoomParams } from "../../types/project";

  function SliderRow({ label, value, min, max, step, onChange, format }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
  }) {
    return (
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs text-slate-600">{label}</span>
          <span className="text-[11px] text-slate-400 tabular-nums">{format ? format(value) : value}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-violet-600 h-1"
        />
      </div>
    );
  }

  export default function EffectPropertiesPanel() {
    const { project, selectedEffectOverlayId, updateEffectOverlayParams } = useProjectStore();
    const effect = project.effectOverlays.find((e) => e.id === selectedEffectOverlayId);

    if (!effect) return null;

    const params = effect.params as ZoomParams;
    const duration = effect.endTime - effect.startTime;
    const maxRamp = Math.max(0.1, duration / 2);

    function update(patch: Partial<ZoomParams>) {
      updateEffectOverlayParams(effect!.id, patch);
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Zoom</p>

          <SliderRow
            label="Scale"
            value={params.scale}
            min={1}
            max={3}
            step={0.05}
            onChange={(v) => update({ scale: v })}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <SliderRow
            label="Ramp In"
            value={params.rampIn}
            min={0}
            max={maxRamp}
            step={0.05}
            onChange={(v) => update({ rampIn: Math.min(v, maxRamp - params.rampOut) })}
            format={(v) => `${v.toFixed(2)}s`}
          />
          <SliderRow
            label="Ramp Out"
            value={params.rampOut}
            min={0}
            max={maxRamp}
            step={0.05}
            onChange={(v) => update({ rampOut: Math.min(v, maxRamp - params.rampIn) })}
            format={(v) => `${v.toFixed(2)}s`}
          />

          <p className="text-[10px] text-slate-400">
            Hold: {Math.max(0, duration - params.rampIn - params.rampOut).toFixed(2)}s
          </p>
        </div>
      </div>
    );
  }
  ```

---

### Task 8: Wire the right panel

**Files:**
- Modify: `frontend/src/components/RightPanel/RightPanel.tsx`

- [ ] **Step 1: Add new imports**

  Add to the imports at the top:
  ```typescript
  import EffectsTab from "./EffectsTab";
  import EffectPropertiesPanel from "./EffectPropertiesPanel";
  ```

- [ ] **Step 2: Add Effects tab icon SVG function**

  After the `MediaIcon` function, add:
  ```tsx
  function EffectsIcon({ active }: { active: boolean }) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#7c3aed" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2l1.8 5.4H17l-4.3 3.2 1.6 5L10 13l-4.3 2.6 1.6-5L3 7.4h5.2L10 2z" />
      </svg>
    );
  }
  ```

- [ ] **Step 3: Add "effects" to the TABS array**

  Find the `TABS` constant:
  ```typescript
  const TABS = [
    {
      id: "properties" as const,
      label: "Properties",
      icon: (active: boolean) => <PropertiesIcon active={active} />,
    },
    {
      id: "media" as const,
      label: "Media",
      icon: (active: boolean) => <MediaIcon active={active} />,
    },
  ];
  ```
  Replace with:
  ```typescript
  const TABS = [
    {
      id: "properties" as const,
      label: "Properties",
      icon: (active: boolean) => <PropertiesIcon active={active} />,
    },
    {
      id: "effects" as const,
      label: "Effects",
      icon: (active: boolean) => <EffectsIcon active={active} />,
    },
    {
      id: "media" as const,
      label: "Media",
      icon: (active: boolean) => <MediaIcon active={active} />,
    },
  ] as const;
  ```

- [ ] **Step 4: Read `selectedEffectOverlayId` from store**

  Find the line inside `RightPanel`:
  ```typescript
  const { rightPanelTab, setRightPanelTab } = useProjectStore();
  ```
  Replace with:
  ```typescript
  const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId } = useProjectStore();
  ```

- [ ] **Step 5: Update content routing**

  Find:
  ```tsx
  {rightPanelTab === "properties" ? <ClipPropertiesPanel /> : <MediaTab />}
  ```
  Replace with:
  ```tsx
  {rightPanelTab === "properties" ? (
    selectedEffectOverlayId ? <EffectPropertiesPanel /> : <ClipPropertiesPanel />
  ) : rightPanelTab === "effects" ? (
    <EffectsTab />
  ) : (
    <MediaTab />
  )}
  ```

- [ ] **Step 6: Update the panel header label**

  The header currently reads `{TABS.find((t) => t.id === rightPanelTab)?.label}`. This works automatically — "Effects" will display when the Effects tab is active. No change needed.

- [ ] **Step 7: Full build check**

  ```bash
  cd frontend && pnpm build 2>&1
  ```
  Expected: 0 errors.

- [ ] **Step 8: End-to-end test in browser**

  Start the dev server (`pnpm dev`) and verify all 7 acceptance criteria:

  1. **Add effect**: Click "Effects" tab in right panel strip → "Zoom" card appears → drag it → drop on the violet FX track → a violet "🔍 Zoom" block appears
  2. **Resize**: Drag the left or right edge of the effect block → block resizes correctly
  3. **Select**: Click the effect block → Properties tab auto-opens → shows Scale, Ramp In, Ramp Out sliders
  4. **Sliders**: Move the Scale slider → scrub through the effect in the preview → video zooms proportionally
  5. **Playback**: Play through the effect range → video zooms in smoothly, holds, zooms out
  6. **Cross-clip**: Place an effect spanning two clips → playback continues through without interruption
  7. **Undo/Redo**: Add effect → Cmd+Z → effect disappears → Cmd+Shift+Z → effect returns

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/components/RightPanel/EffectsTab.tsx \
          frontend/src/components/RightPanel/EffectPropertiesPanel.tsx \
          frontend/src/components/RightPanel/RightPanel.tsx
  git commit -m "feat: add Effects tab and EffectPropertiesPanel to right panel"
  ```

---

## Done

The effects track MVP is complete. Future effects (blur, speed ramp, etc.) follow the same pattern: add a new `EffectType`, extend `ZoomParams` into a union, add a new case to `computeZoomScale`, and add a new card to `EffectsTab`.
