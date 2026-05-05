import { useCallback } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";

const LABEL_WIDTH = 56;

export default function Timeline() {
  const { project, zoom, playheadTime, splitClip } = useProjectStore();

  const totalDuration = Math.max(
    30,
    ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration))
  );
  const totalWidth = totalDuration * zoom + 200;

  function handleSplit() {
    const allClips = project.tracks.flatMap((t) => t.clips);
    const active = allClips.find(
      (c) => playheadTime > c.startTime && playheadTime < c.startTime + c.duration
    );
    if (active) splitClip(active.id, playheadTime);
  }

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        useProjectStore.getState().setZoom(zoom - e.deltaY * 0.5);
      }
    },
    [zoom]
  );

  const playheadX = playheadTime * zoom;

  return (
    <div className="flex flex-col bg-white border-t border-gray-200 flex-shrink-0" style={{ height: 200 }}>
      <TimelineToolbar onSplit={handleSplit} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div className="flex-shrink-0 bg-gray-50 border-r border-gray-200" style={{ width: LABEL_WIDTH }}>
          <div className="h-6 border-b border-gray-200" />
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className="h-10 flex items-center justify-center text-[10px] text-gray-400 border-b border-gray-100"
            >
              {track.type}
            </div>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onWheel={handleWheelZoom}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} />
            {project.tracks.map((track) => (
              <TimelineTrack key={track.id} track={track} zoom={zoom} />
            ))}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
              style={{ left: playheadX }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
