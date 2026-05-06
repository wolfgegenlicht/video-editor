import { useProjectStore } from "../../store/useProjectStore";

interface Props { zoom: number; totalWidth: number }

export default function TextOverlayTrack({ zoom, totalWidth }: Props) {
  const { project, deleteTextOverlay, selectOverlay, selectedOverlayId } = useProjectStore();
  const overlays = project.textOverlays;

  return (
    <div
      className="h-10 border-b border-gray-100 relative bg-purple-50"
      style={{ width: totalWidth }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 4);
        return (
          <div
            key={o.id}
            className={`absolute top-1 h-8 rounded bg-purple-400 border flex items-center overflow-hidden select-none cursor-pointer hover:bg-purple-500 group
              ${selectedOverlayId === o.id ? "border-white ring-2 ring-purple-300 bg-purple-500" : "border-purple-500"}`}
            style={{ left, width }}
            onMouseDown={(e) => { e.stopPropagation(); selectOverlay(o.id); }}
            onContextMenu={(e) => { e.preventDefault(); deleteTextOverlay(o.id); }}
          >
            <span className="px-2 text-[10px] text-white font-medium truncate flex-1">
              T {o.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
