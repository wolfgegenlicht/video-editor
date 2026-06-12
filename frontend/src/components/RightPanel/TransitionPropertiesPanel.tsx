import { useProjectStore } from "../../store/useProjectStore";

export default function TransitionPropertiesPanel() {
  const { project, selectedTransitionId, updateClipTransition, removeClipTransition } = useProjectStore();
  const transition = (project.clipTransitions ?? []).find((t) => t.id === selectedTransitionId);

  if (!transition) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-4 space-y-3">
        <p className="text-[11px] font-bold text-[var(--txt2)]">Cross Dissolve</p>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-[var(--txt2)]">Duration</span>
            <span className="text-[11px] text-[var(--txt2)] tabular-nums">{transition.duration.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            aria-label="Duration"
            min={0.1}
            max={3}
            step={0.05}
            value={transition.duration}
            onChange={(e) => updateClipTransition(transition.id, { duration: parseFloat(e.target.value) })}
            onDoubleClick={() => updateClipTransition(transition.id, { duration: 0.5 })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
        <p className="text-[11px] text-[var(--txt2)]">
          Position: {transition.atTime.toFixed(2)}s ({(transition.duration / 2).toFixed(2)}s each side)
        </p>
        <button
          type="button"
          onClick={() => removeClipTransition(transition.id)}
          className="w-full py-1.5 rounded text-xs font-semibold text-red-400 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
        >
          Remove Dissolve
        </button>
      </div>
    </div>
  );
}
