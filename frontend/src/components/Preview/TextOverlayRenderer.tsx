import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function pillProgress(time: number, startTime: number, endTime: number, animateDuration: number): number {
  const totalDur = endTime - startTime;
  if (totalDur <= 0) return 1;
  const dur = Math.min(animateDuration, totalDur / 2);
  const t = Math.min((time - startTime) / dur, (endTime - time) / dur, 1);
  return easeOutCubic(Math.max(0, t));
}

export default function TextOverlayRenderer({ time }: Props) {
  const { project } = useProjectStore();
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => {
        if (o.shape === "pill") {
          const progress = pillProgress(time, o.startTime, o.endTime, o.animateDuration ?? 0.4);
          return (
            <div
              key={o.id}
              className="absolute pointer-events-none"
              style={{
                left: `${o.x}%`,
                top: `${o.y}%`,
                transform: `translate(-50%, -50%) translateY(${(1 - progress) * 30}px)`,
                opacity: progress,
                fontSize: o.fontSize,
                color: o.color,
                fontWeight: o.fontWeight,
                background: o.background,
                padding: "8px 20px",
                borderRadius: 9999,
                whiteSpace: "nowrap",
                maxWidth: "90%",
                overflow: "hidden",
              }}
            >
              {o.text}
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
              fontSize: o.fontSize,
              color: o.color,
              fontWeight: o.fontWeight,
              background: o.background === "transparent" ? undefined : o.background,
              padding: o.background !== "transparent" ? "2px 8px" : undefined,
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
