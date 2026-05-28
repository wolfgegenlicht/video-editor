import { useProjectStore } from "../../store/useProjectStore";
import { Section, SliderRow } from "../properties-helpers";

const PILL_PRESETS: Array<{ label: string; background: string; color: string; fontWeight: "normal" | "bold" }> = [
  { label: "Purple", background: "#7c3aed", color: "#ffffff", fontWeight: "bold" },
  { label: "Dark",   background: "#1a1a2e", color: "#ffffff", fontWeight: "bold" },
  { label: "White",  background: "#ffffff", color: "#111111", fontWeight: "bold" },
  { label: "Teal",   background: "#0d9488", color: "#ffffff", fontWeight: "bold" },
  { label: "Warm",   background: "#d97706", color: "#ffffff", fontWeight: "bold" },
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
      {overlay.shape === "pill" && (
        <>
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
        <SliderRow
          label="Font size"
          value={overlay.fontSize}
          min={10}
          max={72}
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
      {overlay.shape === "pill" && (
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
