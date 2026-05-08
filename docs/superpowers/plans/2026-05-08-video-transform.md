# Video Layer Transform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click the video in the preview to select it, then drag to move, drag corners to scale, and drag the rotation handle to rotate — per clip, with handles that stay visible even when the video is dragged off-canvas.

**Architecture:** Add a `ClipTransform` type to the data model, a `setClipTransform` store action, and a `VideoTransformOverlay` component that renders outside the canvas's `overflow-hidden` boundary. VideoPreview grows a two-layer structure: an inner clipped canvas + an outer unclipped wrapper that hosts the handles. The CSS transform on the video element drives both preview rendering and the FFmpeg export.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS, Python/FFmpeg

---

## File Map

| File | Change |
|---|---|
| `frontend/src/types/project.ts` | Add `ClipTransform` interface, add `transform?` to `Clip` |
| `frontend/src/store/useProjectStore.ts` | Add `setClipTransform` action |
| `frontend/src/components/Preview/VideoPreview.tsx` | Two-layer restructure, apply CSS transform, click handlers |
| `frontend/src/components/Preview/VideoTransformOverlay.tsx` | **New** — dashed bounding box + move/scale/rotate handles |
| `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` | Add Transform section |
| `backend/services/ffmpeg.py` | Change base filter to cover+crop, apply per-clip transform |

---

## Task 1 — Data model: `ClipTransform` type

**Files:**
- Modify: `frontend/src/types/project.ts`

- [ ] **Add the `ClipTransform` interface and `transform` field to `Clip`**

  In `frontend/src/types/project.ts`, add after the `UploadedFile` interface and update `Clip`:

  ```ts
  export interface ClipTransform {
    x: number;        // % offset from center (positive = right), relative to canvas width
    y: number;        // % offset from center (positive = down), relative to canvas height
    scale: number;    // multiplier; min 1.0 = fills canvas; max 5.0
    rotation: number; // degrees; free range
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
    brightness?: number;
    contrast?: number;
    saturation?: number;
    eyeContact?: boolean;
    eyeContactFileId?: string;
    transform?: ClipTransform;
  }
  ```

- [ ] **Verify TypeScript compiles**

  ```bash
  cd frontend && pnpm build 2>&1 | head -30
  ```
  Expected: no errors related to `ClipTransform`.

- [ ] **Commit**

  ```bash
  git add frontend/src/types/project.ts
  git commit -m "feat: add ClipTransform type to Clip"
  ```

---

## Task 2 — Store action: `setClipTransform`

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Add `setClipTransform` to the `ProjectStore` interface**

  In the `interface ProjectStore` block (around line 89 where `setClipAdjustment` is), add:

  ```ts
  setClipTransform: (clipId: string, transform: Partial<ClipTransform>) => void;
  ```

  Also add `ClipTransform` to the import at the top of the file:

  ```ts
  import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay, ClipTransform } from "../types/project";
  ```

- [ ] **Add the implementation** after `setClipAdjustment` (around line 393):

  ```ts
  setClipTransform: (clipId, patch) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        const current = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
        const merged = { ...current, ...patch };
        merged.scale = Math.max(1.0, Math.min(5.0, merged.scale));
        return { ...c, transform: merged };
      }),
    })),
  })),
  ```

- [ ] **Verify TypeScript compiles**

  ```bash
  cd frontend && pnpm build 2>&1 | head -30
  ```
  Expected: no errors.

- [ ] **Commit**

  ```bash
  git add frontend/src/store/useProjectStore.ts
  git commit -m "feat: add setClipTransform store action"
  ```

---

## Task 3 — VideoPreview: two-layer structure + CSS transform

**Files:**
- Modify: `frontend/src/components/Preview/VideoPreview.tsx`

- [ ] **Replace the contents of `VideoPreview.tsx`** with the two-layer structure. The outer wrapper hosts the handles overlay (not clipped). The inner canvas gets `overflow-hidden`. The video switches from `object-contain` to `object-cover` and receives the CSS transform.

  ```tsx
  import { useEffect, useRef } from "react";
  import { useProjectStore } from "../../store/useProjectStore";
  import { fileUrl } from "../../lib/api";
  import CaptionOverlay from "./CaptionOverlay";
  import TextOverlayRenderer from "./TextOverlayRenderer";
  import VideoTransformOverlay from "./VideoTransformOverlay";

  const RATIO_CLASSES: Record<string, string> = {
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "1:1": "aspect-square",
    "4:3": "aspect-[4/3]",
  };

  interface Props {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    toggle: () => void;
  }

  export default function VideoPreview({ videoRef, toggle }: Props) {
    const { project, files, playheadTime, isPlaying, selectedClipId, selectClip } = useProjectStore();
    // selectClip(id) — select; deselection happens when user clicks elsewhere in the app (timeline, panels)
    const outerRef = useRef<HTMLDivElement>(null);

    const videoTracks = project.tracks.filter((t) => t.type !== "audio");
    const activeTrack = videoTracks.find((t) =>
      t.clips.some((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration)
    );
    const activeClip = activeTrack?.hidden
      ? null
      : activeTrack?.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration) ?? null;
    const activeFile = activeClip ? files.find((f) => f.id === activeClip.fileId) : null;
    const effectiveMuted = !!activeClip?.muted || !!activeTrack?.muted;

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !activeClip) {
        videoRef.current?.pause();
        return;
      }
      const speed = activeClip.speed ?? 1;
      const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
      video.currentTime = sourcePos;
      video.playbackRate = speed;
      video.volume = Math.min(1, activeClip.volume ?? 1);
      if (isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, activeClip?.startTime, activeFile?.id]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !activeClip || isPlaying) return;
      const speed = activeClip.speed ?? 1;
      const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
      if (Math.abs(video.currentTime - sourcePos) > 0.05) {
        video.currentTime = sourcePos;
      }
    }, [playheadTime, activeClip, isPlaying]);

    const ratioClass = RATIO_CLASSES[project.aspectRatio] ?? "aspect-video";
    const t = activeClip?.transform;
    const videoStyle: React.CSSProperties = {
      ...(t ? { transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`, transformOrigin: "center center" } : {}),
      ...(activeClip && (activeClip.brightness !== undefined || activeClip.contrast !== undefined || activeClip.saturation !== undefined)
        ? { filter: `brightness(${activeClip.brightness ?? 1}) contrast(${activeClip.contrast ?? 1}) saturate(${activeClip.saturation ?? 1})` }
        : {}),
    };

    const showOverlay = !!activeClip && selectedClipId === activeClip.id;

    return (
      <div
        ref={outerRef}
        className={`relative ${ratioClass} max-h-full`}
        style={{ maxWidth: "min(100%, 720px)" }}
      >
        {/* Inner canvas — clips video at frame edge */}
        <div className="absolute inset-0 bg-black overflow-hidden">
          {activeFile ? (
            <video
              ref={videoRef}
              key={activeFile.id}
              src={fileUrl(activeFile.id)}
              className="w-full h-full object-cover"
              muted={effectiveMuted}
              style={videoStyle}
              onPointerDown={(e) => {
                if (activeClip) {
                  e.stopPropagation();
                  selectClip(activeClip.id);
                }
              }}
            />
          ) : files.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              Upload media to get started
            </div>
          ) : null}
          <TextOverlayRenderer time={playheadTime} />
          <CaptionOverlay time={playheadTime} />
          {activeClip && (activeClip.fadeIn || activeClip.fadeOut) && (() => {
            const elapsed = playheadTime - activeClip.startTime;
            const remaining = activeClip.duration - elapsed;
            let opacity = 0;
            if (activeClip.fadeIn && elapsed < activeClip.fadeIn) {
              opacity = 1 - elapsed / activeClip.fadeIn;
            } else if (activeClip.fadeOut && remaining < activeClip.fadeOut) {
              opacity = 1 - remaining / activeClip.fadeOut;
            }
            return opacity > 0 ? (
              <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity }} />
            ) : null;
          })()}
        </div>

        {/* Transform handles — NOT inside overflow-hidden, so they stay visible off-canvas */}
        {showOverlay && (
          <VideoTransformOverlay clip={activeClip} outerRef={outerRef} />
        )}
      </div>
    );
  }
  ```

- [ ] **Check TypeScript — VideoTransformOverlay doesn't exist yet, expect one import error**

  ```bash
  cd frontend && pnpm build 2>&1 | grep -i error | head -10
  ```
  Expected: only error is "Cannot find module './VideoTransformOverlay'".

- [ ] **Commit**

  ```bash
  git add frontend/src/components/Preview/VideoPreview.tsx
  git commit -m "feat: restructure VideoPreview for two-layer transform support"
  ```

---

## Task 4 — `VideoTransformOverlay` component

**Files:**
- Create: `frontend/src/components/Preview/VideoTransformOverlay.tsx`

- [ ] **Create `VideoTransformOverlay.tsx`** with move, scale, and rotate drag handlers:

  ```tsx
  import { useRef } from "react";
  import { useProjectStore } from "../../store/useProjectStore";
  import type { Clip } from "../../types/project";

  interface Props {
    clip: Clip;
    outerRef: React.RefObject<HTMLDivElement | null>;
  }

  export default function VideoTransformOverlay({ clip, outerRef }: Props) {
    const { setClipTransform } = useProjectStore();
    const t = clip.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };

    const cssTransform = `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`;

    // ── Move ────────────────────────────────────────────────────────────────
    function onMoveStart(e: React.PointerEvent) {
      e.stopPropagation();
      const rect = outerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startTX = t.x;
      const startTY = t.y;

      function onMove(ev: PointerEvent) {
        const dx = ((ev.clientX - startX) / rect!.width) * 100;
        const dy = ((ev.clientY - startY) / rect!.height) * 100;
        setClipTransform(clip.id, { x: startTX + dx, y: startTY + dy });
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    // ── Scale ───────────────────────────────────────────────────────────────
    function onScaleStart(e: React.PointerEvent) {
      e.stopPropagation();
      const rect = outerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (startDist < 1) return;
      const startScale = t.scale;

      function onMove(ev: PointerEvent) {
        const newDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        setClipTransform(clip.id, { scale: startScale * (newDist / startDist) });
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    // ── Rotate ──────────────────────────────────────────────────────────────
    function onRotateStart(e: React.PointerEvent) {
      e.stopPropagation();
      const rect = outerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const startRotation = t.rotation;

      function onMove(ev: PointerEvent) {
        const newAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        const delta = ((newAngle - startAngle) * 180) / Math.PI;
        setClipTransform(clip.id, { rotation: startRotation + delta });
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    const cornerClass = "absolute w-2.5 h-2.5 bg-teal-400 rounded-sm shadow-sm";

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ transform: cssTransform, transformOrigin: "center center" }}
      >
        {/* Dashed bounding box */}
        <div className="absolute inset-0 border-2 border-dashed border-teal-400 rounded-sm" />

        {/* Rotation handle — above top-center */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-auto cursor-grab flex flex-col items-center"
          style={{ top: -28 }}
          onPointerDown={onRotateStart}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-sm" />
          <div className="w-px h-4 bg-violet-400 opacity-60" />
        </div>

        {/* Corner handles — scale */}
        <div className={`${cornerClass} -top-1.5 -left-1.5 cursor-nw-resize pointer-events-auto`} onPointerDown={onScaleStart} />
        <div className={`${cornerClass} -top-1.5 -right-1.5 cursor-ne-resize pointer-events-auto`} onPointerDown={onScaleStart} />
        <div className={`${cornerClass} -bottom-1.5 -left-1.5 cursor-sw-resize pointer-events-auto`} onPointerDown={onScaleStart} />
        <div className={`${cornerClass} -bottom-1.5 -right-1.5 cursor-se-resize pointer-events-auto`} onPointerDown={onScaleStart} />

        {/* Body drag area — move (under corner handles in z-order) */}
        <div
          className="absolute inset-0 pointer-events-auto cursor-move"
          onPointerDown={onMoveStart}
        />
      </div>
    );
  }
  ```

- [ ] **Verify TypeScript compiles cleanly**

  ```bash
  cd frontend && pnpm build 2>&1 | grep -i error | head -10
  ```
  Expected: no errors.

- [ ] **Start dev server and smoke-test**

  ```bash
  cd frontend && pnpm dev
  ```
  - Upload a video, place it on the timeline
  - Click the video in the preview → teal dashed box + handles appear, Properties panel opens
  - Drag the body → video moves
  - Drag a corner → video scales
  - Drag the violet circle → video rotates
  - Drag video off-canvas edge → handles remain visible outside the frame
  - Click outside the video in the preview → handles disappear

- [ ] **Commit**

  ```bash
  git add frontend/src/components/Preview/VideoTransformOverlay.tsx
  git commit -m "feat: add VideoTransformOverlay with move/scale/rotate handles"
  ```

---

## Task 5 — Properties panel: Transform section

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

- [ ] **Add `setClipTransform` to the destructured store values** (around line 46):

  ```ts
  const {
    project, files, selectedClipId, selectedOverlayId, selectedCaptionId,
    setClipSpeed, setClipVolume, setClipFade, setClipAdjustment, setClipTransform,
    updateTextOverlay,
  } = useProjectStore();
  ```

- [ ] **Add transform defaults** after the existing defaults (around line 151, after `const saturation = ...`):

  ```ts
  const tx = clip.transform?.x ?? 0;
  const ty = clip.transform?.y ?? 0;
  const tScale = clip.transform?.scale ?? 1;
  const tRotation = clip.transform?.rotation ?? 0;
  const hasTransform = tx !== 0 || ty !== 0 || tScale !== 1 || tRotation !== 0;
  ```

- [ ] **Add the Transform `<Section>` block** after the closing `</Section>` of "Adjustments" (around line 243), before the "Effects" block:

  ```tsx
  {/* Transform */}
  <Section title="Transform">
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">X offset</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{tx.toFixed(1)}%</span>
      </div>
      <input
        type="range" min={-200} max={200} step={1} value={tx}
        onChange={(e) => setClipTransform(clip.id, { x: parseFloat(e.target.value) })}
        className="w-full accent-teal-600 h-1"
      />
    </div>
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">Y offset</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{ty.toFixed(1)}%</span>
      </div>
      <input
        type="range" min={-200} max={200} step={1} value={ty}
        onChange={(e) => setClipTransform(clip.id, { y: parseFloat(e.target.value) })}
        className="w-full accent-teal-600 h-1"
      />
    </div>
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">Scale</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(tScale * 100)}%</span>
      </div>
      <input
        type="range" min={100} max={500} step={1} value={Math.round(tScale * 100)}
        onChange={(e) => setClipTransform(clip.id, { scale: parseInt(e.target.value) / 100 })}
        className="w-full accent-teal-600 h-1"
      />
    </div>
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">Rotation</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{tRotation.toFixed(1)}°</span>
      </div>
      <input
        type="range" min={-180} max={180} step={1} value={tRotation}
        onChange={(e) => setClipTransform(clip.id, { rotation: parseFloat(e.target.value) })}
        className="w-full accent-teal-600 h-1"
      />
    </div>
    {hasTransform && (
      <button
        onClick={() => setClipTransform(clip.id, { x: 0, y: 0, scale: 1, rotation: 0 })}
        className="text-[11px] text-slate-400 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-50 hover:text-slate-600 transition-colors"
      >
        Reset transform
      </button>
    )}
  </Section>
  ```

- [ ] **Verify TypeScript compiles cleanly**

  ```bash
  cd frontend && pnpm build 2>&1 | grep -i error | head -10
  ```

- [ ] **Smoke-test the properties panel**

  - Select a clip → Transform section appears below Adjustments
  - Drag X/Y/Scale/Rotation sliders → preview updates live
  - "Reset transform" appears when any value is non-default, resets on click
  - Ctrl+Z undoes each slider change

- [ ] **Commit**

  ```bash
  git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx
  git commit -m "feat: add Transform section to ClipPropertiesPanel"
  ```

---

## Task 6 — FFmpeg export: cover base filter + per-clip transform

**Files:**
- Modify: `backend/services/ffmpeg.py`

- [ ] **Replace `RATIO_FILTERS` and add canvas size constants + `_build_transform_filter` helper** at the top of `ffmpeg.py` (replace lines 7–12):

  ```python
  # Canvas dimensions per aspect ratio
  CANVAS_SIZES: dict[str, tuple[int, int]] = {
      "16:9": (1920, 1080),
      "9:16": (1080, 1920),
      "1:1":  (1080, 1080),
      "4:3":  (1440, 1080),
  }

  # Base scale filter: cover (fills canvas, crops excess) instead of contain+pad
  RATIO_FILTERS = {
      "16:9": "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
      "9:16": "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "1:1":  "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080",
      "4:3":  "scale=1440:1080:force_original_aspect_ratio=increase,crop=1440:1080",
  }

  def _build_transform_filter(transform: dict, W: int, H: int) -> str:
      """Return an ffmpeg filter string that applies the clip transform.

      Operations: scale-to-cover-at-scale-factor → rotate → crop-to-canvas-with-offset.
      Returns empty string for identity transforms (skip to avoid re-encode overhead).
      """
      x = transform.get("x", 0)
      y = transform.get("y", 0)
      scale = max(1.0, min(5.0, transform.get("scale", 1.0)))
      rotation = transform.get("rotation", 0)

      identity = (x == 0 and y == 0 and scale == 1.0 and rotation == 0)
      if identity:
          return ""

      scaled_w = int(W * scale)
      scaled_h = int(H * scale)

      # 1. Scale source to cover canvas * scale factor
      parts = [f"scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=increase,crop={scaled_w}:{scaled_h}"]

      # 2. Rotate (keeps dimensions; corners may show black fill)
      if rotation != 0:
          r_rad = rotation * 3.14159265358979 / 180
          parts.append(f"rotate={r_rad:.6f}:fillcolor=black:ow=iw:oh=ih")

      # 3. Crop to canvas with translation offset
      # crop origin = center of scaled video + x/y% offset - half canvas size
      crop_x = int(W * ((scale - 1) / 2 + x / 100))
      crop_y = int(H * ((scale - 1) / 2 + y / 100))
      # Clamp so crop window stays within scaled video bounds
      crop_x = max(0, min(scaled_w - W, crop_x))
      crop_y = max(0, min(scaled_h - H, crop_y))
      parts.append(f"crop={W}:{H}:{crop_x}:{crop_y}")

      return ",".join(parts)
  ```

- [ ] **Update the per-clip video filter chain** inside the `for i, clip in enumerate(clips)` loop (replace the existing `vf = ...` line, currently around line 59):

  Find this line:
  ```python
  vf = f"[{i}:v]setpts=PTS/{speed}/TB,{ratio_filter}"
  ```

  Replace with:
  ```python
  clip_transform = clip.get("transform") or {}
  transform_filter = _build_transform_filter(clip_transform, W, H)
  active_filter = transform_filter if transform_filter else ratio_filter
  vf = f"[{i}:v]setpts=PTS/{speed}/TB,{active_filter}"
  ```

- [ ] **Add `W, H` locals at the top of the `export` function** (just after `clips.sort(...)`, before the `inputs = []` line):

  ```python
  W, H = CANVAS_SIZES.get(project.get("aspectRatio", "16:9"), CANVAS_SIZES["16:9"])
  ```

  Also update the line that gets `ratio_filter` at the top of `export` to use the new dict:
  ```python
  ratio_filter = RATIO_FILTERS.get(project.get("aspectRatio", "16:9"), RATIO_FILTERS["16:9"])
  ```
  *(This line already exists — no change needed to it, just confirming it still works.)*

- [ ] **Verify the backend starts cleanly**

  ```bash
  cd backend && python -c "from services.ffmpeg import export, _build_transform_filter, CANVAS_SIZES; print('OK')"
  ```
  Expected: `OK`

- [ ] **Test transform filter math manually**

  ```bash
  cd backend && python -c "
  from services.ffmpeg import _build_transform_filter
  # Identity — should return empty string
  print(repr(_build_transform_filter({}, 1920, 1080)))
  # Scale 1.5, shift right 10%
  print(_build_transform_filter({'scale': 1.5, 'x': 10, 'y': 0, 'rotation': 0}, 1920, 1080))
  # Scale 1.0, rotate 45 deg
  print(_build_transform_filter({'scale': 1.0, 'x': 0, 'y': 0, 'rotation': 45}, 1920, 1080))
  "
  ```
  Expected:
  - First: `''`
  - Second: something like `scale=2880:1620:...,crop=1920:1080:...,crop=...` with non-zero crop_x
  - Third: includes a `rotate=` filter

- [ ] **Commit**

  ```bash
  git add backend/services/ffmpeg.py
  git commit -m "feat: apply per-clip transform in FFmpeg export, switch base filter to cover"
  ```

---

## Final Verification

Run through the full flow end-to-end:

- [ ] Start dev server: `cd frontend && pnpm dev`
- [ ] Upload a video clip, add it to the timeline
- [ ] Click the video in the preview — dashed box + handles appear, Properties panel opens to Transform section
- [ ] Drag the body — video moves, handles track it
- [ ] Drag the video far off the canvas edge — handles remain reachable outside the frame
- [ ] Try to scale below 100% via corner handle — scale clamps at 1.0
- [ ] Drag a corner handle up-right — video scales uniformly
- [ ] Drag the violet rotation handle — video rotates in place
- [ ] Edit X/Y/Scale/Rotation sliders in the Properties panel — preview updates live
- [ ] Click "Reset transform" — video snaps back to default position/scale/rotation
- [ ] Press Ctrl+Z multiple times — each transform step undoes correctly
- [ ] Click outside the video (but still in the preview area) — handles disappear
- [ ] Start backend: `cd backend && uvicorn main:app --reload`
- [ ] Export with a transformed clip — verify rendered MP4 reflects the position/scale/rotation
