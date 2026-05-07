import type { Track } from "../../types/project";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineClip from "./TimelineClip";

interface Props { track: Track; zoom: number; height: number }

export default function TimelineTrack({ track, zoom, height }: Props) {
  const { moveClip, addClip, selectClip, files } = useProjectStore();

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("clipId");
    const fileId = e.dataTransfer.getData("fileId");
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dropTime = Math.max(0, x / zoom);

    if (clipId) {
      moveClip(clipId, track.id, dropTime);
    } else if (fileId) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        addClip(track.id, {
          fileId,
          startTime: dropTime,
          duration: file.duration,
          sourceStart: 0,
          sourceEnd: file.duration,
        });
      }
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
        <TimelineClip key={clip.id} clip={clip} trackId={track.id} trackType={track.type} zoom={zoom} trackHeight={height} />
      ))}
    </div>
  );
}
