# Blur Region Keyframes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animate blur region properties (x, y, width, height, intensity, feather) over time using linear keyframe interpolation, with diamond markers in the timeline and a keyframe list in the properties panel.

**Architecture:** A new `BlurKeyframe` type is added to the data model; a pure `interpolateBlurAt` utility computes values at any playhead time; two store actions (`addOrUpdateBlurKeyframe`, `deleteBlurKeyframe`) mutate keyframe arrays with undo/redo. VideoPreview consumes interpolated values, BlurRegionEditor auto-creates keyframes on drag, EffectPropertiesPanel manages the list, EffectOverlayTrack renders diamond markers, and ffmpeg.py generates animated `crop`/`overlay` expressions for export.

**Tech Stack:** TypeScript/React (Zustand store, Tailwind), Python/FFmpeg filter_complex expressions

---

## File Map

| File | Change |
|---|---|
| `frontend/src/types/project.ts` | Add `BlurKeyframe` interface; extend `BlurParams` |
| `frontend/src/lib/blurKeyframes.ts` | **New** — pure interpolation utility |
| `frontend/src/store/useProjectStore.ts` | Add 2 new actions + interface entries |
| `frontend/src/components/Preview/VideoPreview.tsx` | Use `interpolateBlurAt` for active blur params |
| `frontend/src/components/Preview/BlurRegionEditor.tsx` | Auto-create keyframe on drag commit |
| `frontend/src/components/RightPanel/EffectPropertiesPanel.tsx` | Add keyframes section to blur branch |
| `frontend/src/components/Timeline/EffectOverlayTrack.tsx` | Render amber diamonds + click-to-seek |
| `backend/services/ffmpeg.py` | Add `_kf_lerp_expr` helper + animated blur path |

---

## Task 1: Extend the data model

**Files:**
- Modify: `frontend/src/types/project.ts`

- [ ] **Step 1: Add `BlurKeyframe` interface and extend `BlurParams`**

In `frontend/src/types/project.ts`, after the `BlurRegion` interface (line 117), add:

```typescript
export interface BlurKeyframe {
  time: number;        // seconds relative to effect.startTime; array always sorted ascending
  intensity: number;   // blur radius in px
  region?: BlurRegion; // absent only for full-frame blurs
}
```

Replace the `BlurParams` interface (lines 119–122) with:

```typescript
export interface BlurParams {
  intensity: number;    // 0–20 (gaussian blur radius in px)
  region?: BlurRegion;  // absent = full-frame blur
  keyframes?: BlurKeyframe[]; // present & non-empty → keyframe mode
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

Expected: no type errors related to `BlurParams` or `BlurKeyframe`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/project.ts
git commit -m "feat(types): add BlurKeyframe type and keyframes field to BlurParams"
```

---

## Task 2: Interpolation utility

**Files:**
- Create: `frontend/src/lib/blurKeyframes.ts`

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/lib/blurKeyframes.ts
import type { BlurKeyframe, BlurParams, BlurRegion } from "../types/project";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute effective BlurParams at relativeTime (seconds from effect.startTime).
 * Returns base unchanged when keyframes is empty.
 * Clamps to first/last keyframe outside their range.
 * Linearly interpolates all numeric fields between adjacent keyframes.
 */
export function interpolateBlurAt(
  keyframes: BlurKeyframe[],
  relativeTime: number,
  base: BlurParams,
): BlurParams {
  if (!keyframes.length) return base;

  if (relativeTime <= keyframes[0].time) {
    const kf = keyframes[0];
    return { ...base, intensity: kf.intensity, region: kf.region ?? base.region };
  }

  const last = keyframes[keyframes.length - 1];
  if (relativeTime >= last.time) {
    return { ...base, intensity: last.intensity, region: last.region ?? base.region };
  }

  let lo = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (relativeTime >= keyframes[i].time && relativeTime < keyframes[i + 1].time) {
      lo = i;
      break;
    }
  }

  const a = keyframes[lo];
  const b = keyframes[lo + 1];
  const t = (relativeTime - a.time) / (b.time - a.time);

  let region: BlurRegion | undefined = base.region;
  if (a.region && b.region) {
    region = {
      x:       lerp(a.region.x,             b.region.x,             t),
      y:       lerp(a.region.y,             b.region.y,             t),
      width:   lerp(a.region.width,         b.region.width,         t),
      height:  lerp(a.region.height,        b.region.height,        t),
      feather: lerp(a.region.feather ?? 0,  b.region.feather ?? 0,  t),
    };
  } else if (a.region) {
    region = a.region;
  } else if (b.region) {
    region = b.region;
  }

  return { ...base, intensity: lerp(a.intensity, b.intensity, t), region };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

Expected: no errors mentioning `blurKeyframes`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/blurKeyframes.ts
git commit -m "feat: add interpolateBlurAt utility for blur keyframe linear interpolation"
```

---

## Task 3: Store actions

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Add `BlurKeyframe` to the store import**

On line 3, add `BlurKeyframe` to the type import:

```typescript
import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay, ClipTransform, EffectOverlay, ZoomParams, FadeParams, BlurParams, BlurKeyframe, ColorGradeParams, SpeedRampParams, ClipTransition, EffectType, AudioEnhanceType } from "../types/project";
```

- [ ] **Step 2: Declare the new actions in the `ProjectStore` interface**

After `updateEffectOverlayParams` (line 131), add:

```typescript
  addOrUpdateBlurKeyframe: (effectId: string, keyframe: BlurKeyframe) => void;
  deleteBlurKeyframe: (effectId: string, keyframeIndex: number) => void;
```

- [ ] **Step 3: Implement the actions**

After the `updateEffectOverlayParams` implementation (after line 805), add:

```typescript
  addOrUpdateBlurKeyframe: (effectId, keyframe) =>
    withHistory(set, get, (p) => ({
      ...p,
      effectOverlays: p.effectOverlays.map((e) => {
        if (e.id !== effectId || e.type !== "blur") return e;
        const bp = e.params as BlurParams;
        const existing = bp.keyframes ?? [];
        const idx = existing.findIndex((k) => Math.abs(k.time - keyframe.time) < 0.05);
        const next = idx >= 0
          ? existing.map((k, i) => (i === idx ? keyframe : k))
          : [...existing, keyframe].sort((a, b) => a.time - b.time);
        return { ...e, params: { ...bp, keyframes: next } };
      }),
    })),

  deleteBlurKeyframe: (effectId, keyframeIndex) =>
    withHistory(set, get, (p) => ({
      ...p,
      effectOverlays: p.effectOverlays.map((e) => {
        if (e.id !== effectId || e.type !== "blur") return e;
        const bp = e.params as BlurParams;
        return {
          ...e,
          params: { ...bp, keyframes: (bp.keyframes ?? []).filter((_, i) => i !== keyframeIndex) },
        };
      }),
    })),
```

- [ ] **Step 4: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/useProjectStore.ts
git commit -m "feat(store): add addOrUpdateBlurKeyframe and deleteBlurKeyframe actions"
```

---

## Task 4: Wire interpolation in VideoPreview

**Files:**
- Modify: `frontend/src/components/Preview/VideoPreview.tsx`

- [ ] **Step 1: Add import for `interpolateBlurAt`**

At the top of `VideoPreview.tsx`, after the existing `BlurRegionEditor` import (line 9), add:

```typescript
import { interpolateBlurAt } from "../../lib/blurKeyframes";
```

- [ ] **Step 2: Replace static blur param computation (lines 444–454)**

Replace:

```typescript
  const activeBlurEffect = !hiddenEffectLanes?.blur
    ? effectOverlays.find((e) => e.type === "blur" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const activeBlurRegion = activeBlurEffect ? (activeBlurEffect.params as BlurParams).region : undefined;
  const blurPx =
    activeBlurEffect && !activeBlurRegion
      ? (activeBlurEffect.params as BlurParams).intensity
      : 0;
```

With:

```typescript
  const activeBlurEffect = !hiddenEffectLanes?.blur
    ? effectOverlays.find((e) => e.type === "blur" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const activeBlurParams: BlurParams | null = activeBlurEffect
    ? (() => {
        const raw = activeBlurEffect.params as BlurParams;
        return raw.keyframes?.length
          ? interpolateBlurAt(raw.keyframes, playheadTime - activeBlurEffect.startTime, raw)
          : raw;
      })()
    : null;
  const activeBlurRegion = activeBlurParams?.region;
  const blurPx = activeBlurEffect && !activeBlurRegion ? (activeBlurParams?.intensity ?? 0) : 0;
```

- [ ] **Step 3: Update the blur render (lines 516–529)**

Replace the `backdropFilter` lines inside the `{activeBlurRegion && ...}` block:

```typescript
          backdropFilter: `blur(${(activeBlurEffect!.params as BlurParams).intensity}px)`,
          WebkitBackdropFilter: `blur(${(activeBlurEffect!.params as BlurParams).intensity}px)`,
```

With:

```typescript
          backdropFilter: `blur(${activeBlurParams!.intensity}px)`,
          WebkitBackdropFilter: `blur(${activeBlurParams!.intensity}px)`,
```

- [ ] **Step 4: Pass interpolated values to BlurRegionEditor (lines 604–611)**

Compute the selected blur's effective params just before the `BlurRegionEditor` call. Replace:

```typescript
          {viewZoom === 1 && selectedBlurEffect && (
            <BlurRegionEditor
              effectId={selectedBlurEffect.id}
              intensity={(selectedBlurEffect.params as BlurParams).intensity}
              initialRegion={(selectedBlurEffect.params as BlurParams).region}
              outerRef={outerRef}
            />
          )}
```

With:

```typescript
          {viewZoom === 1 && selectedBlurEffect && (() => {
            const sbp = selectedBlurEffect.params as BlurParams;
            const selectedBlurParams = sbp.keyframes?.length
              ? interpolateBlurAt(sbp.keyframes, playheadTime - selectedBlurEffect.startTime, sbp)
              : sbp;
            return (
              <BlurRegionEditor
                effectId={selectedBlurEffect.id}
                effectStartTime={selectedBlurEffect.startTime}
                intensity={selectedBlurParams.intensity}
                initialRegion={selectedBlurParams.region}
                outerRef={outerRef}
              />
            );
          })()}
```

- [ ] **Step 5: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: may see a TS error about unknown prop `effectStartTime` on `BlurRegionEditor` — that's fine, it's fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Preview/VideoPreview.tsx
git commit -m "feat(preview): interpolate blur params from keyframes during playback"
```

---

## Task 5: Auto-create keyframe on drag in BlurRegionEditor

**Files:**
- Modify: `frontend/src/components/Preview/BlurRegionEditor.tsx`

- [ ] **Step 1: Update Props and imports**

Replace the file's Props interface and import block:

```typescript
import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { BlurRegion, BlurParams } from "../../types/project";
import { interpolateBlurAt } from "../../lib/blurKeyframes";

interface Props {
  effectId: string;
  effectStartTime: number;
  intensity: number;
  initialRegion: BlurRegion | undefined;
  outerRef: React.RefObject<HTMLDivElement | null>;
}
```

- [ ] **Step 2: Update the component signature and `commit` function**

Replace the `export default function BlurRegionEditor(...)` line and the `commit` function:

```typescript
export default function BlurRegionEditor({ effectId, effectStartTime, intensity, initialRegion, outerRef }: Props) {
  const { updateEffectOverlayParams } = useProjectStore();
  const [region, setRegion] = useState<BlurRegion>(initialRegion ?? DEFAULT_REGION);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current && initialRegion) setRegion(initialRegion);
  }, [initialRegion]);

  function containerRect() { return outerRef.current?.getBoundingClientRect() ?? null; }

  function commit(r: BlurRegion) {
    setRegion(r);
    const { project, playheadTime, addOrUpdateBlurKeyframe, updateEffectOverlayParams: updateParams } =
      useProjectStore.getState();
    const effect = project.effectOverlays.find((e) => e.id === effectId);
    if (!effect) return;
    const bp = effect.params as BlurParams;
    if (bp.keyframes?.length) {
      const relTime = Math.max(0, playheadTime - effectStartTime);
      const effective = interpolateBlurAt(bp.keyframes, relTime, bp);
      addOrUpdateBlurKeyframe(effectId, { time: relTime, intensity: effective.intensity, region: r });
    } else {
      updateParams(effectId, { region: r });
    }
  }
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Preview/BlurRegionEditor.tsx
git commit -m "feat(blur-editor): auto-create keyframe on drag when effect is in keyframe mode"
```

---

## Task 6: Keyframes panel in EffectPropertiesPanel

**Files:**
- Modify: `frontend/src/components/RightPanel/EffectPropertiesPanel.tsx`

- [ ] **Step 1: Update imports and store destructuring**

Add imports at the top:

```typescript
import { useProjectStore } from "../../store/useProjectStore";
import type { ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams, BlurKeyframe } from "../../types/project";
import type { BlurRegion } from "../../types/project";
import { interpolateBlurAt } from "../../lib/blurKeyframes";
```

Update the store destructuring line inside `EffectPropertiesPanel`:

```typescript
  const {
    project, selectedEffectOverlayId, updateEffectOverlayParams, resizeEffectOverlay,
    playheadTime, addOrUpdateBlurKeyframe, deleteBlurKeyframe, setPlayhead,
  } = useProjectStore();
```

- [ ] **Step 2: Add helper functions above the component**

Add these helpers after the `SectionHeader` component (after line 36):

```typescript
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function kfSummary(kf: BlurKeyframe): string {
  const r = kf.region;
  if (!r) return `blur:${kf.intensity.toFixed(0)}`;
  return `x:${r.x.toFixed(2)} y:${r.y.toFixed(2)} w:${r.width.toFixed(2)} h:${r.height.toFixed(2)}`;
}
```

- [ ] **Step 3: Replace the blur branch (lines 87–118)**

Replace the entire `// — Blur —` block with:

```typescript
  // — Blur —
  if (effect.type === "blur") {
    const params = effect.params as BlurParams;
    const keyframes = params.keyframes ?? [];
    const relTime = playheadTime - effect.startTime;
    const activeKfIdx = keyframes.findIndex((k) => Math.abs(k.time - relTime) < 0.05);
    const effectiveParams = keyframes.length
      ? interpolateBlurAt(keyframes, relTime, params)
      : params;
    const region = effectiveParams.region as BlurRegion | undefined;

    function addKeyframe() {
      addOrUpdateBlurKeyframe(effect!.id, {
        time: Math.max(0, relTime),
        intensity: effectiveParams.intensity,
        region: effectiveParams.region,
      });
    }

    function onIntensityChange(v: number) {
      if (keyframes.length) {
        addOrUpdateBlurKeyframe(effect!.id, {
          time: Math.max(0, relTime),
          intensity: v,
          region: effectiveParams.region,
        });
      } else {
        updateEffectOverlayParams(effect!.id, { intensity: v });
      }
    }

    function onFeatherChange(v: number) {
      if (!effectiveParams.region) return;
      if (keyframes.length) {
        addOrUpdateBlurKeyframe(effect!.id, {
          time: Math.max(0, relTime),
          intensity: effectiveParams.intensity,
          region: { ...effectiveParams.region, feather: v },
        });
      } else {
        updateEffectOverlayParams(effect!.id, { region: { ...params.region!, feather: v } });
      }
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Blur" />

          {/* ── Keyframes section ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400">
                KEYFRAMES{keyframes.length > 0 ? ` (${keyframes.length})` : ""}
              </p>
              <button
                onClick={addKeyframe}
                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-500 text-white hover:bg-sky-600 transition-colors cursor-pointer"
              >
                + Add
              </button>
            </div>

            {keyframes.length > 0 && (
              <>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {keyframes.map((kf, i) => {
                    const isActive = i === activeKfIdx;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] cursor-pointer
                          ${isActive
                            ? "bg-sky-50 border border-sky-200"
                            : "hover:bg-slate-50"}`}
                        onClick={() => setPlayhead(effect!.startTime + kf.time)}
                      >
                        <span className={`w-8 tabular-nums ${isActive ? "text-sky-600 font-semibold" : "text-slate-500"}`}>
                          {fmtTime(effect!.startTime + kf.time)}{isActive ? " ◆" : ""}
                        </span>
                        <span className="flex-1 text-slate-400 truncate">{kfSummary(kf)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBlurKeyframe(effect!.id, i); }}
                          className="text-slate-300 hover:text-red-400 transition-colors leading-none px-0.5 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Prev / Next navigation */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      const prev = [...keyframes].reverse().find((k) => k.time < relTime - 0.05);
                      if (prev) setPlayhead(effect!.startTime + prev.time);
                    }}
                    className="text-[11px] px-2.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >◀</button>
                  <span className="text-[10px] text-slate-400">
                    {activeKfIdx >= 0 ? `${activeKfIdx + 1} / ${keyframes.length}` : `— / ${keyframes.length}`}
                  </span>
                  <button
                    onClick={() => {
                      const next = keyframes.find((k) => k.time > relTime + 0.05);
                      if (next) setPlayhead(effect!.startTime + next.time);
                    }}
                    className="text-[11px] px-2.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >▶</button>
                </div>
              </>
            )}
          </div>

          {/* ── Sliders ── */}
          <SliderRow
            label="Blur Amount"
            value={effectiveParams.intensity}
            min={0} max={20} step={0.5}
            onChange={onIntensityChange}
            format={(v) => `${v.toFixed(1)}px`}
            accentClass="accent-sky-500"
          />
          {region ? (
            <SliderRow
              label="Edge Feather"
              value={region.feather ?? 0}
              min={0} max={0.5} step={0.01}
              onChange={onFeatherChange}
              format={(v) => `${Math.round(v * 100)}%`}
              accentClass="accent-sky-500"
            />
          ) : (
            <p className="text-[10px] text-slate-400">Click the blur in the timeline to position the blur region in the preview.</p>
          )}
          {durationSlider("accent-sky-500")}
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RightPanel/EffectPropertiesPanel.tsx
git commit -m "feat(properties): add keyframe list, add/delete/navigate controls to blur panel"
```

---

## Task 7: Timeline diamonds in EffectOverlayTrack

**Files:**
- Modify: `frontend/src/components/Timeline/EffectOverlayTrack.tsx`

- [ ] **Step 1: Add required imports**

In `EffectOverlayTrack.tsx`, update the type import line at the top to include `BlurParams`:

```typescript
import type { EffectOverlay, EffectType, FadeParams, ColorGradeParams, SpeedRampParams, BlurParams } from "../../types/project";
```

- [ ] **Step 2: Subscribe to `playheadTime` and `setPlayhead` inside `EffectBlock`**

`EffectBlock` already calls `useProjectStore` (line 169). Add these two subscriptions alongside the existing destructuring in `EffectBlock`:

```typescript
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
```

No prop changes needed — `EffectBlock` fetches these values directly from the store.

- [ ] **Step 3: Render keyframe diamonds inside the effect bar**

Inside the `EffectBlock` return statement, after the left handle `<div>` and before the label `<span>`, add:

```typescript
      {effect.type === "blur" &&
        ((effect.params as BlurParams).keyframes ?? []).map((kf, i) => {
          const kfLeft = Math.max(4, Math.min(width - 4, kf.time * zoom));
          const isActive = Math.abs(playheadTime - effect.startTime - kf.time) < 0.05;
          return (
            <div
              key={i}
              title={`Keyframe ${i + 1}`}
              className={`absolute top-1/2 z-20 pointer-events-auto cursor-pointer
                ${isActive ? "outline outline-2 outline-amber-300 outline-offset-1" : ""}`}
              style={{
                left: kfLeft,
                width: 8,
                height: 8,
                background: "#f59e0b",
                transform: "translate(-50%, -50%) rotate(45deg)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPlayhead(effect.startTime + kf.time);
              }}
            />
          );
        })}
```

- [ ] **Step 5: Verify compilation**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Timeline/EffectOverlayTrack.tsx
git commit -m "feat(timeline): render amber keyframe diamonds on blur effect bars"
```

---

## Task 8: FFmpeg animated blur export

**Files:**
- Modify: `backend/services/ffmpeg.py`

- [ ] **Step 1: Add the `_kf_lerp_expr` helper**

Find the top of `ffmpeg.py` (after imports, before the main `export` function). Add this helper function:

```python
def _kf_lerp_expr(t_offset: float, kf_times: list, kf_values: list) -> str:
    """Build a nested FFmpeg if() expression for linear keyframe interpolation.

    t_offset  — absolute effect startTime (seconds); expressions use (t - t_offset)
                as the relative clock.
    kf_times  — list of floats, keyframe times relative to effect startTime, ascending.
    kf_values — list of floats, one value per keyframe.

    Returns an FFmpeg expression string that evaluates to kf_values[0] before the first
    keyframe, kf_values[-1] after the last, and linearly interpolates between them.
    """
    n = len(kf_times)
    if n == 0:
        return "0"
    if n == 1:
        return f"{kf_values[0]:.4f}"

    T = f"(t-{t_offset:.4f})"

    # Build right-to-left: innermost covers last keyframe → clamp to last value
    expr = f"{kf_values[-1]:.4f}"
    for i in range(n - 2, -1, -1):
        t0, t1 = kf_times[i], kf_times[i + 1]
        v0, v1 = kf_values[i], kf_values[i + 1]
        dt = t1 - t0
        if dt < 1e-6:
            lerp = f"{v0:.4f}"
        else:
            dv = v1 - v0
            lerp = f"({v0:.4f}+{dv:.4f}*({T}-{t0:.4f})/{dt:.4f})"
        expr = f"if(lt({T},{t1:.4f}),{lerp},{expr})"

    # Outermost: before first keyframe → clamp to first value
    return f"if(lt({T},{kf_times[0]:.4f}),{kf_values[0]:.4f},{expr})"
```

- [ ] **Step 2: Extend the blur filter block with a keyframe path**

Locate the blur section (around line 300). Inside the `for j, eff in enumerate(blur_effects):` loop, after computing `region = eff.get("params", {}).get("region")`, add a new branch before the existing `if region:` check:

```python
            keyframes = eff.get("params", {}).get("keyframes") or []
            # ── Animated (keyframed) blur ──────────────────────────────────────────
            kf_with_region = [kf for kf in keyframes if kf.get("region")]
            if kf_with_region:
                kf_times = [kf["time"] for kf in kf_with_region]
                kf_x = [max(0.0, kf["region"]["x"] * W) for kf in kf_with_region]
                kf_y = [max(0.0, kf["region"]["y"] * H) for kf in kf_with_region]
                kf_w = [max(2.0, kf["region"]["width"] * W) for kf in kf_with_region]
                kf_h = [max(2.0, kf["region"]["height"] * H) for kf in kf_with_region]
                kf_r = [max(1.0, kf["intensity"]) for kf in kf_with_region]

                ex = _kf_lerp_expr(st, kf_times, kf_x)
                ey = _kf_lerp_expr(st, kf_times, kf_y)
                ew = f"trunc(max(2,{_kf_lerp_expr(st, kf_times, kf_w)})/2)*2"
                eh = f"trunc(max(2,{_kf_lerp_expr(st, kf_times, kf_h)})/2)*2"
                er = f"max(1,{_kf_lerp_expr(st, kf_times, kf_r)})"

                parts.append(
                    f"[{in_lbl}]split[base{j}][bsrc{j}];"
                    f"[bsrc{j}]crop=w='{ew}':h='{eh}':x='{ex}':y='{ey}',"
                    f"boxblur=luma_radius='{er}':luma_power=1[bcrop{j}];"
                    f"[base{j}][bcrop{j}]overlay=x='{ex}':y='{ey}':enable='between(t,{st:.4f},{et:.4f})'[{out_lbl}]"
                )
            # ── Static (no keyframes) blur — existing paths ────────────────────────
            elif region:
```

Make sure the existing `elif region:` and `else:` blocks are shifted one level of indentation to become branches of this new if/elif/else chain. (Only the `if kf_with_region:` is new — `elif region:` and the final `else:` stay identical to today.)

- [ ] **Step 3: Restart backend and verify static blur still works**

```bash
cd backend && uvicorn main:app --reload &
# In a separate step, export a project with a static (no-keyframe) blur and confirm output is correct.
```

- [ ] **Step 4: Verify keyframed blur export**

Export a project that has a blur effect with 2+ keyframes. Open the output video and confirm the blur region moves between the keyframe positions.

- [ ] **Step 5: Commit**

```bash
git add backend/services/ffmpeg.py
git commit -m "feat(ffmpeg): animated blur region export using keyframe interpolation expressions"
```

---

## Verification Checklist

- [ ] **Static blur regression** — create a blur effect with no keyframes, export, confirm output unchanged.
- [ ] **Add first keyframe** — place playhead at 0 s inside a blur effect, click "+ Add" in properties panel. Confirm a diamond appears on the effect bar at position 0.
- [ ] **Auto-keyframe on drag** — with one keyframe existing, move playhead to 2 s, drag the blur region in the preview. Confirm a second diamond appears at 2 s.
- [ ] **Interpolation scrub** — scrub between two keyframes; confirm the blur region moves smoothly in the preview.
- [ ] **Delete keyframe** — click × on a keyframe row. Confirm diamond disappears. Undo (Cmd+Z) restores it.
- [ ] **◀ ▶ navigation** — with 3 keyframes, click ▶ twice and ◀ once; confirm playhead jumps to correct keyframe times.
- [ ] **Slider creates keyframe** — with one keyframe, move playhead to a new time, adjust the blur amount slider. Confirm a new keyframe is created at that time.
- [ ] **Export with keyframes** — export project with a 2-keyframe blur, open in QuickTime/VLC, confirm region animates.
- [ ] **Export without keyframes** — confirm existing static blur export unchanged.
