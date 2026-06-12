import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { SplitIcon } from "../Icons";
import { outputToEdit } from "../../lib/speedRamp";

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
  const { zoom, setZoom, addTrack, playheadTime, isPlaying, addTextOverlay, project } = useProjectStore();
  // Text overlays are stored in EDIT time; the playhead is OUTPUT time.
  const addAtEdit = () => outputToEdit(playheadTime, project.hiddenEffectLanes?.speedramp ? [] : project.effectOverlays ?? []);
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
    const at = addAtEdit();
    addTextOverlay({
      text: "Text",
      startTime: at,
      endTime: at + 3,
      x: 50,
      y: 50,
      fontSize: 32,
      fontFamily: "sans-serif",
      color: "#ffffff",
      fontWeight: "bold",
      background: "transparent",
    });
  }

  function handleAddBellyBand() {
    const at = addAtEdit();
    addTextOverlay({
      text: "Your text here",
      startTime: at,
      endTime: at + 5,
      x: 50,
      y: 85,
      fontSize: 32,
      fontFamily: "sans-serif",
      color: "#ffffff",
      fontWeight: "bold",
      background: "#7c3aed",
      shape: "pill",
      animateIn: "slide-up",
      animateOut: "slide-down",
      animateDuration: 0.4,
    });
  }

  const btnClass = "px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--label-bg)] hover:bg-[var(--hover)] text-[var(--txt2)] hover:text-[var(--txt1)] text-[11px] font-medium cursor-pointer transition-colors";

  return (
    <div className="flex items-center px-3 py-1.5 bg-[var(--panel)] border-b border-[var(--border)] text-xs flex-shrink-0">
      {/* Left: timecode */}
      <div className="flex-1 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            className="font-mono text-[var(--txt1)] bg-[var(--label-bg)] border border-[var(--accent)]/60 rounded px-1 w-24 outline-none text-[11px]"
            placeholder="0:00.00"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            className="font-mono text-[var(--accent)] cursor-text hover:underline underline-offset-2 w-24 text-[11px] font-medium"
            title="Click to enter timecode"
            onClick={startEdit}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(); }}
          >
            {fmt(playheadTime)}
          </span>
        )}
      </div>

      {/* Center: playback + editing controls */}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={toggle} className={`px-2 py-0.5 w-8 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] hover:bg-[oklch(70% 0.16 55 / 0.18)] text-[var(--accent)] text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center`}>
          {isPlaying ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="0" width="3.5" height="11"/><rect x="6.5" y="0" width="3.5" height="11"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="0,0 11,5.5 0,11"/></svg>
          )}
        </button>
        <div className="w-px h-4 bg-var(--border)" />
        <button type="button" onClick={onSplit} className={`${btnClass} flex items-center gap-1`}>
          <SplitIcon />
          Split (S)
        </button>
        <button type="button" onClick={() => addTrack("video")} className={btnClass}>+ Video</button>
        <button type="button" onClick={() => addTrack("audio")} className={btnClass}>+ Audio</button>
        <button type="button" onClick={handleAddText} className={btnClass} title="Add text overlay">T</button>
        <button type="button" onClick={handleAddBellyBand} className={btnClass} title="Add belly band overlay">Belly Band</button>
      </div>

      {/* Right: zoom */}
      <div className="flex-1 flex items-center gap-1.5 justify-end">
        <span className="text-[var(--txt2)] w-14 text-right text-[11px]">{Math.round(zoom)}px/s</span>
        <button type="button" onClick={() => setZoom(zoom - 15)} className={btnClass}>−</button>
        <button type="button" onClick={() => setZoom(zoom + 15)} className={btnClass}>+</button>
      </div>
    </div>
  );
}
