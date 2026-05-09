import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  zoom: number;
  totalWidth: number;
  seek: (time: number) => void;
  height: number;
}

export default function CaptionTimelineTrack({ zoom, totalWidth, seek, height }: Props) {
  const { project, selectedCaptionId, selectCaption, selectedItemIds, toggleItemSelection } = useProjectStore();

  return (
    <div className="relative border-b border-slate-100" style={{ width: totalWidth, height }}>
      {project.captions.map((cap) => {
        const left = cap.startTime * zoom;
        const width = Math.max(2, (cap.endTime - cap.startTime) * zoom);
        const isSelected = cap.id === selectedCaptionId;

        return (
          <div
            key={cap.id}
            className={`absolute top-1 bottom-1 rounded cursor-pointer transition-colors select-none
              flex items-center overflow-hidden px-1
              ${isSelected
                ? "bg-violet-600 ring-1 ring-violet-400"
                : "bg-violet-400 hover:bg-violet-500"}
              ${selectedItemIds.size > 1 && selectedItemIds.has(cap.id) ? "ring-2 ring-blue-400" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => {
              if (e.metaKey) { e.stopPropagation(); toggleItemSelection(cap.id); }
            }}
            onClick={(e) => {
              if (e.metaKey) return;
              selectCaption(cap.id);
              seek(cap.startTime);
            }}
            title={cap.text}
          >
            <span className="text-[9px] text-white font-semibold truncate pointer-events-none">
              {cap.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
