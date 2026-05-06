import { useEffect, useRef, useState } from "react";
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

function KaraokeOverlay({ seg, time }: { seg: Caption; time: number }) {
  const { project, setCaptionPosition, setCaptionBox } = useProjectStore();
  const captionSize = project.captionSize ?? 32;
  const x = project.captionX ?? 10;
  const y = project.captionY ?? 78;
  const boxW = project.captionBoxW ?? 80;
  const boxH = project.captionBoxH ?? 18;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const words = seg.words ?? [];
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  // Scroll inner content to keep active word visible
  useEffect(() => {
    if (!activeWordRef.current || !innerRef.current) return;
    const wordTop = activeWordRef.current.offsetTop;
    setScrollOffset(Math.max(0, wordTop - 4));
  }, [activeIdx]);

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCX = x;
    const startCY = y;

    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionPosition(
        Math.max(0, Math.min(100 - boxW, startCX + dx)),
        Math.max(0, Math.min(100 - boxH, startCY + dy)),
      );
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = boxW;
    const startH = boxH;

    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dw = ((ev.clientX - startX) / rect.width) * 100;
      const dh = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionBox(
        Math.max(10, Math.min(100 - x, startW + dw)),
        Math.max(5, Math.min(60, startH + dh)),
      );
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
      ref={containerRef}
      className="absolute group select-none cursor-move"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${boxW}%`,
        height: `${boxH}%`,
        overflow: "hidden",
        border: "1.5px dashed rgba(255,255,255,0.25)",
      }}
      onMouseDown={onDragStart}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.6)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
    >
      {/* Scrolling word container */}
      <div
        ref={innerRef}
        style={{
          transform: `translateY(-${scrollOffset}px)`,
          transition: "transform 150ms ease-out",
          padding: "4px 8px",
          lineHeight: 1.35,
          wordBreak: "break-word",
        }}
      >
        <p style={{ fontSize: captionSize, fontWeight: "bold", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          {words.length ? words.map((w, i) => (
            <span
              key={i}
              ref={i === activeIdx ? activeWordRef : undefined}
              style={{ pointerEvents: "none" }}
              className={
                i === activeIdx
                  ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.9)]"
                  : i < activeIdx
                  ? "text-white/40"
                  : "text-white"
              }
            >
              {w.text}{" "}
            </span>
          )) : <span className="text-white" style={{ pointerEvents: "none" }}>{seg.text}</span>}
        </p>
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize"
        style={{ width: 20, height: 20, padding: 4 }}
        onMouseDown={onResizeStart}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRight: "2px solid rgba(255,255,255,0.7)",
            borderBottom: "2px solid rgba(255,255,255,0.7)",
          }}
        />
      </div>
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
