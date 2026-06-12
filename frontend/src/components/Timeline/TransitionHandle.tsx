import { useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { ClipTransition } from "../../types/project";
import { editToOutput } from "../../lib/speedRamp";

interface Props {
  transition: ClipTransition;
  zoom: number;
}

export default function TransitionHandle({ transition, zoom }: Props) {
  const { selectedTransitionId, selectTransition, removeClipTransition, updateClipTransition, selectedItemIds, toggleItemSelection } = useProjectStore();
  const ramps = useProjectStore((s) => s.project.hiddenEffectLanes?.speedramp ? [] : s.project.effectOverlays ?? []);
  const selected = transition.id === selectedTransitionId;
  // Centered on the clip boundary (EDIT), mapped to OUTPUT space for ripple.
  const center = editToOutput(transition.atTime, ramps);
  const left = center * zoom - Math.max(transition.duration * zoom, 8) / 2;
  const width = Math.max(transition.duration * zoom, 8);

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeClipTransition(transition.id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, transition.id, removeClipTransition]);

  function startResize(e: React.MouseEvent, side: "left" | "right") {
    e.stopPropagation();
    selectTransition(transition.id);
    const startX = e.clientX;
    const origDuration = transition.duration;

    function onMouseMove(ev: MouseEvent) {
      const dt = (ev.clientX - startX) / zoom;
      const newDuration = side === "right"
        ? Math.max(0.1, origDuration + dt * 2)
        : Math.max(0.1, origDuration - dt * 2);
      updateClipTransition(transition.id, { duration: newDuration });
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Transition"
      className={`absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-pointer select-none
        ${selected ? "opacity-100" : "opacity-70 hover:opacity-100"}
        ${selectedItemIds.size > 1 && selectedItemIds.has(transition.id) ? "ring-2 ring-[var(--accent)]/50" : ""}`}
      style={{ left, width }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.metaKey) { toggleItemSelection(transition.id); return; }
        selectTransition(transition.id);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectTransition(transition.id); }}
    >
      {/* Diagonal stripe pattern */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern id={`stripe-${transition.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="4" height="8" fill={selected ? "oklch(70% 0.16 55 / 0.5)" : "oklch(70% 0.16 55 / 0.3)"} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#stripe-${transition.id})`} />
      </svg>
      {/* Border */}
      <div
        className={`absolute inset-0 border-2 ${selected ? "border-[var(--accent)]" : "border-[var(--accent)]/50"}`}
        style={{ borderRadius: 3 }}
      />
      {/* Left resize handle */}
      <div
        role="presentation"
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[var(--accent-line)]"
        onMouseDown={(e) => startResize(e, "left")}
      />
      {/* Label */}
      {width > 40 && (
        <span className="relative text-[10px] font-bold text-[var(--accent)] pointer-events-none z-10 px-1">
          dissolve
        </span>
      )}
      {/* Right resize handle */}
      <div
        role="presentation"
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[var(--accent-line)]"
        onMouseDown={(e) => startResize(e, "right")}
      />
    </div>
  );
}
