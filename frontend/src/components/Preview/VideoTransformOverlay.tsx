import { useProjectStore } from "../../store/useProjectStore";
import type { Clip } from "../../types/project";

interface Props {
  clip: Clip;
  outerRef: React.RefObject<HTMLDivElement | null>;
}

export default function VideoTransformOverlay({ clip, outerRef }: Props) {
  const { setClipTransform, setClipTransformLive } = useProjectStore();
  const t = clip.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };

  const cssTransform = `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`;

  // ── Move ────────────────────────────────────────────────────────────────
  function onMoveStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTX = t.x;
    const startTY = t.y;
    let finalX = startTX;
    let finalY = startTY;

    function onMove(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / rect!.width) * 100;
      const dy = ((ev.clientY - startY) / rect!.height) * 100;
      finalX = startTX + dx;
      finalY = startTY + dy;
      setClipTransformLive(clip.id, { x: finalX, y: finalY });
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setClipTransform(clip.id, { x: finalX, y: finalY });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ── Scale ───────────────────────────────────────────────────────────────
  function onScaleStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (startDist < 1) return;
    const startScale = t.scale;
    let finalScale = startScale;

    function onMove(ev: PointerEvent) {
      const newDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      finalScale = startScale * (newDist / startDist);
      setClipTransformLive(clip.id, { scale: finalScale });
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setClipTransform(clip.id, { scale: finalScale });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ── Rotate ──────────────────────────────────────────────────────────────
  function onRotateStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRotation = t.rotation;
    let finalRotation = startRotation;

    function onMove(ev: PointerEvent) {
      const newAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      const delta = ((newAngle - startAngle) * 180) / Math.PI;
      finalRotation = startRotation + delta;
      setClipTransformLive(clip.id, { rotation: finalRotation });
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setClipTransform(clip.id, { rotation: finalRotation });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  const cornerClass = "absolute w-2.5 h-2.5 bg-teal-400 rounded-sm shadow-sm";

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ transform: cssTransform, transformOrigin: "center center" }}
    >
      {/* Dashed bounding box */}
      <div className="absolute inset-0 border-2 border-dashed border-teal-400 rounded-sm" />

      {/* Body drag area — move (rendered BEFORE handles so handles sit on top in DOM order) */}
      <div
        className="absolute inset-0 pointer-events-auto cursor-move select-none"
        onPointerDown={onMoveStart}
      />

      {/* Rotation handle — above top-center (rendered after body so it's on top) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto cursor-grab flex flex-col items-center"
        style={{ top: -28 }}
        onPointerDown={onRotateStart}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-sm" />
        <div className="w-px h-4 bg-violet-400 opacity-60" />
      </div>

      {/* Corner handles — scale (rendered last so they are on top of the body drag area) */}
      <div className={`${cornerClass} -top-1.5 -left-1.5 cursor-nw-resize pointer-events-auto`} onPointerDown={onScaleStart} />
      <div className={`${cornerClass} -top-1.5 -right-1.5 cursor-ne-resize pointer-events-auto`} onPointerDown={onScaleStart} />
      <div className={`${cornerClass} -bottom-1.5 -left-1.5 cursor-sw-resize pointer-events-auto`} onPointerDown={onScaleStart} />
      <div className={`${cornerClass} -bottom-1.5 -right-1.5 cursor-se-resize pointer-events-auto`} onPointerDown={onScaleStart} />
    </div>
  );
}
