# Animated Belly Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pill-shaped, slide-up/slide-down animated belly band overlay to the video editor, configurable via a new properties panel.

**Architecture:** Extend the existing `TextOverlay` type with four optional fields (`shape`, `animateIn`, `animateOut`, `animateDuration`). The renderer computes a progress value from the live playhead position and applies CSS transform + opacity inline — no animation library needed. A new "Belly Band" toolbar button inserts a pre-styled overlay, and a new properties panel exposes text, colors, position, and animation duration.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS. Dev server: `cd frontend && pnpm dev`. Type-check: `cd frontend && pnpm build`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/types/project.ts` | Modify | Add 4 optional fields to `TextOverlay` |
| `frontend/src/components/Preview/TextOverlayRenderer.tsx` | Modify | Progress-based animation + pill styling |
| `frontend/src/components/Timeline/TimelineToolbar.tsx` | Modify | Add Belly Band button |
| `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx` | Create | Properties UI for text overlays |
| `frontend/src/components/RightPanel/RightPanel.tsx` | Modify | Route `selectedOverlayId` to new panel |

---

### Task 1: Extend the TextOverlay type

**Files:**
- Modify: `frontend/src/types/project.ts`

- [ ] **Step 1: Add 4 optional fields to `TextOverlay`**

Find the `TextOverlay` interface (currently lines 98–109) and replace it:

```typescript
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
  shape?: "pill";
  animateIn?: "slide-up";
  animateOut?: "slide-down";
  animateDuration?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && pnpm build
```

Expected: build succeeds with no type errors. (Existing code never sets the new fields, so they're safely optional.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/project.ts
git commit -m "feat(belly-band): add shape/animation fields to TextOverlay type"
```

---

### Task 2: Update the renderer with animation and pill styling

**Files:**
- Modify: `frontend/src/components/Preview/TextOverlayRenderer.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function pillProgress(time: number, startTime: number, endTime: number, animateDuration: number): number {
  const dur = Math.min(animateDuration, (endTime - startTime) / 2);
  const t = Math.min((time - startTime) / dur, (endTime - time) / dur, 1);
  return easeOutCubic(Math.max(0, t));
}

export default function TextOverlayRenderer({ time }: Props) {
  const { project } = useProjectStore();
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => {
        if (o.shape === "pill") {
          const progress = pillProgress(time, o.startTime, o.endTime, o.animateDuration ?? 0.4);
          return (
            <div
              key={o.id}
              className="absolute pointer-events-none"
              style={{
                left: `${o.x}%`,
                top: `${o.y}%`,
                transform: `translate(-50%, -50%) translateY(${(1 - progress) * 30}px)`,
                opacity: progress,
                fontSize: o.fontSize,
                color: o.color,
                fontWeight: o.fontWeight,
                background: o.background,
                padding: "8px 20px",
                borderRadius: 9999,
                whiteSpace: "nowrap",
              }}
            >
              {o.text}
            </div>
          );
        }
        return (
          <div
            key={o.id}
            className="absolute pointer-events-none"
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              fontSize: o.fontSize,
              color: o.color,
              fontWeight: o.fontWeight,
              background: o.background === "transparent" ? undefined : o.background,
              padding: o.background !== "transparent" ? "2px 8px" : undefined,
              borderRadius: o.background !== "transparent" ? 4 : undefined,
              transform: "translate(-50%, -50%)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
              whiteSpace: "pre-wrap",
              maxWidth: "90%",
              textAlign: "center",
            }}
          >
            {o.text}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Start the dev server (`pnpm dev`), open the app, add a plain text overlay ("T" button), scrub over it — it should render as before with no regressions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Preview/TextOverlayRenderer.tsx
git commit -m "feat(belly-band): add pill shape rendering and slide-up/down animation to renderer"
```

---

### Task 3: Add the Belly Band toolbar button

**Files:**
- Modify: `frontend/src/components/Timeline/TimelineToolbar.tsx`

- [ ] **Step 1: Add `handleAddBellyBand` after the existing `handleAddText` function** (around line 65)

```tsx
function handleAddBellyBand() {
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
}
```

- [ ] **Step 2: Add the button next to the existing "T" button** (line 113)

Replace:
```tsx
<button type="button" onClick={handleAddText} className={btnClass} title="Add text overlay">T</button>
```
With:
```tsx
<button type="button" onClick={handleAddText} className={btnClass} title="Add text overlay">T</button>
<button type="button" onClick={handleAddBellyBand} className={btnClass} title="Add belly band overlay">Belly Band</button>
```

- [ ] **Step 3: Verify types compile**

```bash
cd frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 4: Manual check**

In the running app, click "Belly Band" — a purple pill overlay should appear in the timeline at the playhead. Scrub through it in the preview and confirm it slides up and down.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Timeline/TimelineToolbar.tsx
git commit -m "feat(belly-band): add Belly Band button to timeline toolbar"
```

---

### Task 4: Create the TextOverlayPropertiesPanel

**Files:**
- Create: `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useProjectStore } from "../../store/useProjectStore";
import { Section, SliderRow } from "../properties-helpers";

export default function TextOverlayPropertiesPanel() {
  const { project, selectedOverlayId, updateTextOverlay } = useProjectStore();
  const overlay = project.textOverlays.find((o) => o.id === selectedOverlayId);
  if (!overlay) return null;

  function update(patch: Parameters<typeof updateTextOverlay>[1]) {
    updateTextOverlay(overlay!.id, patch);
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Section title="Text">
        <textarea
          aria-label="Overlay text"
          value={overlay.text}
          onChange={(e) => update({ text: e.target.value })}
          rows={3}
          className="w-full text-[12px] border border-black/[0.1] rounded-md px-2 py-1.5 resize-none outline-none focus:border-[#0ea5a0] bg-white text-[#141416]"
        />
      </Section>
      <div className="border-t border-black/[0.06]" />
      <Section title="Style">
        <div>
          <p className="text-xs text-[#6b6b78] mb-1">Background color</p>
          <input
            type="color"
            aria-label="Background color"
            value={overlay.background === "transparent" ? "#000000" : overlay.background}
            onChange={(e) => update({ background: e.target.value })}
            className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
          />
        </div>
        <div>
          <p className="text-xs text-[#6b6b78] mb-1">Text color</p>
          <input
            type="color"
            aria-label="Text color"
            value={overlay.color}
            onChange={(e) => update({ color: e.target.value })}
            className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
          />
        </div>
      </Section>
      <div className="border-t border-black/[0.06]" />
      <Section title="Position">
        <SliderRow
          label="X"
          value={overlay.x}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update({ x: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Y"
          value={overlay.y}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update({ y: v })}
          format={(v) => `${v}%`}
        />
      </Section>
      {overlay.shape === "pill" && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Animation">
            <SliderRow
              label="Animate duration"
              value={overlay.animateDuration ?? 0.4}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(v) => update({ animateDuration: v })}
              format={(v) => `${v.toFixed(2)}s`}
            />
          </Section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx
git commit -m "feat(belly-band): add TextOverlayPropertiesPanel with text, color, position, and animation controls"
```

---

### Task 5: Wire up the properties panel in RightPanel

**Files:**
- Modify: `frontend/src/components/RightPanel/RightPanel.tsx`

- [ ] **Step 1: Add the import** at the top of the file, after the existing panel imports

```tsx
import TextOverlayPropertiesPanel from "./TextOverlayPropertiesPanel";
```

- [ ] **Step 2: Destructure `selectedOverlayId` from the store** (line 54)

Replace:
```tsx
const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId, selectedTransitionId, selectedItemIds, selectedClipId, project } = useProjectStore();
```
With:
```tsx
const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId, selectedTransitionId, selectedItemIds, selectedClipId, selectedOverlayId, project } = useProjectStore();
```

- [ ] **Step 3: Add the `selectedOverlayId` branch** in the properties content (around line 91)

Replace:
```tsx
: selectedEffectOverlayId ? <EffectPropertiesPanel />
: selectedTransitionId ? <TransitionPropertiesPanel />
: isAudioClip ? <AudioPropertiesPanel />
: <ClipPropertiesPanel />
```
With:
```tsx
: selectedEffectOverlayId ? <EffectPropertiesPanel />
: selectedTransitionId ? <TransitionPropertiesPanel />
: selectedOverlayId ? <TextOverlayPropertiesPanel />
: isAudioClip ? <AudioPropertiesPanel />
: <ClipPropertiesPanel />
```

- [ ] **Step 4: Verify types compile**

```bash
cd frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 5: End-to-end manual verification**

With the dev server running (`pnpm dev`):

1. Click "Belly Band" in the toolbar — purple pill appears in the timeline track
2. Press play — pill slides up at `startTime`, holds, then slides down before `endTime`
3. Scrub manually through the in/out zones — pill position and opacity are correct at every point
4. Click the overlay in the timeline — right panel opens to Properties showing Text, Style, Position, and Animation sections
5. Edit the text field — preview updates immediately
6. Drag the X slider — pill moves horizontally in the preview
7. Drag the Y slider — pill moves vertically
8. Change background color — pill color changes live
9. Adjust "Animate duration" — longer/shorter slide animation
10. Press Cmd+Z — last change undoes correctly
11. Click the "T" button to add a plain text overlay, click it — panel shows Text, Style, Position (no Animation section), and renders as before without pill styling

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RightPanel/RightPanel.tsx
git commit -m "feat(belly-band): wire TextOverlayPropertiesPanel into RightPanel"
```
