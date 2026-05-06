import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

export default function TextOverlayRenderer({ time }: Props) {
  const { project } = useProjectStore();
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => (
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
      ))}
    </>
  );
}
