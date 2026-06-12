import { useProjectStore } from "../../store/useProjectStore";
import TransitionHandle from "./TransitionHandle";
import { outputToEdit } from "../../lib/speedRamp";

interface Props {
  zoom: number;
  totalWidth: number;
  height: number;
}

export default function TransitionsTrack({ zoom, totalWidth, height }: Props) {
  const clipTransitions = useProjectStore((s) => s.project.clipTransitions ?? []);
  const { addClipTransition, selectTransition } = useProjectStore();
  const project = useProjectStore((s) => s.project);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.getData("effectType") !== "dissolve") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ramps = project.hiddenEffectLanes?.speedramp ? [] : project.effectOverlays ?? [];
    const dropTime = Math.max(0, outputToEdit((e.clientX - rect.left) / zoom, ramps));

    const videoTracks = project.tracks.filter((t) => t.type !== "audio");
    let nearest: { trackId: string; atTime: number; dist: number } | null = null;

    for (const track of videoTracks) {
      const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
      for (let i = 0; i < sorted.length - 1; i++) {
        const boundary = sorted[i].startTime + sorted[i].duration;
        const dist = Math.abs(boundary - dropTime);
        if (!nearest || dist < nearest.dist) nearest = { trackId: track.id, atTime: boundary, dist };
      }
    }

    if (!nearest) {
      const firstVideoTrack = videoTracks[0];
      if (!firstVideoTrack) return;
      nearest = { trackId: firstVideoTrack.id, atTime: dropTime, dist: 0 };
    }

    const existing = clipTransitions.find(
      (t) => t.trackId === nearest!.trackId && Math.abs(t.atTime - nearest!.atTime) < 0.1
    );
    if (existing) return;

    addClipTransition({ trackId: nearest.trackId, atTime: nearest.atTime, type: "dissolve", duration: 0.5 });
  }

  return (
    <div
      role="presentation"
      className="border-b border-[var(--border)] relative bg-[var(--panel)]"
      style={{ width: totalWidth, height }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={() => selectTransition(null)}
    >
      {clipTransitions.map((t) => (
        <TransitionHandle key={t.id} transition={t} zoom={zoom} />
      ))}
    </div>
  );
}
