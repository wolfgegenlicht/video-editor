from pathlib import Path
from faster_whisper import WhisperModel

_model = None

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model

def transcribe(file_path: Path) -> list[dict]:
    model = get_model()
    segments, _ = model.transcribe(str(file_path), beam_size=5)
    return [
        {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
        for seg in segments
    ]
