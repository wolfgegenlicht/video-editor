import { useProjectStore } from "../../store/useProjectStore";
import type { ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams, BlurKeyframe } from "../../types/project";
import type { BlurRegion } from "../../types/project";
import { interpolateBlurAt } from "../../lib/blurKeyframes";

function SliderRow({ label, value, min, max, step, onChange, format, accentClass = "accent-violet-400" }: {
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
        <span className="text-xs text-[#6b6b78]">{label}</span>
        <span className="text-[11px] text-[#6b6b78] tabular-nums">{format ? format(value) : value}</span>
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
  return <p className="text-[11px] font-bold text-[#6b6b78]">{label}</p>;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function kfSummary(kf: BlurKeyframe): string {
  const r = kf.region;
  if (!r) return `blur:${kf.intensity.toFixed(0)}`;
  return `x:${r.x.toFixed(2)} y:${r.y.toFixed(2)} w:${r.width.toFixed(2)} h:${r.height.toFixed(2)}`;
}

export default function EffectPropertiesPanel() {
  const {
    project, selectedEffectOverlayId, updateEffectOverlayParams, resizeEffectOverlay,
    playheadTime, addOrUpdateBlurKeyframe, deleteBlurKeyframe, setPlayhead,
  } = useProjectStore();
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
                    ? "bg-amber-500 text-white"
                    : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"}`}
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
    const keyframes = params.keyframes ?? [];
    const relTime = playheadTime - effect.startTime;
    const activeKfIdx = keyframes.findIndex((k) => Math.abs(k.time - relTime) < 0.05);
    const effectiveParams = keyframes.length
      ? interpolateBlurAt(keyframes, relTime, params)
      : params;
    const region = effectiveParams.region as BlurRegion | undefined;

    function addKeyframe() {
      addOrUpdateBlurKeyframe(effect!.id, {
        time: Math.max(0, relTime),
        intensity: effectiveParams.intensity,
        region: effectiveParams.region,
      });
    }

    function onIntensityChange(v: number) {
      if (keyframes.length) {
        addOrUpdateBlurKeyframe(effect!.id, {
          time: Math.max(0, relTime),
          intensity: v,
          region: effectiveParams.region,
        });
      } else {
        updateEffectOverlayParams(effect!.id, { intensity: v });
      }
    }

    function commitRegion(patch: Partial<BlurRegion>) {
      if (!effectiveParams.region) return;
      const next = { ...effectiveParams.region, ...patch };
      if (keyframes.length) {
        addOrUpdateBlurKeyframe(effect!.id, {
          time: Math.max(0, relTime),
          intensity: effectiveParams.intensity,
          region: next,
        });
      } else {
        updateEffectOverlayParams(effect!.id, { region: next });
      }
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-4 space-y-3">
          <SectionHeader label="Blur" />

          {/* ── Keyframes section (regional blurs only) ── */}
          {region && <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-[#6b6b78]">
                KEYFRAMES{keyframes.length > 0 ? ` (${keyframes.length})` : ""}
              </p>
              <button
                onClick={addKeyframe}
                className="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-500 text-white hover:bg-sky-600 transition-colors cursor-pointer"
              >
                + Add
              </button>
            </div>

            {keyframes.length > 0 && (
              <>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {keyframes.map((kf, i) => {
                    const isActive = i === activeKfIdx;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer
                          ${isActive
                            ? "bg-sky-500/10 border border-sky-500/20"
                            : "hover:bg-[#f7f7fa]"}`}
                        onClick={() => setPlayhead(effect!.startTime + kf.time)}
                      >
                        <span className={`w-8 tabular-nums ${isActive ? "text-sky-500 font-semibold" : "text-[#6b6b78]"}`}>
                          {fmtTime(effect!.startTime + kf.time)}{isActive ? " ◆" : ""}
                        </span>
                        <span className="flex-1 text-[#6b6b78] truncate">{kfSummary(kf)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBlurKeyframe(effect!.id, i); }}
                          className="text-[#6b6b78] hover:text-red-500 transition-colors leading-none px-0.5 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Prev / Next navigation */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      const prev = [...keyframes].reverse().find((k) => k.time < relTime - 0.05);
                      if (prev) setPlayhead(effect!.startTime + prev.time);
                    }}
                    className="text-[11px] px-2.5 py-0.5 rounded border border-black/10 bg-[#f2f2f6] text-[#6b6b78] hover:bg-[#ebebef] transition-colors cursor-pointer"
                  >◀</button>
                  <span className="text-[11px] text-[#6b6b78]">
                    {activeKfIdx >= 0 ? `${activeKfIdx + 1} / ${keyframes.length}` : `— / ${keyframes.length}`}
                  </span>
                  <button
                    onClick={() => {
                      const next = keyframes.find((k) => k.time > relTime + 0.05);
                      if (next) setPlayhead(effect!.startTime + next.time);
                    }}
                    className="text-[11px] px-2.5 py-0.5 rounded border border-black/10 bg-[#f2f2f6] text-[#6b6b78] hover:bg-[#ebebef] transition-colors cursor-pointer"
                  >▶</button>
                </div>
              </>
            )}
          </div>}

          {/* ── Sliders ── */}
          <SliderRow
            label="Blur Amount"
            value={effectiveParams.intensity}
            min={0} max={20} step={0.5}
            onChange={onIntensityChange}
            format={(v) => `${v.toFixed(1)}px`}
            accentClass="accent-sky-500"
          />
          {region ? (
            <>
              <SliderRow
                label="X Position"
                value={region.x}
                min={0} max={1 - region.width} step={0.01}
                onChange={(v) => commitRegion({ x: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                accentClass="accent-sky-400"
              />
              <SliderRow
                label="Y Position"
                value={region.y}
                min={0} max={1 - region.height} step={0.01}
                onChange={(v) => commitRegion({ y: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                accentClass="accent-sky-400"
              />
              <SliderRow
                label="Width"
                value={region.width}
                min={0.05} max={1 - region.x} step={0.01}
                onChange={(v) => commitRegion({ width: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                accentClass="accent-sky-400"
              />
              <SliderRow
                label="Height"
                value={region.height}
                min={0.05} max={1 - region.y} step={0.01}
                onChange={(v) => commitRegion({ height: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                accentClass="accent-sky-400"
              />
              <SliderRow
                label="Edge Feather"
                value={region.feather ?? 0}
                min={0} max={0.5} step={0.01}
                onChange={(v) => commitRegion({ feather: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                accentClass="accent-sky-400"
              />
            </>
          ) : (
            <p className="text-[11px] text-[#6b6b78]">Click the blur in the timeline to position the blur region in the preview.</p>
          )}
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
                    ? "bg-rose-500 text-white"
                    : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"}`}
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
            accentClass="accent-orange-400"
          />
          <SliderRow
            label="End Speed"
            value={params.endSpeed}
            min={0.25} max={4} step={0.05}
            onChange={(v) => updateEffectOverlayParams(effect.id, { endSpeed: v })}
            format={(v) => `${v.toFixed(2)}×`}
            accentClass="accent-orange-400"
          />
          <div className="flex gap-2">
            {(["linear", "ease"] as const).map((easing) => (
              <button
                key={easing}
                onClick={() => updateEffectOverlayParams(effect.id, { easing })}
                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer
                  ${params.easing === easing
                    ? "bg-orange-500 text-white"
                    : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20"}`}
              >
                {easing.charAt(0).toUpperCase() + easing.slice(1)}
              </button>
            ))}
          </div>
          {durationSlider("accent-orange-400")}
          <p className="text-[11px] text-[#6b6b78]">{params.startSpeed.toFixed(2)}× → {params.endSpeed.toFixed(2)}× ({direction})</p>
          <p className="text-[11px] text-amber-500">Preview only — export uses base clip speed.</p>
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
          label="Focus X"
          value={params.anchorX ?? 0.5}
          min={0} max={1} step={0.01}
          onChange={(v) => update({ anchorX: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderRow
          label="Focus Y"
          value={params.anchorY ?? 0.5}
          min={0} max={1} step={0.01}
          onChange={(v) => update({ anchorY: v })}
          format={(v) => `${Math.round(v * 100)}%`}
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
        <p className="text-[11px] text-[#6b6b78]">
          Hold: {Math.max(0, duration - params.rampIn - params.rampOut).toFixed(2)}s
        </p>
      </div>
    </div>
  );
}
