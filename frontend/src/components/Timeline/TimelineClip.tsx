import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProjectStore } from "../../store/useProjectStore";
import type { Clip, TrackType } from "../../types/project";
import ClipContextMenu from "./ClipContextMenu";
import WaveformCanvas from "./WaveformCanvas";
import { MusicIcon, VolumeXIcon, ScissorsIcon, CopyIcon, AudioLinesIcon, Trash2Icon } from "../Icons";

interface Props {
  clip: Clip;
  trackId: string;
  trackType: TrackType;
  zoom: number;
  trackHeight: number;
}

export default function TimelineClip({ clip, trackId, trackType, zoom, trackHeight }: Props) {
  const { moveClip, trimClip, deleteClip, duplicateClip, splitClip, detachAudio, selectClip, files, playheadTime, selectedClipId } = useProjectStore();
  const isAudioTrack = trackType === "audio";
  const isSelected = selectedClipId === clip.id;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);
  const dragStartDuration = useRef(0);
  const dragStartSourceStart = useRef(0);
  const dragStartSourceEnd = useRef(0);

  const file = files.find((f) => f.id === clip.fileId);
  const label = file?.originalName ?? clip.fileId.slice(0, 8);

  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 4);

  function startDrag(e: React.MouseEvent, type: "move" | "trim-left" | "trim-right") {
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);

    dragStartX.current = e.clientX;
    dragStartTime.current = clip.startTime;
    dragStartDuration.current = clip.duration;
    dragStartSourceStart.current = clip.sourceStart;
    dragStartSourceEnd.current = clip.sourceEnd;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - dragStartX.current;
      const dt = dx / zoom;

      if (type === "move") {
        moveClip(clip.id, trackId, Math.max(0, dragStartTime.current + dt));
      } else if (type === "trim-left") {
        const minStart = Math.max(0, dragStartTime.current - dragStartSourceStart.current);
        const newStart = Math.max(minStart, Math.min(
          dragStartTime.current + dragStartDuration.current - 0.1,
          dragStartTime.current + dt
        ));
        const trimmed = newStart - dragStartTime.current;
        trimClip(clip.id, newStart, dragStartDuration.current - trimmed, dragStartSourceStart.current + trimmed, dragStartSourceEnd.current);
      } else {
        const maxDuration = file ? file.duration - dragStartSourceStart.current : dragStartDuration.current + 60;
        const newDuration = Math.max(0.1, Math.min(maxDuration, dragStartDuration.current + dt));
        trimClip(clip.id, dragStartTime.current, newDuration, dragStartSourceStart.current, dragStartSourceStart.current + newDuration);
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("clipId", clip.id);
    e.dataTransfer.setData("fromTrackId", trackId);
    e.dataTransfer.effectAllowed = "move";
  }

  const playheadInClip = playheadTime > clip.startTime && playheadTime < clip.startTime + clip.duration;

  const menuItems = [
    {
      label: "Split at Playhead",
      icon: <ScissorsIcon />,
      disabled: !playheadInClip,
      onClick: () => splitClip(clip.id, playheadTime),
    },
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      onClick: () => duplicateClip(clip.id),
    },
    ...(!isAudioTrack && !clip.muted ? [{
      label: "Detach Audio",
      icon: <AudioLinesIcon />,
      onClick: () => detachAudio(clip.id),
    }] : []),
    { label: "---", icon: null, onClick: () => {} },
    {
      label: "Delete",
      icon: <Trash2Icon />,
      danger: true,
      onClick: () => deleteClip(clip.id),
    },
  ];

  return (
    <>
      <div
        className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing
          ${isAudioTrack
            ? isSelected
              ? "bg-emerald-600 border-2 border-white ring-2 ring-emerald-500"
              : "bg-emerald-500 border border-emerald-600"
            : clip.muted
              ? isSelected
                ? "bg-teal-300 border-2 border-white ring-2 ring-teal-300 opacity-75"
                : "bg-teal-300 border border-teal-400 opacity-75"
              : isSelected
                ? "bg-teal-600 border-2 border-white ring-2 ring-teal-500"
                : "bg-teal-500 border border-teal-600"
          }`}
        style={{ left, width }}
        draggable
        onDragStart={onDragStart}
        onMouseDown={(e) => startDrag(e, "move")}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title="Drag to move · Drag edges to trim · Right-click for options"
      >
        {/* Trim left handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 ${isAudioTrack ? "bg-emerald-700" : "bg-teal-700"}`}
          onMouseDown={(e) => startDrag(e, "trim-left")}
        />
        {isAudioTrack && file && (
          <WaveformCanvas
            fileId={clip.fileId}
            fileDuration={file.duration}
            sourceStart={clip.sourceStart}
            sourceEnd={clip.sourceEnd}
            width={width}
            height={trackHeight - 8}
          />
        )}
        <span className="px-2 text-[10px] text-white font-semibold truncate pointer-events-none flex-1 relative z-10 flex items-center gap-1">
          {isAudioTrack && <MusicIcon className="flex-shrink-0" />}
          {!isAudioTrack && clip.muted && <VolumeXIcon className="flex-shrink-0" />}
          {label}
        </span>
        {/* Trim right handle */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 ${isAudioTrack ? "bg-emerald-700" : "bg-teal-700"}`}
          onMouseDown={(e) => startDrag(e, "trim-right")}
        />
      </div>

      {menu &&
        createPortal(
          <ClipContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems}
            onClose={() => setMenu(null)}
          />,
          document.body
        )}
    </>
  );
}
