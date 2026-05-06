import { useProjectStore } from "../../store/useProjectStore";
import type { Caption } from "../../types/project";

interface Props { time: number }

const CONTAINER: Record<string, string> = {
  minimal:   "absolute left-1/2 -translate-x-1/2 bottom-8 text-center pointer-events-none",
  bold:      "absolute left-1/2 -translate-x-1/2 bottom-10 text-center pointer-events-none",
  subtitle:  "absolute left-1/2 -translate-x-1/2 bottom-8 text-center pointer-events-none",
  cinematic: "absolute left-1/2 -translate-x-1/2 bottom-1/2 translate-y-1/2 text-center pointer-events-none",
};

const TEXT: Record<string, string> = {
  minimal:   "text-white text-sm drop-shadow-md",
  bold:      "text-white text-2xl font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000]",
  subtitle:  "text-white text-sm bg-black/60 px-3 py-1",
  cinematic: "text-white text-xl tracking-[0.2em] uppercase",
};

function windowWords(words: Caption["words"], activeIdx: number, captionSize: number) {
  if (!words?.length) return { visible: [] as NonNullable<Caption["words"]>, relActive: -1 };
  // More words when font is small, fewer when large: 320/size → 32px=10, 64px=5, 96px=3
  const windowSize = Math.max(3, Math.round(320 / captionSize));
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(activeIdx - half, words.length - windowSize));
  const end = Math.min(words.length, start + windowSize);
  return { visible: words.slice(start, end), relActive: activeIdx - start };
}

function KaraokeOverlay({ seg, time }: { seg: Caption; time: number }) {
  const { project, setCaptionPosition } = useProjectStore();
  const captionSize = project.captionSize ?? 32;
  const x = project.captionX ?? 50;
  const y = project.captionY ?? 85;

  const words = seg.words ?? [];
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  const { visible, relActive } = windowWords(words, activeIdx, captionSize);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    if (!container) return;

    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const nx = Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100));
      const ny = Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100));
      setCaptionPosition(nx, ny);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="absolute select-none cursor-move"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
      onMouseDown={onMouseDown}
    >
      <p
        className="font-bold drop-shadow-lg leading-tight text-center max-w-[80vw]"
        style={{ fontSize: captionSize, color: "white", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
      >
        {visible.length ? visible.map((w, i) => (
          <span
            key={i}
            className={
              i === relActive
                ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.9)]"
                : i < relActive
                ? "text-white/40"
                : "text-white"
            }
          >
            {w.text}{" "}
          </span>
        )) : <span>{seg.text}</span>}
      </p>
    </div>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const style = project.captionStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;

  if (style === "karaoke") {
    return <KaraokeOverlay seg={cap} time={time} />;
  }

  return (
    <div className={CONTAINER[style] ?? CONTAINER.minimal}>
      <span className={TEXT[style] ?? TEXT.minimal}>{cap.text}</span>
    </div>
  );
}
