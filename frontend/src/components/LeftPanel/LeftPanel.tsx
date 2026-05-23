import { useRef, useState } from "react";
import TranscriptTab from "./TranscriptTab";
import { useProjectStore } from "../../store/useProjectStore";
import { WarningIcon, Trash2Icon } from "../Icons";

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

interface Props { seek: (t: number) => void }

function TranscriptIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0d9488" : "#9b9baa"} strokeWidth="1.6" strokeLinecap="round">
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
    <div className="flex flex-shrink-0 border-r border-black/[0.06]">
      {/* Vertical icon strip */}
      <div className="w-[80px] flex flex-col items-center pt-3 p-8 gap-0.5 bg-[#f7f7fa] border-r border-black/[0.06]">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-[52px] flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg transition-colors cursor-pointer
            ${open
              ? "bg-[rgba(14,165,160,0.08)] text-[#0d9488]"
              : "text-[#6b6b78] hover:bg-[#ebebef] hover:text-[#141416]"}`}
          title="Transcript"
        >
          <TranscriptIcon active={open} />
          <span className={`text-[11px] font-normal leading-none ${open ? "text-[#0d9488]" : "text-[#6b6b78]"}`}>
            Transcript
          </span>
        </button>
      </div>

      {/* Expandable transcript content */}
      {open && (
        <div
          ref={panelRef}
          className="relative flex flex-col bg-white"
          style={{ width: 280 }}
        >
          {transcriptSelection && (
            <div className="flex items-center px-3 py-1.5 border-b border-amber-500/20 bg-amber-500/10 flex-shrink-0 gap-2">
              <WarningIcon className="text-amber-500 flex-shrink-0" />
              <span className="text-[11px] text-amber-400 flex-1 font-medium">
                {(transcriptSelection.endTime - transcriptSelection.startTime).toFixed(1)}s selected
              </span>
              <button
                onClick={() => setTranscriptSelection(null)}
                className="text-[11px] text-amber-500 hover:text-amber-300 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
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
            className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-[#0ea5a0] transition-colors"
            onMouseDown={onResizeMouseDown}
          />
        </div>
      )}
    </div>
  );
}
