import { useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Clip } from "../../types/project";

interface Props {
  clip: Clip;
  trackId: string;
  zoom: number;
}

export default function TimelineClip({ clip, trackId, zoom }: Props) {
  const { moveClip, trimClip, deleteClip, files } = useProjectStore();
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
        const newStart = Math.max(0, Math.min(
          dragStartTime.current + dragStartDuration.current - 0.1,
          dragStartTime.current + dt
        ));
        const trimmed = newStart - dragStartTime.current;
        trimClip(
          clip.id,
          newStart,
          dragStartDuration.current - trimmed,
          dragStartSourceStart.current + trimmed,
          dragStartSourceEnd.current
        );
      } else {
        // trim-right: extend/shrink the right edge
        const maxDuration = file ? file.duration - dragStartSourceStart.current : dragStartDuration.current + 60;
        const newDuration = Math.max(0.1, Math.min(maxDuration, dragStartDuration.current + dt));
        trimClip(
          clip.id,
          dragStartTime.current,
          newDuration,
          dragStartSourceStart.current,
          dragStartSourceStart.current + newDuration
        );
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

  return (
    <div
      className="absolute top-1 h-8 rounded bg-blue-400 border border-blue-500 flex items-center overflow-hidden select-none group"
      style={{ left, width }}
      draggable
      onDragStart={onDragStart}
      onMouseDown={(e) => startDrag(e, "move")}
      onContextMenu={(e) => { e.preventDefault(); deleteClip(clip.id); }}
      title="Drag to move · Drag edges to trim · Right-click to delete"
    >
      {/* Trim left handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-600 opacity-0 group-hover:opacity-100 z-10"
        onMouseDown={(e) => startDrag(e, "trim-left")}
      />
      <span className="px-2 text-[10px] text-white font-medium truncate pointer-events-none flex-1">
        {label}
      </span>
      {/* Trim right handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-600 opacity-0 group-hover:opacity-100 z-10"
        onMouseDown={(e) => startDrag(e, "trim-right")}
      />
    </div>
  );
}
