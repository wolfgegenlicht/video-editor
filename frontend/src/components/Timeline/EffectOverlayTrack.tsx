import { useProjectStore, getItemStartTime } from "../../store/useProjectStore";
import type { EffectOverlay, EffectType, FadeParams, ColorGradeParams, SpeedRampParams, BlurParams } from "../../types/project";
import { SNAP_PX, findSnap } from "./snapUtils";

const EFFECT_DURATION: Record<EffectType, number> = {
  zoom: 3,
  fade: 1,
  blur: 3,
  colorgrade: 3,
  speedramp: 2,
};

const EFFECT_DEFAULT_PARAMS: Record<EffectType, object> = {
  zoom: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
  fade: { direction: "in" },
  blur: { intensity: 10 },
  colorgrade: { preset: "warm", intensity: 0.8 },
  speedramp: { startSpeed: 1, endSpeed: 0.5, easing: "ease" },
};

const BG_COLORS: Record<EffectType, string> = {
  zoom: "bg-violet-50",
  fade: "bg-amber-50",
  blur: "bg-sky-50",
  colorgrade: "bg-rose-50",
  speedramp: "bg-orange-50",
};

interface Props {
  effectType: EffectType;
  zoom: number;
  totalWidth: number;
  height: number;
  hidden?: boolean;
  onSnapChange?: (time: number | null) => void;
}

export default function EffectOverlayTrack({ effectType, zoom, totalWidth, height, hidden, onSnapChange }: Props) {
  const effectOverlays = useProjectStore((s) => s.project.effectOverlays);
  const selectedEffectOverlayId = useProjectStore((s) => s.selectedEffectOverlayId);
  const { addEffectOverlay, addEffectOverlayWithId, moveEffectOverlay, moveEffectOverlayLive, resizeEffectOverlay, resizeEffectOverlayLive, selectEffectOverlay } =
    useProjectStore();

  const visibleEffects = effectOverlays.filter((e) => e.type === effectType);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const droppedType = e.dataTransfer.getData("effectType");
    if (droppedType !== effectType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startTime = Math.max(0, (e.clientX - rect.left) / zoom);
    addEffectOverlay({
      type: effectType,
      startTime,
      endTime: startTime + EFFECT_DURATION[effectType],
      params: EFFECT_DEFAULT_PARAMS[effectType] as never,
    });
  }

  return (
    <div
      className={`border-b border-slate-100 relative ${BG_COLORS[effectType]} ${hidden ? "opacity-40" : ""}`}
      style={{ width: totalWidth, height }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={() => selectEffectOverlay(null)}
    >
      {visibleEffects.map((effect) => (
        <EffectBlock
          key={effect.id}
          effect={effect}
          zoom={zoom}
          selected={effect.id === selectedEffectOverlayId}
          onSelect={() => selectEffectOverlay(effect.id)}
          onMove={(newStart) => moveEffectOverlayLive(effect.id, newStart)}
          onMoveCommit={(newStart) => moveEffectOverlay(effect.id, newStart)}
          onResize={(newStart, newEnd) => resizeEffectOverlayLive(effect.id, newStart, newEnd)}
          onResizeCommit={(newStart, newEnd) => resizeEffectOverlay(effect.id, newStart, newEnd)}
          onDuplicate={(clone) => {
            addEffectOverlayWithId(clone);
            selectEffectOverlay(clone.id);
          }}
          onSnapChange={onSnapChange}
        />
      ))}
    </div>
  );
}

type EffectTheme = { selected: string; base: string; handle: string; label: string };

function getTheme(type: EffectType): EffectTheme {
  switch (type) {
    case "fade": return {
      selected: "bg-amber-500/65 border border-amber-200",
      base: "bg-amber-400/25 border border-amber-400 hover:bg-amber-400/35",
      handle: "hover:bg-amber-500/40",
      label: "text-amber-700",
    };
    case "blur": return {
      selected: "bg-sky-500/65 border border-sky-200",
      base: "bg-sky-400/25 border border-sky-400 hover:bg-sky-400/35",
      handle: "hover:bg-sky-500/40",
      label: "text-sky-700",
    };
    case "colorgrade": return {
      selected: "bg-rose-500/65 border border-rose-200",
      base: "bg-rose-400/25 border border-rose-400 hover:bg-rose-400/35",
      handle: "hover:bg-rose-500/40",
      label: "text-rose-700",
    };
    case "speedramp": return {
      selected: "bg-orange-500/65 border border-orange-200",
      base: "bg-orange-400/25 border border-orange-400 hover:bg-orange-400/35",
      handle: "hover:bg-orange-500/40",
      label: "text-orange-700",
    };
    default: return {
      selected: "bg-violet-500/65 border border-violet-200",
      base: "bg-violet-400/25 border border-violet-400 hover:bg-violet-400/35",
      handle: "hover:bg-violet-500/40",
      label: "text-violet-700",
    };
  }
}

function getLabel(effect: EffectOverlay): string {
  switch (effect.type) {
    case "fade": {
      const dir = (effect.params as FadeParams).direction;
      return dir === "in" ? "Fade In" : "Fade Out";
    }
    case "blur": return "Blur";
    case "colorgrade": {
      const preset = (effect.params as ColorGradeParams).preset;
      return { warm: "Warm", cool: "Cool", bw: "B&W", vintage: "Vintage" }[preset] ?? "Color";
    }
    case "speedramp": {
      const p = effect.params as SpeedRampParams;
      return `${p.startSpeed.toFixed(1)}× → ${p.endSpeed.toFixed(1)}×`;
    }
    default: return "Zoom";
  }
}

function EffectBlock({
  effect,
  zoom,
  selected,
  onSelect,
  onMove,
  onMoveCommit,
  onResize,
  onResizeCommit,
  onDuplicate,
  onSnapChange,
}: {
  effect: EffectOverlay;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (newStart: number) => void;
  onMoveCommit: (newStart: number) => void;
  onResize: (newStart: number, newEnd: number) => void;
  onResizeCommit: (newStart: number, newEnd: number) => void;
  onDuplicate: (clone: EffectOverlay) => void;
  onSnapChange?: (time: number | null) => void;
}) {
  const { moveEffectOverlayLive, moveEffectOverlay, selectedItemIds, toggleItemSelection, moveSelectedItemsLive, moveSelectedItems } = useProjectStore();
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const left = effect.startTime * zoom;
  const width = Math.max((effect.endTime - effect.startTime) * zoom, 8);
  const theme = getTheme(effect.type);
  const isMultiSelected = selectedItemIds.size > 1 && selectedItemIds.has(effect.id);
  const isFade = effect.type === "fade";
  const fadeDir = isFade ? (effect.params as FadeParams).direction : null;

  function startDrag(e: React.MouseEvent, mode: "move" | "left" | "right") {
    if (mode === "move" && e.metaKey) {
      e.stopPropagation();
      toggleItemSelection(effect.id);
      return;
    }
    e.stopPropagation();

    // Snapshot BEFORE onSelect() (which resets selectedItemIds via selectEffectOverlay)
    const { selectedItemIds: ids, project } = useProjectStore.getState();
    const isMultiDrag = mode === "move" && ids.has(effect.id) && ids.size > 1;
    const origPositions = isMultiDrag
      ? new Map([...ids].map((id) => [id, getItemStartTime(project, id)]))
      : new Map<string, number>();
    let lastMoves: Array<{ id: string; newStartTime: number }> = [];

    // Only select the single effect when NOT doing a multi-drag
    if (!isMultiDrag) onSelect();

    const startX = e.clientX;
    const origStart = effect.startTime;
    const origEnd = effect.endTime;
    const duration = origEnd - origStart;
    let lastStart = origStart;
    let lastEnd = origEnd;

    const excludeIds = isMultiDrag ? ids : new Set([effect.id]);
    const snapPoints = useProjectStore.getState().project.tracks
      .flatMap((t) => t.clips)
      .flatMap((c) => [c.startTime, c.startTime + c.duration]);
    // Also snap to other effect overlays of all types
    useProjectStore.getState().project.effectOverlays
      .filter((eff) => !excludeIds.has(eff.id))
      .forEach((eff) => { snapPoints.push(eff.startTime, eff.endTime); });

    const isAltDuplicate = !isMultiDrag && e.altKey && mode === "move";
    let cloneId: string | null = null;
    if (isAltDuplicate) {
      const clone: EffectOverlay = { ...effect, id: crypto.randomUUID() };
      cloneId = clone.id;
      onDuplicate(clone);
    }

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      if (isMultiDrag) {
        const rawPrimary = Math.max(0, origStart + dt);
        const { snappedStart, snapTime } = findSnap(rawPrimary, duration, snapPoints, SNAP_PX / zoom);
        const snappedDt = snappedStart - origStart;
        lastMoves = [...ids].map((id) => ({
          id,
          newStartTime: Math.max(0, (origPositions.get(id) ?? 0) + snappedDt),
        }));
        onSnapChange?.(snapTime);
        moveSelectedItemsLive(lastMoves);
        return;
      }
      if (mode === "move") {
        const rawStart = Math.max(0, origStart + dt);
        const { snappedStart, snapTime } = findSnap(rawStart, duration, snapPoints, SNAP_PX / zoom);
        onSnapChange?.(snapTime);
        lastStart = snappedStart;
        lastEnd = lastStart + duration;
        if (cloneId) {
          moveEffectOverlayLive(cloneId, lastStart);
        } else {
          onMove(lastStart);
        }
      } else if (mode === "left") {
        lastStart = Math.max(0, Math.min(origStart + dt, origEnd - 0.1));
        lastEnd = origEnd;
        onResize(lastStart, lastEnd);
      } else {
        lastStart = origStart;
        lastEnd = Math.max(origStart + 0.1, origEnd + dt);
        onResize(lastStart, lastEnd);
      }
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      onSnapChange?.(null);
      if (isMultiDrag && lastMoves.length > 0) {
        // Reset to original positions first so withHistory snapshots the pre-drag state
        const originalMoves = [...origPositions.entries()].map(([id, newStartTime]) => ({ id, newStartTime }));
        moveSelectedItemsLive(originalMoves);
        moveSelectedItems(lastMoves);
        return;
      }
      if (cloneId) {
        moveEffectOverlay(cloneId, lastStart);
      } else if (mode === "move") {
        onMoveCommit(lastStart);
      } else {
        onResizeCommit(lastStart, lastEnd);
      }
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden select-none group cursor-grab active:cursor-grabbing ${selected ? theme.selected : theme.base} ${isMultiSelected ? "ring-2 ring-blue-400" : ""}`}
      style={{ left, width }}
      onMouseDown={(e) => startDrag(e, "move")}
    >
      {isFade && (
        <div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            background: fadeDir === "in"
              ? "linear-gradient(to right, rgba(0,0,0,0.15), transparent)"
              : "linear-gradient(to left, rgba(0,0,0,0.15), transparent)",
          }}
        />
      )}
      <div
        className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 ${theme.handle}`}
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "left"); }}
      />
      {effect.type === "blur" &&
        ((effect.params as BlurParams).keyframes ?? []).map((kf, i) => {
          const kfLeft = Math.max(4, Math.min(width - 4, kf.time * zoom));
          const isActive = Math.abs(playheadTime - effect.startTime - kf.time) < 0.05;
          return (
            <div
              key={i}
              title={`Keyframe ${i + 1}`}
              className={`absolute top-1/2 z-20 pointer-events-auto cursor-pointer
                ${isActive ? "outline outline-2 outline-amber-300 outline-offset-1" : ""}`}
              style={{
                left: kfLeft,
                width: 8,
                height: 8,
                background: "#f59e0b",
                transform: "translate(-50%, -50%) rotate(45deg)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPlayhead(effect.startTime + kf.time);
              }}
            />
          );
        })}
      <span className={`px-2 text-[10px] font-semibold truncate flex-1 pointer-events-none ${theme.label}`}>
        {getLabel(effect)}
      </span>
      <div
        className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 ${theme.handle}`}
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "right"); }}
      />
    </div>
  );
}
