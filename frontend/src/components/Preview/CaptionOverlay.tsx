import { useProjectStore } from "../../store/useProjectStore";
import type { Caption } from "../../types/project";

interface Props { time: number }

const BASE_CLASSES = "absolute pointer-events-none left-1/2 -translate-x-1/2";

const CONTAINER: Record<string, string> = {
  minimal:   "bottom-8 text-center",
  bold:      "bottom-10 text-center",
  subtitle:  "bottom-8 text-center",
  cinematic: "bottom-1/2 translate-y-1/2 text-center",
  karaoke:   "bottom-10 text-center px-4 w-full max-w-lg",
};

const TEXT: Record<string, string> = {
  minimal:   "text-white text-sm drop-shadow-md",
  bold:      "text-white text-2xl font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000]",
  subtitle:  "text-white text-sm bg-black/60 px-3 py-1",
  cinematic: "text-white text-xl tracking-[0.2em] uppercase",
  karaoke:   "text-white text-xl font-bold drop-shadow-lg leading-relaxed",
};

function KaraokeWords({ seg, time }: { seg: Caption; time: number }) {
  const words = seg.words ?? [];
  if (!words.length) return <span>{seg.text}</span>;

  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  return (
    <>
      {words.map((w, i) => (
        <span
          key={i}
          className={
            i === activeIdx
              ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]"
              : i < activeIdx
              ? "text-white/50"
              : "text-white"
          }
        >
          {w.text}{" "}
        </span>
      ))}
    </>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const style = project.captionStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;

  return (
    <div className={`${BASE_CLASSES} ${CONTAINER[style] ?? CONTAINER.minimal}`}>
      <span className={TEXT[style] ?? TEXT.minimal}>
        {style === "karaoke" ? (
          <KaraokeWords seg={cap} time={time} />
        ) : (
          cap.text
        )}
      </span>
    </div>
  );
}
