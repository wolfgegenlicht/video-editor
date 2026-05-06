import { useRef, useState } from "react";
import MediaTab from "./MediaTab";
import TranscriptTab from "./TranscriptTab";
import ClipPropertiesPanel from "./ClipPropertiesPanel";
import { useProjectStore } from "../../store/useProjectStore";

type Tab = "Media" | "Transcript" | "Properties";

interface Props { seek: (t: number) => void }

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

export default function LeftPanel({ seek }: Props) {
  const { leftPanelTab: tab, selectLeftPanelTab: setTab } = useProjectStore();
  const [width, setWidth] = useState(240);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };

    function onMove(ev: MouseEvent) {
      if (!dragState.current) return;
      const delta = ev.clientX - dragState.current.startX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta)));
    }
    function onUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <aside className="relative bg-white border-r border-gray-200 flex flex-col flex-shrink-0" style={{ width }}>
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(["Media", "Transcript", "Properties"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors
              ${tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "Media" && <MediaTab />}
        {tab === "Transcript" && <TranscriptTab seek={seek} />}
        {tab === "Properties" && <ClipPropertiesPanel />}
      </div>
      {/* Drag handle on right edge */}
      <div
        className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400 transition-colors"
        onMouseDown={onResizeMouseDown}
      />
    </aside>
  );
}
