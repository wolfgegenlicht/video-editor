import { useProjectStore, makeDefaultCaptionStyle } from "../../store/useProjectStore";
import CaptionPresetPicker from "./CaptionPresetPicker";

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: "Georgia, serif", label: "Georgia" },
];

export default function CaptionStyleEditor() {
  const { project, setCaptionTrackStyle } = useProjectStore();
  const s = project.captionTrackStyle;

  function set<K extends keyof typeof s>(key: K, value: typeof s[K]) {
    setCaptionTrackStyle({ [key]: value } as any);
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <CaptionPresetPicker />

      <p className="text-[11px] text-[#6b6b78] font-medium border-t border-black/[0.06] pt-3">Caption Style</p>

      {/* Font family */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Font</label>
        <select
          value={s.fontFamily}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="w-full text-xs bg-[#f2f2f6] border border-black/10 text-[#141416] rounded p-1.5 outline-none focus:ring-1 focus:ring-[#0ea5a0]"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Size — {s.fontSize}px
        </label>
        <input
          type="range" min={12} max={96} step={2}
          value={s.fontSize}
          onChange={(e) => set("fontSize", parseInt(e.target.value))}
          className="w-full accent-[#0ea5a0]"
        />
      </div>

      {/* Font weight */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Weight</label>
        <div className="flex gap-2">
          {(["normal", "bold"] as const).map((w) => (
            <button
              key={w}
              onClick={() => set("fontWeight", w)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.fontWeight === w
                  ? "bg-[#0ea5a0] text-white border-[#0ea5a0]"
                  : "border-black/10 text-[#6b6b78] hover:bg-[#ebebef]"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Text align */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Align</label>
        <div className="flex gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => set("textAlign", a)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.textAlign === a
                  ? "bg-[#0ea5a0] text-white border-[#0ea5a0]"
                  : "border-black/10 text-[#6b6b78] hover:bg-[#ebebef]"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Letter spacing */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Letter spacing — {s.letterSpacing}px
        </label>
        <input
          type="range" min={-2} max={20} step={0.5}
          value={s.letterSpacing}
          onChange={(e) => set("letterSpacing", parseFloat(e.target.value))}
          className="w-full accent-[#0ea5a0]"
        />
      </div>

      {/* Text color */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Color</label>
        <input
          type="color"
          value={s.color}
          onChange={(e) => set("color", e.target.value)}
          className="w-full h-8 rounded border border-black/10 cursor-pointer"
        />
      </div>

      {/* Background */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Background</label>
        <div className="flex gap-2">
          <button
            onClick={() => set("backgroundColor", "transparent")}
            className={`flex-1 py-1 rounded text-xs border transition-colors
              ${s.backgroundColor === "transparent"
                ? "bg-[#0ea5a0] text-white border-[#0ea5a0]"
                : "border-black/10 text-[#6b6b78] hover:bg-[#ebebef]"}`}
          >
            None
          </button>
          <input
            type="color"
            value={s.backgroundColor === "transparent" ? "#000000" : s.backgroundColor}
            onChange={(e) => set("backgroundColor", e.target.value)}
            className="flex-1 h-8 rounded border border-black/10 cursor-pointer"
            title="Background color"
          />
        </div>
      </div>

      {/* Text shadow */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-[#6b6b78]">Text Shadow</label>
        <button
          onClick={() => set("textShadow", !s.textShadow)}
          className={`w-10 h-5 rounded-full transition-colors relative ${s.textShadow ? "bg-[#0ea5a0]" : "bg-[#e4e4ea]"}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.textShadow ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Outline */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Outline — {s.outlineWidth}px
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range" min={0} max={8} step={0.5}
            value={s.outlineWidth}
            onChange={(e) => set("outlineWidth", parseFloat(e.target.value))}
            className="flex-1 accent-[#0ea5a0]"
          />
          {s.outlineWidth > 0 && (
            <input
              type="color"
              value={s.outlineColor}
              onChange={(e) => set("outlineColor", e.target.value)}
              className="w-8 h-8 rounded border border-black/10 cursor-pointer flex-shrink-0"
              title="Outline color"
            />
          )}
        </div>
      </div>

      {/* Highlight color */}
      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">Highlight Color</label>
        <input
          type="color"
          value={s.highlightColor}
          onChange={(e) => set("highlightColor", e.target.value)}
          className="w-full h-8 rounded border border-black/10 cursor-pointer"
        />
      </div>

      {/* Position */}
      <p className="text-[11px] text-[#6b6b78] font-medium pt-1 border-t border-black/[0.06]">Position</p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-[#6b6b78]">X — {s.x.toFixed(0)}%</label>
          <button
            onClick={() => setCaptionTrackStyle({ x: Math.round((100 - s.boxW) / 2) })}
            className="text-[11px] text-[#0d9488] hover:text-[#0c9490] transition-colors"
          >
            Center
          </button>
        </div>
        <input
          type="range" min={0} max={90}
          value={s.x}
          onChange={(e) => setCaptionTrackStyle({ x: parseInt(e.target.value) })}
          className="w-full accent-[#0ea5a0]"
        />
      </div>

      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Y — {s.y.toFixed(0)}%
        </label>
        <input
          type="range" min={0} max={90}
          value={s.y}
          onChange={(e) => setCaptionTrackStyle({ y: parseInt(e.target.value) })}
          className="w-full accent-[#0ea5a0]"
        />
      </div>

      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Width — {s.boxW.toFixed(0)}%
        </label>
        <input
          type="range" min={10} max={100}
          value={s.boxW}
          onChange={(e) => setCaptionTrackStyle({ boxW: parseInt(e.target.value) })}
          className="w-full accent-[#0ea5a0]"
        />
      </div>

      <div>
        <label className="text-[11px] text-[#6b6b78] block mb-1">
          Height — {s.boxH.toFixed(0)}%
        </label>
        <input
          type="range" min={3} max={80}
          value={s.boxH}
          onChange={(e) => setCaptionTrackStyle({ boxH: parseInt(e.target.value) })}
          className="w-full accent-[#0ea5a0]"
        />
        <p className="text-[11px] text-[#6b6b78] mt-1">Text scrolls to stay visible · drag corner to resize</p>
      </div>

      {/* Reset */}
      <button
        onClick={() => setCaptionTrackStyle(makeDefaultCaptionStyle())}
        className="w-full py-1.5 text-xs border border-black/10 rounded text-[#6b6b78] hover:bg-[#ebebef] transition-colors"
      >
        Reset to defaults
      </button>
    </div>
  );
}
