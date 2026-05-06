import { useProjectStore } from "../../store/useProjectStore";
import type { CaptionStyle } from "../../types/project";

const STYLES: { id: CaptionStyle; label: string; description: string }[] = [
  { id: "minimal", label: "Minimal", description: "White text, drop shadow" },
  { id: "bold", label: "Bold", description: "Large, thick black outline" },
  { id: "subtitle", label: "Subtitle", description: "Semi-transparent bar" },
  { id: "cinematic", label: "Cinematic", description: "Centered, all-caps" },
  { id: "karaoke" as CaptionStyle, label: "Karaoke", description: "Word-by-word highlight" },
];

export default function CaptionStylePicker() {
  const { project, setCaptionStyle, setCaptionSize } = useProjectStore();
  const captionSize = project.captionSize ?? 32;

  return (
    <div className="p-2 border-t border-gray-100 space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Caption Style</p>
      <div className="space-y-1">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setCaptionStyle(s.id)}
            className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
              project.captionStyle === s.id
                ? "bg-blue-50 border border-blue-300 text-blue-700"
                : "hover:bg-gray-50 border border-transparent text-gray-700"
            }`}
          >
            <span className="font-medium">{s.label}</span>
            <span className="text-gray-400 ml-1 text-[10px]">{s.description}</span>
          </button>
        ))}
      </div>

      {project.captionStyle === "karaoke" && (
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Size — {captionSize}px
          </label>
          <input
            type="range"
            min={16}
            max={96}
            step={4}
            value={captionSize}
            onChange={(e) => setCaptionSize(parseInt(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
            <span>more words</span>
            <span>fewer words</span>
          </div>
          <p className="text-[9px] text-gray-400 mt-1">Drag box to move · drag corner to resize</p>
        </div>
      )}
    </div>
  );
}
