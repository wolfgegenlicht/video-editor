import { useProjectStore } from "../../store/useProjectStore";
import type { EffectOverlay } from "../../types/project";

interface Props {
  zoom: number;
  totalWidth: number;
  height: number;
}

export default function EffectOverlayTrack({ zoom, totalWidth, height }: Props) {
  const effectOverlays = useProjectStore((s) => s.project.effectOverlays);
  const selectedEffectOverlayId = useProjectStore((s) => s.selectedEffectOverlayId);
  const { addEffectOverlay, addEffectOverlayWithId, moveEffectOverlay, moveEffectOverlayLive, resizeEffectOverlay, resizeEffectOverlayLive, selectEffectOverlay } =
    useProjectStore();

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const effectType = e.dataTransfer.getData("effectType");
    if (effectType !== "zoom") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startTime = Math.max(0, (e.clientX - rect.left) / zoom);
    addEffectOverlay({
      type: "zoom",
      startTime,
      endTime: startTime + 3,
      params: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
    });
  }

  return (
    <div
      className="border-b border-slate-100 relative bg-violet-50"
      style={{ width: totalWidth, height }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={() => selectEffectOverlay(null)}
    >
      {effectOverlays.map((effect) => (
        <EffectBlock
          key={effect.id}
          effect={effect}
          zoom={zoom}
          selected={effect.id === selectedEffectOverlayId}
          onSelect={() => selectEffectOverlay(effect.id)}
          onMove={(newStart) => moveEffectOverlayLive(effect.id, newStart)}
          onMoveCommit={(newStart) => moveEffectOverlay(effect.id, newStart)}
          onResize={(newStart, newEnd) => resizeEffectOverlayLive(effect.id, newStart, newEnd)}
          onResizeCommit={(newStart, newEnd) => resizeEffectOverlay(effect.id, newStart, newEnd)}
          onDuplicate={(clone) => {
            addEffectOverlayWithId(clone);
            selectEffectOverlay(clone.id);
          }}
        />
      ))}
    </div>
  );
}

function EffectBlock({
  effect,
  zoom,
  selected,
  onSelect,
  onMove,
  onMoveCommit,
  onResize,
  onResizeCommit,
  onDuplicate,
}: {
  effect: EffectOverlay;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (newStart: number) => void;
  onMoveCommit: (newStart: number) => void;
  onResize: (newStart: number, newEnd: number) => void;
  onResizeCommit: (newStart: number, newEnd: number) => void;
  onDuplicate: (clone: EffectOverlay) => void;
}) {
  const { moveEffectOverlayLive, moveEffectOverlay } = useProjectStore();
  const left = effect.startTime * zoom;
  const width = Math.max((effect.endTime - effect.startTime) * zoom, 8);

  function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const origStart = effect.startTime;
    const origEnd = effect.endTime;
    let lastStart = origStart;
    let lastEnd = origEnd;

    // Alt+drag: create a clone immediately and drag it instead
    const isAltDuplicate = e.altKey && mode === "move";
    let cloneId: string | null = null;
    if (isAltDuplicate) {
      const clone: EffectOverlay = {
        ...effect,
        id: crypto.randomUUID(),
      };
      cloneId = clone.id;
      onDuplicate(clone);
    }

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (mode === "move") {
        lastStart = Math.max(0, origStart + dt);
        lastEnd = lastStart + (origEnd - origStart);
        if (cloneId) {
          moveEffectOverlayLive(cloneId, lastStart);
        } else {
          onMove(lastStart);
        }
      } else if (mode === "left") {
        lastStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.1));
        lastEnd = origEnd;
        onResize(lastStart, lastEnd);
      } else {
        lastStart = origStart;
        lastEnd = Math.max(origStart + 0.1, origEnd + dt);
        onResize(lastStart, lastEnd);
      }
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (cloneId) {
        moveEffectOverlay(cloneId, lastStart);
      } else if (mode === "move") {
        onMoveCommit(lastStart);
      } else {
        onResizeCommit(lastStart, lastEnd);
      }
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing
        ${selected
          ? "bg-violet-400/40 border border-white ring-2 ring-violet-400"
          : "bg-violet-400/25 border border-violet-400 hover:bg-violet-400/35"}`}
      style={{ left, width }}
      onMouseDown={(e) => startDrag(e, "move")}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "left"); }}
      />
      <span className="px-2 text-[10px] text-violet-700 font-semibold truncate flex-1 pointer-events-none flex items-center gap-1">
        <svg width="10" height="10" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="7.5" r="5"/>
          <line x1="11.5" y1="11.5" x2="15.5" y2="15.5"/>
          <line x1="7.5" y1="5" x2="7.5" y2="10"/>
          <line x1="5" y1="7.5" x2="10" y2="7.5"/>
        </svg>
        Zoom
      </span>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "right"); }}
      />
    </div>
  );
}
