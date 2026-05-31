import { DEFAULT_RADIUS_PCT, type OverlayShape } from "../../lib/overlayShapes";
import { useProjectStore } from "../../store/useProjectStore";
import { Section, SliderRow } from "../properties-helpers";

// Only the families bundled with the backend (so preview and export match exactly)
const OVERLAY_FONTS = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

const SHAPES: Array<{ value: OverlayShape; label: string }> = [
  { value: "pill", label: "Pill" },
  { value: "rounded", label: "Rounded" },
  { value: "rectangle", label: "Rectangle" },
  { value: "tab", label: "Tab" },
  { value: "accent", label: "Accent" },
];

const PILL_PRESETS: Array<{ label: string; background: string; color: string; fontWeight: "normal" | "bold" }> = [
  { label: "Purple",   background: "#7c3aed", color: "#ffffff", fontWeight: "bold" },
  { label: "Navy",     background: "#1a1a2e", color: "#ffffff", fontWeight: "bold" },
  { label: "White",    background: "#ffffff", color: "#111111", fontWeight: "bold" },
  { label: "Teal",     background: "#0d9488", color: "#ffffff", fontWeight: "bold" },
  { label: "Amber",    background: "#d97706", color: "#ffffff", fontWeight: "bold" },
  { label: "Crimson",  background: "#dc2626", color: "#ffffff", fontWeight: "bold" },
  { label: "Sky",      background: "#0284c7", color: "#ffffff", fontWeight: "bold" },
  { label: "Emerald",  background: "#059669", color: "#ffffff", fontWeight: "bold" },
  { label: "Rose",     background: "#db2777", color: "#ffffff", fontWeight: "bold" },
  { label: "Charcoal", background: "#374151", color: "#ffffff", fontWeight: "bold" },
];

export default function TextOverlayPropertiesPanel() {
  const { project, selectedOverlayId, updateTextOverlay } = useProjectStore();
  const overlay = project.textOverlays.find((o) => o.id === selectedOverlayId);
  if (!overlay) return null;

  function update(patch: Parameters<typeof updateTextOverlay>[1]) {
    updateTextOverlay(overlay!.id, patch);
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Section title="Text">
        <textarea
          aria-label="Overlay text"
          value={overlay.text}
          onChange={(e) => update({ text: e.target.value })}
          rows={3}
          className="w-full text-[12px] border border-black/[0.1] rounded-md px-2 py-1.5 resize-none outline-none focus:border-[#0ea5a0] bg-white text-[#141416]"
        />
      </Section>
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Shape">
            <div className="flex gap-1.5 flex-wrap mb-2">
              {SHAPES.map((s) => (
                <button
                  key={s.value}
                  aria-pressed={overlay.shape === s.value}
                  onClick={() => update({ shape: s.value, cornerRadius: DEFAULT_RADIUS_PCT[s.value] })}
                  className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                    overlay.shape === s.value
                      ? "border-[#0d9488] bg-[#0d9488]/10 text-[#0d9488]"
                      : "border-black/[0.1] bg-white text-[#6b6b78] hover:text-[#141416]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <SliderRow
              label={overlay.shape === "tab" ? "Cut corner" : "Corner radius"}
              value={overlay.cornerRadius ?? DEFAULT_RADIUS_PCT[overlay.shape]}
              min={0}
              max={50}
              step={1}
              onChange={(v) => update({ cornerRadius: v })}
              format={(v) => `${v}%`}
            />
            {overlay.shape === "accent" && (
              <div className="mt-2">
                <p className="text-xs text-[#6b6b78] mb-1">Accent color</p>
                <input
                  type="color"
                  aria-label="Accent color"
                  value={overlay.accentColor ?? "#ffffff"}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
                />
              </div>
            )}
          </Section>
          <div className="border-t border-black/[0.06]" />
          <Section title="Templates">
            <div className="flex gap-2 flex-wrap">
              {PILL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  title={p.label}
                  onClick={() => update({ background: p.background, color: p.color, fontWeight: p.fontWeight })}
                  className="w-6 h-6 rounded-full border-2 cursor-pointer transition-all"
                  style={{
                    background: p.background,
                    borderColor: overlay.background === p.background ? "#fff" : "transparent",
                    boxShadow: overlay.background === p.background
                      ? "0 0 0 1px #0d9488"
                      : "0 0 0 1px rgba(0,0,0,0.15)",
                  }}
                />
              ))}
            </div>
          </Section>
        </>
      )}
      <div className="border-t border-black/[0.06]" />
      <Section title="Style">
        <div>
          <label htmlFor="overlay-font" className="text-[11px] text-[#6b6b78] block mb-1">Font</label>
          <select
            id="overlay-font"
            value={overlay.fontFamily ?? "sans-serif"}
            onChange={(e) => update({ fontFamily: e.target.value })}
            className="w-full text-xs bg-[#f2f2f6] border border-black/10 text-[#141416] rounded p-1.5 outline-none focus:ring-1 focus:ring-[#0ea5a0]"
          >
            {OVERLAY_FONTS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <SliderRow
          label="Font size"
          value={overlay.fontSize}
          min={10}
          max={120}
          step={1}
          onChange={(v) => update({ fontSize: v })}
          format={(v) => `${v}px`}
        />
        <div>
          <p className="text-xs text-[#6b6b78] mb-1">Background color</p>
          <input
            type="color"
            aria-label="Background color"
            value={overlay.background === "transparent" ? "#000000" : overlay.background}
            onChange={(e) => update({ background: e.target.value })}
            className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
          />
        </div>
        <div>
          <p className="text-xs text-[#6b6b78] mb-1">Text color</p>
          <input
            type="color"
            aria-label="Text color"
            value={overlay.color}
            onChange={(e) => update({ color: e.target.value })}
            className="w-full h-8 rounded cursor-pointer border border-black/[0.1]"
          />
        </div>
      </Section>
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Padding">
            <SliderRow
              label="Horizontal"
              value={overlay.paddingH ?? 20}
              min={4}
              max={80}
              step={2}
              onChange={(v) => update({ paddingH: v })}
              format={(v) => `${v}px`}
            />
            <SliderRow
              label="Vertical"
              value={overlay.paddingV ?? 8}
              min={2}
              max={40}
              step={1}
              onChange={(v) => update({ paddingV: v })}
              format={(v) => `${v}px`}
            />
          </Section>
        </>
      )}
      <div className="border-t border-black/[0.06]" />
      <Section title="Position">
        <SliderRow
          label="X"
          value={overlay.x}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update({ x: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Y"
          value={overlay.y}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update({ y: v })}
          format={(v) => `${v}%`}
        />
      </Section>
      {overlay.shape && (
        <>
          <div className="border-t border-black/[0.06]" />
          <Section title="Animation">
            <SliderRow
              label="Animate duration"
              value={overlay.animateDuration ?? 0.4}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(v) => update({ animateDuration: v })}
              format={(v) => `${v.toFixed(2)}s`}
            />
          </Section>
        </>
      )}
    </div>
  );
}
