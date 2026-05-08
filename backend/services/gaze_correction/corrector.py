import os
import sys
import threading
from pathlib import Path

# Must be set before TF is imported so tf.compat.v1.layers resolves to tf_keras (legacy Keras).
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import cv2
import dlib
import numpy as np
import tensorflow as tf

tf.compat.v1.disable_eager_execution()

_BASE = Path(__file__).parent
sys.path.insert(0, str(_BASE))

import flx as _flx_model  # noqa: E402 (needs sys.path set first)

_LANDMARK_PATH = str(_BASE / "lm_feat" / "shape_predictor_68_face_landmarks.dat")
_MODEL_DIR = str(_BASE / "weights" / "warping_model" / "flx" / "12") + "/"
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

    def correct_frame(self, frame: np.ndarray) -> tuple[np.ndarray, int]:
        """Return (corrected_frame, faces_detected). If no face found, frame is unchanged."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Run detection on full-res image with 1 upsample pass so small/distant faces are found
        detections = self._detector(gray, 1)
        # alpha=[0,0] means "look straight at camera"
        alpha = np.array([[0, 0]], dtype=np.float32)
        pc = _PIXEL_CUT

        for bx in detections:
            target = dlib.rectangle(
                left=bx.left(), right=bx.right(),
                top=bx.top(), bottom=bx.bottom(),
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
        return frame, len(detections)


_corrector: GazeCorrector | None = None
_corrector_lock = threading.Lock()


def get_corrector() -> GazeCorrector:
    global _corrector
    if _corrector is None:
        with _corrector_lock:
            if _corrector is None:
                _corrector = GazeCorrector()
    return _corrector
