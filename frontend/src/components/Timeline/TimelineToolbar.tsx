import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  onSplit: () => void;
  toggle: () => void;
  seek: (time: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

// Accept: "1:23", "1:23.5", "1:23.45", "83", "83.5"
function parseTimecode(raw: string): number | null {
  const s = raw.trim();
  const colonParts = s.split(":");
  if (colonParts.length === 2) {
    const mins = parseFloat(colonParts[0]);
    const secs = parseFloat(colonParts[1]);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export default function TimelineToolbar({ onSplit, toggle, seek }: Props) {
  const { zoom, setZoom, addTrack, playheadTime, isPlaying, addTextOverlay } = useProjectStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(fmt(playheadTime));
    setEditing(true);
    // select-all happens after the input mounts
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const t = parseTimecode(draft);
    if (t !== null) seek(Math.max(0, t));
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") setEditing(false);
  }

  function handleAddText() {
    addTextOverlay({
      text: "Text",
      startTime: playheadTime,
      endTime: playheadTime + 3,
      x: 50,
      y: 50,
      fontSize: 32,
      color: "#ffffff",
      fontWeight: "bold",
      background: "transparent",
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs flex-shrink-0">
      <button onClick={toggle} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100 w-12 text-center">
        {isPlaying ? "⏸" : "▶"}
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button onClick={() => setZoom(zoom + 15)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">+</button>
      <button onClick={() => setZoom(zoom - 15)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">−</button>
      <span className="text-gray-400 w-14">{zoom}px/s</span>
      <button onClick={onSplit} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">Split (S)</button>
      <button onClick={() => addTrack("video")} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">+ Video</button>
      <button onClick={() => addTrack("audio")} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">+ Audio</button>
      <button onClick={handleAddText} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100" title="Add text overlay">T</button>
      <div className="flex-1" />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="font-mono text-gray-800 bg-white border border-blue-400 rounded px-1 w-24 text-right outline-none ring-1 ring-blue-400"
          placeholder="0:00.00"
        />
      ) : (
        <span
          className="font-mono text-gray-600 cursor-text hover:text-blue-600 hover:underline underline-offset-2 w-24 text-right"
          title="Click to enter timecode"
          onClick={startEdit}
        >
          {fmt(playheadTime)}
        </span>
      )}
    </div>
  );
}
