import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function KaraokeOverlay({ seg, time, style, onSelect }: { seg: Caption; time: number; style: CaptionTrackStyle; onSelect: () => void }) {
  const { setCaptionPosition, setCaptionBox } = useProjectStore();
  const { x, y, boxW, boxH } = style;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const visible = useFadeIn();

  const words = seg.words ?? [];
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  // Snap to active word position before first paint (no animation flash on segment change)
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const el = wordRefs.current[Math.max(0, activeIdx)];
    const scrollY = el ? Math.max(0, el.offsetTop - 4) : 0;
    contentRef.current.style.transition = "none";
    contentRef.current.style.transform = `translateY(-${scrollY}px)`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — seg.id handled by key={cap.id} in parent

  // Animate scroll as active word advances during playback
  useEffect(() => {
    if (!contentRef.current) return;
    const el = wordRefs.current[activeIdx];
    if (!el) return;
    contentRef.current.style.transition = "transform 150ms ease-out";
    contentRef.current.style.transform = `translateY(-${Math.max(0, el.offsetTop - 4)}px)`;
  }, [activeIdx]);

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
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

  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startW = boxW, startH = boxH;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const dw = ((ev.clientX - startX) / rect.width) * 100;
      const dh = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionBox(
        Math.max(10, Math.min(100 - x, startW + dw)),
        Math.max(3, Math.min(80, startH + dh)),
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
        left: `${x}%`, top: `${y}%`, width: `${boxW}%`, height: `${boxH}%`,
        overflow: "hidden",
        border: "1.5px dashed rgba(255,255,255,0.25)",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
      onPointerDown={onDragStart}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.6)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
    >
      <div ref={contentRef}>
        <p style={{ ...captionTextStyle(style), padding: "4px 8px", backgroundColor: undefined }}>
          {words.length ? words.map((w, i) => (
            <span
              key={i}
              ref={(el) => { wordRefs.current[i] = el; }}
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
      </div>

      {/* Corner resize handle — width + height */}
      <div
        className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize"
        style={{ width: 20, height: 20, padding: 4 }}
        onPointerDown={onResizeStart}
      >
        <div style={{ width: "100%", height: "100%", borderRight: "2px solid rgba(255,255,255,0.7)", borderBottom: "2px solid rgba(255,255,255,0.7)" }} />
      </div>
    </div>
  );
}

function StaticCaption({ seg, style, onSelect }: { seg: Caption; style: CaptionTrackStyle; onSelect: () => void }) {
  const visible = useFadeIn();
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "absolute",
        left: `${style.x}%`,
        top: `${style.y}%`,
        width: `${style.boxW}%`,
        textAlign: style.textAlign,
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
    >
      <span style={captionTextStyle(style)}>{seg.text}</span>
    </div>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project, selectCaption } = useProjectStore();
  const style = project.captionTrackStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time < c.endTime);
  if (!cap) return null;

  const handleSelect = () => selectCaption(cap.id);

  if (style.highlightMode === "karaoke") {
    return <KaraokeOverlay key={cap.id} seg={cap} time={time} style={style} onSelect={handleSelect} />;
  }

  return <StaticCaption key={cap.id} seg={cap} style={style} onSelect={handleSelect} />;
}
