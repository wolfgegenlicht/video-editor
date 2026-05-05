import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { transcribeFile } from "../../lib/api";
import { v4 as uuid } from "uuid";
import CaptionStylePicker from "./CaptionStylePicker";

export default function TranscriptTab() {
  const { files, project, setCaption } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const segments = project.captions.map((c) => ({
    start: c.startTime,
    end: c.endTime,
    text: c.text,
  }));

  async function handleTranscribe() {
    const videoFile = files.find((f) => f.width > 0);
    if (!videoFile) {
      alert("Add a video file first");
      return;
    }
    setLoading(true);
    try {
      const segs = await transcribeFile(videoFile.id);
      setCaption(segs.map((s) => ({ id: uuid(), text: s.text, startTime: s.start, endTime: s.end })));
    } catch (e) {
      alert("Transcription failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-100">
        <button
          onClick={handleTranscribe}
          disabled={loading}
          className="w-full py-2 text-xs bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Transcribing…" : "Auto-Transcribe"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
        {segments.map((seg, i) => (
          <div key={i} className="p-2 rounded hover:bg-gray-50">
            <p className="text-[10px] text-gray-400 mb-0.5">
              {seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s
            </p>
            <p className="text-xs text-gray-800 leading-relaxed">{seg.text}</p>
          </div>
        ))}
        {!segments.length && (
          <p className="text-xs text-gray-400 text-center pt-4">No transcript yet</p>
        )}
      </div>
      <CaptionStylePicker />
    </div>
  );
}
