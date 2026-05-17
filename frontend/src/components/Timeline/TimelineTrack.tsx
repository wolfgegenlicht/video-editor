import type { EffectType, Track } from "../../types/project";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineClip from "./TimelineClip";

interface Props { track: Track; zoom: number; height: number; onSnapChange?: (time: number | null) => void }

const EFFECT_DURATION: Record<EffectType, number> = {
  zoom: 3, fade: 1, blur: 3, colorgrade: 3, speedramp: 2,
};
const EFFECT_DEFAULT_PARAMS: Record<EffectType, object> = {
  zoom: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
  fade: { direction: "in" },
  blur: { intensity: 10 },
  colorgrade: { preset: "warm", intensity: 0.8 },
  speedramp: { startSpeed: 1, endSpeed: 0.5, easing: "ease" },
};

export default function TimelineTrack({ track, zoom, height, onSnapChange }: Props) {
  const { moveClip, addClip, addTrackWithClip, selectClip, files, addEffectOverlay, addClipTransition } = useProjectStore();

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("clipId");
    const fileId = e.dataTransfer.getData("fileId");
    const effectType = e.dataTransfer.getData("effectType");
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dropTime = Math.max(0, x / zoom);

    if (clipId) {
      moveClip(clipId, track.id, dropTime);
    } else if (fileId) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        const newClip = {
          fileId,
          startTime: dropTime,
          duration: file.duration,
          sourceStart: 0,
          sourceEnd: file.duration,
        };
        const occupied = track.type === "video" && track.clips.some(
          (c) => dropTime < c.startTime + c.duration && dropTime + file.duration > c.startTime
        );
        if (occupied) {
          const { project } = useProjectStore.getState();
          const videoCount = project.tracks.filter((t) => t.type === "video").length;
          addTrackWithClip("video", newClip, `Video ${videoCount + 1}`);
        } else {
          addClip(track.id, newClip);
        }
      }
    } else if (effectType === "dissolve") {
      const { project } = useProjectStore.getState();
      const videoTracks = project.tracks.filter((t) => t.type !== "audio");
      let nearest: { trackId: string; atTime: number; dist: number } | null = null;
      for (const vt of videoTracks) {
        const sorted = [...vt.clips].sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < sorted.length - 1; i++) {
          const boundary = sorted[i].startTime + sorted[i].duration;
          const dist = Math.abs(boundary - dropTime);
          if (!nearest || dist < nearest.dist) nearest = { trackId: vt.id, atTime: boundary, dist };
        }
      }
      if (!nearest) return;
      const existing = (project.clipTransitions ?? []).find(
        (t) => t.trackId === nearest!.trackId && Math.abs(t.atTime - nearest!.atTime) < 0.1
      );
      if (existing) return;
      addClipTransition({ trackId: nearest.trackId, atTime: nearest.atTime, type: "dissolve", duration: 0.5 });
    } else if (effectType && effectType in EFFECT_DURATION) {
      const type = effectType as EffectType;
      addEffectOverlay({
        type,
        startTime: dropTime,
        endTime: dropTime + EFFECT_DURATION[type],
        params: EFFECT_DEFAULT_PARAMS[type] as never,
      });
    }
  }

  return (
    <div
      className="border-b border-slate-100 relative bg-white hover:bg-slate-50"
      style={{ height }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={() => selectClip(null)}
    >
      {track.clips.map((clip) => (
        <TimelineClip key={clip.id} clip={clip} trackId={track.id} trackType={track.type} zoom={zoom} trackHeight={height} onSnapChange={onSnapChange} />
      ))}
    </div>
  );
}
