import { useCallback } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TextOverlayTrack from "./TextOverlayTrack";

const LABEL_WIDTH = 110;

interface Props {
  toggle: () => void;
  seek: (time: number) => void;
}

export default function Timeline({ toggle, seek }: Props) {
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden } = useProjectStore();

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
      <TimelineToolbar onSplit={handleSplit} toggle={toggle} seek={seek} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div className="flex-shrink-0 bg-gray-50 border-r border-gray-200" style={{ width: LABEL_WIDTH }}>
          <div className="h-6 border-b border-gray-200" />
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className="h-10 flex items-center gap-1 px-2 border-b border-gray-100"
            >
              <span className={`text-[10px] font-medium flex-1 truncate ${track.type === "audio" ? "text-green-600" : "text-gray-500"}`}>
                {track.type}
              </span>
              {/* Mute */}
              <button
                title={track.muted ? "Unmute track" : "Mute track"}
                onClick={() => setTrackMuted(track.id, !track.muted)}
                className={`flex-shrink-0 w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors
                  ${track.muted ? "bg-yellow-400 text-white" : "text-gray-400 hover:bg-gray-200"}`}
              >
                {track.muted ? "🔇" : "🔈"}
              </button>
              {/* Hide — video tracks only */}
              {track.type !== "audio" && (
                <button
                  title={track.hidden ? "Show track" : "Hide track"}
                  onClick={() => setTrackHidden(track.id, !track.hidden)}
                  className={`flex-shrink-0 w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors
                    ${track.hidden ? "bg-gray-400 text-white" : "text-gray-400 hover:bg-gray-200"}`}
                >
                  {track.hidden ? "🚫" : "👁"}
                </button>
              )}
            </div>
          ))}
          {project.textOverlays.length > 0 && (
            <div className="h-10 flex items-center gap-1 px-2 border-b border-gray-100">
              <span className="text-[10px] font-medium text-purple-500 flex-1">text</span>
            </div>
          )}
        </div>

        {/* Scrollable timeline */}
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onWheel={handleWheelZoom}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} seek={seek} />
            {project.tracks.map((track) => (
              <TimelineTrack key={track.id} track={track} zoom={zoom} />
            ))}
            {project.textOverlays.length > 0 && (
              <TextOverlayTrack zoom={zoom} totalWidth={totalWidth} />
            )}
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
