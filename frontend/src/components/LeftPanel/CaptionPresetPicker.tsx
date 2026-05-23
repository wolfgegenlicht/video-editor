import { useProjectStore } from "../../store/useProjectStore";
import { CAPTION_PRESETS } from "../../lib/captionPresets";

export default function CaptionPresetPicker() {
  const { project, setCaptionTrackStyle } = useProjectStore();
  const s = project.captionTrackStyle;

  return (
    <div>
      <p className="text-[11px] text-[#6b6b78] font-medium mb-2">Presets</p>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {CAPTION_PRESETS.map((preset) => {
          const isActive =
            s.highlightColor === preset.style.highlightColor &&
            s.fontFamily === preset.style.fontFamily &&
            s.fontWeight === preset.style.fontWeight;

          const hasBg = preset.preview.bg !== "transparent";

          return (
            <button
              key={preset.name}
              onClick={() => setCaptionTrackStyle(preset.style)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 rounded-lg p-0.5 border-2 transition-all ${
                isActive ? "border-[#0ea5a0]" : "border-transparent hover:border-black/10"
              }`}
              title={preset.name}
            >
              {/* Mini video frame */}
              <div
                className="w-[68px] h-[40px] rounded flex items-end justify-center pb-1"
                style={{ background: "#111827" }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: preset.style.fontWeight ?? "normal",
                    padding: hasBg ? "1px 4px" : undefined,
                    background: hasBg ? preset.preview.bg : undefined,
                    borderRadius: hasBg ? 2 : undefined,
                  }}
                >
                  <span style={{ color: preset.preview.text }}>Hallo </span>
                  <span style={{ color: preset.preview.highlight }}>{hasBg ? "Welt" : "Welt"}</span>
                </span>
              </div>
              <span className="text-[11px] text-[#6b6b78] leading-none">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
