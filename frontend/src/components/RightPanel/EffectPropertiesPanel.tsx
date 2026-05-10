import { useProjectStore } from "../../store/useProjectStore";
import type { ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams } from "../../types/project";

function SliderRow({ label, value, min, max, step, onChange, format, accentClass = "accent-violet-600" }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accentClass?: string;
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
        className={`w-full ${accentClass} h-1`}
      />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <p className="text-[10px] font-bold text-slate-400">{label}</p>;
}

export default function EffectPropertiesPanel() {
  const { project, selectedEffectOverlayId, updateEffectOverlayParams, resizeEffectOverlay } = useProjectStore();
  const effect = project.effectOverlays.find((e) => e.id === selectedEffectOverlayId);

  if (!effect) return null;

  const duration = effect.endTime - effect.startTime;

  function durationSlider(accentClass: string) {
    return (
      <SliderRow
        label="Duration"
        value={duration}
        min={0.1} max={30} step={0.1}
        onChange={(v) => resizeEffectOverlay(effect!.id, effect!.startTime, effect!.startTime + v)}
        format={(v) => `${v.toFixed(1)}s`}
        accentClass={accentClass}
      />
    );
  }

  // — Fade —
  if (effect.type === "fade") {
    const params = effect.params as FadeParams;
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Fade" />
          <div className="flex gap-2">
            {(["in", "out"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => updateEffectOverlayParams(effect.id, { direction: dir })}
                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer
                  ${params.direction === dir
                    ? "bg-amber-400 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"}`}
              >
                Fade {dir.charAt(0).toUpperCase() + dir.slice(1)}
              </button>
            ))}
          </div>
          {durationSlider("accent-amber-500")}
        </div>
      </div>
    );
  }

  // — Blur —
  if (effect.type === "blur") {
    const params = effect.params as BlurParams;
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Blur" />
          <SliderRow
            label="Blur Amount"
            value={params.intensity}
            min={0} max={20} step={0.5}
            onChange={(v) => updateEffectOverlayParams(effect.id, { intensity: v })}
            format={(v) => `${v.toFixed(1)}px`}
            accentClass="accent-sky-500"
          />
          {durationSlider("accent-sky-500")}
        </div>
      </div>
    );
  }

  // — Color Grade —
  if (effect.type === "colorgrade") {
    const params = effect.params as ColorGradeParams;
    const presets = [
      { id: "warm" as const, label: "Warm" },
      { id: "cool" as const, label: "Cool" },
      { id: "bw" as const, label: "B&W" },
      { id: "vintage" as const, label: "Vintage" },
    ];
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Color Grade" />
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => updateEffectOverlayParams(effect.id, { preset: id })}
                className={`py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer
                  ${params.preset === id
                    ? "bg-rose-400 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <SliderRow
            label="Intensity"
            value={params.intensity}
            min={0} max={1} step={0.05}
            onChange={(v) => updateEffectOverlayParams(effect.id, { intensity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            accentClass="accent-rose-500"
          />
          {durationSlider("accent-rose-500")}
        </div>
      </div>
    );
  }

  // — Speed Ramp —
  if (effect.type === "speedramp") {
    const params = effect.params as SpeedRampParams;
    const direction = params.endSpeed < params.startSpeed ? "↓ slowdown" : params.endSpeed > params.startSpeed ? "↑ speedup" : "→ constant";
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Speed Ramp" />
          <SliderRow
            label="Start Speed"
            value={params.startSpeed}
            min={0.25} max={4} step={0.05}
            onChange={(v) => updateEffectOverlayParams(effect.id, { startSpeed: v })}
            format={(v) => `${v.toFixed(2)}×`}
            accentClass="accent-orange-500"
          />
          <SliderRow
            label="End Speed"
            value={params.endSpeed}
            min={0.25} max={4} step={0.05}
            onChange={(v) => updateEffectOverlayParams(effect.id, { endSpeed: v })}
            format={(v) => `${v.toFixed(2)}×`}
            accentClass="accent-orange-500"
          />
          <div className="flex gap-2">
            {(["linear", "ease"] as const).map((easing) => (
              <button
                key={easing}
                onClick={() => updateEffectOverlayParams(effect.id, { easing })}
                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer
                  ${params.easing === easing
                    ? "bg-orange-400 text-white"
                    : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"}`}
              >
                {easing.charAt(0).toUpperCase() + easing.slice(1)}
              </button>
            ))}
          </div>
          {durationSlider("accent-orange-500")}
          <p className="text-[10px] text-slate-400">{params.startSpeed.toFixed(2)}× → {params.endSpeed.toFixed(2)}× ({direction})</p>
          <p className="text-[10px] text-amber-500">Preview only — export uses base clip speed.</p>
        </div>
      </div>
    );
  }

  // — Zoom —
  const params = effect.params as ZoomParams;
  const maxRamp = Math.max(0.1, duration / 2);

  function update(patch: Partial<ZoomParams>) {
    updateEffectOverlayParams(effect!.id, patch);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-4 space-y-3">
        <SectionHeader label="Zoom" />
        <SliderRow
          label="Scale"
          value={params.scale}
          min={1} max={3} step={0.05}
          onChange={(v) => update({ scale: v })}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <SliderRow
          label="Zoom In"
          value={params.rampIn}
          min={0} max={maxRamp} step={0.05}
          onChange={(v) => update({ rampIn: Math.min(v, maxRamp - params.rampOut) })}
          format={(v) => `${v.toFixed(2)}s`}
        />
        <SliderRow
          label="Zoom Out"
          value={params.rampOut}
          min={0} max={maxRamp} step={0.05}
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
