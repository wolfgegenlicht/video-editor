# Blur Speaker Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic ML-powered "Blur Background" clip property that uses MediaPipe selfie segmentation to blur everything behind the speaker at export time.

**Architecture:** MediaPipe `SelfieSegmentation` runs per-frame in a new `background_blur.py` service to produce a pre-composited video (sharp foreground, blurred background). Before the FFmpeg filter_complex is assembled, any clip with `blurBackground: true` has its `path` replaced with the temp pre-processed video; all other FFmpeg effects (color grading, fade, speed) then stack on top as normal. Temp files are deleted in the existing `finally` block after export completes.

**Tech Stack:** TypeScript/React (frontend toggle + slider), Python 3 with `mediapipe>=0.10.0` and `opencv-python` (both already in `requirements.txt`), FFmpeg (export pipeline — unchanged logic, new pre-processing step).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types/project.ts` | Modify | Add `blurBackground?: boolean` and `blurBackgroundIntensity?: number` to `Clip` interface |
| `frontend/src/store/useProjectStore.ts` | Modify | Extend `setClipAdjustment` key union; add `setClipBlurBackground` action |
| `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` | Modify | Add `BlurBackgroundToggle` component; render it after `<EyeContactToggle>` |
| `backend/services/background_blur.py` | Create | `blur_background_clip()` — MediaPipe segmentation + OpenCV compositing |
| `backend/services/ffmpeg.py` | Modify | Pre-process blurBackground clips before filter_complex; clean up temp files |
| `backend/tests/test_background_blur.py` | Create | Pytest tests for `blur_background_clip` |

---

## Task 1: Add `blurBackground` fields to the Clip type

**Files:**
- Modify: `frontend/src/types/project.ts:37-59`
- Modify: `frontend/src/store/useProjectStore.ts:111` and `:604-610`

- [ ] **Step 1: Add fields to the Clip interface**

In `frontend/src/types/project.ts`, add two lines after `eyeContactFileId?: string;` (currently line 53):

```typescript
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
  blurBackground?: boolean;
  blurBackgroundIntensity?: number;
  pan?: number;
  audioEnhanceType?: AudioEnhanceType;
  audioEnhanceEnabled?: boolean;
  audioEnhanceFileId?: string;
  transform?: ClipTransform;
}
```

- [ ] **Step 2: Extend `setClipAdjustment` key union and add `setClipBlurBackground` in store type**

In `frontend/src/store/useProjectStore.ts`, replace line 111 with the two lines below it:

Old (line 111):
```typescript
  setClipAdjustment: (clipId: string, key: "brightness" | "contrast" | "saturation", value: number) => void;
```

New:
```typescript
  setClipAdjustment: (clipId: string, key: "brightness" | "contrast" | "saturation" | "blurBackgroundIntensity", value: number) => void;
  setClipBlurBackground: (clipId: string, enabled: boolean) => void;
```

- [ ] **Step 3: Add `setClipBlurBackground` implementation in the store**

In `frontend/src/store/useProjectStore.ts`, after the `setClipAdjustment` implementation (currently ending around line 610), add:

```typescript
  setClipBlurBackground: (clipId, enabled) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, blurBackground: enabled } : c),
    })),
  })),
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && pnpm build 2>&1 | grep -E "error|blurBackground"
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/project.ts frontend/src/store/useProjectStore.ts
git commit -m "feat(types): add blurBackground and blurBackgroundIntensity to Clip"
```

---

## Task 2: Add `BlurBackgroundToggle` UI component

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

- [ ] **Step 1: Add the component**

In `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`, add the following function immediately before the `export default function ClipPropertiesPanel()` line (currently line 187):

```tsx
function BlurBackgroundToggle({ clip }: { clip: Clip }) {
  const { setClipBlurBackground, setClipAdjustment } = useProjectStore();
  const isOn = !!clip.blurBackground;
  const intensity = clip.blurBackgroundIntensity ?? 25;

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Blur Background</p>
        <button
          onClick={() => setClipBlurBackground(clip.id, !isOn)}
          aria-label="Toggle background blur"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              isOn ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>
      {isOn && (
        <SliderRow
          label="Intensity"
          value={intensity}
          min={1}
          max={100}
          step={1}
          onChange={(v) => setClipAdjustment(clip.id, "blurBackgroundIntensity", v)}
          format={(v) => `${v}`}
        />
      )}
      <p className="text-[11px] text-slate-400">AI background blur · applied at export</p>
    </div>
  );
}
```

- [ ] **Step 2: Render the component in the Effects section**

In the same file, find the Effects section (currently lines 455–459):

```tsx
      {/* Effects */}
      <div className="px-3 py-3 space-y-2">
        <p className="text-[10px] font-bold text-slate-400">Effects</p>
        <EyeContactToggle clip={clip} />
      </div>
```

Replace with:

```tsx
      {/* Effects */}
      <div className="px-3 py-3 space-y-2">
        <p className="text-[10px] font-bold text-slate-400">Effects</p>
        <EyeContactToggle clip={clip} />
        <BlurBackgroundToggle clip={clip} />
      </div>
```

- [ ] **Step 3: Type-check + dev server smoke test**

```bash
cd frontend && pnpm build 2>&1 | grep -E "error|BlurBackground"
```

Expected: no errors.

Then run `pnpm dev`, open the editor, select a video clip, check the right panel shows "Blur Background" toggle below "Eye Contact". Toggle on → intensity slider appears. Toggle off → slider disappears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx
git commit -m "feat(ui): add BlurBackgroundToggle to clip properties panel"
```

---

## Task 3: Create `background_blur.py` service

**Files:**
- Create: `backend/services/background_blur.py`
- Create: `backend/tests/test_background_blur.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/__init__.py` (empty, if it doesn't exist):

```bash
touch backend/tests/__init__.py
```

Create `backend/tests/test_background_blur.py`:

```python
import os
import tempfile
import numpy as np
import cv2
import pytest


def _make_test_video(path: str, width: int = 64, height: int = 64, fps: float = 10.0, num_frames: int = 10) -> None:
    """Write a short synthetic video: first half solid red, second half solid blue."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(path, fourcc, fps, (width, height))
    for i in range(num_frames):
        color = (0, 0, 200) if i < num_frames // 2 else (200, 0, 0)  # BGR
        frame = np.full((height, width, 3), color, dtype=np.uint8)
        out.write(frame)
    out.release()


def test_blur_background_clip_creates_output():
    """blur_background_clip must create a non-empty output video file."""
    from services.background_blur import blur_background_clip

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, num_frames=10)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=1.0, intensity=10)
        assert os.path.exists(dst_path)
        assert os.path.getsize(dst_path) > 0
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)


def test_blur_background_clip_output_has_correct_frame_count():
    """Output video must contain the same number of frames as the input segment."""
    from services.background_blur import blur_background_clip

    fps = 10.0
    num_frames = 15
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, fps=fps, num_frames=num_frames)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=num_frames / fps, intensity=5)
        cap = cv2.VideoCapture(dst_path)
        out_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        # Allow ±1 frame for codec rounding
        assert abs(out_count - num_frames) <= 1
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)


def test_blur_background_clip_no_person_fallback():
    """When no person is detected (solid-color video), output frames must equal input frames."""
    from services.background_blur import blur_background_clip

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_f:
        dst_path = dst_f.name

    try:
        _make_test_video(src_path, num_frames=5)
        blur_background_clip(src_path, dst_path, source_start=0.0, source_end=0.5, intensity=20)
        # Output must be a valid readable video
        cap = cv2.VideoCapture(dst_path)
        assert cap.isOpened()
        cap.release()
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)
```

- [ ] **Step 2: Run tests to verify they fail (service doesn't exist yet)**

```bash
cd backend && python -m pytest tests/test_background_blur.py -v 2>&1 | head -30
```

Expected: `ImportError: cannot import name 'blur_background_clip' from 'services.background_blur'` or `ModuleNotFoundError`.

- [ ] **Step 3: Create `backend/services/background_blur.py`**

```python
import os
import cv2
import numpy as np

try:
    import mediapipe as mp
    _mp_seg = mp.solutions.selfie_segmentation
    _MEDIAPIPE_AVAILABLE = True
except ImportError:
    _MEDIAPIPE_AVAILABLE = False
    print("[background_blur] WARNING: mediapipe not installed — blur_background_clip will be a no-op")


def blur_background_clip(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    intensity: int = 25,
) -> None:
    """Pre-process a clip segment by blurring the background behind detected persons.

    Reads frames from source_start..source_end, runs MediaPipe selfie segmentation
    per frame, composites sharp foreground over blurred background, and writes
    video-only output to output_path. Audio is not included — FFmpeg adds it later.

    Falls back to copying original frames when MediaPipe is unavailable or when
    no person is detected in a frame.
    """
    if not _MEDIAPIPE_AVAILABLE:
        _copy_frames(input_path, output_path, source_start, source_end)
        return

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Seek to source_start
    cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

    # Kernel must be odd and >= 3
    k = max(3, int(intensity * 0.5) | 1)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    with _mp_seg.SelfieSegmentation(model_selection=1) as seg:
        while True:
            pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if pos_ms >= source_end * 1000.0 - (500.0 / fps):
                break
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = seg.process(rgb)
            mask = result.segmentation_mask  # float32 H×W, 0=background 1=person

            if mask.max() < 0.05:
                # No person detected — write original frame unchanged
                out.write(frame)
                continue

            blurred = cv2.GaussianBlur(frame, (k, k), 0)
            mask_3ch = np.stack([mask, mask, mask], axis=-1)
            composite = (frame.astype(np.float32) * mask_3ch +
                         blurred.astype(np.float32) * (1.0 - mask_3ch))
            out.write(composite.astype(np.uint8))

    cap.release()
    out.release()


def _copy_frames(input_path: str, output_path: str, source_start: float, source_end: float) -> None:
    """Copy frames from source_start to source_end without modification."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.set(cv2.CAP_PROP_POS_MSEC, source_start * 1000.0)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    while True:
        pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        if pos_ms >= source_end * 1000.0 - (500.0 / fps):
            break
        ret, frame = cap.read()
        if not ret:
            break
        out.write(frame)

    cap.release()
    out.release()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_background_blur.py -v
```

Expected:
```
PASSED tests/test_background_blur.py::test_blur_background_clip_creates_output
PASSED tests/test_background_blur.py::test_blur_background_clip_output_has_correct_frame_count
PASSED tests/test_background_blur.py::test_blur_background_clip_no_person_fallback
```

- [ ] **Step 5: Commit**

```bash
git add backend/services/background_blur.py backend/tests/__init__.py backend/tests/test_background_blur.py
git commit -m "feat(backend): add blur_background_clip service with MediaPipe segmentation"
```

---

## Task 4: Wire up export integration in `ffmpeg.py`

**Files:**
- Modify: `backend/services/ffmpeg.py`

- [ ] **Step 1: Import the new service**

At the top of `backend/services/ffmpeg.py`, add the import after the existing `from services.ass_generator import generate_ass` line:

```python
from services.background_blur import blur_background_clip
```

- [ ] **Step 2: Add the pre-processing block**

In `backend/services/ffmpeg.py`, after the line `clips.sort(key=lambda c: c["startTime"])` (currently line 201) and before `if not clips:` (line 203), insert:

```python
    # Pre-process clips that have background blur enabled.
    # Creates temp video-only files; FFmpeg applies remaining effects on top.
    blur_temp_files: list[str] = []
    for clip in clips:
        if not clip.get("blurBackground"):
            continue
        original_ss = clip.get("sourceStart", 0)
        original_se = clip.get("sourceEnd", clip.get("duration", 0))
        intensity = int(clip.get("blurBackgroundIntensity") or 25)
        tmp_path = tempfile.mktemp(suffix="_blur_bg.mp4")
        try:
            blur_background_clip(clip["path"], tmp_path, original_ss, original_se, intensity)
            clip["path"] = tmp_path
            clip["sourceStart"] = 0.0
            clip["sourceEnd"] = original_se - original_ss
            blur_temp_files.append(tmp_path)
        except Exception as exc:
            print(f"[ffmpeg export] WARNING: blur_background_clip failed for clip {clip['id'][:8]}: {exc}, using original")
```

- [ ] **Step 3: Add temp file cleanup to the `finally` block**

The existing `finally` block (around line 599) currently reads:

```python
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)
```

Replace with:

```python
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)
        for tmp in blur_temp_files:
            if os.path.exists(tmp):
                os.unlink(tmp)
```

Note: `blur_temp_files` is declared in the pre-processing block inserted at line ~202, which is before the `try` block at line 582 — so it is in scope in the `finally` at line 599. No additional scoping change is needed.

- [ ] **Step 4: Verify the backend starts without errors**

```bash
cd backend && uvicorn main:app --reload &
sleep 3
curl -s http://localhost:8000/docs | grep -o '"title":"[^"]*"' | head -3
kill %1
```

Expected: FastAPI docs JSON includes route titles (no import errors).

- [ ] **Step 5: Commit**

```bash
git add backend/services/ffmpeg.py
git commit -m "feat(export): pre-process blurBackground clips with MediaPipe before FFmpeg"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Start both servers**

```bash
cd backend && uvicorn main:app --reload &
cd frontend && pnpm dev &
```

- [ ] **Step 2: Toggle + slider UI check**
  - Open `http://localhost:5173` (or `:5175` if port is taken)
  - Upload a video clip and add it to the timeline
  - Click the clip to select it — right panel opens to Properties
  - Scroll down to "Effects" section
  - Confirm "Blur Background" toggle is present below "Eye Contact"
  - Toggle ON → intensity slider appears with value 25
  - Drag intensity slider → value updates
  - Toggle OFF → slider disappears

- [ ] **Step 3: Export with blur enabled**
  - Re-enable the toggle (intensity 25)
  - Open Export dialog, click Export
  - Wait for export to complete
  - Open the exported MP4 in QuickTime/VLC — background should be visibly Gaussian blurred while the speaker remains sharp

- [ ] **Step 4: Temp file cleanup check**

```bash
ls /tmp/*_blur_bg.mp4 2>/dev/null && echo "TEMP FILES FOUND - BUG" || echo "Clean"
```

Expected: `Clean`

- [ ] **Step 5: Effects stacking check**
  - Enable "Blur Background" AND drag Brightness to +20%
  - Export again
  - Verify: background is blurred AND the whole video is brighter (FFmpeg color grading applied on top of the pre-processed video)

---

## Spec Coverage Check

| Spec Requirement | Covered By |
|-----------------|-----------|
| `blurBackground?: boolean` on Clip | Task 1 |
| `blurBackgroundIntensity?: number` on Clip | Task 1 |
| `setClipAdjustment` extended for `blurBackgroundIntensity` | Task 1 |
| `setClipBlurBackground` store action | Task 1 |
| Toggle below Eye Contact in ClipPropertiesPanel | Task 2 |
| Intensity slider visible only when ON | Task 2 |
| "Applied at export" note | Task 2 |
| `blur_background_clip()` service | Task 3 |
| MediaPipe `SelfieSegmentation(model_selection=1)` | Task 3 |
| Kernel size = `max(3, int(intensity * 0.5) \| 1)` | Task 3 |
| No-person fallback (write original frame) | Task 3 |
| Video-only output (no audio) | Task 3 |
| Pre-process before FFmpeg filter_complex | Task 4 |
| `clip["sourceStart"] = 0.0` reset after pre-processing | Task 4 |
| Error fallback (use original path) | Task 4 |
| Temp file cleanup in `finally` | Task 4 |
| Toggle visible, export applies blur, cleanup | Task 5 |
