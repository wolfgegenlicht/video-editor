import { useProjectStore } from "../../store/useProjectStore";

interface Props { zoom: number; totalWidth: number; height: number }

export default function TextOverlayTrack({ zoom, totalWidth, height }: Props) {
  const { project, selectOverlay, selectedOverlayId, selectedItemIds, toggleItemSelection } = useProjectStore();
  const overlays = project.textOverlays;

  return (
    <div
      className="border-b border-slate-100 relative bg-amber-50"
      style={{ width: totalWidth, height }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 4);
        return (
          <div
            key={o.id}
            className={`absolute top-1 bottom-1 rounded bg-amber-400 border flex items-center overflow-hidden select-none cursor-pointer hover:bg-amber-500 group
              ${selectedOverlayId === o.id ? "border-white ring-2 ring-amber-300 bg-amber-500" : "border-amber-500"}
              ${selectedItemIds.size > 1 && selectedItemIds.has(o.id) ? "ring-2 ring-blue-400" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.metaKey) { toggleItemSelection(o.id); return; }
              selectOverlay(o.id);
            }}
          >
            <span className="px-2 text-[10px] text-white font-semibold truncate flex-1">
              T {o.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
