import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  zoom: number;
  totalWidth: number;
  seek: (time: number) => void;
}

export default function CaptionTimelineTrack({ zoom, totalWidth, seek }: Props) {
  const { project, selectedCaptionId, selectCaption, selectLeftPanelTab } = useProjectStore();

  return (
    <div className="h-10 relative border-b border-gray-100" style={{ width: totalWidth }}>
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
                ? "bg-blue-500 ring-1 ring-blue-300"
                : "bg-blue-300 hover:bg-blue-400"}`}
            style={{ left, width }}
            onClick={() => {
              selectCaption(cap.id);
              selectLeftPanelTab("Properties");
              seek(cap.startTime);
            }}
            title={cap.text}
          >
            <span className="text-[9px] text-white truncate pointer-events-none">
              {cap.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
