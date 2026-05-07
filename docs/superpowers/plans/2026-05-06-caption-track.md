# Caption Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the caption style preset picker with a full-featured Caption track in the timeline — caption segments appear as blocks, clicking one selects it and opens rich typographic controls in the Properties tab.

**Architecture:** `CaptionTrackStyle` replaces all scattered `captionStyle/captionSize/captionX/Y/BoxW/H` fields on `Project` with a single style object. The timeline gains a Captions row (always visible when captions exist) rendered by a new `CaptionTimelineTrack` component. The Properties tab renders a new `CaptionStyleEditor` when `selectedCaptionId` is set. `CaptionOverlay` is rewritten to use `CaptionTrackStyle` directly instead of preset class maps.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS — no new dependencies.

---

## File map

| File | Change |
|---|---|
| `frontend/src/types/project.ts` | Add `CaptionTrackStyle`, remove `CaptionStyle`, update `Project` |
| `frontend/src/store/useProjectStore.ts` | Add `selectedCaptionId`, `selectCaption`, `setCaptionTrackStyle`; remove old caption style setters |
| `frontend/src/components/Timeline/CaptionTimelineTrack.tsx` | **New** — renders caption segments as clickable blocks |
| `frontend/src/components/Timeline/Timeline.tsx` | Add caption track label row + `CaptionTimelineTrack` |
| `frontend/src/components/LeftPanel/CaptionStyleEditor.tsx` | **New** — full typographic controls for `CaptionTrackStyle` |
| `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` | Add `selectedCaptionId` case → renders `CaptionStyleEditor` |
| `frontend/src/components/Preview/CaptionOverlay.tsx` | Rewrite to use `CaptionTrackStyle` properties |
| `frontend/src/components/LeftPanel/TranscriptTab.tsx` | Remove `CaptionStylePicker` import/usage |
| `frontend/src/components/LeftPanel/CaptionStylePicker.tsx` | **Delete** |

---

## Task 1: Add `CaptionTrackStyle` type, update `Project`

**Files:**
- Modify: `frontend/src/types/project.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type TrackType = "video" | "audio" | "captions";

export interface CaptionTrackStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  color: string;
  letterSpacing: number;         // px
  textAlign: "left" | "center" | "right";
  textShadow: boolean;
  outlineWidth: number;          // px (0 = off)
  outlineColor: string;
  backgroundColor: string;      // hex or "transparent"
  x: number;                    // % of video width (top-left)
  y: number;                    // % of video height (top-left)
  boxW: number;                  // % of video width
  boxH: number;                  // % of video height (karaoke only)
  highlightMode: "none" | "karaoke";
  highlightColor: string;
}

export interface UploadedFile {
  id: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
}

export interface Clip {
  id: string;
  fileId: string;
  startTime: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
  muted?: boolean;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Track {
  id: string;
  type: TrackType;
  clips: Clip[];
  muted?: boolean;
  hidden?: boolean;
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: CaptionWord[];
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  background: string;
}

export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  captionTrackStyle: CaptionTrackStyle;
  tracks: Track[];
  captions: Caption[];
  textOverlays: TextOverlay[];
  captionSourceFileId?: string;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: errors about removed fields (`captionStyle`, `captionSize`, etc.) — these will be fixed in subsequent tasks.

---

## Task 2: Update the Zustand store

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Replace the top of the file — imports and helpers**

Replace the import line and `makeDefaultProject`:

```typescript
import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay } from "../types/project";
import { saveProject } from "../lib/api";
import type { ProjectData } from "../lib/api";

const STORAGE_KEY = "video-editor-project";
const MAX_HISTORY = 50;

export function makeDefaultCaptionStyle(): CaptionTrackStyle {
  return {
    fontFamily: "sans-serif",
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: 0,
    textAlign: "center",
    textShadow: true,
    outlineWidth: 0,
    outlineColor: "#000000",
    backgroundColor: "transparent",
    x: 10,
    y: 78,
    boxW: 80,
    boxH: 18,
    highlightMode: "karaoke",
    highlightColor: "#fde047",
  };
}

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

- [ ] **Step 2: Update the `ProjectStore` interface**

Replace the existing interface block (lines ~29–84) with:

```typescript
interface ProjectStore {
  project: Project;
  files: UploadedFile[];
  history: Project[];
  future: Project[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;
  activeProjectId: string | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  selectedCaptionId: string | null;
  leftPanelTab: "Media" | "Transcript" | "Properties";

  setProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setCaptionTrackStyle: (patch: Partial<CaptionTrackStyle>) => void;
  setCaptionPosition: (x: number, y: number) => void;
  setCaptionBox: (w: number, h: number) => void;

  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;

  addTrack: (type?: TrackType) => void;
  detachAudio: (clipId: string) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  addClip: (trackId: string, clip: Omit<Clip, "id">) => void;
  moveClip: (clipId: string, toTrackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, newStartTime: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;

  setClipSpeed: (clipId: string, speed: number) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  setClipFade: (clipId: string, fadeIn: number, fadeOut: number) => void;
  addTextOverlay: (overlay: Omit<TextOverlay, "id">) => void;
  updateTextOverlay: (id: string, patch: Partial<Omit<TextOverlay, "id">>) => void;
  deleteTextOverlay: (id: string) => void;
  selectOverlay: (id: string | null) => void;

  setCaption: (captions: Caption[], sourceFileId?: string) => void;

  setPlayhead: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  selectClip: (id: string | null) => void;
  selectCaption: (id: string | null) => void;
  selectLeftPanelTab: (tab: "Media" | "Transcript" | "Properties") => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;

  undo: () => void;
  redo: () => void;

  saveAsJson: () => void;
  loadFromJson: (json: string) => void;
}
```

- [ ] **Step 3: Update initial state and actions in `create()`**

In the `create<ProjectStore>((set, get) => ({` block:

a) Add `selectedCaptionId: null` and `leftPanelTab: "Media"` to initial state.

b) Replace `setCaptionStyle`, `setCaptionSize`, `setCaptionPosition`, `setCaptionBox` with:

```typescript
setCaptionTrackStyle: (patch) => withHistory(set, get, (p) => ({
  ...p,
  captionTrackStyle: { ...p.captionTrackStyle, ...patch },
})),
setCaptionPosition: (x, y) => set((s) => ({
  project: { ...s.project, captionTrackStyle: { ...s.project.captionTrackStyle, x, y } },
})),
setCaptionBox: (boxW, boxH) => set((s) => ({
  project: { ...s.project, captionTrackStyle: { ...s.project.captionTrackStyle, boxW, boxH } },
})),
```

c) Add `selectCaption` and `selectLeftPanelTab`:

```typescript
selectCaption: (selectedCaptionId) => set({ selectedCaptionId }),
selectLeftPanelTab: (leftPanelTab) => set({ leftPanelTab }),
```

d) Update `openProject` to migrate old format and normalize `captionTrackStyle`:

```typescript
openProject: ({ project, files }) => {
  const normalized: Project = {
    ...project,
    textOverlays: project.textOverlays ?? [],
    captionTrackStyle: {
      ...makeDefaultCaptionStyle(),
      // migrate old karaoke position fields if present
      ...((project as any).captionX !== undefined ? { x: (project as any).captionX } : {}),
      ...((project as any).captionY !== undefined ? { y: (project as any).captionY } : {}),
      ...((project as any).captionBoxW !== undefined ? { boxW: (project as any).captionBoxW } : {}),
      ...((project as any).captionBoxH !== undefined ? { boxH: (project as any).captionBoxH } : {}),
      ...((project as any).captionSize !== undefined ? { fontSize: (project as any).captionSize } : {}),
      ...(project.captionTrackStyle ?? {}),
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  set({ project: normalized, files, activeProjectId: normalized.id, history: [], future: [], playheadTime: 0, isPlaying: false });
},
```

e) Update `loadFromJson` to normalize the project the same way `openProject` does:

```typescript
loadFromJson: (json) => {
  try {
    const parsed = JSON.parse(json);
    if (!isValidProject(parsed)) { alert("Invalid project JSON: missing required fields"); return; }
    const project: Project = {
      ...parsed,
      textOverlays: parsed.textOverlays ?? [],
      captionTrackStyle: { ...makeDefaultCaptionStyle(), ...(parsed.captionTrackStyle ?? {}) },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    set({ project, history: [], future: [] });
  } catch {
    alert("Invalid project JSON");
  }
},
```

- [ ] **Step 4: Update `LeftPanel.tsx` to read/write tab from store**

`LeftPanel` currently manages `tab` state locally. Replace local state with store:

```typescript
// Remove: const [tab, setTab] = useState<Tab>("Media");
// Add:
const { leftPanelTab: tab, selectLeftPanelTab: setTab } = useProjectStore();
```

Import `useProjectStore` at top of `LeftPanel.tsx` if not already there.

- [ ] **Step 5: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: errors from components that still reference old fields — fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/project.ts frontend/src/store/useProjectStore.ts frontend/src/components/LeftPanel/LeftPanel.tsx
git commit -m "feat: add CaptionTrackStyle type and store actions"
```

---

## Task 3: Caption timeline track component

**Files:**
- Create: `frontend/src/components/Timeline/CaptionTimelineTrack.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  zoom: number;
  totalWidth: number;
  seek: (time: number) => void;
}

export default function CaptionTimelineTrack({ zoom, totalWidth, seek }: Props) {
  const { project, selectedCaptionId, selectCaption, selectLeftPanelTab } = useProjectStore();

  return (
    <div className="h-10 relative border-b border-gray-100" style={{ width: totalWidth }}>
      {project.captions.map((cap) => {
        const left = cap.startTime * zoom;
        const width = Math.max(2, (cap.endTime - cap.startTime) * zoom);
        const isSelected = cap.id === selectedCaptionId;

        return (
          <div
            key={cap.id}
            className={`absolute top-1 bottom-1 rounded cursor-pointer transition-colors select-none
              flex items-center overflow-hidden px-1
              ${isSelected
                ? "bg-blue-500 ring-1 ring-blue-300"
                : "bg-blue-300 hover:bg-blue-400"}`}
            style={{ left, width }}
            onClick={() => {
              selectCaption(cap.id);
              selectLeftPanelTab("Properties");
              seek(cap.startTime);
            }}
            title={cap.text}
          >
            <span className="text-[9px] text-white truncate pointer-events-none">
              {cap.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | grep CaptionTimelineTrack
```

Expected: no errors for this file.

---

## Task 4: Wire caption track into Timeline.tsx

**Files:**
- Modify: `frontend/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Add import**

Add to existing imports:

```typescript
import CaptionTimelineTrack from "./CaptionTimelineTrack";
```

- [ ] **Step 2: Add caption track label row**

In the track labels section, after the `project.textOverlays.length > 0` block:

```tsx
{project.captions.length > 0 && (
  <div className="h-10 flex items-center gap-1 px-2 border-b border-gray-100">
    <span className="text-[10px] font-medium text-blue-500 flex-1">captions</span>
  </div>
)}
```

- [ ] **Step 3: Add caption track in scrollable area**

After the `TextOverlayTrack` block:

```tsx
{project.captions.length > 0 && (
  <CaptionTimelineTrack zoom={zoom} totalWidth={totalWidth} seek={seek} />
)}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Timeline/CaptionTimelineTrack.tsx frontend/src/components/Timeline/Timeline.tsx
git commit -m "feat: caption track row in timeline"
```

---

## Task 5: Caption style editor component

**Files:**
- Create: `frontend/src/components/LeftPanel/CaptionStyleEditor.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useProjectStore, makeDefaultCaptionStyle } from "../../store/useProjectStore";

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Arial Black, sans-serif", label: "Arial Black" },
];

export default function CaptionStyleEditor() {
  const { project, setCaptionTrackStyle } = useProjectStore();
  const s = project.captionTrackStyle;

  function set<K extends keyof typeof s>(key: K, value: typeof s[K]) {
    setCaptionTrackStyle({ [key]: value } as any);
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Caption Style</p>

      {/* Font family */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Font</label>
        <select
          value={s.fontFamily}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="w-full text-xs border border-gray-200 rounded p-1.5 outline-none focus:ring-1 focus:ring-blue-400"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Size — {s.fontSize}px
        </label>
        <input
          type="range" min={12} max={96} step={2}
          value={s.fontSize}
          onChange={(e) => set("fontSize", parseInt(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>

      {/* Font weight */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Weight</label>
        <div className="flex gap-2">
          {(["normal", "bold"] as const).map((w) => (
            <button
              key={w}
              onClick={() => set("fontWeight", w)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.fontWeight === w
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Text align */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Align</label>
        <div className="flex gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => set("textAlign", a)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.textAlign === a
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Letter spacing */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Letter spacing — {s.letterSpacing}px
        </label>
        <input
          type="range" min={-2} max={20} step={0.5}
          value={s.letterSpacing}
          onChange={(e) => set("letterSpacing", parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>

      {/* Text color */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Color</label>
        <input
          type="color"
          value={s.color}
          onChange={(e) => set("color", e.target.value)}
          className="w-full h-8 rounded border border-gray-200 cursor-pointer"
        />
      </div>

      {/* Background */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Background</label>
        <div className="flex gap-2">
          <button
            onClick={() => set("backgroundColor", "transparent")}
            className={`flex-1 py-1 rounded text-xs border transition-colors
              ${s.backgroundColor === "transparent"
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >
            None
          </button>
          <input
            type="color"
            value={s.backgroundColor === "transparent" ? "#000000" : s.backgroundColor}
            onChange={(e) => set("backgroundColor", e.target.value)}
            className="flex-1 h-8 rounded border border-gray-200 cursor-pointer"
            title="Background color"
          />
        </div>
      </div>

      {/* Text shadow */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-400 uppercase tracking-wide">Text Shadow</label>
        <button
          onClick={() => set("textShadow", !s.textShadow)}
          className={`w-10 h-5 rounded-full transition-colors relative ${s.textShadow ? "bg-blue-600" : "bg-gray-300"}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.textShadow ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Outline */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Outline — {s.outlineWidth}px
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range" min={0} max={8} step={0.5}
            value={s.outlineWidth}
            onChange={(e) => set("outlineWidth", parseFloat(e.target.value))}
            className="flex-1 accent-blue-600"
          />
          {s.outlineWidth > 0 && (
            <input
              type="color"
              value={s.outlineColor}
              onChange={(e) => set("outlineColor", e.target.value)}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer flex-shrink-0"
              title="Outline color"
            />
          )}
        </div>
      </div>

      {/* Highlight mode */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Highlight</label>
        <div className="flex gap-2">
          {(["none", "karaoke"] as const).map((m) => (
            <button
              key={m}
              onClick={() => set("highlightMode", m)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.highlightMode === m
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {m === "none" ? "None" : "Karaoke"}
            </button>
          ))}
        </div>
      </div>

      {/* Highlight color (karaoke only) */}
      {s.highlightMode === "karaoke" && (
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Highlight Color</label>
          <input
            type="color"
            value={s.highlightColor}
            onChange={(e) => set("highlightColor", e.target.value)}
            className="w-full h-8 rounded border border-gray-200 cursor-pointer"
          />
        </div>
      )}

      {/* Position */}
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium pt-1 border-t border-gray-100">Position</p>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          X — {s.x.toFixed(0)}%
        </label>
        <input
          type="range" min={0} max={90}
          value={s.x}
          onChange={(e) => setCaptionTrackStyle({ x: parseInt(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Y — {s.y.toFixed(0)}%
        </label>
        <input
          type="range" min={0} max={90}
          value={s.y}
          onChange={(e) => setCaptionTrackStyle({ y: parseInt(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Width — {s.boxW.toFixed(0)}%
        </label>
        <input
          type="range" min={10} max={100}
          value={s.boxW}
          onChange={(e) => setCaptionTrackStyle({ boxW: parseInt(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>

      {s.highlightMode === "karaoke" && (
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Box Height — {s.boxH.toFixed(0)}%
          </label>
          <input
            type="range" min={5} max={60}
            value={s.boxH}
            onChange={(e) => setCaptionTrackStyle({ boxH: parseInt(e.target.value) })}
            className="w-full accent-blue-600"
          />
          <p className="text-[9px] text-gray-400 mt-1">Drag box to move · drag corner to resize</p>
        </div>
      )}

      {/* Reset */}
      <button
        onClick={() => setCaptionTrackStyle(makeDefaultCaptionStyle())}
        className="w-full py-1.5 text-xs border border-gray-300 rounded text-gray-500 hover:bg-gray-50 transition-colors"
      >
        Reset to defaults
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | grep CaptionStyleEditor
```

Expected: no errors for this file.

---

## Task 6: Wire caption selection into ClipPropertiesPanel

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

- [ ] **Step 1: Add import**

```typescript
import CaptionStyleEditor from "./CaptionStyleEditor";
```

- [ ] **Step 2: Add `selectedCaptionId` to the destructure**

```typescript
const {
  project, selectedClipId, selectedOverlayId, selectedCaptionId,
  setClipSpeed, setClipVolume, setClipFade,
  updateTextOverlay,
} = useProjectStore();
```

- [ ] **Step 3: Add caption case before the overlay case**

Insert after the opening of the component, before the `overlay` check:

```typescript
// Caption style editor takes priority when a caption is selected
if (selectedCaptionId) {
  return <CaptionStyleEditor />;
}
```

- [ ] **Step 4: Update empty state message**

```typescript
return (
  <div className="flex-1 flex items-center justify-center p-4">
    <p className="text-xs text-gray-400 text-center">Select a clip, caption, or text overlay to edit properties</p>
  </div>
);
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | head -20
```

---

## Task 7: Rewrite CaptionOverlay to use CaptionTrackStyle

**Files:**
- Modify: `frontend/src/components/Preview/CaptionOverlay.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Caption, CaptionTrackStyle } from "../../types/project";

interface Props { time: number }

function useFadeIn() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return visible;
}

function captionTextStyle(s: CaptionTrackStyle): React.CSSProperties {
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    color: s.color,
    letterSpacing: s.letterSpacing > 0 ? `${s.letterSpacing}px` : undefined,
    textAlign: s.textAlign,
    textShadow: s.textShadow ? "0 2px 8px rgba(0,0,0,0.8)" : undefined,
    WebkitTextStroke: s.outlineWidth > 0 ? `${s.outlineWidth}px ${s.outlineColor}` : undefined,
    backgroundColor: s.backgroundColor !== "transparent" ? s.backgroundColor : undefined,
    padding: s.backgroundColor !== "transparent" ? "2px 12px" : undefined,
    lineHeight: 1.35,
    wordBreak: "break-word" as const,
  };
}

function KaraokeOverlay({ seg, time, style }: { seg: Caption; time: number; style: CaptionTrackStyle }) {
  const { setCaptionPosition, setCaptionBox } = useProjectStore();
  const { x, y, boxW, boxH } = style;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visible = useFadeIn();

  const words = seg.words ?? [];
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startCX = x, startCY = y;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionPosition(
        Math.max(0, Math.min(100 - boxW, startCX + dx)),
        Math.max(0, Math.min(100 - boxH, startCY + dy)),
      );
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startW = boxW, startH = boxH;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dw = ((ev.clientX - startX) / rect.width) * 100;
      const dh = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionBox(
        Math.max(10, Math.min(100 - x, startW + dw)),
        Math.max(5, Math.min(60, startH + dh)),
      );
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      ref={containerRef}
      className="absolute group select-none cursor-move"
      style={{
        left: `${x}%`, top: `${y}%`, width: `${boxW}%`, height: `${boxH}%`,
        overflow: "hidden",
        border: "1.5px dashed rgba(255,255,255,0.25)",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
      onMouseDown={onDragStart}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.6)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
    >
      <p style={{ ...captionTextStyle(style), padding: "4px 8px", backgroundColor: undefined }}>
        {words.length ? words.map((w, i) => (
          <span
            key={i}
            style={{
              pointerEvents: "none",
              color: i === activeIdx
                ? style.highlightColor
                : i < activeIdx
                ? `${style.color}66`
                : style.color,
              textShadow: style.textShadow ? "0 2px 8px rgba(0,0,0,0.8)" : undefined,
              WebkitTextStroke: style.outlineWidth > 0 ? `${style.outlineWidth}px ${style.outlineColor}` : undefined,
            }}
          >
            {w.text}{" "}
          </span>
        )) : <span style={{ pointerEvents: "none", color: style.color }}>{seg.text}</span>}
      </p>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize"
        style={{ width: 20, height: 20, padding: 4 }}
        onMouseDown={onResizeStart}
      >
        <div style={{ width: "100%", height: "100%", borderRight: "2px solid rgba(255,255,255,0.7)", borderBottom: "2px solid rgba(255,255,255,0.7)" }} />
      </div>
    </div>
  );
}

function StaticCaption({ seg, style }: { seg: Caption; style: CaptionTrackStyle }) {
  const visible = useFadeIn();
  return (
    <div
      style={{
        position: "absolute",
        left: `${style.x}%`,
        top: `${style.y}%`,
        width: `${style.boxW}%`,
        textAlign: style.textAlign,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
    >
      <span style={captionTextStyle(style)}>{seg.text}</span>
    </div>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const style = project.captionTrackStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;

  if (style.highlightMode === "karaoke") {
    return <KaraokeOverlay key={cap.id} seg={cap} time={time} style={style} />;
  }

  return <StaticCaption key={cap.id} seg={cap} style={style} />;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: errors in TranscriptTab (still imports CaptionStylePicker) and possibly store — fixed next.

---

## Task 8: Remove CaptionStylePicker, clean up TranscriptTab

**Files:**
- Modify: `frontend/src/components/LeftPanel/TranscriptTab.tsx`
- Delete: `frontend/src/components/LeftPanel/CaptionStylePicker.tsx`

- [ ] **Step 1: Remove import and usage from TranscriptTab**

In `TranscriptTab.tsx`, delete:
```typescript
import CaptionStylePicker from "./CaptionStylePicker";
```

And remove the `<CaptionStylePicker />` element at the bottom of the returned JSX (the last line before the closing `</div>`).

- [ ] **Step 2: Delete CaptionStylePicker.tsx**

```bash
rm frontend/src/components/LeftPanel/CaptionStylePicker.tsx
```

- [ ] **Step 3: Final type-check — must be zero errors**

```bash
cd frontend && pnpm tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit everything**

```bash
git add -A
git commit -m "feat: caption track with full typographic style controls"
```

---

## Verification checklist

1. `pnpm tsc --noEmit` — zero errors
2. Captions row appears in timeline when transcript is transcribed
3. Clicking a caption block seeks to its start time
4. Clicking a caption block switches to Properties tab showing the style editor
5. Font, size, weight, color, background, shadow, outline, alignment, letter-spacing all update the preview live
6. Karaoke highlight color picker appears/disappears with highlight mode toggle
7. Position sliders (X, Y, Width, Box Height) move the overlay on the preview
8. Drag-to-move and corner resize still work in the preview
9. Reset button restores all defaults
10. Old projects load without errors (migration in `openProject`)
