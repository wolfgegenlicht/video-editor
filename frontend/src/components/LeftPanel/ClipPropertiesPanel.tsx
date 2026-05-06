import { useProjectStore } from "../../store/useProjectStore";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

export default function ClipPropertiesPanel() {
  const {
    project, selectedClipId,
    setClipSpeed, setClipVolume, setClipFade,
  } = useProjectStore();

  const clip = selectedClipId
    ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : null;

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-400 text-center">Select a clip on the timeline to edit its properties</p>
      </div>
    );
  }

  const speed = clip.speed ?? 1;
  const volume = clip.volume ?? 1;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-5">
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Speed</label>
        <div className="flex flex-wrap gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setClipSpeed(clip.id, s)}
              className={`px-2 py-1 rounded text-xs border transition-colors
                ${speed === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Volume — {Math.round(volume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={volume}
          onChange={(e) => setClipVolume(clip.id, parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Fade In — {fadeIn.toFixed(1)}s
        </label>
        <input
          type="range"
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.1}
          value={fadeIn}
          onChange={(e) => setClipFade(clip.id, parseFloat(e.target.value), fadeOut)}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Fade Out — {fadeOut.toFixed(1)}s
        </label>
        <input
          type="range"
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.1}
          value={fadeOut}
          onChange={(e) => setClipFade(clip.id, fadeIn, parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>
    </div>
  );
}
