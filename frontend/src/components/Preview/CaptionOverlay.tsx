import { useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

/**
 * Caption TEXT is rendered by libass (see LibassCaptions) so the preview matches the
 * export exactly. This component only draws the drag/resize/select affordance box at
 * the caption's [x, y, boxW, boxH] (all percentages of the preview area) while a
 * caption is active under the playhead.
 */
export default function CaptionOverlay({ time }: Props) {
  const { project, selectCaption, setCaptionPosition, setCaptionBox } = useProjectStore();
  const style = project.captionTrackStyle;
  const { x, y, boxW, boxH } = style;
  const boxRef = useRef<HTMLDivElement | null>(null);

  const cap = project.captions.find((c) => time >= c.startTime && time < c.endTime);
  if (!cap) return null;

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    selectCaption(cap!.id);
    const container = boxRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startCX = x, startCY = y;
    function onMove(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionPosition(
        Math.max(0, Math.min(100 - boxW, startCX + dx)),
        Math.max(0, Math.min(95, startCY + dy)),
      );
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const container = boxRef.current?.parentElement;
    if (!container) return;
    const startX = e.clientX, startY = e.clientY;
    const startW = boxW, startH = boxH;
    function onMove(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const dw = ((ev.clientX - startX) / rect.width) * 100;
      const dh = ((ev.clientY - startY) / rect.height) * 100;
      setCaptionBox(
        Math.max(10, Math.min(100 - x, startW + dw)),
        Math.max(3, Math.min(80, startH + dh)),
      );
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div
      role="presentation"
      ref={boxRef}
      className="absolute group select-none cursor-move"
      style={{
        left: `${x}%`, top: `${y}%`, width: `${boxW}%`, height: `${boxH}%`,
        border: "1.5px dashed rgba(255,255,255,0.25)",
      }}
      onPointerDown={onDragStart}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.6)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
    >
      {/* Corner resize handle — width + height */}
      <div
        role="presentation"
        className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize"
        style={{ width: 20, height: 20, padding: 4 }}
        onPointerDown={onResizeStart}
      >
        <div style={{ width: "100%", height: "100%", borderRight: "2px solid rgba(255,255,255,0.7)", borderBottom: "2px solid rgba(255,255,255,0.7)" }} />
      </div>
    </div>
  );
}
