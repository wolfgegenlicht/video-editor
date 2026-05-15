# Blur Speaker Background — Design Spec

**Date:** 2026-05-15  
**Status:** Approved

---

## Context

Users recording talking-head video often want the background blurred to keep attention on the speaker — the "portrait mode" or "Zoom background blur" effect. The editor already has region-based blur overlays, but those require manual placement and don't auto-track the person.

This feature adds an automatic, ML-powered "Blur Background" toggle to clip properties that uses MediaPipe selfie segmentation to blur everything behind the speaker at export time.

---

## Design

### 1. Data Model

**File:** `frontend/src/types/project.ts`

Two optional fields added to the `Clip` interface:

```typescript
blurBackground?: boolean          // toggle on/off
blurBackgroundIntensity?: number  // Gaussian kernel radius, 1–100, default 25
```

No new store actions. The existing `setClipAdjustment(clipId, key, value)` handles both fields once they're declared on `Clip`.

---

### 2. UI

**File:** `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

A new `BlurBackgroundToggle` component is added to the "Effects" section of `ClipPropertiesPanel`, placed immediately after `<EyeContactToggle clip={clip} />` (line 458).

Component shape:
- Toggle on/off (same visual style as `EyeContactToggle`)
- When enabled: shows an Intensity slider (1–100, uses existing `SliderRow` helper)
- Static note: "AI background blur · applied at export"
- No async state, no polling — purely synchronous store mutations

```
┌─ Blur Background ─────────────────────────────┐
│  Blur Background             [ ○─────────── ]  │
│  Intensity  ████████░░░░░░  25                  │
│  (only shown when ON)                           │
│  AI background blur · applied at export        │
└────────────────────────────────────────────────┘
```

---

### 3. Backend Service

**File:** `backend/services/background_blur.py` (new)

```python
def blur_background_clip(
    input_path: str,
    output_path: str,
    source_start: float,
    source_end: float,
    intensity: int = 25,
) -> None
```

Algorithm:
1. Open source video with `cv2.VideoCapture`, seek to `source_start`
2. Init `mediapipe.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)` (landscape model — more accurate for desktop video)
3. Per frame (until `source_end`):
   - Convert BGR → RGB, run segmentation → float mask (0 = background, 1 = person)
   - Gaussian blur full frame: kernel = `max(3, int(intensity * 0.5) | 1)` (always odd)
   - Composite: `frame * mask + blurred * (1 – mask)` cast to uint8
   - Fallback: if `mask.max() < 0.05` (no person detected), write original frame
4. Write composited frames with `cv2.VideoWriter` (codec: `mp4v`, no audio)
5. Release capture and writer

Output is video-only. FFmpeg merges audio from the original source during export.

---

### 4. Export Integration

**File:** `backend/services/ffmpeg.py`

Before assembling the FFmpeg filter_complex, iterate over clips. For any clip with `blurBackground == True`:

1. Resolve original file path (as currently done for the clip's `fileId`)
2. Write temp file: `tmp_path = tempfile.mktemp(suffix="_blur_bg.mp4")`
3. Call `blur_background_clip(original_path, tmp_path, clip["sourceStart"], clip["sourceEnd"], intensity)` — using the clip's trim points, not timeline positions
4. Use `tmp_path` as the FFmpeg input for that clip (in place of original)
5. Collect all temp paths in a list; delete them in a `finally` block after FFmpeg exits

All other per-clip effects (color grading, fade, speed, transform) are applied by FFmpeg on top of the pre-processed video as normal.

---

### 5. Error Handling

- If `blur_background_clip` raises, log the error and fall back to the original file for that clip (don't abort the entire export).
- If MediaPipe is not installed (`ImportError`), log a warning and skip the pre-processing step.

---

## Verification

1. **Toggle appears** — select a clip → right panel shows "Blur Background" toggle in Effects section below Eye Contact
2. **Slider visible only when on** — toggle off → no intensity slider; toggle on → slider appears
3. **Export applies blur** — enable the toggle on a clip with a person, export → background visibly blurred in output MP4
4. **No-person fallback** — on a clip with no person (e.g., a screen recording), export → original frames preserved
5. **Other effects stack** — blur background + brightness adjustment + fade → all three applied correctly in output
6. **Temp cleanup** — after export, no `_blur_bg.mp4` files left in `/tmp`
