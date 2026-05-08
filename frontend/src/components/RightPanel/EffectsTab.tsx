export default function EffectsTab() {
  function handleDragStart(e: React.DragEvent, effectType: string) {
    e.dataTransfer.setData("effectType", effectType);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Video Effects</p>
      <p className="text-[11px] text-slate-400">Drag an effect onto the FX track in the timeline.</p>

      <div
        draggable
        onDragStart={(e) => handleDragStart(e, "zoom")}
        className="flex items-center gap-3 p-3 rounded-lg border border-violet-200 bg-violet-50 cursor-grab active:cursor-grabbing hover:bg-violet-100 transition-colors select-none"
      >
        <span className="text-xl">🔍</span>
        <div>
          <p className="text-xs font-semibold text-violet-800">Zoom</p>
          <p className="text-[11px] text-violet-500">Zooms in, holds, zooms out</p>
        </div>
      </div>
    </div>
  );
}
