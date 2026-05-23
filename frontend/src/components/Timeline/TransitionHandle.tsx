import { useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { ClipTransition } from "../../types/project";

interface Props {
  transition: ClipTransition;
  zoom: number;
}

export default function TransitionHandle({ transition, zoom }: Props) {
  const { selectedTransitionId, selectTransition, removeClipTransition, updateClipTransition, selectedItemIds, toggleItemSelection } = useProjectStore();
  const selected = transition.id === selectedTransitionId;
  const left = (transition.atTime - transition.duration / 2) * zoom;
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
      className={`absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-pointer select-none
        ${selected ? "opacity-100" : "opacity-70 hover:opacity-100"}
        ${selectedItemIds.size > 1 && selectedItemIds.has(transition.id) ? "ring-2 ring-[#0ea5a0]/50" : ""}`}
      style={{ left, width }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.metaKey) { toggleItemSelection(transition.id); return; }
        selectTransition(transition.id);
      }}
    >
      {/* Diagonal stripe pattern */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern id={`stripe-${transition.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="4" height="8" fill={selected ? "rgba(14,165,160,0.5)" : "rgba(14,165,160,0.3)"} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#stripe-${transition.id})`} />
      </svg>
      {/* Border */}
      <div
        className={`absolute inset-0 border-2 ${selected ? "border-[#0ea5a0]" : "border-[#0ea5a0]/50"}`}
        style={{ borderRadius: 3 }}
      />
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[rgba(14,165,160,0.4)]"
        onMouseDown={(e) => startResize(e, "left")}
      />
      {/* Label */}
      {width > 40 && (
        <span className="relative text-[10px] font-bold text-[#0d9488] pointer-events-none z-10 px-1">
          dissolve
        </span>
      )}
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[rgba(14,165,160,0.4)]"
        onMouseDown={(e) => startResize(e, "right")}
      />
    </div>
  );
}
