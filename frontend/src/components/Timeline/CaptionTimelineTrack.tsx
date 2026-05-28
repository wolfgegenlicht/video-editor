import { useEffect, useRef } from "react";
import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";
import { SNAP_PX, findSnap } from "./snapUtils";

interface Props {
  zoom: number;
  totalWidth: number;
  seek: (time: number) => void;
  height: number;
  onSnapChange?: (time: number | null) => void;
}

export default function CaptionTimelineTrack({ zoom, totalWidth, seek, height, onSnapChange }: Props) {
  const {
    project, selectedCaptionId, selectCaption, deleteCaption,
    selectedItemIds, toggleItemSelection,
    moveSelectedItemsLive, moveSelectedItems,
    trimCaptionLive, trimCaption,
  } = useProjectStore();

  useEffect(() => {
    if (!selectedCaptionId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteCaption(selectedCaptionId!);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedCaptionId, deleteCaption]);

  // Use a ref to hold drag state so closures always read current values
  const dragRef = useRef<{
    type: "move" | "trim-left" | "trim-right";
    captionId: string;
    startX: number;
    origStart: number;
    origEnd: number;
    isMultiDrag: boolean;
    origPositions: Map<string, number>;
    lastMoves: Array<{ id: string; newStartTime: number }>;
    snapPoints: number[];
    duration: number;
  } | null>(null);

  function startDrag(e: React.MouseEvent, captionId: string, type: "move" | "trim-left" | "trim-right") {
    if (type === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(captionId);
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const { selectedItemIds: ids, project: p } = useProjectStore.getState();
    const cap = p.captions.find((c) => c.id === captionId);
    if (!cap) return;

    const isMultiDrag = type === "move" && ids.has(captionId) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(p, id)]))
      : new Map<string, number>();

    // Snap points: edges of all other captions + all clip edges
    const excludeIds = isMultiDrag ? ids : new Set([captionId]);
    const snapPoints = [
      ...p.captions
        .filter((c) => !excludeIds.has(c.id))
        .flatMap((c) => [c.startTime, c.endTime]),
      ...p.tracks.flatMap((t) => t.clips.flatMap((c) => [c.startTime, c.startTime + c.duration])),
    ];

    dragRef.current = {
      type,
      captionId,
      startX: e.clientX,
      origStart: cap.startTime,
      origEnd: cap.endTime,
      isMultiDrag,
      origPositions,
      lastMoves: [],
      snapPoints,
      duration: cap.endTime - cap.startTime,
    };

    if (!isMultiDrag) selectCaption(captionId);

    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dt = (ev.clientX - d.startX) / zoom;

      if (d.type === "move") {
        const threshold = SNAP_PX / zoom;
        if (d.isMultiDrag) {
          const rawPrimary = Math.max(0, d.origStart + dt);
          const { snappedStart, snapTime } = findSnap(rawPrimary, d.duration, d.snapPoints, threshold);
          const snappedDt = snappedStart - d.origStart;
          d.lastMoves = [...d.origPositions.entries()].map(([id, orig]) => ({
            id,
            newStartTime: Math.max(0, orig + snappedDt),
          }));
          onSnapChange?.(snapTime);
          moveSelectedItemsLive(d.lastMoves);
        } else {
          const rawStart = Math.max(0, d.origStart + dt);
          const { snappedStart, snapTime } = findSnap(rawStart, d.duration, d.snapPoints, threshold);
          onSnapChange?.(snapTime);
          moveSelectedItemsLive([{ id: d.captionId, newStartTime: snappedStart }]);
        }
      } else if (d.type === "trim-left") {
        const newStart = Math.max(0, Math.min(d.origStart + dt, d.origEnd - 0.1));
        trimCaptionLive(d.captionId, newStart, d.origEnd);
      } else {
        const newEnd = Math.max(d.origStart + 0.1, d.origEnd + dt);
        trimCaptionLive(d.captionId, d.origStart, newEnd);
      }
    }

    function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const d = dragRef.current;
      if (!d) return;
      onSnapChange?.(null);
      const dt = (ev.clientX - d.startX) / zoom;
      const threshold = SNAP_PX / zoom;

      if (d.type === "move") {
        if (d.isMultiDrag && d.lastMoves.length > 0) {
          const revert = [...d.origPositions.entries()].map(([id, orig]) => ({ id, newStartTime: orig }));
          moveSelectedItemsLive(revert);
          moveSelectedItems(d.lastMoves);
        } else {
          const rawStart = Math.max(0, d.origStart + dt);
          const { snappedStart } = findSnap(rawStart, d.duration, d.snapPoints, threshold);
          moveSelectedItemsLive([{ id: d.captionId, newStartTime: d.origStart }]);
          moveSelectedItems([{ id: d.captionId, newStartTime: snappedStart }]);
        }
      } else if (d.type === "trim-left") {
        const newStart = Math.max(0, Math.min(d.origStart + dt, d.origEnd - 0.1));
        trimCaption(d.captionId, newStart, d.origEnd);
      } else {
        const newEnd = Math.max(d.origStart + 0.1, d.origEnd + dt);
        trimCaption(d.captionId, d.origStart, newEnd);
      }

      dragRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="relative border-b border-black/[0.06] bg-white" style={{ width: totalWidth, height }}>
      {project.captions.map((cap) => {
        const left = cap.startTime * zoom;
        const width = Math.max(2, (cap.endTime - cap.startTime) * zoom);
        const isSelected = cap.id === selectedCaptionId;
        const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(cap.id);

        return (
          <div
            key={cap.id}
            role="button"
            tabIndex={0}
            className={`absolute top-1 bottom-1 rounded select-none group
              flex items-center overflow-hidden px-1
              cursor-grab active:cursor-grabbing
              ${isSelected
                ? "bg-[rgba(14,165,160,0.22)] border border-[#0ea5a0]/60"
                : "bg-[rgba(14,165,160,0.12)] border border-[#0ea5a0]/30 hover:bg-[rgba(14,165,160,0.18)]"}
              ${isMultiSelected ? "ring-2 ring-[#0ea5a0]/50" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => startDrag(e, cap.id, "move")}
            onClick={(e) => {
              if (e.metaKey) return;
              selectCaption(cap.id);
              seek(cap.startTime);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { selectCaption(cap.id); seek(cap.startTime); } }}
            title="Drag to move · Drag edges to trim"
          >
            {/* Trim left handle */}
            <div
              role="presentation"
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 bg-[#0ea5a0]/30 hover:bg-[#0ea5a0]/60 rounded-l"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, cap.id, "trim-left"); }}
            />
            <span className="text-[10px] text-[#0d9488] font-semibold truncate pointer-events-none px-1">
              {cap.text}
            </span>
            {/* Trim right handle */}
            <div
              role="presentation"
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10 bg-[#0ea5a0]/30 hover:bg-[#0ea5a0]/60 rounded-r"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, cap.id, "trim-right"); }}
            />
          </div>
        );
      })}
    </div>
  );
}
