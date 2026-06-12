import { useRef, useState } from "react";
import TranscriptTab from "./TranscriptTab";
import { useProjectStore } from "../../store/useProjectStore";
import { WarningIcon, Trash2Icon } from "../Icons";

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

interface Props { seek: (t: number) => void }

function TranscriptIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "var(--accent)" : "var(--txt3)"} strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 5h12M4 9h12M4 13h8" />
    </svg>
  );
}

export default function LeftPanel({ seek }: Props) {
  const { transcriptSelection, setTranscriptSelection, deleteTimeRange } = useProjectStore();
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: panelRef.current?.offsetWidth ?? 300 };

    function onMove(ev: MouseEvent) {
      if (!dragState.current || !panelRef.current) return;
      const delta = ev.clientX - dragState.current.startX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta));
      panelRef.current.style.width = `${newW}px`;
    }
    function onUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleDeleteSelection() {
    if (!transcriptSelection) return;
    deleteTimeRange(transcriptSelection.startTime, transcriptSelection.endTime);
    setTranscriptSelection(null);
  }

  return (
    <div className="flex flex-shrink-0 border-r border-[var(--border)]">
      {/* Vertical icon strip */}
      <div className="w-[48px] flex flex-col items-center pt-3 px-1 gap-0.5 bg-[var(--panel-2)] border-r border-[var(--border)]">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`w-[36px] h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer
              ${open
                ? "bg-[var(--accent-soft)]"
                : "hover:bg-[var(--hover)]"}`}
            title="Transcript"
          >
            <TranscriptIcon active={open} />
          </button>
          <span className={`text-[9px] font-medium leading-none ${open ? "text-[var(--accent)]" : "text-[var(--txt3)]"}`}>
            Transcript
          </span>
        </div>
      </div>

      {/* Expandable transcript content */}
      {open && (
        <div
          ref={panelRef}
          className="relative flex flex-col bg-[var(--panel)]"
          style={{ width: 280 }}
        >
          {transcriptSelection && (
            <div className="flex items-center px-3 py-1.5 border-b border-amber-500/20 bg-amber-500/10 flex-shrink-0 gap-2">
              <WarningIcon className="text-amber-500 flex-shrink-0" />
              <span className="text-[11px] text-amber-400 flex-1 font-medium">
                {(transcriptSelection.endTime - transcriptSelection.startTime).toFixed(1)}s selected
              </span>
              <button
                type="button"
                onClick={() => setTranscriptSelection(null)}
                className="text-[11px] text-amber-500 hover:text-amber-300 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelection}
                className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 font-semibold px-2 py-0.5 rounded bg-red-500/15 hover:bg-red-500/25 transition-colors cursor-pointer"
              >
                <Trash2Icon />
                Delete
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TranscriptTab seek={seek} />
          </div>
          {/* Resize handle on right edge */}
          <div
            role="presentation"
            className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--accent)] transition-colors"
            onMouseDown={onResizeMouseDown}
          />
        </div>
      )}
    </div>
  );
}
