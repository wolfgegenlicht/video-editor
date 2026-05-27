# Animated Belly Band — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Context

The video editor has a `TextOverlay` system for placing static text on the preview. Users need an "animated belly band" — a pill-shaped social-tag overlay that slides up into view and slides back down on exit, positioned freely anywhere in the frame. This is common in social media clips and podcast highlight reels.

The chosen approach extends the existing `TextOverlay` type with optional animation and shape fields, reusing all existing store actions, timeline rendering, and undo/redo infrastructure.

---

## Data Model

**File:** `frontend/src/types/project.ts`

Add four optional fields to `TextOverlay`:

```typescript
export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;          // 0–100, % of preview width
  y: number;          // 0–100, % of preview height
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  background: string;
  // New — belly band fields (all optional; absent = existing plain-text behavior)
  shape?: "pill";
  animateIn?: "slide-up";
  animateOut?: "slide-down";
  animateDuration?: number;   // seconds, default 0.4
}
```

Existing plain text overlays (no `shape` field) are entirely unaffected.

---

## Renderer

**File:** `frontend/src/components/Preview/TextOverlayRenderer.tsx`

For each active overlay where `shape === "pill"`, compute an animation `progress` (0→1) from the playhead position `time`:

- **In phase** (`time < startTime + animateDuration`): `progress = easeOutCubic((time - startTime) / animateDuration)`
- **Hold phase**: `progress = 1`
- **Out phase** (`time > endTime - animateDuration`): `progress = easeOutCubic((endTime - time) / animateDuration)`

```typescript
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
```

Applied styles for `slide-up` / `slide-down`:

```
translateY: (1 - progress) * 30px
opacity:    progress
```

Pill shape styling (replaces the current text-shadow/plain div style):

```
borderRadius: 9999px
padding: 8px 20px
background: o.background
color: o.color
fontWeight: o.fontWeight
fontSize: o.fontSize
```

Plain text overlays (`shape` absent) render exactly as before — the new code is gated on `shape === "pill"`.

---

## Toolbar Button

**File:** `frontend/src/components/Timeline/TimelineToolbar.tsx`

Add a "Belly Band" button next to the existing "T" (Add Text) button. On click:

```typescript
addTextOverlay({
  text: "Your text here",
  startTime: playheadTime,
  endTime: playheadTime + 5,
  x: 50,
  y: 85,
  fontSize: 20,
  color: "#ffffff",
  fontWeight: "bold",
  background: "#7c3aed",
  shape: "pill",
  animateIn: "slide-up",
  animateOut: "slide-down",
  animateDuration: 0.4,
});
```

Uses the existing `addTextOverlay` store action — no new actions needed.

---

## Properties Panel

**New file:** `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

Shown when a `TextOverlay` is selected. Controls:

| Control | Field | Notes |
|---|---|---|
| Text input | `text` | Multiline supported |
| Background color | `background` | Pill fill color |
| Text color | `color` | |
| X position slider | `x` | 0–100% |
| Y position slider | `y` | 0–100% |
| Animate duration slider | `animateDuration` | 0.1–1.0s, shown only when `shape === "pill"` |

All controls call `updateTextOverlay(id, patch)` on change — existing action, undo/redo comes free.

**File:** `frontend/src/components/RightPanel/RightPanel.tsx`

Add a branch for `selectedOverlayId` before the fallthrough to `ClipPropertiesPanel`:

```tsx
: selectedOverlayId ? <TextOverlayPropertiesPanel />
: isAudioClip ? <AudioPropertiesPanel />
: <ClipPropertiesPanel />
```

Import `selectedOverlayId` from `useProjectStore`.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `src/types/project.ts` | Add 4 optional fields to `TextOverlay` |
| `src/components/Preview/TextOverlayRenderer.tsx` | Add progress-based animation + pill styling |
| `src/components/Timeline/TimelineToolbar.tsx` | Add "Belly Band" button |
| `src/components/RightPanel/RightPanel.tsx` | Add `selectedOverlayId` branch |
| `src/components/RightPanel/TextOverlayPropertiesPanel.tsx` | **New** — properties UI |

---

## Verification

1. Start the dev server (`cd frontend && pnpm dev`)
2. Click "Belly Band" in the timeline toolbar — a pill overlay appears at the playhead position
3. Press play — the pill slides up at `startTime`, holds, then slides down at `endTime`
4. Scrub the playhead through the in/out zones — animation state is correct at every position
5. Select the overlay — the right panel opens with text, color, X/Y, and duration controls
6. Edit any control — change is reflected live in preview and is undoable (Cmd+Z)
7. Add a second plain text overlay (existing "T" button) — it renders without animation, unchanged
