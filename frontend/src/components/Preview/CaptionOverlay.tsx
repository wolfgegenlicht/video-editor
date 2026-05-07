import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Caption, CaptionTrackStyle } from "../../types/project";

interface Props { time: number }

function useFadeIn() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return visible;
}

function captionTextStyle(s: CaptionTrackStyle): React.CSSProperties {
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    color: s.color,
    letterSpacing: s.letterSpacing > 0 ? `${s.letterSpacing}px` : undefined,
    textAlign: s.textAlign,
    textShadow: s.textShadow ? "0 2px 8px rgba(0,0,0,0.8)" : undefined,
    WebkitTextStroke: s.outlineWidth > 0 ? `${s.outlineWidth}px ${s.outlineColor}` : undefined,
    backgroundColor: s.backgroundColor !== "transparent" ? s.backgroundColor : undefined,
    padding: s.backgroundColor !== "transparent" ? "2px 12px" : undefined,
    lineHeight: 1.35,
    wordBreak: "break-word" as const,
  };
}

function KaraokeOverlay({ seg, time, style }: { seg: Caption; time: number; style: CaptionTrackStyle }) {
  const { setCaptionPosition, setCaptionBox } = useProjectStore();
  const { x, y, boxW } = style;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visible = useFadeIn();

  const words = seg.words ?? [];
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startCX = x, startCY = y;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionPosition(
        Math.max(0, Math.min(100 - boxW, startCX + dx)),
        Math.max(0, Math.min(95, startCY + dy)),
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
    const startW = boxW;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dw = ((ev.clientX - startX) / rect.width) * 100;
      setCaptionBox(Math.max(10, Math.min(100 - x, startW + dw)), style.boxH);
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
        left: `${x}%`, top: `${y}%`, width: `${boxW}%`,
        border: "1.5px dashed rgba(255,255,255,0.25)",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
      onMouseDown={onDragStart}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.6)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
    >
      <p style={{ ...captionTextStyle(style), padding: "4px 8px", backgroundColor: undefined }}>
        {words.length ? words.map((w, i) => (
          <span
            key={i}
            style={{
              pointerEvents: "none",
              color: i === activeIdx
                ? style.highlightColor
                : i < activeIdx
                ? `${style.color}66`
                : style.color,
              textShadow: style.textShadow ? "0 2px 8px rgba(0,0,0,0.8)" : undefined,
              WebkitTextStroke: style.outlineWidth > 0 ? `${style.outlineWidth}px ${style.outlineColor}` : undefined,
            }}
          >
            {w.text}{" "}
          </span>
        )) : <span style={{ pointerEvents: "none", color: style.color }}>{seg.text}</span>}
      </p>

      {/* Width-only resize handle — right edge */}
      <div
        className="absolute top-0 bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize"
        style={{ width: 8 }}
        onMouseDown={onResizeStart}
      >
        <div style={{ position: "absolute", top: "50%", right: 2, width: 4, height: 20, marginTop: -10, background: "rgba(255,255,255,0.7)", borderRadius: 2 }} />
      </div>
    </div>
  );
}

function StaticCaption({ seg, style }: { seg: Caption; style: CaptionTrackStyle }) {
  const visible = useFadeIn();
  return (
    <div
      style={{
        position: "absolute",
        left: `${style.x}%`,
        top: `${style.y}%`,
        width: `${style.boxW}%`,
        textAlign: style.textAlign,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
    >
      <span style={captionTextStyle(style)}>{seg.text}</span>
    </div>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const style = project.captionTrackStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;

  if (style.highlightMode === "karaoke") {
    return <KaraokeOverlay key={cap.id} seg={cap} time={time} style={style} />;
  }

  return <StaticCaption key={cap.id} seg={cap} style={style} />;
}
