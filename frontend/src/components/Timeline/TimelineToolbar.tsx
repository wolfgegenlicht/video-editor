import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { SplitIcon } from "../Icons";

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

  const btnClass = "px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-medium cursor-pointer transition-colors";

  return (
    <div className="flex items-center px-3 py-1.5 bg-white border-b border-slate-200 text-xs flex-shrink-0">
      {/* Left: timecode */}
      <div className="flex-1 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            className="font-mono text-slate-800 bg-white border border-teal-400 rounded px-1 w-24 outline-none ring-1 ring-teal-400 text-[11px]"
            placeholder="0:00.00"
          />
        ) : (
          <span
            className="font-mono text-slate-500 cursor-text hover:text-teal-600 hover:underline underline-offset-2 w-24 text-[11px] font-medium"
            title="Click to enter timecode"
            onClick={startEdit}
          >
            {fmt(playheadTime)}
          </span>
        )}
      </div>

      {/* Center: playback + editing controls */}
      <div className="flex items-center gap-1.5">
        <button onClick={toggle} className={`${btnClass} w-8 flex items-center justify-center`}>
          {isPlaying ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="0" width="3.5" height="11"/><rect x="6.5" y="0" width="3.5" height="11"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="0,0 11,5.5 0,11"/></svg>
          )}
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <button onClick={onSplit} className={`${btnClass} flex items-center gap-1`}>
          <SplitIcon />
          Split (S)
        </button>
        <button onClick={() => addTrack("video")} className={btnClass}>+ Video</button>
        <button onClick={() => addTrack("audio")} className={btnClass}>+ Audio</button>
        <button onClick={handleAddText} className={btnClass} title="Add text overlay">T</button>
      </div>

      {/* Right: zoom */}
      <div className="flex-1 flex items-center gap-1.5 justify-end">
        <span className="text-slate-400 w-14 text-right text-[11px]">{Math.round(zoom)}px/s</span>
        <button onClick={() => setZoom(zoom - 15)} className={btnClass}>−</button>
        <button onClick={() => setZoom(zoom + 15)} className={btnClass}>+</button>
      </div>
    </div>
  );
}
