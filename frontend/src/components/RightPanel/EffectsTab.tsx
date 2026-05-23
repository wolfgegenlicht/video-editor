import { useProjectStore } from "../../store/useProjectStore";

export default function EffectsTab() {
  const { addEffectOverlay, addClipTransition, playheadTime, project, setDraggingEffectType } = useProjectStore();

  function handleDragStart(e: React.DragEvent, effectType: string) {
    e.dataTransfer.setData("effectType", effectType);
    e.dataTransfer.effectAllowed = "copy";
    setDraggingEffectType(effectType);
  }

  function handleDragEnd() {
    setDraggingEffectType(null);
  }

  function handleDoubleClick(effectType: string) {
    if (effectType === "zoom") {
      addEffectOverlay({ type: "zoom", startTime: playheadTime, endTime: playheadTime + 3, params: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 } });
    } else if (effectType === "fade") {
      addEffectOverlay({ type: "fade", startTime: playheadTime, endTime: playheadTime + 1, params: { direction: "in" } });
    } else if (effectType === "blur") {
      addEffectOverlay({ type: "blur", startTime: playheadTime, endTime: playheadTime + 3, params: { intensity: 10 } });
    } else if (effectType === "colorgrade") {
      addEffectOverlay({ type: "colorgrade", startTime: playheadTime, endTime: playheadTime + 3, params: { preset: "warm", intensity: 0.8 } });
    } else if (effectType === "speedramp") {
      addEffectOverlay({ type: "speedramp", startTime: playheadTime, endTime: playheadTime + 2, params: { startSpeed: 1, endSpeed: 0.5, easing: "ease" } });
    } else if (effectType === "dissolve") {
      const videoTracks = project.tracks.filter((t) => t.type !== "audio");
      let nearest: { trackId: string; atTime: number; dist: number } | null = null;
      for (const track of videoTracks) {
        const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < sorted.length - 1; i++) {
          const boundary = sorted[i].startTime + sorted[i].duration;
          const dist = Math.abs(boundary - playheadTime);
          if (!nearest || dist < nearest.dist) nearest = { trackId: track.id, atTime: boundary, dist };
        }
      }
      if (!nearest || nearest.dist > 3) return;
      const existing = (project.clipTransitions ?? []).find(
        (t) => t.trackId === nearest!.trackId && Math.abs(t.atTime - nearest!.atTime) < 0.1
      );
      if (existing) return;
      addClipTransition({ trackId: nearest.trackId, atTime: nearest.atTime, type: "dissolve", duration: 0.5 });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <p className="text-[11px] font-bold text-[#6b6b78]">Video Effects</p>
      <p className="text-[11px] text-[#6b6b78]">Drag or double-click to add to the timeline.</p>

      <EffectCard
        effectType="zoom" label="Zoom" desc="Zooms in, holds, zooms out"
        color="violet"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#7c3aed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="7.5" r="5"/><line x1="11.5" y1="11.5" x2="15.5" y2="15.5"/>
            <line x1="7.5" y1="5" x2="7.5" y2="10"/><line x1="5" y1="7.5" x2="10" y2="7.5"/>
          </svg>
        }
      />

      <EffectCard
        effectType="fade" label="Fade" desc="Fade in or fade out"
        color="amber"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <defs>
              <linearGradient id="fade-icon-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d97706" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#d97706" stopOpacity="1"/>
              </linearGradient>
            </defs>
            <rect x="2" y="5" width="14" height="8" rx="1.5" fill="url(#fade-icon-grad)"/>
          </svg>
        }
      />

      <EffectCard
        effectType="blur" label="Blur" desc="Gaussian blur over a time range"
        color="sky"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="9" cy="9" r="5" strokeOpacity="0.4"/>
            <circle cx="9" cy="9" r="3" strokeOpacity="0.6"/>
            <circle cx="9" cy="9" r="1.5"/>
          </svg>
        }
      />

      <EffectCard
        effectType="colorgrade" label="Color Grade" desc="Warm, cool, B&W or vintage look"
        color="rose"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" strokeLinecap="round">
            <circle cx="6" cy="9" r="4" fill="#fca5a5" fillOpacity="0.7"/>
            <circle cx="12" cy="9" r="4" fill="#93c5fd" fillOpacity="0.7"/>
            <circle cx="9" cy="6" r="4" fill="#86efac" fillOpacity="0.5"/>
          </svg>
        }
      />

      <EffectCard
        effectType="speedramp" label="Speed Ramp" desc="Smoothly change playback speed"
        color="orange"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#ea580c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 13 Q5 13 9 5 Q13 13 16 13"/>
            <line x1="2" y1="13" x2="16" y2="13" strokeOpacity="0.3"/>
          </svg>
        }
      />

      <p className="text-[11px] font-bold text-[#6b6b78] pt-2">Transitions</p>
      <p className="text-[11px] text-[#6b6b78]">Double-click with playhead near a clip boundary.</p>

      <EffectCard
        effectType="dissolve" label="Cross Dissolve" desc="Dip to black between clips"
        color="teal"
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDoubleClick={handleDoubleClick}
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" strokeLinecap="round">
            <defs>
              <linearGradient id="dissolve-l" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0d9488" stopOpacity="1"/>
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="dissolve-r" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0d9488" stopOpacity="0"/>
                <stop offset="100%" stopColor="#0d9488" stopOpacity="1"/>
              </linearGradient>
            </defs>
            <rect x="1" y="5" width="7" height="8" rx="1" fill="url(#dissolve-l)"/>
            <rect x="10" y="5" width="7" height="8" rx="1" fill="url(#dissolve-r)"/>
          </svg>
        }
      />
    </div>
  );
}

type CardColor = "violet" | "amber" | "sky" | "rose" | "orange" | "teal";

const COLOR_CLASSES: Record<CardColor, { border: string; bg: string; hover: string; title: string; desc: string }> = {
  violet: { border: "border-violet-200", bg: "bg-violet-50", hover: "hover:bg-violet-100", title: "text-violet-700", desc: "text-violet-500" },
  amber:  { border: "border-amber-200",  bg: "bg-amber-50",  hover: "hover:bg-amber-100",  title: "text-amber-700",  desc: "text-amber-500"  },
  sky:    { border: "border-sky-200",    bg: "bg-sky-50",    hover: "hover:bg-sky-100",    title: "text-sky-700",    desc: "text-sky-500"    },
  rose:   { border: "border-rose-200",   bg: "bg-rose-50",   hover: "hover:bg-rose-100",   title: "text-rose-700",   desc: "text-rose-500"   },
  orange: { border: "border-orange-200", bg: "bg-orange-50", hover: "hover:bg-orange-100", title: "text-orange-700", desc: "text-orange-500" },
  teal:   { border: "border-teal-200",   bg: "bg-teal-50",   hover: "hover:bg-teal-100",   title: "text-teal-700",   desc: "text-teal-500"   },
};

function EffectCard({ effectType, label, desc, color, icon, draggable = true, onDragStart, onDragEnd, onDoubleClick }: {
  effectType: string;
  label: string;
  desc: string;
  color: CardColor;
  icon: React.ReactNode;
  draggable?: boolean;
  onDragStart: (e: React.DragEvent, type: string) => void;
  onDragEnd: () => void;
  onDoubleClick: (type: string) => void;
}) {
  const cls = COLOR_CLASSES[color];
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, effectType) : undefined}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onDoubleClick(effectType)}
      className={`flex items-center gap-3 p-3 rounded-lg border ${cls.border} ${cls.bg} ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${cls.hover} transition-colors select-none`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className={`text-xs font-semibold ${cls.title}`}>{label}</p>
        <p className={`text-[11px] ${cls.desc}`}>{desc}</p>
      </div>
    </div>
  );
}
