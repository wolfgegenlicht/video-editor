import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TextOverlayTrack from "./TextOverlayTrack";
import CaptionTimelineTrack from "./CaptionTimelineTrack";
import EffectOverlayTrack from "./EffectOverlayTrack";
import { Volume2Icon, VolumeXIcon, EyeIcon, EyeOffIcon } from "../Icons";

const LABEL_WIDTH = 110;
const MAX_HEIGHT = 600;
const DEFAULT_TRACK_H = 40;
const MIN_TRACK_H = 28;
const MAX_TRACK_H = 160;
// scrubber (4) + resize handle (4) + toolbar (~32) + ruler (24)
const CHROME_H = 64;

const TRACK_DOT_COLORS: Record<string, string> = {
  video: "bg-teal-500",
  audio: "bg-emerald-500",
};

interface Props {
  toggle: () => void;
  seek: (time: number) => void;
}

export default function Timeline({ toggle, seek }: Props) {
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden } = useProjectStore();
  const [height, setHeight] = useState(260);
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const dragTrackRef = useRef<{ key: string; startY: number; startH: number } | null>(null);

  const trackH = (key: string) => trackHeights[key] ?? DEFAULT_TRACK_H;

  function onTrackResizeDown(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragTrackRef.current = { key, startY: e.clientY, startH: trackH(key) };
    function onMove(ev: MouseEvent) {
      if (!dragTrackRef.current) return;
      const newH = Math.min(MAX_TRACK_H, Math.max(MIN_TRACK_H, dragTrackRef.current.startH + ev.clientY - dragTrackRef.current.startY));
      setTrackHeights((p) => ({ ...p, [dragTrackRef.current!.key]: newH }));
    }
    function onUp() {
      dragTrackRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };

    function onMouseMove(ev: MouseEvent) {
      if (!dragState.current) return;
      const delta = dragState.current.startY - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(minHeight, dragState.current.startHeight + delta)));
    }

    function onMouseUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  const minHeight = CHROME_H
    + project.tracks.reduce((sum, t) => sum + trackH(t.id), 0)
    + trackH("text") + trackH("captions") + trackH("fx");

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
  const scrubberPct = totalDuration > 0 ? Math.min(1, playheadTime / totalDuration) * 100 : 0;

  return (
    <div className="flex flex-col bg-white border-t border-slate-200 flex-shrink-0" style={{ height: Math.max(minHeight, height) }}>
      {/* Scrubber bar */}
      <div
        className="h-1 bg-slate-200 flex-shrink-0 relative cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width * totalDuration);
        }}
      >
        <div className="absolute left-0 top-0 h-full bg-teal-500 transition-none" style={{ width: `${scrubberPct}%` }} />
      </div>
      {/* Height resize handle */}
      <div
        className="h-1 cursor-ns-resize bg-transparent hover:bg-teal-400 transition-colors flex-shrink-0"
        onMouseDown={onDragHandleMouseDown}
      />
      <TimelineToolbar onSplit={handleSplit} toggle={toggle} seek={seek} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div className="flex-shrink-0 bg-slate-50 border-r border-slate-200" style={{ width: LABEL_WIDTH }}>
          <div className="h-6 border-b border-slate-200" />
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className="relative flex items-center gap-1.5 px-2 border-b border-slate-100"
              style={{ height: trackH(track.id) }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${TRACK_DOT_COLORS[track.type] ?? "bg-slate-400"}`} />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1 truncate">
                {track.type}
              </span>
              <button
                title={track.muted ? "Unmute track" : "Mute track"}
                onClick={() => setTrackMuted(track.id, !track.muted)}
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                  ${track.muted ? "text-amber-500 hover:text-amber-700" : "text-slate-400 hover:text-slate-600"}`}
              >
                {track.muted ? <VolumeXIcon /> : <Volume2Icon />}
              </button>
              {track.type !== "audio" && (
                <button
                  title={track.hidden ? "Show track" : "Hide track"}
                  onClick={() => setTrackHidden(track.id, !track.hidden)}
                  className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                    ${track.hidden ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {track.hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown(track.id, e)}
              />
            </div>
          ))}
          {project.textOverlays.length > 0 && (
            <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("text") }}>
              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">text</span>
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("text", e)}
              />
            </div>
          )}
          {project.captions.length > 0 && (
            <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("captions") }}>
              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">captions</span>
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("captions", e)}
              />
            </div>
          )}
          <div className="relative flex items-center gap-1.5 px-2 border-b border-slate-100" style={{ height: trackH("fx") }}>
            <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
            <span className="text-[10px] font-bold tracking-wide uppercase text-slate-500 flex-1">fx</span>
            <div
              className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
              onMouseDown={(e) => onTrackResizeDown("fx", e)}
            />
          </div>
        </div>

        {/* Scrollable timeline */}
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onWheel={handleWheelZoom}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} seek={seek} />
            {project.tracks.map((track) => (
              <TimelineTrack key={track.id} track={track} zoom={zoom} height={trackH(track.id)} />
            ))}
            {project.textOverlays.length > 0 && (
              <TextOverlayTrack zoom={zoom} totalWidth={totalWidth} height={trackH("text")} />
            )}
            {project.captions.length > 0 && (
              <CaptionTimelineTrack zoom={zoom} totalWidth={totalWidth} seek={seek} height={trackH("captions")} />
            )}
            <EffectOverlayTrack zoom={zoom} totalWidth={totalWidth} height={trackH("fx")} />
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
