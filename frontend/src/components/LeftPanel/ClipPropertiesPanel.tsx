import { useProjectStore } from "../../store/useProjectStore";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

export default function ClipPropertiesPanel() {
  const {
    project, selectedClipId, selectedOverlayId,
    setClipSpeed, setClipVolume, setClipFade,
    updateTextOverlay,
  } = useProjectStore();

  // Text overlay editor takes priority if an overlay is selected
  const overlay = selectedOverlayId
    ? project.textOverlays.find((o) => o.id === selectedOverlayId)
    : null;

  if (overlay) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Text</label>
          <textarea
            value={overlay.text}
            onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded p-2 resize-none outline-none focus:ring-1 focus:ring-blue-400"
            rows={3}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Font Size — {overlay.fontSize}px
          </label>
          <input
            type="range" min={12} max={120} step={2}
            value={overlay.fontSize}
            onChange={(e) => updateTextOverlay(overlay.id, { fontSize: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Color</label>
          <input
            type="color"
            value={overlay.color}
            onChange={(e) => updateTextOverlay(overlay.id, { color: e.target.value })}
            className="w-full h-8 rounded border border-gray-200 cursor-pointer"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Weight</label>
          <div className="flex gap-2">
            {(["normal", "bold"] as const).map((w) => (
              <button
                key={w}
                onClick={() => updateTextOverlay(overlay.id, { fontWeight: w })}
                className={`flex-1 py-1 rounded text-xs border transition-colors
                  ${overlay.fontWeight === w
                    ? "bg-purple-600 text-white border-purple-600"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Position X — {overlay.x.toFixed(0)}%
          </label>
          <input
            type="range" min={0} max={100}
            value={overlay.x}
            onChange={(e) => updateTextOverlay(overlay.id, { x: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Position Y — {overlay.y.toFixed(0)}%
          </label>
          <input
            type="range" min={0} max={100}
            value={overlay.y}
            onChange={(e) => updateTextOverlay(overlay.id, { y: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Duration — {(overlay.endTime - overlay.startTime).toFixed(1)}s
          </label>
          <input
            type="range" min={0.5} max={30} step={0.5}
            value={overlay.endTime - overlay.startTime}
            onChange={(e) => updateTextOverlay(overlay.id, { endTime: overlay.startTime + parseFloat(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Background</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateTextOverlay(overlay.id, { background: "transparent" })}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${overlay.background === "transparent"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              None
            </button>
            <input
              type="color"
              value={overlay.background === "transparent" ? "#000000" : overlay.background}
              onChange={(e) => updateTextOverlay(overlay.id, { background: e.target.value })}
              className="flex-1 h-8 rounded border border-gray-200 cursor-pointer"
              title="Background color"
            />
          </div>
        </div>
      </div>
    );
  }

  // Clip properties editor
  const clip = selectedClipId
    ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : null;

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-400 text-center">Select a clip or text overlay to edit its properties</p>
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
          max={1}
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
