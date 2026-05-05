import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

const STYLE_CLASSES: Record<string, string> = {
  minimal: "text-white text-sm drop-shadow-md bottom-8 left-1/2 -translate-x-1/2",
  bold: "text-white text-2xl font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000] bottom-10 left-1/2 -translate-x-1/2",
  subtitle: "text-white text-sm bg-black/60 px-3 py-1 bottom-8 left-1/2 -translate-x-1/2",
  cinematic: "text-white text-xl tracking-[0.2em] uppercase bottom-1/2 translate-y-1/2 left-1/2 -translate-x-1/2",
};

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;
  const cls = STYLE_CLASSES[project.captionStyle] ?? STYLE_CLASSES.minimal;
  return (
    <div className={`absolute pointer-events-none ${cls}`}>
      {cap.text}
    </div>
  );
}
