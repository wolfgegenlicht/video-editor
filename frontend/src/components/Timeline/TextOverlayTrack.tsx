import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";
import { SNAP_PX, findSnap } from "./snapUtils";

interface Props { zoom: number; totalWidth: number; height: number; onSnapChange?: (time: number | null) => void }

export default function TextOverlayTrack({ zoom, totalWidth, height, onSnapChange }: Props) {
  const { project, selectOverlay, selectedOverlayId, selectedItemIds, toggleItemSelection,
          moveSelectedItemsLive, moveSelectedItems, trimTextOverlayLive, updateTextOverlay } = useProjectStore();
  const overlays = project.textOverlays;

  function startDrag(
    e: React.MouseEvent,
    overlayId: string,
    mode: "move" | "left" | "right"
  ) {
    if (mode === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(overlayId);
      return;
    }
    e.stopPropagation();

    const { selectedItemIds: ids, project: proj } = useProjectStore.getState();
    const isMultiDrag = mode === "move" && ids.has(overlayId) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(proj, id)]))
      : new Map<string, number>();
    let lastMoves: Array<{ id: string; newStartTime: number }> = [];

    if (!isMultiDrag) selectOverlay(overlayId);

    const ov = proj.textOverlays.find((o) => o.id === overlayId)!;
    const origStart = ov.startTime;
    const origEnd = ov.endTime;
    const duration = origEnd - origStart;
    const startX = e.clientX;

    const snapPoints: number[] = [];
    const currentState = useProjectStore.getState();
    currentState.project.tracks.forEach((t) => t.clips.forEach((c) => {
      snapPoints.push(c.startTime, c.startTime + c.duration);
    }));
    currentState.project.effectOverlays
      .filter((e) => !ids.has(e.id))
      .forEach((e) => { snapPoints.push(e.startTime, e.endTime); });
    currentState.project.textOverlays
      .filter((o) => !ids.has(o.id))
      .forEach((o) => { snapPoints.push(o.startTime, o.endTime); });

    let lastStart = origStart;
    let lastEnd = origEnd;

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (isMultiDrag) {
        const rawPrimary = Math.max(0, origStart + dt);
        const { snappedStart, snapTime } = findSnap(rawPrimary, duration, snapPoints, SNAP_PX / zoom);
        const delta = snappedStart - origStart;
        onSnapChange?.(snapTime);
        lastMoves = [...ids].map((id) => ({
          id,
          newStartTime: Math.max(0, (origPositions.get(id) ?? 0) + delta),
        }));
        moveSelectedItemsLive(lastMoves);
        return;
      }
      if (mode === "move") {
        const rawStart = Math.max(0, origStart + dt);
        const { snappedStart, snapTime } = findSnap(rawStart, duration, snapPoints, SNAP_PX / zoom);
        onSnapChange?.(snapTime);
        lastStart = snappedStart;
        lastEnd = lastStart + duration;
        moveSelectedItemsLive([{ id: overlayId, newStartTime: lastStart }]);
      } else if (mode === "left") {
        lastStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.5));
        lastEnd = origEnd;
        trimTextOverlayLive(overlayId, lastStart, lastEnd);
      } else {
        lastStart = origStart;
        lastEnd = Math.max(origStart + 0.5, origEnd + dt);
        trimTextOverlayLive(overlayId, lastStart, lastEnd);
      }
    }

    function onMouseUp() {
      onSnapChange?.(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (isMultiDrag && lastMoves.length > 0) {
        const originalMoves = [...origPositions.entries()].map(([id, newStartTime]) => ({ id, newStartTime }));
        moveSelectedItemsLive(originalMoves);
        moveSelectedItems(lastMoves);
        return;
      }
      if (mode === "move") {
        moveSelectedItems([{ id: overlayId, newStartTime: lastStart }]);
      } else {
        trimTextOverlayLive(overlayId, origStart, origEnd);
        updateTextOverlay(overlayId, { startTime: lastStart, endTime: lastEnd });
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      role="presentation"
      className="border-b border-black/[0.06] relative bg-white"
      style={{ width: totalWidth, height }}
      onMouseDown={() => selectOverlay(null)}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 8);
        const isSelected = selectedOverlayId === o.id;
        const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(o.id);
        return (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none cursor-grab active:cursor-grabbing group
              ${isSelected
                ? "bg-purple-100 border border-purple-400 ring-1 ring-purple-300"
                : "bg-purple-100 border border-purple-300/50 hover:bg-purple-100/80"}
              ${isMultiSelected ? "ring-2 ring-purple-400/50" : ""}`}
            style={{ left, width }}
            onMouseDown={(e) => startDrag(e, o.id, "move")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectOverlay(o.id); }}
          >
            {/* Left resize handle */}
            <div
              role="presentation"
              className="absolute left-0 top-0 bottom-0 w-[6px] cursor-ew-resize z-10 hover:bg-purple-400/40"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, o.id, "left"); }}
            />
            <span className="px-2 text-[11px] text-purple-700 font-semibold truncate flex-1 pointer-events-none">
              T {o.text}
            </span>
            {/* Right resize handle */}
            <div
              role="presentation"
              className="absolute right-0 top-0 bottom-0 w-[6px] cursor-ew-resize z-10 hover:bg-purple-400/40"
              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, o.id, "right"); }}
            />
          </div>
        );
      })}
    </div>
  );
}
