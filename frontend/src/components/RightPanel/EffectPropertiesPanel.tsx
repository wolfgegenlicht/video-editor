import { useProjectStore } from "../../store/useProjectStore";
import type { ZoomParams } from "../../types/project";

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-violet-600 h-1"
      />
    </div>
  );
}

export default function EffectPropertiesPanel() {
  const { project, selectedEffectOverlayId, updateEffectOverlayParams } = useProjectStore();
  const effect = project.effectOverlays.find((e) => e.id === selectedEffectOverlayId);

  if (!effect) return null;

  const params = effect.params as ZoomParams;
  const duration = effect.endTime - effect.startTime;
  const maxRamp = Math.max(0.1, duration / 2);

  function update(patch: Partial<ZoomParams>) {
    updateEffectOverlayParams(effect!.id, patch);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-4 space-y-3">
        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Zoom</p>

        <SliderRow
          label="Scale"
          value={params.scale}
          min={1}
          max={3}
          step={0.05}
          onChange={(v) => update({ scale: v })}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <SliderRow
          label="Ramp In"
          value={params.rampIn}
          min={0}
          max={maxRamp}
          step={0.05}
          onChange={(v) => update({ rampIn: Math.min(v, maxRamp - params.rampOut) })}
          format={(v) => `${v.toFixed(2)}s`}
        />
        <SliderRow
          label="Ramp Out"
          value={params.rampOut}
          min={0}
          max={maxRamp}
          step={0.05}
          onChange={(v) => update({ rampOut: Math.min(v, maxRamp - params.rampIn) })}
          format={(v) => `${v.toFixed(2)}s`}
        />

        <p className="text-[10px] text-slate-400">
          Hold: {Math.max(0, duration - params.rampIn - params.rampOut).toFixed(2)}s
        </p>
      </div>
    </div>
  );
}
