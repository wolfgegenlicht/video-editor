import { useProjectStore } from "../../store/useProjectStore";

interface Props { zoom: number; totalWidth: number; height: number }

export default function TextOverlayTrack({ zoom, totalWidth, height }: Props) {
  const { project, selectOverlay, selectedOverlayId, selectedItemIds, toggleItemSelection } = useProjectStore();
  const overlays = project.textOverlays;

  return (
    <div
      className="border-b border-black/[0.06] relative bg-white"
      style={{ width: totalWidth, height }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 4);
        return (
          <div
            key={o.id}
            className={`absolute top-1 bottom-1 rounded border flex items-center overflow-hidden select-none cursor-pointer group
              ${selectedOverlayId === o.id ? "bg-purple-100 border-purple-400 border ring-1 ring-purple-300" : "bg-purple-100 border border-purple-300/50 hover:bg-purple-100/80"}
              ${selectedItemIds.size > 1 && selectedItemIds.has(o.id) ? "ring-2 ring-purple-400/50" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.metaKey) { toggleItemSelection(o.id); return; }
              selectOverlay(o.id);
            }}
          >
            <span className="px-2 text-[11px] text-purple-700 font-semibold truncate flex-1">
              T {o.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
