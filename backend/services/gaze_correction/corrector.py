import concurrent.futures
import os
import sys
import threading
from pathlib import Path

os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import cv2
import dlib
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
import numpy as np
import tensorflow as tf

tf.compat.v1.disable_eager_execution()

_BASE = Path(__file__).parent
sys.path.insert(0, str(_BASE))

import flx as _flx_model  # noqa: E402

_LANDMARK_PATH = str(_BASE / "lm_feat" / "shape_predictor_68_face_landmarks.dat")
_MODEL_DIR = str(_BASE / "weights" / "warping_model" / "flx" / "12") + "/"
_SIZE_I = (48, 64)
_PIXEL_CUT = (3, 4)

_IRIS_SCALE = 150.0          # scale for fallback dark-pixel iris detection
_MP_IRIS_SCALE = 100.0       # scale for MediaPipe iris detection
_CORRECTION_STRENGTH = 0.8
_MAX_ANGLE_DEG = 12.0
_DETECT_SCALE = 0.5
_INFER_EVERY_N = 1

# Temporal smoothing: EMA keeps the correction signal from jumping on saccades.
# Lower alpha = smoother output but slower to track real gaze shifts.
_GAZE_SMOOTH_ALPHA = 0.12

# Rate limiter: caps how many degrees the applied correction can change per frame.
# Prevents sudden discontinuities even if the smoothed estimate jumps.
_RATE_LIMIT_DEG_PER_FRAME = 0.8

# MediaPipe FaceMesh landmark indices (requires refine_landmarks=True, 478 total)
_MP_LEFT_IRIS_CENTER = 468   # subject's left eye iris centre
_MP_RIGHT_IRIS_CENTER = 473  # subject's right eye iris centre
_MP_LEFT_EYE_OUTER = 33      # temporal (outer) corner, left eye
_MP_LEFT_EYE_INNER = 133     # nasal (inner) corner, left eye
_MP_RIGHT_EYE_INNER = 362    # nasal (inner) corner, right eye
_MP_RIGHT_EYE_OUTER = 263    # temporal (outer) corner, right eye


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
        "input_fp":  input_fp,
        "input_ang": input_ang,
        "phase_train": phase_train,
        "img_pred":  img_pred,
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


def _iris_offset_fallback(eye_patch_norm: np.ndarray) -> tuple[float, float]:
    """Fallback: estimate iris centre from dark-pixel centroid in the eye patch."""
    gray = cv2.cvtColor((eye_patch_norm * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    threshold = float(np.percentile(gray, 20))
    mask = (gray <= threshold).astype(np.uint8)
    M = cv2.moments(mask)
    if M["m00"] == 0:
        return 0.0, 0.0
    h, w = gray.shape
    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]
    return (cx - w / 2.0) / w, (cy - h / 2.0) / h


class GazeCorrector:
    """Thread-safe gaze corrector. Load once via get_corrector()."""

    def __init__(self):
        from config import get_config  # noqa
        conf, _ = get_config()
        self._conf = conf
        self._detector = dlib.get_frontal_face_detector()
        self._predictor = dlib.shape_predictor(_LANDMARK_PATH)
        self._L_sess, self._L_t = _load_eye_model("L", conf)
        self._R_sess, self._R_t = _load_eye_model("R", conf)
        self._infer_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._frame_idx = 0
        self._patch_cache: list[tuple] = []

        # MediaPipe FaceLandmarker (Tasks API) with iris refinement for accurate iris detection
        _task_path = str(_BASE / "face_landmarker.task")
        _base_opts = mp_python.BaseOptions(model_asset_path=_task_path)
        _fl_opts = mp_vision.FaceLandmarkerOptions(
            base_options=_base_opts,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1,
        )
        self._mp_landmarker = mp_vision.FaceLandmarker.create_from_options(_fl_opts)

        # Temporal smoothing state (EMA + rate limiter)
        self._smoothed_a_h = 0.0
        self._smoothed_a_v = 0.0
        self._prev_a_h = 0.0
        self._prev_a_v = 0.0

    def _iris_offset_mp(self, frame: np.ndarray, h: int, w: int) -> tuple[float | None, float | None]:
        """Return (dx, dy) iris gaze offset using MediaPipe iris landmarks.
        Positive dx = iris right of eye centre, positive dy = iris below centre.
        Both values normalised by eye width.  Returns (None, None) if no face found.
        """
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        result = self._mp_landmarker.detect(mp_img)
        if not result.face_landmarks:
            return None, None

        lm = result.face_landmarks[0]

        def xy(idx: int) -> tuple[float, float]:
            return lm[idx].x * w, lm[idx].y * h

        # Left eye (subject's perspective)
        li_x, li_y = xy(_MP_LEFT_IRIS_CENTER)
        lo_x, lo_y = xy(_MP_LEFT_EYE_OUTER)
        lin_x, lin_y = xy(_MP_LEFT_EYE_INNER)
        le_cx, le_cy = (lo_x + lin_x) / 2, (lo_y + lin_y) / 2
        le_w = abs(lo_x - lin_x)

        # Right eye (subject's perspective)
        ri_x, ri_y = xy(_MP_RIGHT_IRIS_CENTER)
        rin_x, rin_y = xy(_MP_RIGHT_EYE_INNER)
        ro_x, ro_y = xy(_MP_RIGHT_EYE_OUTER)
        re_cx, re_cy = (rin_x + ro_x) / 2, (rin_y + ro_y) / 2
        re_w = abs(ro_x - rin_x)

        if le_w < 1 or re_w < 1:
            return None, None

        dx = ((li_x - le_cx) / le_w + (ri_x - re_cx) / re_w) / 2
        dy = ((li_y - le_cy) / le_w + (ri_y - re_cy) / re_w) / 2
        return dx, dy

    def _infer_eye(self, sess, t, img, fp, alpha) -> np.ndarray:
        return sess.run(t["img_pred"], feed_dict={
            t["input_img"]: np.expand_dims(img, 0),
            t["input_fp"]:  np.expand_dims(fp, 0),
            t["input_ang"]: alpha,
            t["phase_train"]: False,
        })

    def correct_frame(self, frame: np.ndarray) -> tuple[np.ndarray, int]:
        """Return (corrected_frame, faces_detected). Frame modified in-place."""
        h, w = frame.shape[:2]
        run_infer = (self._frame_idx % _INFER_EVERY_N == 0)
        self._frame_idx += 1

        if run_infer:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # MediaPipe iris detection — run once per frame before the dlib loop
            mp_dx, mp_dy = self._iris_offset_mp(frame, h, w)

            # Face detection at reduced resolution (dlib needed for FLX eye patches)
            dw, dh = max(1, int(w * _DETECT_SCALE)), max(1, int(h * _DETECT_SCALE))
            small_gray = cv2.resize(gray, (dw, dh))
            raw_dets = self._detector(small_gray, 0)
            inv = 1.0 / _DETECT_SCALE
            detections = [dlib.rectangle(
                left=int(bx.left() * inv), right=int(bx.right() * inv),
                top=int(bx.top() * inv), bottom=int(bx.bottom() * inv),
            ) for bx in raw_dets]

            self._patch_cache = []
            pc = _PIXEL_CUT

            for bx in detections:
                shape = self._predictor(gray, bx)

                eye_data: dict[str, tuple] = {}
                for pos in ("L", "R"):
                    result = _get_eye_inputs(frame, shape, pos)
                    if result[0] is not None:
                        eye_data[pos] = result

                if not eye_data:
                    continue

                # Prefer MediaPipe iris offsets; fall back to dark-pixel centroid
                if mp_dx is not None:
                    dx, dy = mp_dx, mp_dy
                    scale = _MP_IRIS_SCALE
                else:
                    offsets = [_iris_offset_fallback(d[0]) for d in eye_data.values()]
                    dx = sum(o[0] for o in offsets) / len(offsets)
                    dy = sum(o[1] for o in offsets) / len(offsets)
                    scale = _IRIS_SCALE

                a_h_raw = max(-_MAX_ANGLE_DEG, min(_MAX_ANGLE_DEG, -dx * scale * _CORRECTION_STRENGTH))
                a_v_raw = max(-_MAX_ANGLE_DEG, min(_MAX_ANGLE_DEG, -dy * scale * _CORRECTION_STRENGTH))

                # EMA smoothing: keeps the correction from jumping on saccades
                self._smoothed_a_h = _GAZE_SMOOTH_ALPHA * a_h_raw + (1 - _GAZE_SMOOTH_ALPHA) * self._smoothed_a_h
                self._smoothed_a_v = _GAZE_SMOOTH_ALPHA * a_v_raw + (1 - _GAZE_SMOOTH_ALPHA) * self._smoothed_a_v

                # Rate limiter: caps the change between consecutive frames
                a_h = self._prev_a_h + np.clip(
                    self._smoothed_a_h - self._prev_a_h,
                    -_RATE_LIMIT_DEG_PER_FRAME,
                    _RATE_LIMIT_DEG_PER_FRAME,
                )
                a_v = self._prev_a_v + np.clip(
                    self._smoothed_a_v - self._prev_a_v,
                    -_RATE_LIMIT_DEG_PER_FRAME,
                    _RATE_LIMIT_DEG_PER_FRAME,
                )
                self._prev_a_h = a_h
                self._prev_a_v = a_v

                _gaze_log["total"] += 1
                _gaze_log["av_sum"] += abs(a_v)
                _gaze_log["ah_sum"] += abs(a_h)
                if _gaze_log["total"] % 100 == 0:
                    n = _gaze_log["total"]
                    src = "mp" if mp_dx is not None else "fallback"
                    print(
                        f"[gaze] frames={n} src={src} "
                        f"avg|a_v|={_gaze_log['av_sum']/n:.1f}° "
                        f"avg|a_h|={_gaze_log['ah_sum']/n:.1f}°",
                        flush=True,
                    )

                alpha = np.array([[a_v, a_h]], dtype=np.float32)

                # Run L and R inference in parallel
                sess_map = {"L": (self._L_sess, self._L_t), "R": (self._R_sess, self._R_t)}
                futures = {
                    pos: self._infer_pool.submit(self._infer_eye, sess, t, img, fp, alpha)
                    for pos, (img, fp, _, _lt) in eye_data.items()
                    for sess, t in [sess_map[pos]]
                }

                for pos, fut in futures.items():
                    pred = fut.result()
                    img, fp, ori_size, lt = eye_data[pos]
                    out = cv2.resize(
                        pred.reshape(_SIZE_I[0], _SIZE_I[1], 3),
                        (ori_size[1], ori_size[0]),
                        interpolation=cv2.INTER_LINEAR,
                    )
                    out_cropped = np.clip(
                        out[pc[0]: ori_size[0] - pc[0], pc[1]: ori_size[1] - pc[1]] * 255,
                        0, 255,
                    ).astype(np.uint8)
                    y1 = lt[0] + pc[0]
                    y2 = lt[0] + ori_size[0] - pc[0]
                    x1 = lt[1] + pc[1]
                    x2 = lt[1] + ori_size[1] - pc[1]
                    self._patch_cache.append((out_cropped, y1, y2, x1, x2))

        # Apply cached patches (from this frame or the last inferred frame)
        fh, fw = frame.shape[:2]
        for out_cropped, y1, y2, x1, x2 in self._patch_cache:
            if y1 >= 0 and x1 >= 0 and y2 <= fh and x2 <= fw:
                frame[y1:y2, x1:x2] = out_cropped

        return frame, len(self._patch_cache)


_gaze_log: dict[str, float] = {"total": 0, "av_sum": 0.0, "ah_sum": 0.0}
_corrector: GazeCorrector | None = None
_corrector_lock = threading.Lock()


def get_corrector() -> GazeCorrector:
    global _corrector
    if _corrector is None:
        with _corrector_lock:
            if _corrector is None:
                _corrector = GazeCorrector()
    return _corrector
