import type { CSSProperties } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { FONT_FAMILY_CSS } from "../../lib/fonts";
import { effectiveRadiusPct, ACCENT_STRIPE_REF_WIDTH } from "../../lib/overlayShapes";

interface Props { time: number }

const REFERENCE_WIDTH = 1280;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function pillProgress(time: number, startTime: number, endTime: number, animateDuration: number): number {
  const totalDur = endTime - startTime;
  if (totalDur <= 0) return 1;
  const dur = Math.min(animateDuration, totalDur / 2);
  const t = Math.min((time - startTime) / dur, (endTime - time) / dur, 1);
  return easeOutCubic(Math.max(0, t));
}

export default function TextOverlayRenderer({ time }: Props) {
  const { project, previewWidth } = useProjectStore();
  const scale = previewWidth / REFERENCE_WIDTH;
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => {
        if (o.shape) {
          const progress = pillProgress(time, o.startTime, o.endTime, o.animateDuration ?? 0.4);
          const pH = (o.paddingH ?? 20) * scale;
          const pV = (o.paddingV ?? 8) * scale;
          const fontPx = o.fontSize * scale;
          // Approximate box height (matches PIL ascent+descent ≈ 1.2× font size).
          const boxH = fontPx * 1.2 + 2 * pV;
          const radiusPct = effectiveRadiusPct(o.shape, o.cornerRadius);
          const radiusPx = Math.min((radiusPct / 100) * boxH, boxH / 2);
          const chamfer = Math.min((radiusPct / 100) * boxH, boxH);
          const stripeW = ACCENT_STRIPE_REF_WIDTH * scale;
          const isAccent = o.shape === "accent";
          const style: CSSProperties = {
            left: `${o.x}%`,
            top: `${o.y}%`,
            transform: `translate(-50%, -50%) translateY(${(1 - progress) * 30 * scale}px)`,
            opacity: progress,
            fontSize: fontPx,
            lineHeight: 1.2,
            fontFamily: FONT_FAMILY_CSS[o.fontFamily ?? "sans-serif"] ?? FONT_FAMILY_CSS["sans-serif"],
            color: o.color,
            fontWeight: o.fontWeight,
            background: isAccent ? (o.accentColor ?? "#ffffff") : o.background,
            padding: `${pV}px ${pH}px`,
            whiteSpace: "nowrap",
            maxWidth: "90%",
            overflow: "hidden",
            borderRadius: o.shape === "tab" ? 0 : radiusPx,
          };
          if (o.shape === "tab") {
            style.clipPath = `polygon(0 0, calc(100% - ${chamfer}px) 0, 100% ${chamfer}px, 100% 100%, 0 100%)`;
          }
          return (
            <div key={o.id} className="absolute pointer-events-none" style={style}>
              {isAccent && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: stripeW,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    background: o.background,
                    borderRadius: radiusPx,
                  }}
                />
              )}
              <span style={{ position: "relative" }}>{o.text}</span>
            </div>
          );
        }
        return (
          <div
            key={o.id}
            className="absolute pointer-events-none"
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              fontSize: o.fontSize * scale,
              fontFamily: FONT_FAMILY_CSS[o.fontFamily ?? "sans-serif"] ?? FONT_FAMILY_CSS["sans-serif"],
              color: o.color,
              fontWeight: o.fontWeight,
              background: o.background === "transparent" ? undefined : o.background,
              padding: o.background !== "transparent" ? `${2 * scale}px ${8 * scale}px` : undefined,
              borderRadius: o.background !== "transparent" ? 4 : undefined,
              transform: "translate(-50%, -50%)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
              whiteSpace: "pre-wrap",
              maxWidth: "90%",
              textAlign: "center",
            }}
          >
            {o.text}
          </div>
        );
      })}
    </>
  );
}
