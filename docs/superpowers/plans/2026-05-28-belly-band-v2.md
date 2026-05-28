# Belly Band v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend belly band with timeline drag interactions (move + resize), font size control, style template presets, and animated FFmpeg export rendering.

**Architecture:** Three isolated changes: (1) store + timeline drag for move/resize, (2) properties panel additions, (3) FFmpeg export for pill shape. Each task is independent and can be verified separately.

**Tech Stack:** React/TypeScript/Zustand (frontend), Python/FFmpeg (backend)

---

## Files to Modify

| File | Change |
|---|---|
| `frontend/src/store/useProjectStore.ts` | Add `trimTextOverlayLive` to interface + implementation |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | Add move drag + left/right resize handles |
| `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx` | Add fontSize slider + PILL_PRESETS template swatches |
| `backend/services/ffmpeg.py` | Extend text overlay section for pill shape (drawbox + animated drawtext) |

---

## Task 1: Store `trimTextOverlayLive` + Timeline Drag

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`
- Modify: `frontend/src/components/Timeline/TextOverlayTrack.tsx`

### Step 1.1 — Add `trimTextOverlayLive` to the store interface

In `useProjectStore.ts`, the `ProjectStore` interface is defined starting around line 45. Find the existing `updateTextOverlay` line (line 128) and add `trimTextOverlayLive` right after it:

```typescript
  updateTextOverlay: (id: string, patch: Partial<Omit<TextOverlay, "id">>) => void;
  trimTextOverlayLive: (id: string, startTime: number, endTime: number) => void;
  deleteTextOverlay: (id: string) => void;
```

- [ ] Open `frontend/src/store/useProjectStore.ts`, find line 128 (`updateTextOverlay`), add `trimTextOverlayLive` declaration on the line after it.

### Step 1.2 — Implement `trimTextOverlayLive` in the store

The implementation lives near `updateTextOverlay` (around line 782). Find the `updateTextOverlay` implementation and add `trimTextOverlayLive` right after it — it's a live action (no `withHistory`), mirroring the `trimClipLive` pattern:

```typescript
  trimTextOverlayLive: (id, startTime, endTime) =>
    set((s) => ({
      project: {
        ...s.project,
        textOverlays: s.project.textOverlays.map((o) =>
          o.id === id ? { ...o, startTime, endTime } : o
        ),
      },
    })),
```

- [ ] Add the implementation in `useProjectStore.ts` immediately after the `updateTextOverlay` implementation block.

### Step 1.3 — Rewrite `TextOverlayTrack.tsx` with drag + resize

Replace the entire file content with the following. This adds:
- Body drag → `moveSelectedItemsLive` / `moveSelectedItems` (commit on mouseup)
- Left 6px handle → adjusts `startTime`, clamps to `endTime - 0.5`
- Right 6px handle → adjusts `endTime`, clamps to `startTime + 0.5`

```tsx
import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";

interface Props { zoom: number; totalWidth: number; height: number }

export default function TextOverlayTrack({ zoom, totalWidth, height }: Props) {
  const { project, selectOverlay, selectedOverlayId, selectedItemIds, toggleItemSelection,
          moveSelectedItemsLive, moveSelectedItems, trimTextOverlayLive, updateTextOverlay } = useProjectStore();
  const overlays = project.textOverlays;

  function startDrag(
    e: React.MouseEvent,
    overlayId: string,
    mode: "move" | "left" | "right"
  ) {
    if (mode === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(overlayId);
      return;
    }
    e.stopPropagation();

    const { selectedItemIds: ids, project: proj } = useProjectStore.getState();
    const isMultiDrag = mode === "move" && ids.has(overlayId) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(proj, id)]))
      : new Map<string, number>();
    let lastMoves: Array<{ id: string; newStartTime: number }> = [];

    if (!isMultiDrag) selectOverlay(overlayId);

    const ov = proj.textOverlays.find((o) => o.id === overlayId)!;
    const origStart = ov.startTime;
    const origEnd = ov.endTime;
    const duration = origEnd - origStart;
    const startX = e.clientX;
    let lastStart = origStart;
    let lastEnd = origEnd;

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (isMultiDrag) {
        const newPrimary = Math.max(0, origStart + dt);
        const snappedDt = newPrimary - origStart;
        lastMoves = [...ids].map((id) => ({
          id,
          newStartTime: Math.max(0, (origPositions.get(id) ?? 0) + snappedDt),
        }));
        moveSelectedItemsLive(lastMoves);
        return;
      }
      if (mode === "move") {
        lastStart = Math.max(0, origStart + dt);
        lastEnd = lastStart + duration;
        moveSelectedItemsLive([{ id: overlayId, newStartTime: lastStart }]);
      } else if (mode === "left") {
        lastStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.5));
        lastEnd = origEnd;
        trimTextOverlayLive(overlayId, lastStart, lastEnd);
      } else {
        lastStart = origStart;
        lastEnd = Math.max(origStart + 0.5, origEnd + dt);
        trimTextOverlayLive(overlayId, lastStart, lastEnd);
      }
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (isMultiDrag && lastMoves.length > 0) {
        const originalMoves = [...origPositions.entries()].map(([id, newStartTime]) => ({ id, newStartTime }));
        moveSelectedItemsLive(originalMoves);
        moveSelectedItems(lastMoves);
        return;
      }
      if (mode === "move") {
        moveSelectedItems([{ id: overlayId, newStartTime: lastStart }]);
      } else {
        updateTextOverlay(overlayId, { startTime: lastStart, endTime: lastEnd });
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      role="presentation"
      className="border-b border-black/[0.06] relative bg-white"
      style={{ width: totalWidth, height }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 8);
        const isSelected = selectedOverlayId === o.id;
        const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(o.id);
        return (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none cursor-grab active:cursor-grabbing group
              ${isSelected
                ? "bg-purple-100 border border-purple-400 ring-1 ring-purple-300"
                : "bg-purple-100 border border-purple-300/50 hover:bg-purple-100/80"}
              ${isMultiSelected ? "ring-2 ring-purple-400/50" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => startDrag(e, o.id, "move")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectOverlay(o.id); }}
          >
            {/* Left resize handle */}
            <div
              role="presentation"
              className="absolute left-0 top-0 bottom-0 w-[6px] cursor-ew-resize z-10 hover:bg-purple-400/40"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, o.id, "left"); }}
            />
            <span className="px-2 text-[11px] text-purple-700 font-semibold truncate flex-1 pointer-events-none">
              T {o.text}
            </span>
            {/* Right resize handle */}
            <div
              role="presentation"
              className="absolute right-0 top-0 bottom-0 w-[6px] cursor-ew-resize z-10 hover:bg-purple-400/40"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, o.id, "right"); }}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] Replace the full content of `frontend/src/components/Timeline/TextOverlayTrack.tsx` with the code above.

### Step 1.4 — Type-check

```bash
cd frontend && pnpm build 2>&1 | head -40
```

Expected: no TypeScript errors related to `trimTextOverlayLive` or `TextOverlayTrack`.

- [ ] Run the type-check and confirm it passes.

### Step 1.5 — Manual verification

Start the dev server (`cd frontend && pnpm dev`), open the editor, add a belly band overlay from the timeline toolbar.

- Drag the block body left/right — it moves, releases at the new position (one undo step).
- Drag the left edge — `startTime` changes, block shrinks/grows from the left.
- Drag the right edge — `endTime` changes, block shrinks/grows from the right.
- Cannot resize below 0.5s duration.
- Cmd+drag adds to multi-selection; dragging a selected group moves all items together.

- [ ] Verify all five behaviors above manually in the browser.

### Step 1.6 — Commit

```bash
git add frontend/src/store/useProjectStore.ts frontend/src/components/Timeline/TextOverlayTrack.tsx
git commit -m "feat(belly-band-v2): add timeline move drag and resize handles for text overlays"
```

- [ ] Commit.

---

## Task 2: Font Size + Style Templates in Properties Panel

**Files:**
- Modify: `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx`

### Step 2.1 — Add `fontSize` slider and `PILL_PRESETS` template swatches

Replace the entire file content:

```tsx
import { useProjectStore } from "../../store/useProjectStore";
import { Section, SliderRow } from "../properties-helpers";

const PILL_PRESETS = [
  { label: "Purple", background: "#7c3aed", color: "#ffffff", fontWeight: "bold" as const },
  { label: "Dark",   background: "#1a1a2e", color: "#ffffff", fontWeight: "bold" as const },
  { label: "White",  background: "#ffffff", color: "#111111", fontWeight: "bold" as const },
  { label: "Teal",   background: "#0d9488", color: "#ffffff", fontWeight: "bold" as const },
  { label: "Warm",   background: "#d97706", color: "#ffffff", fontWeight: "bold" as const },
];

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
      {overlay.shape === "pill" && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Templates">
            <div className="flex gap-2 flex-wrap">
              {PILL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  title={p.label}
                  onClick={() => update({ background: p.background, color: p.color, fontWeight: p.fontWeight })}
                  className="w-6 h-6 rounded-full border-2 cursor-pointer transition-all"
                  style={{
                    background: p.background,
                    borderColor: overlay.background === p.background ? "#fff" : "transparent",
                    boxShadow: overlay.background === p.background
                      ? "0 0 0 1px #0d9488"
                      : "0 0 0 1px rgba(0,0,0,0.15)",
                  }}
                />
              ))}
            </div>
          </Section>
        </>
      )}
      <div className="border-t border-black/[0.06]" />
      <Section title="Style">
        <SliderRow
          label="Font size"
          value={overlay.fontSize}
          min={10}
          max={72}
          step={1}
          onChange={(v) => update({ fontSize: v })}
          format={(v) => `${v}px`}
        />
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

- [ ] Replace the full content of `frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx` with the code above.

### Step 2.2 — Type-check

```bash
cd frontend && pnpm build 2>&1 | head -40
```

Expected: no errors.

- [ ] Run the type-check.

### Step 2.3 — Manual verification

In the browser with dev server running:

- Select a belly band overlay → Properties panel shows "Templates" section with 5 colored circles above "Style".
- Click each swatch — pill background color updates immediately in the preview; the active swatch has a teal ring.
- "Font size" slider in Style section changes text size live in the preview (10–72px).
- Select a plain text overlay ("T" button) → Templates section is NOT shown.

- [ ] Verify all four behaviors above.

### Step 2.4 — Commit

```bash
git add frontend/src/components/RightPanel/TextOverlayPropertiesPanel.tsx
git commit -m "feat(belly-band-v2): add font size slider and style template presets"
```

- [ ] Commit.

---

## Task 3: FFmpeg Export for Pill Overlays

**Files:**
- Modify: `backend/services/ffmpeg.py` (text overlays section, currently lines 624–643)

### Step 3.1 — Replace the text overlays section in `ffmpeg.py`

Find the `# Text overlays` comment block (lines 624–643). Replace the entire block with the code below, which splits pill vs plain overlays and emits two filters per pill (drawbox + drawtext with animation):

```python
    # Text overlays
    text_overlays = project.get("textOverlays", [])
    if text_overlays:
        ov_filters = []
        for ov in text_overlays:
            escaped = _escape(ov["text"])
            t0, t1 = ov["startTime"], ov["endTime"]
            enable = f"between(t,{t0},{t1})"
            px_x = int(ov["x"] / 100 * W)
            px_y = int(ov["y"] / 100 * H)
            fs = ov.get("fontSize", 32)
            color_raw = ov.get("color", "#ffffff").lstrip("#")
            color = color_raw if re.match(r'^[0-9a-fA-F]{6}$', color_raw) else "ffffff"

            if ov.get("shape") == "pill":
                anim_dur = ov.get("animateDuration", 0.4)
                char_w = fs * 0.55
                box_w = int(len(ov["text"]) * char_w + 40)
                box_h = fs + 20
                box_x = px_x - box_w // 2
                box_y_base = px_y - box_h // 2
                slide = 30

                slide_expr = (
                    f"if(lt(t-{t0},{anim_dur}),"
                    f"round(({anim_dur}-(t-{t0}))/{anim_dur}*{slide}),"
                    f"if(lt({t1}-t,{anim_dur}),"
                    f"round(({t1}-t)/{anim_dur}*{slide}),"
                    f"0))"
                )
                alpha_expr = (
                    f"if(lt(t-{t0},{anim_dur}),(t-{t0})/{anim_dur},"
                    f"if(lt({t1}-t,{anim_dur}),({t1}-t)/{anim_dur},1))"
                )
                bg_color = ov.get("background", "#7c3aed").lstrip("#")
                bg_color = bg_color if re.match(r'^[0-9a-fA-F]{6}$', bg_color) else "7c3aed"
                text_y = f"{px_y}-text_h/2+{slide_expr}"

                ov_filters.append(
                    f"drawbox=x={box_x}:y={box_y_base}+{slide_expr}:w={box_w}:h={box_h}:"
                    f"color=0x{bg_color}@0.95:t=fill:enable='{enable}'"
                )
                ov_filters.append(
                    f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}:"
                    f"x={px_x}-text_w/2:y={text_y}:"
                    f"alpha='{alpha_expr}':enable='{enable}'"
                )
            else:
                ov_filters.append(
                    f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}:"
                    f"x={px_x}-text_w/2:y={px_y}-text_h/2:enable='{enable}'"
                )
        if ov_filters:
            chained = "[vpre2]" + "[vov];[vov]".join(ov_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vpre2];{chained}[vout]", 1)
```

**Note:** The pill background is a rectangle in export — `drawbox` has no border-radius. Rounded corners are CSS-only in the browser preview.

- [ ] In `backend/services/ffmpeg.py`, replace lines 624–643 (the `# Text overlays` block) with the code above.

### Step 3.2 — Start the backend and verify no syntax errors

```bash
cd backend && python -c "import services.ffmpeg; print('ok')"
```

Expected: `ok` with no import errors.

- [ ] Run the import check.

### Step 3.3 — Manual export verification

With both frontend and backend running:

1. Add a belly band overlay to a project with at least one video clip.
2. Export the project.
3. Play the exported MP4 in a video player.

Verify:
- At `startTime`: pill background box and text slide up from below (30px offset), fading in over `animateDuration` seconds.
- During the overlay's hold period: pill is fully visible and stationary.
- Before `endTime`: pill and text slide down and fade out over `animateDuration` seconds.
- Plain text overlays (shape != "pill") are unaffected — still render as simple `drawtext`.

- [ ] Export and verify the animation in the MP4.

### Step 3.4 — Commit

```bash
git add backend/services/ffmpeg.py
git commit -m "feat(belly-band-v2): render pill slide animation in FFmpeg export"
```

- [ ] Commit.

---

## Verification Checklist

After all tasks are complete, do a final regression pass:

- [ ] **Timeline move**: drag a belly band block left/right → moves; mouseup = one undo step.
- [ ] **Timeline resize left**: drag left edge → `startTime` changes; min duration 0.5s enforced.
- [ ] **Timeline resize right**: drag right edge → `endTime` changes; min duration 0.5s enforced.
- [ ] **Font size**: slider in Style section changes text size live in the preview.
- [ ] **Templates**: 5 swatches shown for pill overlays only; clicking updates colors; active swatch has teal ring.
- [ ] **Export animation**: exported MP4 shows slide-up at start, slide-down before end, fade matches slide.
- [ ] **Plain text regression**: "T" overlay exports exactly as before (simple drawtext, no box).
- [ ] **Existing drag regression**: standard clip drag/resize on video track is unaffected.
