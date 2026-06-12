export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-4 space-y-3">
      <p className="text-[11px] font-bold text-[var(--txt2)]">{title}</p>
      {children}
    </div>
  );
}

export function SliderRow({ label, value, min, max, step, onChange, format, defaultValue }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  defaultValue?: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-[var(--txt2)]">{label}</span>
        <span className="text-[11px] text-[var(--txt2)] tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
        className="w-full accent-[var(--accent)] h-1"
      />
    </div>
  );
}
