import threading
from pathlib import Path
from faster_whisper import WhisperModel

_model = None
_model_lock = threading.Lock()

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model

def transcribe(file_path: Path) -> list[dict]:
    model = get_model()
    segments, _ = model.transcribe(str(file_path), beam_size=5, word_timestamps=True)
    result = []
    for seg in segments:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({"text": w.word.strip(), "start": w.start, "end": w.end})
        result.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "words": words,
        })
    return result
