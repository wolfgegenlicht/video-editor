# Eye Contact Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing "Eye Contact" placeholder in the Properties panel so users can toggle AI gaze correction on a clip — the backend processes the video using a pre-trained TF warping CNN and stores a corrected file that the preview and export pipeline then use automatically.

**Architecture:** The frontend toggle fires `POST /eye-contact/process` and polls `GET /eye-contact/status/:jobId` every 2 seconds. The backend runs a ThreadPoolExecutor job: OpenCV reads frames → dlib + TF warping model corrects gaze → FFmpeg re-encodes with original audio. The corrected file is stored in `uploads/` with a new UUID and referenced via `clip.eyeContactFileId`; `VideoPreview` and the FFmpeg export pipeline both resolve `eyeContactFileId ?? fileId` to decide which file to play/encode.

**Tech Stack:** Python `dlib`, `tensorflow>=2.x` (compat.v1 mode), `opencv-python`; React + Zustand; TF checkpoint weights from [mvaibhav77/eye-contact-correction](https://github.com/mvaibhav77/eye-contact-correction).

---

## File Map

**Create:**
- `backend/services/gaze_correction/__init__.py`
- `backend/services/gaze_correction/corrector.py` — GazeCorrector class (adapted from repo)
- `backend/services/gaze_correction/flx.py` — copied from repo
- `backend/services/gaze_correction/transformation.py` — copied from repo
- `backend/services/gaze_correction/tf_utils.py` — copied from repo
- `backend/services/gaze_correction/config.py` — copied from repo (no changes needed)
- `backend/services/gaze_correction/lm_feat/shape_predictor_68_face_landmarks.dat` — copied from repo
- `backend/services/gaze_correction/weights/warping_model/flx/12/L/` — copied from repo
- `backend/services/gaze_correction/weights/warping_model/flx/12/R/` — copied from repo
- `backend/services/eye_contact.py` — job management + video processing pipeline
- `backend/routes/eye_contact.py` — FastAPI route handlers

**Modify:**
- `frontend/src/types/project.ts` — add `eyeContact?` and `eyeContactFileId?` to `Clip`
- `frontend/src/store/useProjectStore.ts` — ephemeral status map + 3 new actions + `deleteClip` cleanup
- `frontend/src/lib/api.ts` — 3 new API functions
- `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` — replace disabled placeholder with live toggle
- `frontend/src/components/Preview/VideoPreview.tsx` — resolve `eyeContactFileId ?? fileId`
- `backend/services/ffmpeg.py` — resolve `eyeContactFileId ?? fileId` per clip
- `backend/main.py` — register eye contact router
- `backend/requirements.txt` — add `dlib`, `tensorflow`, `opencv-python`

---

## Task 1: Clip type + store additions

**Files:**
- Modify: `frontend/src/types/project.ts`
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Step 1: Add fields to Clip**

  In `frontend/src/types/project.ts`, add two optional fields to the `Clip` interface after `saturation?`:

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
  }
  ```

- [ ] **Step 2: Add ephemeral status map to store interface**

  In `frontend/src/store/useProjectStore.ts`, add to the `ProjectStore` interface (after `transcriptSelection`):

  ```typescript
  eyeContactStatus: Record<string, "processing" | "done" | "error">;
  ```

  And add three new action signatures (after `deleteTimeRange`):

  ```typescript
  setClipEyeContact: (clipId: string, enabled: boolean) => void;
  setClipEyeContactFileId: (clipId: string, fileId: string) => void;
  setEyeContactStatus: (clipId: string, status: "processing" | "done" | "error" | undefined) => void;
  ```

- [ ] **Step 3: Initialise eyeContactStatus in store state**

  In the `create<ProjectStore>((set, get) => ({` block, after `transcriptSelection: null,`, add:

  ```typescript
  eyeContactStatus: {},
  ```

- [ ] **Step 4: Implement the three new actions**

  In the store implementation, add after `setClipAdjustment`:

  ```typescript
  setClipEyeContact: (clipId, eyeContact) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, eyeContact } : c),
    })),
  })),

  setClipEyeContactFileId: (clipId, eyeContactFileId) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, eyeContactFileId } : c),
    })),
  })),

  setEyeContactStatus: (clipId, status) => set((s) => {
    if (status === undefined) {
      const { [clipId]: _, ...rest } = s.eyeContactStatus;
      return { eyeContactStatus: rest };
    }
    return { eyeContactStatus: { ...s.eyeContactStatus, [clipId]: status } };
  }),
  ```

- [ ] **Step 5: Update deleteClip to clean up corrected file**

  At the top of `useProjectStore.ts`, update the api import line to also import `deleteEyeContactFile`:

  ```typescript
  import { saveProject, deleteEyeContactFile } from "../lib/api";
  ```

  Replace the existing `deleteClip` implementation (currently at line 321–327):

  ```typescript
  deleteClip: (clipId) => {
    const found = findClip(get().project, clipId);
    if (found?.clip.eyeContactFileId) {
      deleteEyeContactFile(found.clip.eyeContactFileId).catch(console.error);
    }
    withHistory(set, get, (p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
    }));
    set((s) => s.selectedClipId === clipId ? { selectedClipId: null } : {});
  },
  ```

- [ ] **Step 6: Verify type-check passes**

  ```bash
  cd frontend && pnpm build 2>&1 | head -40
  ```

  Expected: no TypeScript errors about `eyeContact` or `eyeContactFileId`.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/types/project.ts frontend/src/store/useProjectStore.ts
  git commit -m "feat: add eyeContact fields to Clip type and store actions"
  ```

---

## Task 2: API layer

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add three API functions**

  Append to `frontend/src/lib/api.ts`:

  ```typescript
  export async function startEyeContactJob(fileId: string): Promise<{ jobId: string }> {
    const res = await fetch("/eye-contact/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    if (!res.ok) throw new Error(`Eye contact job failed: ${res.status}`);
    return res.json();
  }

  export async function getEyeContactStatus(jobId: string): Promise<{
    status: "processing" | "done" | "error";
    correctedFileId?: string;
    progress?: number;
    error?: string;
  }> {
    const res = await fetch(`/eye-contact/status/${jobId}`);
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json();
  }

  export async function deleteEyeContactFile(fileId: string): Promise<void> {
    await fetch(`/eye-contact/files/${fileId}`, { method: "DELETE" });
  }
  ```

- [ ] **Step 2: Verify type-check passes**

  ```bash
  cd frontend && pnpm build 2>&1 | head -20
  ```

  Expected: clean build.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/lib/api.ts
  git commit -m "feat: add eye contact API functions"
  ```

---

## Task 3: ClipPropertiesPanel — Eye Contact toggle UI

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

- [ ] **Step 1: Add React and API imports**

  At the top of `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`, add:

  ```typescript
  import { useState, useEffect, useRef } from "react";
  import * as api from "../../lib/api";
  import type { Clip } from "../../types/project";
  ```

- [ ] **Step 2: Add EyeContactToggle component**

  Add this new component above the main `ClipPropertiesPanel` export (below the `SliderRow` component definition):

  ```tsx
  function EyeContactToggle({ clip }: { clip: Clip }) {
    const { setClipEyeContact, setClipEyeContactFileId, setEyeContactStatus, eyeContactStatus } =
      useProjectStore();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
      mountedRef.current = true;
      // Restore ephemeral 'done' status after page refresh if persisted data shows it's processed
      if (clip.eyeContact && clip.eyeContactFileId && !eyeContactStatus[clip.id]) {
        setEyeContactStatus(clip.id, "done");
      }
      return () => { mountedRef.current = false; };
    }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const status = eyeContactStatus[clip.id];
    const isProcessing = status === "processing";
    const isOn = !!clip.eyeContact && (status === "done" || (!!clip.eyeContactFileId && status !== "error"));

    async function handleToggle() {
      if (isProcessing) return;
      const enabling = !clip.eyeContact;
      setClipEyeContact(clip.id, enabling);
      if (!enabling) {
        setEyeContactStatus(clip.id, undefined);
        return;
      }
      // Already processed — just flip the flag
      if (clip.eyeContactFileId) {
        setEyeContactStatus(clip.id, "done");
        return;
      }
      setEyeContactStatus(clip.id, "processing");
      try {
        const { jobId } = await api.startEyeContactJob(clip.fileId);
        while (mountedRef.current) {
          await new Promise<void>((r) => setTimeout(r, 2000));
          if (!mountedRef.current) break;
          const s = await api.getEyeContactStatus(jobId);
          if (s.status === "done" && s.correctedFileId) {
            setClipEyeContactFileId(clip.id, s.correctedFileId);
            setEyeContactStatus(clip.id, "done");
            break;
          }
          if (s.status === "error") throw new Error(s.error ?? "Processing failed");
        }
      } catch (e) {
        if (mountedRef.current) {
          setClipEyeContact(clip.id, false);
          setEyeContactStatus(clip.id, "error");
          setErrorMsg(e instanceof Error ? e.message : "Failed");
          setTimeout(() => { if (mountedRef.current) setErrorMsg(null); }, 3000);
        }
      }
    }

    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
        <div>
          <p className="text-xs font-medium text-slate-700">Eye Contact</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isProcessing ? "Processing…" : errorMsg ?? "AI gaze correction"}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle eye contact correction"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
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
    );
  }
  ```

- [ ] **Step 3: Replace the disabled placeholder**

  Find the Effects section (lines 246–256 in the original file):

  ```tsx
        {/* Effects */}
        <div className="px-3 py-3 space-y-2">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Effects</p>
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 opacity-50 cursor-not-allowed">
            <div>
              <p className="text-xs font-medium text-slate-700">Eye Contact</p>
              <p className="text-[11px] text-slate-400 mt-0.5">AI gaze correction</p>
            </div>
            <span className="text-[11px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Soon</span>
          </div>
        </div>
  ```

  Replace it with:

  ```tsx
        {/* Effects */}
        <div className="px-3 py-3 space-y-2">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Effects</p>
          <EyeContactToggle clip={clip} />
        </div>
  ```

- [ ] **Step 4: Verify type-check passes**

  ```bash
  cd frontend && pnpm build 2>&1 | head -40
  ```

  Expected: no errors about `EyeContactToggle` or missing props.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx
  git commit -m "feat: enable Eye Contact toggle in clip properties panel"
  ```

---

## Task 4: VideoPreview — use corrected file when available

**Files:**
- Modify: `frontend/src/components/Preview/VideoPreview.tsx`

- [ ] **Step 1: Compute playback file ID**

  In `VideoPreview.tsx`, replace the line:

  ```typescript
  const activeFile = activeClip ? files.find((f) => f.id === activeClip.fileId) : null;
  ```

  With:

  ```typescript
  const playbackFileId = activeClip
    ? (activeClip.eyeContact && activeClip.eyeContactFileId)
      ? activeClip.eyeContactFileId
      : activeClip.fileId
    : null;
  const activeFile = playbackFileId
    ? (files.find((f) => f.id === playbackFileId) ?? { id: playbackFileId } as import("../../types/project").UploadedFile)
    : null;
  ```

- [ ] **Step 2: Update effect dependency and video element**

  In the `useEffect` that syncs play state (the one ending with `}, [isPlaying, activeClip?.startTime, activeFile?.id]);`), change the dependency to:

  ```typescript
  }, [isPlaying, activeClip?.startTime, playbackFileId]);
  ```

  In the `<video>` element, update `key` and `src`:

  ```tsx
  <video
    ref={videoRef}
    key={playbackFileId}
    src={fileUrl(playbackFileId!)}
    className="w-full h-full object-contain"
    muted={effectiveMuted}
    onClick={toggle}
    style={...}
  />
  ```

- [ ] **Step 3: Verify type-check passes**

  ```bash
  cd frontend && pnpm build 2>&1 | head -20
  ```

  Expected: clean.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/Preview/VideoPreview.tsx
  git commit -m "feat: VideoPreview uses eyeContactFileId when eye contact is enabled"
  ```

---

## Task 5: Backend — gaze correction adapter

**Files:**
- Create: `backend/services/gaze_correction/` (cloned + adapted from the repo)

- [ ] **Step 1: Clone the eye-contact-correction repo into a temp location**

  ```bash
  cd /tmp && git clone https://github.com/mvaibhav77/eye-contact-correction.git eye-contact-repo
  ```

- [ ] **Step 2: Copy model files into the backend**

  ```bash
  cp -r /tmp/eye-contact-repo/gaze_correction_system backend/services/gaze_correction
  ```

  Verify the structure:

  ```bash
  ls backend/services/gaze_correction/
  # Expected: flx.py  tf_utils.py  transformation.py  config.py  lm_feat/  weights/  regz_socket_MP_FD.py  ...
  ls backend/services/gaze_correction/weights/warping_model/flx/
  # Expected: 12  (the ef_dim folder)
  ls backend/services/gaze_correction/weights/warping_model/flx/12/
  # Expected: L  R
  ```

- [ ] **Step 3: Patch `flx.py` and `tf_utils.py` for TF 2 compatibility**

  `flx.py` and `tf_utils.py` use TF 1.x APIs (`tf.variable_scope`, `tf.layers.*`, `tf.image.resize_images`) that are removed in TF 2 but still available under `tensorflow.compat.v1`. The fix is to replace the import alias in both files.

  In `backend/services/gaze_correction/flx.py`, change the first line:

  ```python
  # from:
  import tensorflow as tf
  # to:
  import tensorflow.compat.v1 as tf
  ```

  In `backend/services/gaze_correction/tf_utils.py`, change the first line:

  ```python
  # from:
  import tensorflow as tf
  # to:
  import tensorflow.compat.v1 as tf
  ```

  Leave `transformation.py` unchanged — it only uses TF 2-compatible ops (`tf.shape`, `tf.reshape`, `tf.cast`, `tf.linspace`, `tf.meshgrid`).

- [ ] **Step 4: Create `__init__.py`**

  Create `backend/services/gaze_correction/__init__.py` with empty content:

  ```python
  ```

- [ ] **Step 4: Create `corrector.py`** (replaces the socket-based main script — no Windows/socket code)

  Create `backend/services/gaze_correction/corrector.py`:

  ```python
  import sys
  import threading
  from pathlib import Path

  import cv2
  import dlib
  import numpy as np
  import tensorflow as tf

  tf.compat.v1.disable_eager_execution()

  _BASE = Path(__file__).parent
  sys.path.insert(0, str(_BASE))

  import flx as _flx_model  # noqa: E402 (needs sys.path set first)

  _LANDMARK_PATH = str(_BASE / "lm_feat" / "shape_predictor_68_face_landmarks.dat")
  _MODEL_DIR = str(_BASE / "weights" / "warping_model" / "flx" / "12" / "")
  _SIZE_I = (48, 64)   # model input: height, width
  _PIXEL_CUT = (3, 4)  # border pixels to trim when pasting corrected eye back


  def _load_eye_model(side: str, conf):
      g = tf.compat.v1.Graph()
      with g.as_default():
          with tf.compat.v1.name_scope("inputs"):
              input_img = tf.compat.v1.placeholder(
                  tf.float32, [None, conf.height, conf.width, conf.channel], name="input_img"
              )
              input_fp = tf.compat.v1.placeholder(
                  tf.float32, [None, conf.height, conf.width, conf.ef_dim], name="input_fp"
              )
              input_ang = tf.compat.v1.placeholder(
                  tf.float32, [None, conf.agl_dim], name="input_ang"
              )
              phase_train = tf.compat.v1.placeholder(tf.bool, name="phase_train")
          img_pred, _, _ = _flx_model.inference(input_img, input_fp, input_ang, phase_train, conf)
          sess = tf.compat.v1.Session(
              config=tf.compat.v1.ConfigProto(allow_soft_placement=True), graph=g
          )
          saver = tf.compat.v1.train.Saver(tf.compat.v1.global_variables())
          ckpt = tf.compat.v1.train.get_checkpoint_state(_MODEL_DIR + side + "/")
          if ckpt and ckpt.model_checkpoint_path:
              saver.restore(sess, ckpt.model_checkpoint_path)
          else:
              raise RuntimeError(f"No checkpoint found at {_MODEL_DIR}{side}/")
      return sess, {
          "input_img": input_img,
          "input_fp": input_fp,
          "input_ang": input_ang,
          "phase_train": phase_train,
          "img_pred": img_pred,
      }


  def _get_eye_inputs(frame, shape, pos):
      if pos == "R":
          lc, rc, fp_seq = 36, 39, [36, 37, 38, 39, 40, 41]
      else:
          lc, rc, fp_seq = 42, 45, [45, 44, 43, 42, 47, 46]

      eye_cx = (shape.part(rc).x + shape.part(lc).x) * 0.5
      eye_cy = (shape.part(rc).y + shape.part(lc).y) * 0.5
      eye_len = abs(shape.part(rc).x - shape.part(lc).x)
      bx_d5w = eye_len * 3 / 4
      bx_h = 1.5 * bx_d5w
      sft_up = bx_h * 7 / 12
      sft_low = bx_h * 5 / 12

      img_eye = frame[
          int(eye_cy - sft_up): int(eye_cy + sft_low),
          int(eye_cx - bx_d5w): int(eye_cx + bx_d5w),
      ]
      if img_eye.size == 0:
          return None, None, None, None

      ori_size = [img_eye.shape[0], img_eye.shape[1]]
      lt = [int(eye_cy - sft_up), int(eye_cx - bx_d5w)]
      img_eye = cv2.resize(img_eye, (_SIZE_I[1], _SIZE_I[0]))

      ach_map = None
      for i, d in enumerate(fp_seq):
          rx = int((shape.part(d).x - lt[1]) * _SIZE_I[1] / max(ori_size[1], 1))
          ry = int((shape.part(d).y - lt[0]) * _SIZE_I[0] / max(ori_size[0], 1))
          ach_y = np.tile(
              np.expand_dims(np.expand_dims(np.arange(_SIZE_I[0]) - ry, 1), 2),
              [1, _SIZE_I[1], 1],
          )
          ach_x = np.tile(
              np.expand_dims(np.expand_dims(np.arange(_SIZE_I[1]) - rx, 0), 2),
              [_SIZE_I[0], 1, 1],
          )
          pair = np.concatenate((ach_x, ach_y), axis=2)
          ach_map = pair if ach_map is None else np.concatenate((ach_map, pair), axis=2)

      return img_eye / 255.0, ach_map, ori_size, lt


  class GazeCorrector:
      """Thread-safe gaze corrector. Load once via get_corrector()."""

      def __init__(self):
          from config import get_config  # noqa (config.py is in the same dir on sys.path)
          conf, _ = get_config()
          self._conf = conf
          self._detector = dlib.get_frontal_face_detector()
          self._predictor = dlib.shape_predictor(_LANDMARK_PATH)
          self._L_sess, self._L_t = _load_eye_model("L", conf)
          self._R_sess, self._R_t = _load_eye_model("R", conf)

      def correct_frame(self, frame: np.ndarray) -> np.ndarray:
          """Return frame with gaze corrected to face the camera. If no face detected, returns frame unchanged."""
          size_df = (320, 240)
          x_ratio = frame.shape[1] / size_df[0]
          y_ratio = frame.shape[0] / size_df[1]
          gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
          small_gray = cv2.resize(gray, size_df)
          detections = self._detector(small_gray, 0)
          # alpha=[0,0] means "look straight at camera"
          alpha = np.array([[0, 0]], dtype=np.float32)
          pc = _PIXEL_CUT

          for bx in detections:
              target = dlib.rectangle(
                  left=int(bx.left() * x_ratio), right=int(bx.right() * x_ratio),
                  top=int(bx.top() * y_ratio), bottom=int(bx.bottom() * y_ratio),
              )
              shape = self._predictor(gray, target)

              for sess, t, pos in [
                  (self._L_sess, self._L_t, "L"),
                  (self._R_sess, self._R_t, "R"),
              ]:
                  img, fp, ori_size, lt = _get_eye_inputs(frame, shape, pos)
                  if img is None:
                      continue
                  pred = sess.run(t["img_pred"], feed_dict={
                      t["input_img"]: np.expand_dims(img, 0),
                      t["input_fp"]: np.expand_dims(fp, 0),
                      t["input_ang"]: alpha,
                      t["phase_train"]: False,
                  })
                  out = cv2.resize(
                      pred.reshape(_SIZE_I[0], _SIZE_I[1], 3),
                      (ori_size[1], ori_size[0]),
                  )
                  frame[
                      lt[0] + pc[0]: lt[0] + ori_size[0] - pc[0],
                      lt[1] + pc[1]: lt[1] + ori_size[1] - pc[1],
                  ] = out[pc[0]: -pc[0], pc[1]: -pc[1]] * 255
          return frame


  _corrector: GazeCorrector | None = None
  _corrector_lock = threading.Lock()


  def get_corrector() -> GazeCorrector:
      global _corrector
      if _corrector is None:
          with _corrector_lock:
              if _corrector is None:
                  _corrector = GazeCorrector()
      return _corrector
  ```

- [ ] **Step 5: Update `requirements.txt`**

  Add to `backend/requirements.txt`:

  ```
  dlib
  tensorflow>=2.0
  opencv-python
  ```

  > **Note:** `dlib` requires `cmake` to be installed on the host (`brew install cmake` on macOS, `apt install cmake` on Linux).

- [ ] **Step 6: Install new dependencies**

  ```bash
  cd backend && pip install -r requirements.txt
  ```

  Expected: dlib, tensorflow, and opencv-python install without errors. Dlib compilation may take 2–5 minutes.

- [ ] **Step 7: Smoke-test the corrector loads**

  ```bash
  cd backend && python3 -c "
  from services.gaze_correction.corrector import GazeCorrector
  c = GazeCorrector()
  print('GazeCorrector loaded OK')
  "
  ```

  Expected: prints `GazeCorrector loaded OK` (may take 5–10s for TF model loading).

- [ ] **Step 8: Commit**

  ```bash
  git add backend/services/gaze_correction/ backend/requirements.txt
  git commit -m "feat: add adapted gaze correction model (corrector.py + weights)"
  ```

---

## Task 6: Backend — eye contact service (job management)

**Files:**
- Create: `backend/services/eye_contact.py`

- [ ] **Step 1: Create the service file**

  Create `backend/services/eye_contact.py`:

  ```python
  import threading
  import uuid
  import subprocess
  from concurrent.futures import ThreadPoolExecutor
  from dataclasses import dataclass
  from pathlib import Path
  from typing import Literal, Optional

  import cv2

  from services.gaze_correction.corrector import get_corrector

  UPLOADS = Path(__file__).parent.parent / "uploads"
  _executor = ThreadPoolExecutor(max_workers=1)   # one correction job at a time
  _jobs: dict[str, "_JobState"] = {}
  _jobs_lock = threading.Lock()


  @dataclass
  class _JobState:
      status: Literal["processing", "done", "error"] = "processing"
      corrected_file_id: Optional[str] = None
      progress: float = 0.0
      error: Optional[str] = None


  def start_job(file_id: str) -> str:
      job_id = str(uuid.uuid4())
      state = _JobState()
      with _jobs_lock:
          _jobs[job_id] = state
      _executor.submit(_run_job, job_id, file_id, state)
      return job_id


  def get_job(job_id: str) -> Optional[_JobState]:
      with _jobs_lock:
          return _jobs.get(job_id)


  def _run_job(job_id: str, file_id: str, state: _JobState) -> None:
      try:
          matches = list(UPLOADS.glob(f"{file_id}.*"))
          if not matches:
              raise FileNotFoundError(f"Source file {file_id} not found in uploads")
          input_path = str(matches[0])
          corrected_id = str(uuid.uuid4())
          output_path = str(UPLOADS / f"{corrected_id}.mp4")
          _process_video(input_path, output_path, state)
          state.corrected_file_id = corrected_id
          state.status = "done"
          state.progress = 1.0
      except Exception as exc:
          state.status = "error"
          state.error = str(exc)


  def _process_video(input_path: str, output_path: str, state: _JobState) -> None:
      corrector = get_corrector()
      cap = cv2.VideoCapture(input_path)
      fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
      w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
      h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
      total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

      temp_path = str(UPLOADS / f"tmp_{uuid.uuid4().hex}.mp4")
      fourcc = cv2.VideoWriter_fourcc(*"mp4v")
      writer = cv2.VideoWriter(temp_path, fourcc, fps, (w, h))

      frame_idx = 0
      try:
          while cap.isOpened():
              ret, frame = cap.read()
              if not ret:
                  break
              corrected = corrector.correct_frame(frame)
              writer.write(corrected)
              frame_idx += 1
              state.progress = (frame_idx / total_frames) * 0.9  # reserve last 10% for re-encode
      finally:
          cap.release()
          writer.release()

      # Merge corrected video with original audio track
      result = subprocess.run(
          [
              "ffmpeg", "-y",
              "-i", temp_path,
              "-i", input_path,
              "-c:v", "libx264", "-preset", "fast",
              "-c:a", "aac",
              "-map", "0:v:0",
              "-map", "1:a:0?",  # optional audio stream (some clips have none)
              "-shortest",
              output_path,
          ],
          capture_output=True,
          text=True,
      )
      Path(temp_path).unlink(missing_ok=True)
      if result.returncode != 0:
          raise RuntimeError(f"FFmpeg re-encode failed:\n{result.stderr[-2000:]}")
  ```

- [ ] **Step 2: Smoke-test the service is importable**

  ```bash
  cd backend && python3 -c "from services.eye_contact import start_job, get_job; print('OK')"
  ```

  Expected: `OK`

- [ ] **Step 3: Commit**

  ```bash
  git add backend/services/eye_contact.py
  git commit -m "feat: eye contact background job service (frame-by-frame video processing)"
  ```

---

## Task 7: Backend — route + register in main

**Files:**
- Create: `backend/routes/eye_contact.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the route file**

  Create `backend/routes/eye_contact.py`:

  ```python
  from pathlib import Path

  from fastapi import APIRouter, HTTPException
  from pydantic import BaseModel

  import services.eye_contact as svc

  router = APIRouter()
  UPLOADS = Path(__file__).parent.parent / "uploads"


  class ProcessRequest(BaseModel):
      fileId: str


  @router.post("/eye-contact/process")
  async def start_process(req: ProcessRequest):
      matches = list(UPLOADS.glob(f"{req.fileId}.*"))
      if not matches:
          raise HTTPException(404, f"File {req.fileId} not found")
      job_id = svc.start_job(req.fileId)
      return {"jobId": job_id}


  @router.get("/eye-contact/status/{job_id}")
  async def get_status(job_id: str):
      state = svc.get_job(job_id)
      if state is None:
          raise HTTPException(404, "Job not found")
      return {
          "status": state.status,
          "correctedFileId": state.corrected_file_id,
          "progress": state.progress,
          "error": state.error,
      }


  @router.delete("/eye-contact/files/{file_id}")
  async def delete_corrected_file(file_id: str):
      for match in UPLOADS.glob(f"{file_id}.*"):
          match.unlink(missing_ok=True)
      return {"ok": True}
  ```

- [ ] **Step 2: Register the router in main.py**

  In `backend/main.py`, add after the existing router imports:

  ```python
  from routes.eye_contact import router as eye_contact_router
  ```

  And after the last `app.include_router(...)` call:

  ```python
  app.include_router(eye_contact_router)
  ```

- [ ] **Step 3: Start the backend and test the route**

  ```bash
  cd backend && uvicorn main:app --reload &
  sleep 3
  # Check route is registered
  curl -s http://localhost:8000/docs | grep -o "eye-contact" | head -3
  ```

  Expected: `eye-contact` appears in the output (route is registered).

- [ ] **Step 4: Test the full round-trip with a real video**

  Upload a video first via the app (or use `curl`), then:

  ```bash
  # Replace FILE_ID with an actual file ID from your uploads/ directory
  FILE_ID=$(ls backend/uploads/ | head -1 | sed 's/\..*//')
  echo "Testing with file: $FILE_ID"

  # Start a job
  curl -s -X POST http://localhost:8000/eye-contact/process \
    -H "Content-Type: application/json" \
    -d "{\"fileId\": \"$FILE_ID\"}" | python3 -m json.tool

  # Expected: { "jobId": "<uuid>" }
  ```

  Then poll the status:

  ```bash
  JOB_ID="<paste jobId here>"
  curl -s http://localhost:8000/eye-contact/status/$JOB_ID | python3 -m json.tool
  # Expected: { "status": "processing", "progress": 0.xx, ... }
  # Poll again after a few seconds until status is "done"
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add backend/routes/eye_contact.py backend/main.py
  git commit -m "feat: add eye contact API routes (process, status, delete)"
  ```

---

## Task 8: FFmpeg export — use corrected file per clip

**Files:**
- Modify: `backend/services/ffmpeg.py`

- [ ] **Step 1: Resolve eyeContactFileId in export**

  In `backend/services/ffmpeg.py`, find the loop that resolves clip paths (around line 32):

  ```python
          for clip in track.get("clips", []):
              matches = list(uploads_dir.glob(f"{clip['fileId']}.*"))
  ```

  Replace with:

  ```python
          for clip in track.get("clips", []):
              file_id = clip.get("eyeContactFileId") or clip["fileId"]
              matches = list(uploads_dir.glob(f"{file_id}.*"))
  ```

  Also update the `clips.append` call that stores `path` to keep using the resolved `matches[0]`:

  ```python
              if matches:
                  clips.append({**clip, "path": str(matches[0]), "track_muted": track.get("muted", False)})
              else:
                  print(f"[ffmpeg export] WARNING: file not found for clip {file_id}, skipping")
  ```

  (Only the `file_id` variable name and the warning message change — `matches[0]` is still used for the path.)

- [ ] **Step 2: Restart backend and run an export with an eye-contact clip**

  With a clip that has `eyeContact=true` and `eyeContactFileId` set:

  ```bash
  # Export via the UI, or test directly:
  curl -s -X POST http://localhost:8000/export \
    -H "Content-Type: application/json" \
    -d '{"tracks": [...], "aspectRatio": "16:9", ...}' \
    --output /tmp/test-export.mp4
  ```

  Expected: export succeeds and the corrected clip appears in the output video.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/services/ffmpeg.py
  git commit -m "feat: ffmpeg export uses eyeContactFileId when set on a clip"
  ```

---

## End-to-end verification

- [ ] Start both servers: `cd backend && uvicorn main:app --reload` and `cd frontend && pnpm dev`
- [ ] Upload a video of someone talking to camera but glancing off to the side
- [ ] Select the clip in the timeline → Properties panel → Effects section
- [ ] Toggle **Eye Contact** on
- [ ] Verify the toggle enters "Processing…" state and the spinner is shown
- [ ] Poll the status in DevTools Network tab — confirm `GET /eye-contact/status/:jobId` returns `progress` incrementing
- [ ] Wait for processing to complete — toggle should snap to active (teal)
- [ ] Scrub the playhead over that clip — preview should show the corrected video (eyes looking at camera)
- [ ] Toggle off — preview reverts to original
- [ ] Toggle on again — no new job fires (uses cached `eyeContactFileId`)
- [ ] Export the project — verify exported MP4 uses the corrected clip for that segment
- [ ] Delete the clip from the timeline — verify `DELETE /eye-contact/files/:correctedFileId` fires in DevTools Network
