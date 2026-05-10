import { useProjectStore } from "../../store/useProjectStore";

export default function TransitionPropertiesPanel() {
  const { project, selectedTransitionId, updateClipTransition, removeClipTransition } = useProjectStore();
  const transition = (project.clipTransitions ?? []).find((t) => t.id === selectedTransitionId);

  if (!transition) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-400">Cross Dissolve</p>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Duration</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{transition.duration.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.05}
            value={transition.duration}
            onChange={(e) => updateClipTransition(transition.id, { duration: parseFloat(e.target.value) })}
            className="w-full accent-teal-500 h-1"
          />
        </div>
        <p className="text-[10px] text-slate-400">
          Position: {transition.atTime.toFixed(2)}s — each side {(transition.duration / 2).toFixed(2)}s
        </p>
        <button
          onClick={() => removeClipTransition(transition.id)}
          className="w-full py-1.5 rounded text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
        >
          Remove Dissolve
        </button>
      </div>
    </div>
  );
}
