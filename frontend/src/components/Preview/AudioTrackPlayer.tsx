import { useEffect, useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl } from "../../lib/api";

export default function AudioTrackPlayer() {
  const { project, files, playheadTime, isPlaying } = useProjectStore();
  const audioRef = useRef<HTMLAudioElement>(null);

  const audioTracks = project.tracks.filter((t) => t.type === "audio");
  const activeTrack = audioTracks.find((t) =>
    t.clips.some((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration)
  );
  const activeClip = activeTrack?.muted
    ? null
    : activeTrack?.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration) ?? null;
  const activeFile = activeClip ? files.find((f) => f.id === activeClip.fileId) : null;

  // Sync play state when entering a clip or toggling playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeClip) {
      audioRef.current?.pause();
      return;
    }
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    audio.currentTime = sourcePos;
    audio.volume = Math.min(1, activeClip.volume ?? 1);
    audio.playbackRate = speed;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeClip?.startTime, activeFile?.id]);

  // Scrubbing: keep position in sync when not playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeClip || isPlaying) return;
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    if (Math.abs(audio.currentTime - sourcePos) > 0.05) {
      audio.currentTime = sourcePos;
    }
  }, [playheadTime, activeClip, isPlaying]);

  if (!activeFile) return null;

  return (
    <audio
      ref={audioRef}
      key={activeFile.id}
      src={fileUrl(activeFile.id)}
    />
  );
}
