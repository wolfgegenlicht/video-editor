# Design Retheme — Light Refined + Teal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current ad-hoc gray color system with a unified Light Refined design — slate color scale, teal-600 accent, SVG icons replacing all emoji, refined typography, and the ProjectPicker flipped to light mode.

**Architecture:** Pure visual retheme — no layout changes, no new features, no store changes. All changes are in `.tsx` and `.css` files. A shared `Icons.tsx` file centralises all SVG components so they're consistent and easy to update.

**Tech Stack:** React + TypeScript + Tailwind v4 (`@import "tailwindcss"`). Dev server: `pnpm dev` at `http://localhost:5173`.

---

## File Map

| File | Change type |
|---|---|
| `frontend/src/components/Icons.tsx` | **Create** — shared SVG icon components |
| `frontend/src/index.css` | Modify — body bg |
| `frontend/src/App.tsx` | Modify — shell bg class |
| `frontend/src/components/Header/Header.tsx` | Modify — colors + SVG icons |
| `frontend/src/components/LeftPanel/LeftPanel.tsx` | Modify — strip colors + selection bar |
| `frontend/src/components/LeftPanel/TranscriptTab.tsx` | Modify — font size + word highlight colors |
| `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` | Modify — accent-teal, gray→slate |
| `frontend/src/components/RightPanel/RightPanel.tsx` | Modify — strip + panel colors |
| `frontend/src/components/Timeline/Timeline.tsx` | Modify — bg + track label sidebar |
| `frontend/src/components/Timeline/TimelineToolbar.tsx` | Modify — button styles + SVG split icon |
| `frontend/src/components/Timeline/TimelineRuler.tsx` | Modify — bg + tick colors |
| `frontend/src/components/Timeline/TimelineTrack.tsx` | Modify — bg colors |
| `frontend/src/components/Timeline/TimelineClip.tsx` | Modify — teal/emerald colors + SVG icon refs |
| `frontend/src/components/Timeline/ClipContextMenu.tsx` | Modify — icon type + colors |
| `frontend/src/components/Timeline/CaptionTimelineTrack.tsx` | Modify — violet clip colors |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Modify — amber colors |
| `frontend/src/components/ProjectPicker/ProjectPicker.tsx` | Modify — full light retheme + topbar |

---

## Task 1: Create shared SVG icon components

**Files:**
- Create: `frontend/src/components/Icons.tsx`

- [ ] **Step 1: Create the Icons file**

```tsx
// frontend/src/components/Icons.tsx

interface IconProps { className?: string }

export function UndoIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5h7a3 3 0 0 1 0 6H5" />
      <path d="M2 5l3-3M2 5l3 3" />
    </svg>
  );
}

export function RedoIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5H5a3 3 0 0 0 0 6h3" />
      <path d="M12 5l-3-3M12 5l-3 3" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8.5 2.5L5 6.5l3.5 4" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 2.5L8 6.5l-3.5 4" />
    </svg>
  );
}

export function VolumeXIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5H4.5L7.5 2.5v9L4.5 9H2V5z" />
      <path d="M10 5l3 4M13 5l-3 4" />
    </svg>
  );
}

export function Volume2Icon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5H4.5L7.5 2.5v9L4.5 9H2V5z" />
      <path d="M10 5a3 3 0 0 1 0 4" />
    </svg>
  );
}

export function EyeIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="7" cy="7" rx="5.5" ry="3.5" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  );
}

export function EyeOffIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 2l10 10" />
      <path d="M6 5.2A3 3 0 0 1 9.5 9M3.5 4A6.5 6.5 0 0 0 1.5 7c1 2.5 3 4 5.5 4 1 0 2-.3 2.8-.8" />
      <path d="M5 3.2A6.5 6.5 0 0 1 7 2.5c2.5 0 4.5 1.5 5.5 4a6.5 6.5 0 0 1-1.1 2" />
    </svg>
  );
}

export function ScissorsIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="3" cy="4" r="1.5" />
      <circle cx="3" cy="10" r="1.5" />
      <path d="M4.5 4.5L11 11M4.5 9.5L11 3" />
    </svg>
  );
}

export function SplitIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className={className}>
      <path d="M1 1.5h11M6.5 1.5v10M1 11.5h11" />
    </svg>
  );
}

export function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
      <path d="M10 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" />
    </svg>
  );
}

export function AudioLinesIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M2 5H4.5L7 2.5v9L4.5 9H2V5z" />
      <path d="M9.5 2a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function Trash2Icon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 4h10M5 4V3h4v1M4.5 4v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V4" />
    </svg>
  );
}

export function MusicIcon({ className = "" }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 10V3.5L10 2.5V9" />
      <circle cx="3" cy="10" r="1.5" />
      <circle cx="8.5" cy="9" r="1.5" />
    </svg>
  );
}

export function WarningIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6.5 1L12 12H1L6.5 1z" />
      <path d="M6.5 5v3M6.5 9.5v.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Icons.tsx
git commit -m "feat: add shared SVG icon components"
```

---

## Task 2: Foundation — index.css and App.tsx

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update index.css body background**

In `frontend/src/index.css`, change the body rule:

```css
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f1f5f9;
  color: #0f172a;
}
```

(Changed `#f8f8f8` → `#f1f5f9` and `#1a1a1a` → `#0f172a`.)

- [ ] **Step 2: Update App.tsx shell and restoring screen**

In `frontend/src/App.tsx`, make these two changes:

1. Editor shell div — change `bg-gray-100` to `bg-slate-100`:
```tsx
<div className="flex flex-col h-screen bg-slate-100 text-slate-900 overflow-hidden">
```

2. Restoring state screen — change `bg-gray-900` to `bg-slate-50` and `text-gray-400` to `text-slate-400`:
```tsx
<div className="min-h-screen bg-slate-50 flex items-center justify-center">
  <span className="text-slate-400 text-sm">Opening project…</span>
</div>
```

3. Floating card — change `border-gray-200` to `border-slate-200`:
```tsx
<div className="flex-1 flex flex-col ml-2 mb-2 rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
```

4. Main preview area — change `bg-gray-100` to `bg-slate-100`:
```tsx
<main className="flex-1 flex items-center justify-center bg-slate-100 min-w-0">
```

- [ ] **Step 3: Verify in browser**

```bash
pnpm --prefix frontend dev
```

Open `http://localhost:5173`. The shell background should be a slightly bluer cool gray (slate-100 vs the old warm gray-100). No other changes yet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/App.tsx
git commit -m "style: update shell background to slate-100"
```

---

## Task 3: Header

**Files:**
- Modify: `frontend/src/components/Header/Header.tsx`

- [ ] **Step 1: Replace the full Header component**

```tsx
// frontend/src/components/Header/Header.tsx
import { useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { AspectRatio } from "../../types/project";
import { exportProject } from "../../lib/api";
import { UndoIcon, RedoIcon, ChevronLeftIcon } from "../Icons";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3"];

export default function Header() {
  const { project, setProjectName, setAspectRatio, undo, redo, history, future, saveAsJson, loadFromJson, closeProject } =
    useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      const blob = await exportProject(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      alert("Export failed: " + String(e));
    }
  }

  function handleLoadJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadFromJson(ev.target?.result as string);
    reader.readAsText(file);
  }

  return (
    <header className="h-9 flex items-center px-3 gap-2 flex-shrink-0 bg-white border-b border-slate-200">
      {/* Left group */}
      <div className="flex items-center gap-2 flex-1">
        <button
          onClick={closeProject}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
        >
          <ChevronLeftIcon />
          Projects
        </button>
        <div className="w-px h-3.5 bg-slate-200" />
        <div className="flex gap-0.5">
          <button
            onClick={undo}
            disabled={!history.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors"
            title="Undo (⌘Z)"
          >
            <UndoIcon />
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors"
            title="Redo (⌘⇧Z)"
          >
            <RedoIcon />
          </button>
        </div>
        <select
          value={project.aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          className="text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700 cursor-pointer"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Center group — project name */}
      <div className="flex items-center justify-center">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-teal-500 rounded px-1 w-44 text-center text-slate-900"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        <button onClick={saveAsJson} className="px-2 py-0.5 text-xs rounded hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer transition-colors">
          Save JSON
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="px-2 py-0.5 text-xs rounded hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer transition-colors">
          Load JSON
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadJson} />
        <button
          onClick={handleExport}
          className="px-3 py-0.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 font-semibold cursor-pointer transition-colors"
        >
          Export
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify**

Reload `http://localhost:5173`. Header should show: chevron-SVG back button, SVG undo/redo icons, slate border on bottom, teal Export button.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header/Header.tsx
git commit -m "style: header — SVG icons, slate colors, teal export"
```

---

## Task 4: Left Panel

**Files:**
- Modify: `frontend/src/components/LeftPanel/LeftPanel.tsx`

- [ ] **Step 1: Replace LeftPanel**

```tsx
// frontend/src/components/LeftPanel/LeftPanel.tsx
import { useRef, useState } from "react";
import TranscriptTab from "./TranscriptTab";
import { useProjectStore } from "../../store/useProjectStore";
import { WarningIcon, Trash2Icon } from "../Icons";

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

interface Props { seek: (t: number) => void }

function TranscriptIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0f766e" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 5h12M4 9h12M4 13h8" />
    </svg>
  );
}

export default function LeftPanel({ seek }: Props) {
  const { transcriptSelection, setTranscriptSelection, deleteTimeRange } = useProjectStore();
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: panelRef.current?.offsetWidth ?? 300 };

    function onMove(ev: MouseEvent) {
      if (!dragState.current || !panelRef.current) return;
      const delta = ev.clientX - dragState.current.startX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta));
      panelRef.current.style.width = `${newW}px`;
    }
    function onUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleDeleteSelection() {
    if (!transcriptSelection) return;
    deleteTimeRange(transcriptSelection.startTime, transcriptSelection.endTime);
    setTranscriptSelection(null);
  }

  return (
    <div className="flex flex-shrink-0 border-r border-slate-200">
      {/* Vertical icon strip */}
      <div className="w-[60px] flex flex-col items-center pt-3 gap-0.5 bg-white border-r border-slate-100">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-[52px] flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg transition-colors cursor-pointer
            ${open
              ? "bg-teal-50 text-teal-700"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
          title="Transcript"
        >
          <TranscriptIcon active={open} />
          <span className={`text-[9px] font-bold leading-none tracking-wide uppercase ${open ? "text-teal-700" : "text-slate-400"}`}>
            Transcript
          </span>
        </button>
      </div>

      {/* Expandable transcript content */}
      {open && (
        <div
          ref={panelRef}
          className="relative flex flex-col bg-white"
          style={{ width: 280 }}
        >
          {transcriptSelection && (
            <div className="flex items-center px-3 py-1.5 border-b border-amber-200 bg-amber-50 flex-shrink-0 gap-2">
              <WarningIcon className="text-amber-500 flex-shrink-0" />
              <span className="text-[11px] text-amber-800 flex-1 font-medium">
                {(transcriptSelection.endTime - transcriptSelection.startTime).toFixed(1)}s selected
              </span>
              <button
                onClick={() => setTranscriptSelection(null)}
                className="text-[11px] text-amber-600 hover:text-amber-800 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelection}
                className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 font-semibold px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 transition-colors cursor-pointer"
              >
                <Trash2Icon />
                Delete
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TranscriptTab seek={seek} />
          </div>
          {/* Resize handle on right edge */}
          <div
            className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-teal-400 transition-colors"
            onMouseDown={onResizeMouseDown}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Reload. The left icon strip should have a teal-50 active state for Transcript. Drag-select some transcript words and confirm the selection bar is amber (not red), with clear "Cancel" and "Delete" buttons.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LeftPanel/LeftPanel.tsx
git commit -m "style: left panel — teal strip, amber selection bar, SVG icons"
```

---

## Task 5: Transcript Tab

**Files:**
- Modify: `frontend/src/components/LeftPanel/TranscriptTab.tsx`

- [ ] **Step 1: Update word highlight classes**

Three targeted find-and-replace changes in `TranscriptTab.tsx`:

**1. Active word** — find and replace the exact string:
```
"bg-yellow-200 text-yellow-900"
```
Replace with:
```
"bg-teal-50 text-teal-700"
```

**2. Past word color** — find the `isPast` branch. It currently reads something like `"text-gray-400"`. Grep for it:
```bash
grep -n "isPast\|text-gray-4" frontend/src/components/LeftPanel/TranscriptTab.tsx
```
Change the past-word color class to `"text-slate-400"`.

**3. Default word + font size** — find the default (non-active, non-past, non-selected) word class. It will be the final `else`/default branch in the className ternary. Change it to include `text-slate-700 hover:bg-slate-100`. Then find the `<div>` wrapping the entire word flow (the prose container) and add `text-[13px] leading-relaxed` to its className.

Grep to find the container:
```bash
grep -n "prose\|word-flow\|leading\|font-size\|text-sm\|text-xs" frontend/src/components/LeftPanel/TranscriptTab.tsx | head -20
```

The container is the `<div>` that wraps the entire `{project.captions.map(...)}` render. Add `text-[13px] leading-relaxed` to it.

- [ ] **Step 2: Verify**

Play a video. Words should be 13px, comfortably readable. The active word should glow teal instead of yellow. Past words should be slate-400 (cool gray, not warm gray).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LeftPanel/TranscriptTab.tsx
git commit -m "style: transcript — 13px words, teal active highlight, slate past"
```

---

## Task 6: Right Panel

**Files:**
- Modify: `frontend/src/components/RightPanel/RightPanel.tsx`

- [ ] **Step 1: Replace RightPanel**

```tsx
// frontend/src/components/RightPanel/RightPanel.tsx
import { useProjectStore } from "../../store/useProjectStore";
import ClipPropertiesPanel from "../LeftPanel/ClipPropertiesPanel";
import MediaTab from "../LeftPanel/MediaTab";

function PropertiesIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0f766e" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l1.42-1.42M4.22 15.78l1.42-1.42" />
    </svg>
  );
}

function MediaIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0f766e" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="13" rx="2" />
      <path d="M8 8.5l5 2.5-5 2.5V8.5z" fill={active ? "#0f766e" : "#94a3b8"} stroke="none" />
    </svg>
  );
}

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

export default function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useProjectStore();

  return (
    <div className="flex flex-shrink-0">
      {/* Slide-in content panel */}
      {rightPanelTab !== null && (
        <div className="w-[260px] flex flex-col bg-white border-l border-r border-slate-200">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => setRightPanelTab(null)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Close panel"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </button>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              {TABS.find((t) => t.id === rightPanelTab)?.label}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {rightPanelTab === "properties" ? <ClipPropertiesPanel /> : <MediaTab />}
          </div>
        </div>
      )}

      {/* Vertical icon strip */}
      <div className="w-[64px] flex flex-col items-center pt-4 gap-1 bg-slate-50 border-l border-slate-200">
        {TABS.map(({ id, label, icon }) => {
          const active = rightPanelTab === id;
          return (
            <button
              key={id}
              onClick={() => setRightPanelTab(active ? null : id)}
              className={`w-[52px] flex flex-col items-center gap-1 py-3 px-1 rounded-lg transition-colors cursor-pointer
                ${active
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
              title={label}
            >
              {icon(active)}
              <span className={`text-[9px] font-bold leading-none tracking-wide uppercase ${active ? "text-teal-700" : "text-slate-400"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Click a clip. Right panel opens. Icon strip should be slate-50. Active tab button should be teal-50 with teal text. Panel header label should be uppercase tracked slate-400.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RightPanel/RightPanel.tsx
git commit -m "style: right panel — slate strip, teal active, uppercase labels"
```

---

## Task 7: Clip Properties Panel

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

- [ ] **Step 1: Update accent color and gray→slate**

In `ClipPropertiesPanel.tsx`, make these find-and-replace changes:

1. `accent-blue-500` → `accent-teal-600` (appears on all `<input type="range">` elements)
2. `focus:ring-blue-400` → `focus:ring-teal-500`
3. `text-gray-400` → `text-slate-400`
4. `text-gray-600` → `text-slate-600`
5. `border-gray-200` → `border-slate-200`

Also update the `Section` helper component's title:
```tsx
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-4 space-y-3">
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{title}</p>
      {children}
    </div>
  );
}
```

And `SliderRow` label colors:
```tsx
<span className="text-xs text-slate-600">{label}</span>
<span className="text-[11px] text-slate-400 tabular-nums">{format ? format(value) : value}</span>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx
git commit -m "style: clip properties — teal accent, slate text colors"
```

---

## Task 8: Timeline container and track label sidebar

**Files:**
- Modify: `frontend/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Replace Timeline**

The key changes: slate colors throughout, track label rows get colored dots + uppercase names + SVG icon buttons, scrubber fill becomes teal.

```tsx
// frontend/src/components/Timeline/Timeline.tsx
import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TextOverlayTrack from "./TextOverlayTrack";
import CaptionTimelineTrack from "./CaptionTimelineTrack";
import { Volume2Icon, VolumeXIcon, EyeIcon, EyeOffIcon } from "../Icons";

const LABEL_WIDTH = 110;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_TRACK_H = 40;
const MIN_TRACK_H = 28;
const MAX_TRACK_H = 160;

const TRACK_DOT_COLORS: Record<string, string> = {
  video: "bg-teal-500",
  audio: "bg-emerald-500",
};

interface Props {
  toggle: () => void;
  seek: (time: number) => void;
}

export default function Timeline({ toggle, seek }: Props) {
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden } = useProjectStore();
  const [height, setHeight] = useState(200);
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const dragTrackRef = useRef<{ key: string; startY: number; startH: number } | null>(null);

  const trackH = (key: string) => trackHeights[key] ?? DEFAULT_TRACK_H;

  function onTrackResizeDown(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragTrackRef.current = { key, startY: e.clientY, startH: trackH(key) };
    function onMove(ev: MouseEvent) {
      if (!dragTrackRef.current) return;
      const newH = Math.min(MAX_TRACK_H, Math.max(MIN_TRACK_H, dragTrackRef.current.startH + ev.clientY - dragTrackRef.current.startY));
      setTrackHeights((p) => ({ ...p, [dragTrackRef.current!.key]: newH }));
    }
    function onUp() {
      dragTrackRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };

    function onMouseMove(ev: MouseEvent) {
      if (!dragState.current) return;
      const delta = dragState.current.startY - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragState.current.startHeight + delta)));
    }

    function onMouseUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  const totalDuration = Math.max(
    30,
    ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration))
  );
  const totalWidth = totalDuration * zoom + 200;

  function handleSplit() {
    const allClips = project.tracks.flatMap((t) => t.clips);
    const active = allClips.find(
      (c) => playheadTime > c.startTime && playheadTime < c.startTime + c.duration
    );
    if (active) splitClip(active.id, playheadTime);
  }

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        useProjectStore.getState().setZoom(zoom - e.deltaY * 0.5);
      }
    },
    [zoom]
  );

  const playheadX = playheadTime * zoom;
  const scrubberPct = totalDuration > 0 ? Math.min(1, playheadTime / totalDuration) * 100 : 0;

  return (
    <div className="flex flex-col bg-white border-t border-slate-200 flex-shrink-0" style={{ height }}>
      {/* Scrubber bar */}
      <div
        className="h-1 bg-slate-200 flex-shrink-0 relative cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width * totalDuration);
        }}
      >
        <div className="absolute left-0 top-0 h-full bg-teal-500 transition-none" style={{ width: `${scrubberPct}%` }} />
      </div>
      {/* Height resize handle */}
      <div
        className="h-1 cursor-ns-resize bg-transparent hover:bg-teal-400 transition-colors flex-shrink-0"
        onMouseDown={onDragHandleMouseDown}
      />
      <TimelineToolbar onSplit={handleSplit} toggle={toggle} seek={seek} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div className="flex-shrink-0 bg-slate-50 border-r border-slate-200" style={{ width: LABEL_WIDTH }}>
          <div className="h-6 border-b border-slate-200" />
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className="relative flex items-center gap-1.5 px-2 border-b border-slate-100"
              style={{ height: trackH(track.id) }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${TRACK_DOT_COLORS[track.type] ?? "bg-slate-400"}`} />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1 truncate">
                {track.type}
              </span>
              <button
                title={track.muted ? "Unmute track" : "Mute track"}
                onClick={() => setTrackMuted(track.id, !track.muted)}
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                  ${track.muted ? "text-amber-500 hover:text-amber-700" : "text-slate-400 hover:text-slate-600"}`}
              >
                {track.muted ? <VolumeXIcon /> : <Volume2Icon />}
              </button>
              {track.type !== "audio" && (
                <button
                  title={track.hidden ? "Show track" : "Hide track"}
                  onClick={() => setTrackHidden(track.id, !track.hidden)}
                  className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                    ${track.hidden ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {track.hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown(track.id, e)}
              />
            </div>
          ))}
          {project.textOverlays.length > 0 && (
            <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("text") }}>
              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">text</span>
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("text", e)}
              />
            </div>
          )}
          {project.captions.length > 0 && (
            <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("captions") }}>
              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">captions</span>
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("captions", e)}
              />
            </div>
          )}
        </div>

        {/* Scrollable timeline */}
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onWheel={handleWheelZoom}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} seek={seek} />
            {project.tracks.map((track) => (
              <TimelineTrack key={track.id} track={track} zoom={zoom} height={trackH(track.id)} />
            ))}
            {project.textOverlays.length > 0 && (
              <TextOverlayTrack zoom={zoom} totalWidth={totalWidth} height={trackH("text")} />
            )}
            {project.captions.length > 0 && (
              <CaptionTimelineTrack zoom={zoom} totalWidth={totalWidth} seek={seek} height={trackH("captions")} />
            )}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
              style={{ left: playheadX }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Timeline should show: teal scrubber fill, teal-50 resize handles on hover, slate-50 label column, colored dots (teal for video, emerald for audio, amber for text, violet for captions), SVG mute/hide buttons.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Timeline/Timeline.tsx
git commit -m "style: timeline — slate colors, teal scrubber, SVG track icons, colored dots"
```

---

## Task 9: Timeline Toolbar

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineToolbar.tsx`

- [ ] **Step 1: Replace TimelineToolbar**

```tsx
// frontend/src/components/Timeline/TimelineToolbar.tsx
import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { SplitIcon } from "../Icons";

interface Props {
  onSplit: () => void;
  toggle: () => void;
  seek: (time: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

function parseTimecode(raw: string): number | null {
  const s = raw.trim();
  const colonParts = s.split(":");
  if (colonParts.length === 2) {
    const mins = parseFloat(colonParts[0]);
    const secs = parseFloat(colonParts[1]);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export default function TimelineToolbar({ onSplit, toggle, seek }: Props) {
  const { zoom, setZoom, addTrack, playheadTime, isPlaying, addTextOverlay } = useProjectStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(fmt(playheadTime));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const t = parseTimecode(draft);
    if (t !== null) seek(Math.max(0, t));
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") setEditing(false);
  }

  function handleAddText() {
    addTextOverlay({
      text: "Text",
      startTime: playheadTime,
      endTime: playheadTime + 3,
      x: 50,
      y: 50,
      fontSize: 32,
      color: "#ffffff",
      fontWeight: "bold",
      background: "transparent",
    });
  }

  const btnClass = "px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-medium cursor-pointer transition-colors";

  return (
    <div className="flex items-center px-3 py-1.5 bg-white border-b border-slate-200 text-xs flex-shrink-0">
      {/* Left: timecode */}
      <div className="flex-1 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            className="font-mono text-slate-800 bg-white border border-teal-400 rounded px-1 w-24 outline-none ring-1 ring-teal-400 text-[11px]"
            placeholder="0:00.00"
          />
        ) : (
          <span
            className="font-mono text-slate-500 cursor-text hover:text-teal-600 hover:underline underline-offset-2 w-24 text-[11px] font-medium"
            title="Click to enter timecode"
            onClick={startEdit}
          >
            {fmt(playheadTime)}
          </span>
        )}
      </div>

      {/* Center: playback + editing controls */}
      <div className="flex items-center gap-1.5">
        <button onClick={toggle} className={`${btnClass} w-8 flex items-center justify-center`}>
          {isPlaying ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="0" width="3.5" height="11"/><rect x="6.5" y="0" width="3.5" height="11"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="0,0 11,5.5 0,11"/></svg>
          )}
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <button onClick={onSplit} className={`${btnClass} flex items-center gap-1`}>
          <SplitIcon />
          Split (S)
        </button>
        <button onClick={() => addTrack("video")} className={btnClass}>+ Video</button>
        <button onClick={() => addTrack("audio")} className={btnClass}>+ Audio</button>
        <button onClick={handleAddText} className={btnClass} title="Add text overlay">T</button>
      </div>

      {/* Right: zoom */}
      <div className="flex-1 flex items-center gap-1.5 justify-end">
        <span className="text-slate-400 w-14 text-right text-[11px]">{Math.round(zoom)}px/s</span>
        <button onClick={() => setZoom(zoom - 15)} className={btnClass}>−</button>
        <button onClick={() => setZoom(zoom + 15)} className={btnClass}>+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Timeline/TimelineToolbar.tsx
git commit -m "style: timeline toolbar — slate buttons, SVG split icon, SVG play/pause"
```

---

## Task 10: Timeline Ruler and Track

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineRuler.tsx`
- Modify: `frontend/src/components/Timeline/TimelineTrack.tsx`

- [ ] **Step 1: Update TimelineRuler**

```tsx
// frontend/src/components/Timeline/TimelineRuler.tsx
import { useCallback, useRef } from "react";

interface Props {
  totalWidth: number;
  zoom: number;
  seek: (time: number) => void;
}

export default function TimelineRuler({ totalWidth, zoom, seek }: Props) {
  const rulerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      seek(Math.max(0, x / zoom));
    },
    [zoom, seek]
  );

  const ticks: React.ReactElement[] = [];
  const step = zoom >= 80 ? 1 : zoom >= 30 ? 5 : 10;
  const totalSeconds = Math.ceil(totalWidth / zoom) + step;
  for (let t = 0; t <= totalSeconds; t += step) {
    const x = t * zoom;
    ticks.push(
      <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: x }}>
        <div className="w-px h-2 bg-slate-300" />
        <span className="text-slate-400 text-[9px] mt-0.5 select-none whitespace-nowrap">{t}s</span>
      </div>
    );
  }

  return (
    <div
      ref={rulerRef}
      className="relative h-6 bg-slate-50 border-b border-slate-200 cursor-pointer flex-shrink-0"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {ticks}
    </div>
  );
}
```

- [ ] **Step 2: Update TimelineTrack**

```tsx
// frontend/src/components/Timeline/TimelineTrack.tsx
import type { Track } from "../../types/project";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineClip from "./TimelineClip";

interface Props { track: Track; zoom: number; height: number }

export default function TimelineTrack({ track, zoom, height }: Props) {
  const { moveClip, addClip, selectClip, files } = useProjectStore();

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("clipId");
    const fileId = e.dataTransfer.getData("fileId");
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dropTime = Math.max(0, x / zoom);

    if (clipId) {
      moveClip(clipId, track.id, dropTime);
    } else if (fileId) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        addClip(track.id, {
          fileId,
          startTime: dropTime,
          duration: file.duration,
          sourceStart: 0,
          sourceEnd: file.duration,
        });
      }
    }
  }

  return (
    <div
      className="border-b border-slate-100 relative bg-white hover:bg-slate-50"
      style={{ height }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={() => selectClip(null)}
    >
      {track.clips.map((clip) => (
        <TimelineClip key={clip.id} clip={clip} trackId={track.id} trackType={track.type} zoom={zoom} trackHeight={height} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Timeline/TimelineRuler.tsx frontend/src/components/Timeline/TimelineTrack.tsx
git commit -m "style: timeline ruler + track — slate colors"
```

---

## Task 11: Timeline Clips

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineClip.tsx`

- [ ] **Step 1: Replace TimelineClip**

The key changes: teal for video clips, emerald for audio, SVG icons in label prefix and menuItems.

```tsx
// frontend/src/components/Timeline/TimelineClip.tsx
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProjectStore } from "../../store/useProjectStore";
import type { Clip, TrackType } from "../../types/project";
import ClipContextMenu from "./ClipContextMenu";
import WaveformCanvas from "./WaveformCanvas";
import { MusicIcon, VolumeXIcon, ScissorsIcon, CopyIcon, AudioLinesIcon, Trash2Icon } from "../Icons";

interface Props {
  clip: Clip;
  trackId: string;
  trackType: TrackType;
  zoom: number;
  trackHeight: number;
}

export default function TimelineClip({ clip, trackId, trackType, zoom, trackHeight }: Props) {
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, files, playheadTime, selectedClipId } = useProjectStore();
  const isAudioTrack = trackType === "audio";
  const isSelected = selectedClipId === clip.id;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);
  const dragStartDuration = useRef(0);
  const dragStartSourceStart = useRef(0);
  const dragStartSourceEnd = useRef(0);

  const file = files.find((f) => f.id === clip.fileId);
  const label = file?.originalName ?? clip.fileId.slice(0, 8);

  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 4);

  function startDrag(e: React.MouseEvent, type: "move" | "trim-left" | "trim-right") {
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);

    dragStartX.current = e.clientX;
    dragStartTime.current = clip.startTime;
    dragStartDuration.current = clip.duration;
    dragStartSourceStart.current = clip.sourceStart;
    dragStartSourceEnd.current = clip.sourceEnd;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - dragStartX.current;
      const dt = dx / zoom;

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
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("clipId", clip.id);
    e.dataTransfer.setData("fromTrackId", trackId);
    e.dataTransfer.effectAllowed = "move";
  }

  const playheadInClip = playheadTime > clip.startTime && playheadTime < clip.startTime + clip.duration;

  const menuItems = [
    {
      label: "Split at Playhead",
      icon: <ScissorsIcon />,
      disabled: !playheadInClip,
      onClick: () => splitClip(clip.id, playheadTime),
    },
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      onClick: () => duplicateClip(clip.id),
    },
    ...(!isAudioTrack && !clip.muted ? [{
      label: "Detach Audio",
      icon: <AudioLinesIcon />,
      onClick: () => detachAudio(clip.id),
    }] : []),
    { label: "---", icon: null, onClick: () => {} },
    {
      label: "Delete",
      icon: <Trash2Icon />,
      danger: true,
      onClick: () => deleteClip(clip.id),
    },
  ];

  return (
    <>
      <div
        className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing
          ${isAudioTrack
            ? isSelected
              ? "bg-emerald-600 border-2 border-white ring-2 ring-emerald-500"
              : "bg-emerald-500 border border-emerald-600"
            : clip.muted
              ? isSelected
                ? "bg-teal-300 border-2 border-white ring-2 ring-teal-300 opacity-75"
                : "bg-teal-300 border border-teal-400 opacity-75"
              : isSelected
                ? "bg-teal-600 border-2 border-white ring-2 ring-teal-500"
                : "bg-teal-500 border border-teal-600"
          }`}
        style={{ left, width }}
        draggable
        onDragStart={onDragStart}
        onMouseDown={(e) => startDrag(e, "move")}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title="Drag to move · Drag edges to trim · Right-click for options"
      >
        {/* Trim left handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 ${isAudioTrack ? "bg-emerald-700" : "bg-teal-700"}`}
          onMouseDown={(e) => startDrag(e, "trim-left")}
        />
        {isAudioTrack && file && (
          <WaveformCanvas
            fileId={clip.fileId}
            fileDuration={file.duration}
            sourceStart={clip.sourceStart}
            sourceEnd={clip.sourceEnd}
            width={width}
            height={trackHeight - 8}
          />
        )}
        <span className="px-2 text-[10px] text-white font-semibold truncate pointer-events-none flex-1 relative z-10 flex items-center gap-1">
          {isAudioTrack && <MusicIcon className="flex-shrink-0" />}
          {!isAudioTrack && clip.muted && <VolumeXIcon className="flex-shrink-0" />}
          {label}
        </span>
        {/* Trim right handle */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 ${isAudioTrack ? "bg-emerald-700" : "bg-teal-700"}`}
          onMouseDown={(e) => startDrag(e, "trim-right")}
        />
      </div>

      {menu &&
        createPortal(
          <ClipContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems}
            onClose={() => setMenu(null)}
          />,
          document.body
        )}
    </>
  );
}
```

- [ ] **Step 2: Verify**

Clips should now be teal (video) and emerald (audio). Audio label shows music note SVG. Muted clip shows VolumeX SVG. Right-click shows context menu.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Timeline/TimelineClip.tsx
git commit -m "style: timeline clips — teal/emerald colors, SVG icons"
```

---

## Task 12: Context Menu

**Files:**
- Modify: `frontend/src/components/Timeline/ClipContextMenu.tsx`

- [ ] **Step 1: Update ClipContextMenu to accept ReactNode icons**

```tsx
// frontend/src/components/Timeline/ClipContextMenu.tsx
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ClipContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const menuWidth = 180;
  const menuHeight = items.length * 36 + 8;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.label === "---" ? (
          <div key={i} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
              ${item.disabled
                ? "text-slate-300 cursor-not-allowed"
                : item.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Timeline/ClipContextMenu.tsx
git commit -m "style: context menu — slate colors, ReactNode icon support"
```

---

## Task 13: Caption and Text Overlay Tracks

**Files:**
- Modify: `frontend/src/components/Timeline/CaptionTimelineTrack.tsx`
- Modify: `frontend/src/components/Timeline/TextOverlayTrack.tsx`

- [ ] **Step 1: Update CaptionTimelineTrack**

```tsx
// frontend/src/components/Timeline/CaptionTimelineTrack.tsx
import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  zoom: number;
  totalWidth: number;
  seek: (time: number) => void;
  height: number;
}

export default function CaptionTimelineTrack({ zoom, totalWidth, seek, height }: Props) {
  const { project, selectedCaptionId, selectCaption } = useProjectStore();

  return (
    <div className="relative border-b border-slate-100" style={{ width: totalWidth, height }}>
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
                ? "bg-violet-600 ring-1 ring-violet-400"
                : "bg-violet-400 hover:bg-violet-500"}`}
            style={{ left, width }}
            onClick={() => {
              selectCaption(cap.id);
              seek(cap.startTime);
            }}
            title={cap.text}
          >
            <span className="text-[9px] text-white font-semibold truncate pointer-events-none">
              {cap.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update TextOverlayTrack**

```tsx
// frontend/src/components/Timeline/TextOverlayTrack.tsx
import { useProjectStore } from "../../store/useProjectStore";

interface Props { zoom: number; totalWidth: number; height: number }

export default function TextOverlayTrack({ zoom, totalWidth, height }: Props) {
  const { project, deleteTextOverlay, selectOverlay, selectedOverlayId } = useProjectStore();
  const overlays = project.textOverlays;

  return (
    <div
      className="border-b border-slate-100 relative bg-amber-50"
      style={{ width: totalWidth, height }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 4);
        return (
          <div
            key={o.id}
            className={`absolute top-1 bottom-1 rounded bg-amber-400 border flex items-center overflow-hidden select-none cursor-pointer hover:bg-amber-500 group
              ${selectedOverlayId === o.id ? "border-white ring-2 ring-amber-300 bg-amber-500" : "border-amber-500"}`}
            style={{ left, width }}
            onMouseDown={(e) => { e.stopPropagation(); selectOverlay(o.id); }}
            onContextMenu={(e) => { e.preventDefault(); deleteTextOverlay(o.id); }}
          >
            <span className="px-2 text-[10px] text-white font-semibold truncate flex-1">
              T {o.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Timeline/CaptionTimelineTrack.tsx frontend/src/components/Timeline/TextOverlayTrack.tsx
git commit -m "style: caption track — violet, text overlay track — amber"
```

---

## Task 14: Project Picker

**Files:**
- Modify: `frontend/src/components/ProjectPicker/ProjectPicker.tsx`

- [ ] **Step 1: Replace ProjectPicker**

```tsx
// frontend/src/components/ProjectPicker/ProjectPicker.tsx
import { useState, useEffect } from "react";
import { listProjects, createProject, loadProject, renameProject, deleteProject } from "../../lib/api";
import { useProjectStore } from "../../store/useProjectStore";
import type { ProjectSummary } from "../../lib/api";

const THUMB_GRADIENTS = [
  "from-teal-400 to-emerald-500",
  "from-violet-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
];

export default function ProjectPicker() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const { openProject } = useProjectStore();

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    try {
      setProjects(await listProjects());
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(id: string) {
    try {
      openProject(await loadProject(id));
    } catch (e) {
      alert("Failed to open project: " + String(e));
    }
  }

  async function handleCreate() {
    const name = newName.trim() || "Untitled Project";
    setCreating(false);
    setNewName("");
    try {
      openProject(await createProject(name));
    } catch (e) {
      alert("Failed to create project: " + String(e));
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch (e) {
      alert("Failed to rename: " + String(e));
    }
  }

  async function handleDelete(id: string) {
    setOpenMenu(null);
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert("Failed to delete: " + String(e));
    }
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
    setOpenMenu(null);
  }

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col"
      onClick={() => setOpenMenu(null)}
    >
      {/* Top bar */}
      <div className="h-[52px] bg-white border-b border-slate-200 flex items-center px-7 gap-3 flex-shrink-0">
        <div className="w-7 h-7 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="3" width="12" height="10" rx="2" />
            <path d="M5.5 6.5l4 2-4 2V6.5z" fill="white" stroke="none" />
          </svg>
        </div>
        <span className="text-[15px] font-bold text-slate-900 tracking-tight">Video Editor</span>
      </div>

      {/* Content */}
      <div className="p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-7">
          <h1 className="text-[18px] font-bold text-slate-900 tracking-tight">Projects</h1>
          <button
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            onClick={() => setCreating(true)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
            New Project
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map((project, i) => {
              const gradient = THUMB_GRADIENTS[i % THUMB_GRADIENTS.length];
              return (
                <div
                  key={project.id}
                  className="relative group bg-white rounded-xl overflow-hidden cursor-pointer border border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-px transition-all"
                  onClick={() => handleOpen(project.id)}
                >
                  <div className={`bg-gradient-to-br ${gradient} aspect-video flex items-center justify-center`}>
                    <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-slate-600 translate-x-px">
                        <polygon points="2,1 11,6 2,11" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                  </div>
                  <div className="p-3">
                    {renamingId === project.id ? (
                      <input
                        autoFocus
                        className="text-sm font-semibold bg-slate-100 text-slate-900 rounded px-1 w-full outline-none ring-1 ring-teal-500"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => handleRename(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(project.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <p className="text-sm font-semibold text-slate-900 truncate">{project.name}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(project.updated_at)}</p>
                  </div>

                  <button
                    className="absolute top-2 right-2 w-6 h-6 rounded-md bg-white/85 border border-slate-200 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-white cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === project.id ? null : project.id);
                    }}
                  >
                    ···
                  </button>

                  {openMenu === project.id && (
                    <div
                      className="absolute top-8 right-2 bg-white border border-slate-200 rounded-lg shadow-xl z-10 min-w-28 overflow-hidden py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                        onClick={() => startRename(project.id, project.name)}
                      >
                        Rename
                      </button>
                      <button
                        className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={() => handleDelete(project.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {creating ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2 justify-center min-h-32">
                <input
                  autoFocus
                  className="text-sm bg-slate-50 text-slate-900 rounded-lg px-2 py-1.5 outline-none ring-1 ring-teal-500 border border-slate-200 w-full"
                  placeholder="Project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 text-xs py-1.5 bg-teal-600 hover:bg-teal-700 rounded-lg text-white font-semibold transition-colors cursor-pointer"
                    onClick={handleCreate}
                  >
                    Create
                  </button>
                  <button
                    className="flex-1 text-xs py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
                    onClick={() => { setCreating(false); setNewName(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="bg-transparent rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-32 transition-all group"
                onClick={() => setCreating(true)}
              >
                <div className="w-8 h-8 rounded-full border-2 border-slate-300 group-hover:border-teal-500 flex items-center justify-center transition-colors">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400 group-hover:text-teal-500 transition-colors">
                    <path d="M7 1v12M1 7h12"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-400 group-hover:text-teal-600 transition-colors">New Project</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}
```

- [ ] **Step 2: Verify**

Navigate to the project picker (close the current project or open fresh). Should show: white topbar with teal logo mark, slate-50 background, white project cards with gradient thumbnails, teal "New Project" button, hover states.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProjectPicker/ProjectPicker.tsx
git commit -m "style: project picker — light mode, topbar, gradient thumbnails, teal CTA"
```

---

## Task 15: Final verification pass

- [ ] **Step 1: Run TypeScript check**

```bash
pnpm --prefix frontend build
```

Expected: no type errors. If TypeScript complains about `React.ReactNode` in ClipContextMenu's `MenuItem`, ensure `import React from "react"` or `import type { ReactNode } from "react"` is present and the interface uses `ReactNode`.

- [ ] **Step 2: Smoke-test the full editor**

Open `http://localhost:5173`. Check:
- ProjectPicker: light, topbar visible, gradient thumbnails, teal CTA
- Open a project: editor shell is slate-100, header has teal Export button
- Transcript: 13px words, teal active word, amber selection bar when words are drag-selected
- Click a clip: right panel opens with teal-50 active icon, slate panel header
- Timeline: teal scrubber fill, teal/emerald clips, violet caption clips, amber text overlay clips
- Timeline track labels: colored dots, uppercase names, SVG mute/hide buttons
- Right-click a clip: white context menu with SVG icons
- Mute a track: VolumeX SVG appears (amber-colored), no emoji

- [ ] **Step 3: Commit all remaining changes if any**

```bash
git add -A
git status  # confirm only intentional files are staged
git commit -m "style: final verification pass — full retheme complete"
```
