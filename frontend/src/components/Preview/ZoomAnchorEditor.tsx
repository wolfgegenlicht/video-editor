import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { ZoomParams } from "../../types/project";

interface Props {
  effectId: string;
  anchorX: number;
  anchorY: number;
  scale: number;
  outerRef: React.RefObject<HTMLDivElement | null>;
}

function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

export default function ZoomAnchorEditor({ effectId, anchorX, anchorY, scale, outerRef }: Props) {
  const [localAx, setLocalAx] = useState(anchorX);
  const [localAy, setLocalAy] = useState(anchorY);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      setLocalAx(anchorX);
      setLocalAy(anchorY);
    }
  }, [anchorX, anchorY]);

  function containerRect() { return outerRef.current?.getBoundingClientRect() ?? null; }

  function commit(ax: number, ay: number) {
    useProjectStore.getState().updateEffectOverlayParams(effectId, { anchorX: ax, anchorY: ay } as Partial<ZoomParams>);
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRect();
    if (!rect) return;
    draggingRef.current = true;

    let lastAx = clamp((e.clientX - rect.left) / rect.width);
    let lastAy = clamp((e.clientY - rect.top) / rect.height);
    setLocalAx(lastAx);
    setLocalAy(lastAy);

    function onMove(ev: PointerEvent) {
      lastAx = clamp((ev.clientX - rect!.left) / rect!.width);
      lastAy = clamp((ev.clientY - rect!.top) / rect!.height);
      setLocalAx(lastAx);
      setLocalAy(lastAy);
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      draggingRef.current = false;
      commit(lastAx, lastAy);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // The crop frame: the region that fills the screen at full zoom
  const cropW = 1 / scale;
  const cropH = 1 / scale;
  const cropLeft = (1 - cropW) * localAx;
  const cropTop = (1 - cropH) * localAy;

  return (
    <>
      {/* Full-overlay interaction — click or drag anywhere to reposition anchor */}
      <div
        role="presentation"
        className="absolute inset-0 pointer-events-auto cursor-crosshair select-none"
        onPointerDown={onPointerDown}
      />

      {/* Crop frame with vignette: box-shadow dims everything outside the frame */}
      <div
        className="absolute pointer-events-none rounded-sm"
        style={{
          left: `${cropLeft * 100}%`,
          top: `${cropTop * 100}%`,
          width: `${cropW * 100}%`,
          height: `${cropH * 100}%`,
          border: "1.5px dashed rgba(255,255,255,0.75)",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)",
        }}
      />

      {/* Anchor crosshair */}
      <div
        className="absolute pointer-events-none"
        style={{ left: `${localAx * 100}%`, top: `${localAy * 100}%` }}
      >
        <div className="absolute bg-white/80" style={{ width: 28, height: 1, left: -14, top: -0.5 }} />
        <div className="absolute bg-white/80" style={{ width: 1, height: 28, left: -0.5, top: -14 }} />
        <div
          className="absolute rounded-full border-2 border-white"
          style={{ width: 10, height: 10, left: -5, top: -5, background: "rgba(139,92,246,0.55)" }}
        />
      </div>
    </>
  );
}
