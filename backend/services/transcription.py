import threading
from pathlib import Path
import torch
import whisperx

_model = None
_align_models: dict = {}
_model_lock = threading.Lock()
_align_lock = threading.Lock()

def _device() -> tuple[str, str]:
    if torch.cuda.is_available():
        return "cuda", "float16"
    return "cpu", "int8"

def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                device, compute_type = _device()
                _model = whisperx.load_model("deepdml/faster-whisper-large-v3-turbo-ct2", device, compute_type=compute_type)
    return _model

def _get_align_model(language: str):
    if language not in _align_models:
        with _align_lock:
            if language not in _align_models:
                device, _ = _device()
                align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
                _align_models[language] = (align_model, metadata)
    return _align_models[language]

def transcribe(file_path: Path) -> list[dict]:
    device, _ = _device()
    audio = whisperx.load_audio(str(file_path))

    model = _get_model()
    batch_size = 8 if device == "cuda" else 4
    result = model.transcribe(audio, batch_size=batch_size)

    language = result.get("language", "de")
    align_model, metadata = _get_align_model(language)
    result = whisperx.align(
        result["segments"], align_model, metadata, audio, device,
        return_char_alignments=False,
    )

    output = []
    for seg in result["segments"]:
        words = []
        for w in seg.get("words", []):
            if "start" in w and "end" in w:
                words.append({"text": w["word"].strip(), "start": w["start"], "end": w["end"]})
        output.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
            "words": words,
        })
    return output
