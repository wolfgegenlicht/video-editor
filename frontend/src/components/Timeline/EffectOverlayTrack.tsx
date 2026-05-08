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
  const { addEffectOverlay, moveEffectOverlay, resizeEffectOverlay, deleteEffectOverlay, selectEffectOverlay } =
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
          onMove={(newStart) => moveEffectOverlay(effect.id, newStart)}
          onResize={(newStart, newEnd) => resizeEffectOverlay(effect.id, newStart, newEnd)}
          onDelete={() => deleteEffectOverlay(effect.id)}
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
  onResize,
  onDelete,
}: {
  effect: EffectOverlay;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (newStart: number) => void;
  onResize: (newStart: number, newEnd: number) => void;
  onDelete: () => void;
}) {
  const left = effect.startTime * zoom;
  const width = Math.max((effect.endTime - effect.startTime) * zoom, 8);

  function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const origStart = effect.startTime;
    const origEnd = effect.endTime;

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (mode === "move") {
        onMove(Math.max(0, origStart + dt));
      } else if (mode === "left") {
        const newStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.1));
        onResize(newStart, origEnd);
      } else {
        const newEnd = Math.max(origStart + 0.1, origEnd + dt);
        onResize(origStart, newEnd);
      }
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
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
      onContextMenu={(e) => { e.preventDefault(); onDelete(); }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "left"); }}
      />
      <span className="px-2 text-[10px] text-violet-700 font-semibold truncate flex-1 pointer-events-none">
        🔍 Zoom
      </span>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-violet-500/40"
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "right"); }}
      />
    </div>
  );
}
