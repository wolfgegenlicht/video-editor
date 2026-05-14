import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { BlurRegion, BlurParams } from "../../types/project";
import { interpolateBlurAt } from "../../lib/blurKeyframes";

interface Props {
  effectId: string;
  effectStartTime: number;
  intensity: number;
  initialRegion: BlurRegion | undefined;
  outerRef: React.RefObject<HTMLDivElement | null>;
}

const DEFAULT_REGION: BlurRegion = { x: 0.15, y: 0.15, width: 0.7, height: 0.7, feather: 0.2 };

type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize",
  w:  "w-resize",                 e:  "e-resize",
  sw: "sw-resize", s: "s-resize", se: "se-resize",
};

function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

export function featherMaskStyle(feather: number): React.CSSProperties {
  if (!feather) return {};
  const pct = `${feather * 100}%`;
  const pctEnd = `${(1 - feather) * 100}%`;
  const gradH = `linear-gradient(to right, transparent 0%, black ${pct}, black ${pctEnd}, transparent 100%)`;
  const gradV = `linear-gradient(to bottom, transparent 0%, black ${pct}, black ${pctEnd}, transparent 100%)`;
  return {
    maskImage: `${gradH}, ${gradV}`,
    maskComposite: "intersect",
    WebkitMaskImage: `${gradH}, ${gradV}`,
    WebkitMaskComposite: "source-in",
  };
}

export default function BlurRegionEditor({ effectId, effectStartTime, intensity, initialRegion, outerRef }: Props) {
  useProjectStore();
  const [region, setRegion] = useState<BlurRegion>(initialRegion ?? DEFAULT_REGION);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current && initialRegion) setRegion(initialRegion);
  }, [initialRegion]);

  function containerRect() { return outerRef.current?.getBoundingClientRect() ?? null; }

  function commit(r: BlurRegion) {
    setRegion(r);
    const { project, playheadTime, addOrUpdateBlurKeyframe, updateEffectOverlayParams: updateParams } =
      useProjectStore.getState();
    const effect = project.effectOverlays.find((e) => e.id === effectId);
    if (!effect) return;
    const bp = effect.params as BlurParams;
    if (bp.keyframes?.length) {
      const relTime = Math.max(0, playheadTime - effectStartTime);
      const effective = interpolateBlurAt(bp.keyframes, relTime, bp);
      addOrUpdateBlurKeyframe(effectId, { time: relTime, intensity: effective.intensity, region: r });
    } else {
      updateParams(effectId, { region: r });
    }
  }

  // ── Move ────────────────────────────────────────────────────────────────
  function onMoveStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRect();
    if (!rect) return;
    draggingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRegion = { ...region };
    let final = { ...region };

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / rect!.width;
      const dy = (ev.clientY - startY) / rect!.height;
      final = {
        ...startRegion,
        x: clamp(startRegion.x + dx, 0, 1 - startRegion.width),
        y: clamp(startRegion.y + dy, 0, 1 - startRegion.height),
      };
      setRegion(final);
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      draggingRef.current = false;
      commit(final);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ── Resize ──────────────────────────────────────────────────────────────
  function onResizeStart(handle: Handle, e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRect();
    if (!rect) return;
    draggingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const s = { ...region };
    let final = { ...region };

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / rect!.width;
      const dy = (ev.clientY - startY) / rect!.height;
      let { x, y, width, height } = s;

      if (handle === "nw" || handle === "w" || handle === "sw") {
        const newX = clamp(x + dx, 0, x + width - 0.02);
        width = clamp(width - (newX - x), 0.02, 1);
        x = newX;
      }
      if (handle === "ne" || handle === "e" || handle === "se") {
        width = clamp(width + dx, 0.02, 1 - x);
      }
      if (handle === "nw" || handle === "n" || handle === "ne") {
        const newY = clamp(y + dy, 0, y + height - 0.02);
        height = clamp(height - (newY - y), 0.02, 1);
        y = newY;
      }
      if (handle === "sw" || handle === "s" || handle === "se") {
        height = clamp(height + dy, 0.02, 1 - y);
      }

      final = { ...s, x, y, width, height };
      setRegion(final);
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      draggingRef.current = false;
      commit(final);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  const { x, y, width, height, feather = 0 } = region;
  const pos: React.CSSProperties = {
    left:   `${x * 100}%`,
    top:    `${y * 100}%`,
    width:  `${width * 100}%`,
    height: `${height * 100}%`,
  };
  const handleClass = "absolute w-3 h-3 bg-white border border-gray-500 rounded-sm shadow pointer-events-auto";

  return (
    <>
      {/* Visual layer — backdrop-filter + feather mask (pointer-events-none so controls work) */}
      <div
        className="absolute pointer-events-none"
        style={{
          ...pos,
          backdropFilter: `blur(${intensity}px)`,
          WebkitBackdropFilter: `blur(${intensity}px)`,
          ...featherMaskStyle(feather),
        }}
      />

      {/* Controls layer — border + handles (no mask so they're always fully visible) */}
      <div className="absolute pointer-events-none" style={pos}>
        <div className="absolute inset-0 border-2 border-dashed border-white/80 rounded-sm" />
        <div
          className="absolute inset-0 pointer-events-auto cursor-move select-none"
          onPointerDown={onMoveStart}
        />
        {(Object.keys(HANDLE_CURSORS) as Handle[]).map((h) => (
          <div
            key={h}
            className={handleClass}
            style={{
              cursor: HANDLE_CURSORS[h],
              top:    h.includes("n") ? -6 : h.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)",
              left:   h.includes("w") ? -6 : h.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)",
            }}
            onPointerDown={(e) => onResizeStart(h, e)}
          />
        ))}
      </div>
    </>
  );
}
