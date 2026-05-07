# Design Spec: Full Retheme — Light Refined + Teal

**Date:** 2026-05-07  
**Scope:** Full visual retheme of all UI surfaces. No layout restructuring, no new features.

---

## Summary

Replace the current ad-hoc gray color system with a unified Light Refined design: slate color scale throughout, teal accent, SVG icon system replacing all emoji, refined typography scale, and the ProjectPicker flipped from dark to light mode. All existing layout, panel dimensions, and functionality are preserved exactly.

---

## 1. Color System

Replace all `gray-*` Tailwind classes with their `slate-*` equivalents. Apply teal as the single accent color.

| Role | Token | Hex |
|---|---|---|
| Primary text | `slate-900` | `#0f172a` |
| Body text | `slate-700` | `#334155` |
| Secondary text | `slate-600` | `#475569` |
| Muted text | `slate-400` | `#94a3b8` |
| Borders | `slate-200` | `#e2e8f0` |
| Subtle borders | `slate-100` | `#f1f5f9` |
| Panel background | `white` | `#ffffff` |
| Shell background | `slate-100` | `#f1f5f9` |
| Hover background | `slate-100` | `#f1f5f9` |
| **Accent** | `teal-600` | `#0d9488` |
| Accent hover | `teal-700` | `#0f766e` |
| Accent light bg | `teal-50` | `#f0fdfa` |
| Accent light border | `teal-100` | `#ccfbf1` |
| Active strip bg | `teal-50` | `#f0fdfa` |
| Active strip text | `teal-700` | `#0f766e` |
| Video clips | `teal-500` | `#14b8a6` |
| Video clip selected | `teal-700` | `#0f766e` |
| Audio clips | `emerald-500` | `#10b981` |
| Caption clips | `violet-500` | `#8b5cf6` |
| Text overlay clips | `amber-400` | `#fbbf24` |
| Playhead | `red-500` | `#ef4444` |
| Warning/selection | `amber-*` | amber scale |

All `focus:ring-blue-*` → `focus:ring-teal-500`. All `hover:bg-blue-*` → `hover:bg-teal-*`. Resize handles: `hover:bg-teal-400`.

---

## 2. Icon System

Remove all emoji from the UI. Replace with inline SVG icons sourced from [Lucide](https://lucide.dev) at 15×15px, `stroke-width="1.5"`, `stroke-linecap="round"`.

| Location | Current | Replacement |
|---|---|---|
| Timeline track — mute (on) | 🔇 | `VolumeX` |
| Timeline track — mute (off) | 🔈 | `Volume2` |
| Timeline track — hide (visible) | 👁 | `Eye` |
| Timeline track — hide (hidden) | 🚫 | `EyeOff` |
| Timeline toolbar — split | ✂️ | custom split-line SVG |
| Clip context menu — split | ✂️ | `Scissors` |
| Clip context menu — duplicate | ⧉ | `Copy` |
| Clip context menu — detach audio | 🔊 | `AudioLines` |
| Clip context menu — delete | 🗑 | `Trash2` |
| Audio clip label prefix | ♪ | `Music` (12px, inline) |
| Clip muted indicator | 🔇 | `VolumeX` (12px, inline) |
| Header undo | ↩ | `Undo2` |
| Header redo | ↪ | `Redo2` |
| Header back | ← | chevron-left SVG |
| Right panel close | chevron SVG (keep, already SVG) | no change |

All icon buttons must have `cursor-pointer` and a visible focus ring (`focus:outline-none focus:ring-2 focus:ring-teal-500`).

---

## 3. Typography Scale

| Element | Before | After |
|---|---|---|
| Icon strip label | 9px, medium | 9px, **700**, tracked (0.06em), uppercase |
| Panel section label | 10px, normal | 10px, **700**, tracked (0.08em), uppercase, slate-400 |
| Property label | 10px, normal | 11px, 500, slate-600 |
| Toolbar buttons | 10–12px | 11px, 500 |
| Transcript words | 11–12px | **13px**, 400, line-height 1.7, slate-700 |
| Clip labels | 10px, medium | 10px, **600**, white |
| Header project name | 13px, semibold | 13px, 600, tracking -0.01em |
| Project card name | 13px, medium | **13px, 600** |
| Project card date | 11px | 11px, slate-400 |
| Timecode display | font-mono, small | font-mono, 11px, 500, slate-600 |

Font stack: keep current `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

---

## 4. Component Changes

### Header (`Header.tsx`)

- Height stays `h-9` (36px) — no change needed, it works
- Back button: replace `←` text arrow with chevron SVG, `text-slate-500 hover:text-slate-800`
- Undo/redo: replace `↩`/`↪` with `Undo2`/`Redo2` SVG icons
- Aspect ratio select: `border-slate-200 bg-slate-50 text-slate-700`
- Project name input: `text-slate-900 focus:ring-teal-500`
- Save/Load JSON buttons: `border-slate-200 hover:bg-slate-100 text-slate-600`
- Export button: `bg-teal-600 hover:bg-teal-700 text-white`

### Left Panel (`LeftPanel.tsx`)

- Strip background: `bg-white border-r border-slate-200`
- Active strip button: `bg-teal-50 text-teal-700`
- Inactive strip button: `text-slate-400 hover:bg-slate-100 hover:text-slate-700`
- Panel label: uppercase tracked slate-400 label above transcript
- Transcript selection bar: change from red (`bg-red-50 border-red-100`) to amber (`bg-amber-50 border-amber-200`). Replace two `✕` buttons with explicit "Cancel" text button + "Delete" button with `Trash2` icon. Add warning triangle SVG icon on left.
- Resize handle: `hover:bg-teal-400`

### Transcript (`TranscriptTab.tsx`)

- Word font size: 13px (up from ~11px)
- Line height: 1.7
- Past words: `text-slate-400`
- Active word: `bg-teal-50 text-teal-700 rounded` (was yellow)
- Selected words: `bg-blue-100 text-blue-800` (keep blue for drag selection — distinct from active)

### Right Panel (`RightPanel.tsx`)

- Content panel: `bg-white border-l border-slate-200`
- Panel header label: uppercase tracked slate-400
- Strip background: `bg-slate-50 border-l border-slate-200`
- Active strip button: `bg-teal-50 text-teal-700`
- Inactive: `text-slate-400 hover:bg-slate-100`

### Timeline (`Timeline.tsx`, `TimelineToolbar.tsx`, `TimelineTrack.tsx`, `TimelineClip.tsx`)

- Timeline background: `bg-white border-t border-slate-200`
- Track labels column: `bg-slate-50 border-r border-slate-100`
- Track label rows: replace color text (`text-green-600`, `text-gray-500`, `text-purple-500`) with colored dot (`w-2 h-2 rounded-full`) + uppercase tracked name
- Mute/hide emoji buttons → SVG icon buttons (16×16, `text-slate-400 hover:text-slate-600`)
- Toolbar buttons: `border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600`
- Zoom label: `text-slate-400`
- Video clips: `bg-teal-500 border-teal-600` (selected: `bg-teal-700 ring-teal-500`)
- Audio clips: `bg-emerald-500 border-emerald-600`
- Trim handles: `bg-teal-700` / `bg-emerald-700`
- Ruler: `bg-slate-50 border-b border-slate-200`, tick text `text-slate-400`
- Playhead stays `bg-red-500`
- Scrubber fill: `bg-teal-500`
- Resize handle: `hover:bg-teal-400`

### Timeline Clip Context Menu (`ClipContextMenu.tsx`)

- Background: `bg-white border border-slate-200 shadow-lg`
- Item text: `text-slate-700 hover:bg-slate-50`
- Danger item: `text-red-600 hover:bg-red-50`
- Replace emoji icons in menu items with SVG (see icon table above)

### Project Picker (`ProjectPicker.tsx`)

- Container: `min-h-screen bg-slate-50` (was `bg-gray-900`)
- Add a topbar: `h-[52px] bg-white border-b border-slate-200` containing a teal logo mark (video-play icon) + "Video Editor" app name
- Section title: `text-slate-900 text-lg font-bold tracking-tight`
- "New Project" button: `bg-teal-600 hover:bg-teal-700 text-white` with `+` SVG icon, in header row next to title
- Project cards: `bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-px transition-all`
- Card thumbnail: colored gradient (cycle through a fixed array by index: `[teal→emerald, violet→indigo, amber→orange, rose→pink, sky→blue]`) with centered white play-icon overlay on a white/80 circle
- Card name: `text-slate-900 text-sm font-semibold`
- Card date: `text-slate-400 text-xs`
- Card menu button (···): `bg-white/90 border border-slate-200 text-slate-500`, appears on hover
- Context menu: `bg-white border border-slate-200 shadow-xl`
- New project placeholder card: dashed `border-slate-300 hover:border-teal-500 hover:bg-teal-50` — `+` SVG + "New Project" label, both shift to `text-teal-600` on hover
- Loading/restoring state: `min-h-screen bg-slate-50` with `text-slate-400` spinner text (was `bg-gray-900 text-gray-400`)

---

## 5. What Does Not Change

- All layout structure and component hierarchy
- Panel widths and the floating-card concept in the editor
- All resizing behavior (panels, timeline height, track heights)
- All collapse/expand toggle behavior
- All keyboard shortcuts and playback logic
- All business logic (store, API, hooks)
- No new features or functionality

---

## 6. Files Touched

| File | Change |
|---|---|
| `frontend/src/index.css` | Update body bg to `#f1f5f9`, font stack |
| `frontend/src/App.tsx` | Update shell bg class |
| `frontend/src/components/Header/Header.tsx` | Colors, SVG icons for undo/redo/back, button styles |
| `frontend/src/components/LeftPanel/LeftPanel.tsx` | Strip colors, selection bar redesign |
| `frontend/src/components/LeftPanel/TranscriptTab.tsx` | Font size, line height, word highlight colors |
| `frontend/src/components/RightPanel/RightPanel.tsx` | Strip + panel colors |
| `frontend/src/components/Timeline/Timeline.tsx` | Background, track label column, scrubber color |
| `frontend/src/components/Timeline/TimelineToolbar.tsx` | Button styles, SVG split icon |
| `frontend/src/components/Timeline/TimelineTrack.tsx` | Track label row: dot + uppercase + SVG buttons |
| `frontend/src/components/Timeline/TimelineClip.tsx` | Teal/emerald clip colors, SVG mute label icon |
| `frontend/src/components/Timeline/TimelineRuler.tsx` | Ruler bg + tick text color |
| `frontend/src/components/Timeline/CaptionTimelineTrack.tsx` | Color update |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Color update |
| `frontend/src/components/Timeline/ClipContextMenu.tsx` | Colors + SVG icons |
| `frontend/src/components/ProjectPicker/ProjectPicker.tsx` | Full light-mode retheme + topbar |
