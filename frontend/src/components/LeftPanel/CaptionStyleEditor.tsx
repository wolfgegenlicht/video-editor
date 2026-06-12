import { useProjectStore, makeDefaultCaptionStyle } from "../../store/useProjectStore";

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
      <p className="text-[11px] text-[var(--txt2)] font-medium">Caption Style</p>

      {/* Font family */}
      <div>
        <label htmlFor="caption-font" className="text-[11px] text-[var(--txt2)] block mb-1">Font</label>
        <select
          id="caption-font"
          value={s.fontFamily}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="w-full text-xs bg-[var(--label-bg)] border border-[var(--border-strong)] text-[var(--txt1)] rounded p-1.5 outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div>
        <label htmlFor="caption-size" className="text-[11px] text-[var(--txt2)] block mb-1">
          Size: {s.fontSize}px
        </label>
        <input
          id="caption-size"
          type="range" min={12} max={96} step={2}
          value={s.fontSize}
          onChange={(e) => set("fontSize", parseInt(e.target.value))}
          onDoubleClick={() => set("fontSize", 32)}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* Font weight */}
      <div>
        <p className="text-[11px] text-[var(--txt2)] block mb-1">Weight</p>
        <div className="flex gap-2">
          {(["normal", "bold"] as const).map((w) => (
            <button
              type="button"
              key={w}
              onClick={() => set("fontWeight", w)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.fontWeight === w
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "border-[var(--border-strong)] text-[var(--txt2)] hover:bg-[var(--hover)]"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Text align */}
      <div>
        <p className="text-[11px] text-[var(--txt2)] block mb-1">Align</p>
        <div className="flex gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => set("textAlign", a)}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${s.textAlign === a
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "border-[var(--border-strong)] text-[var(--txt2)] hover:bg-[var(--hover)]"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Letter spacing */}
      <div>
        <label htmlFor="caption-letter-spacing" className="text-[11px] text-[var(--txt2)] block mb-1">
          Letter spacing: {s.letterSpacing}px
        </label>
        <input
          id="caption-letter-spacing"
          type="range" min={-2} max={20} step={0.5}
          value={s.letterSpacing}
          onChange={(e) => set("letterSpacing", parseFloat(e.target.value))}
          onDoubleClick={() => set("letterSpacing", 0)}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* Line height */}
      <div>
        <label htmlFor="caption-line-height" className="text-[11px] text-[var(--txt2)] block mb-1">
          Line height: {(s.lineHeight ?? 1.35).toFixed(2)}×
        </label>
        <input
          id="caption-line-height"
          type="range" min={1} max={2} step={0.05}
          value={s.lineHeight ?? 1.35}
          onChange={(e) => set("lineHeight", parseFloat(e.target.value))}
          onDoubleClick={() => set("lineHeight", 1.35)}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* Text color */}
      <div>
        <label htmlFor="caption-color" className="text-[11px] text-[var(--txt2)] block mb-1">Color</label>
        <input
          id="caption-color"
          type="color"
          value={s.color}
          onChange={(e) => set("color", e.target.value)}
          className="w-full h-8 rounded border border-[var(--border-strong)] cursor-pointer"
        />
      </div>

      {/* Background */}
      <div>
        <p className="text-[11px] text-[var(--txt2)] block mb-1">Background</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set("backgroundColor", "transparent")}
            className={`flex-1 py-1 rounded text-xs border transition-colors
              ${s.backgroundColor === "transparent"
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "border-[var(--border-strong)] text-[var(--txt2)] hover:bg-[var(--hover)]"}`}
          >
            None
          </button>
          <input
            type="color"
            aria-label="Background color"
            value={s.backgroundColor === "transparent" ? "#000000" : s.backgroundColor}
            onChange={(e) => set("backgroundColor", e.target.value)}
            className="flex-1 h-8 rounded border border-[var(--border-strong)] cursor-pointer"
            title="Background color"
          />
        </div>
      </div>

      {/* Text shadow */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--txt2)]">Text Shadow</span>
        <button
          type="button"
          aria-label="Toggle text shadow"
          onClick={() => set("textShadow", !s.textShadow)}
          className={`w-10 h-5 rounded-full transition-colors relative ${s.textShadow ? "bg-[var(--accent)]" : "bg-[var(--border-soft)]"}`}
        >
          <div className={`absolute top-0.5 size-4 bg-[var(--panel)] rounded-full shadow transition-transform ${s.textShadow ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Outline */}
      <div>
        <label htmlFor="caption-outline" className="text-[11px] text-[var(--txt2)] block mb-1">
          Outline: {s.outlineWidth}px
        </label>
        <div className="flex gap-2 items-center">
          <input
            id="caption-outline"
            type="range" min={0} max={8} step={0.5}
            value={s.outlineWidth}
            onChange={(e) => set("outlineWidth", parseFloat(e.target.value))}
            onDoubleClick={() => set("outlineWidth", 0)}
            className="flex-1 accent-[var(--accent)]"
          />
          {s.outlineWidth > 0 && (
            <input
              type="color"
              value={s.outlineColor}
              onChange={(e) => set("outlineColor", e.target.value)}
              className="size-8 rounded border border-[var(--border-strong)] cursor-pointer flex-shrink-0"
              aria-label="Outline color"
              title="Outline color"
            />
          )}
        </div>
      </div>

      {/* Highlight color */}
      <div>
        <label htmlFor="caption-highlight" className="text-[11px] text-[var(--txt2)] block mb-1">Highlight Color</label>
        <input
          id="caption-highlight"
          type="color"
          value={s.highlightColor}
          onChange={(e) => set("highlightColor", e.target.value)}
          className="w-full h-8 rounded border border-[var(--border-strong)] cursor-pointer"
        />
      </div>

      {/* Position */}
      <p className="text-[11px] text-[var(--txt2)] font-medium pt-1 border-t border-[var(--border)]">Position</p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="caption-x" className="text-[11px] text-[var(--txt2)]">X: {s.x.toFixed(0)}%</label>
          <button
            type="button"
            onClick={() => setCaptionTrackStyle({ x: Math.round((100 - s.boxW) / 2) })}
            className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            Center
          </button>
        </div>
        <input
          id="caption-x"
          type="range" min={0} max={90}
          value={s.x}
          onChange={(e) => setCaptionTrackStyle({ x: parseInt(e.target.value) })}
          onDoubleClick={() => setCaptionTrackStyle({ x: 10 })}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <div>
        <label htmlFor="caption-y" className="text-[11px] text-[var(--txt2)] block mb-1">
          Y: {s.y.toFixed(0)}%
        </label>
        <input
          id="caption-y"
          type="range" min={0} max={90}
          value={s.y}
          onChange={(e) => setCaptionTrackStyle({ y: parseInt(e.target.value) })}
          onDoubleClick={() => setCaptionTrackStyle({ y: 78 })}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <div>
        <label htmlFor="caption-width" className="text-[11px] text-[var(--txt2)] block mb-1">
          Width: {s.boxW.toFixed(0)}%
        </label>
        <input
          id="caption-width"
          type="range" min={10} max={100}
          value={s.boxW}
          onChange={(e) => setCaptionTrackStyle({ boxW: parseInt(e.target.value) })}
          onDoubleClick={() => setCaptionTrackStyle({ boxW: 80 })}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <div>
        <label htmlFor="caption-height" className="text-[11px] text-[var(--txt2)] block mb-1">
          Height: {s.boxH.toFixed(0)}%
        </label>
        <input
          id="caption-height"
          type="range" min={3} max={80}
          value={s.boxH}
          onChange={(e) => setCaptionTrackStyle({ boxH: parseInt(e.target.value) })}
          onDoubleClick={() => setCaptionTrackStyle({ boxH: 18 })}
          className="w-full accent-[var(--accent)]"
        />
        <p className="text-[11px] text-[var(--txt2)] mt-1">Text scrolls to stay visible · drag corner to resize</p>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={() => setCaptionTrackStyle(makeDefaultCaptionStyle())}
        className="w-full py-1.5 text-xs border border-[var(--border-strong)] rounded text-[var(--txt2)] hover:bg-[var(--hover)] transition-colors"
      >
        Reset to defaults
      </button>
    </div>
  );
}
