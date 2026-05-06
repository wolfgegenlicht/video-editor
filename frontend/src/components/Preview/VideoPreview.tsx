import { useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl } from "../../lib/api";
import CaptionOverlay from "./CaptionOverlay";
import TextOverlayRenderer from "./TextOverlayRenderer";

const RATIO_CLASSES: Record<string, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
};

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  toggle: () => void;
}

export default function VideoPreview({ videoRef, toggle }: Props) {
  const { project, files, playheadTime, isPlaying } = useProjectStore();

  const videoTracks = project.tracks.filter((t) => t.type !== "audio");
  const activeTrack = videoTracks.find((t) =>
    t.clips.some((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration)
  );
  const activeClip = activeTrack?.hidden
    ? null
    : activeTrack?.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration) ?? null;
  const activeFile = activeClip ? files.find((f) => f.id === activeClip.fileId) : null;
  const effectiveMuted = !!activeClip?.muted || !!activeTrack?.muted;

  // When entering a clip or toggling playback, sync the video element's play state.
  // Uses clip identity (startTime + fileId) so this doesn't fire on every playhead tick.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) {
      videoRef.current?.pause();
      return;
    }
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    video.currentTime = sourcePos;
    video.playbackRate = speed;
    video.volume = Math.min(1, activeClip.volume ?? 1);
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeClip?.startTime, activeFile?.id]);

  // While scrubbing (not playing), keep the video frame in sync with the playhead.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip || isPlaying) return;
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    if (Math.abs(video.currentTime - sourcePos) > 0.05) {
      video.currentTime = sourcePos;
    }
  }, [playheadTime, activeClip, isPlaying]);

  const ratioClass = RATIO_CLASSES[project.aspectRatio] ?? "aspect-video";

  return (
    <div
      className={`relative bg-black ${ratioClass} max-h-full`}
      style={{ maxWidth: "min(100%, 720px)" }}
    >
      {activeFile ? (
        <video
          ref={videoRef}
          key={activeFile.id}
          src={fileUrl(activeFile.id)}
          className="w-full h-full object-contain"
          muted={effectiveMuted}
          onClick={toggle}
        />
      ) : files.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          Upload media to get started
        </div>
      ) : null}
      <TextOverlayRenderer time={playheadTime} />
      <CaptionOverlay time={playheadTime} />
      {activeClip && (activeClip.fadeIn || activeClip.fadeOut) && (() => {
        const elapsed = playheadTime - activeClip.startTime;  // timeline seconds
        const remaining = activeClip.duration - elapsed;       // timeline seconds
        let opacity = 0;
        if (activeClip.fadeIn && elapsed < activeClip.fadeIn) {
          opacity = 1 - elapsed / activeClip.fadeIn;
        } else if (activeClip.fadeOut && remaining < activeClip.fadeOut) {
          opacity = 1 - remaining / activeClip.fadeOut;
        }
        return opacity > 0 ? (
          <div
            className="absolute inset-0 bg-black pointer-events-none"
            style={{ opacity }}
          />
        ) : null;
      })()}
    </div>
  );
}
