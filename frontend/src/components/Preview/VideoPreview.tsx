import { useEffect, useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl } from "../../lib/api";
import CaptionOverlay from "./CaptionOverlay";
import TextOverlayRenderer from "./TextOverlayRenderer";
import VideoTransformOverlay from "./VideoTransformOverlay";

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

export default function VideoPreview({ videoRef, toggle: _toggle }: Props) {
  const { project, files, playheadTime, isPlaying, selectedClipId, selectClip } = useProjectStore();
  // selectClip(id) — select; deselection happens when user clicks elsewhere in the app (timeline, panels)
  const outerRef = useRef<HTMLDivElement>(null);

  const videoTracks = project.tracks.filter((t) => t.type !== "audio");
  const activeTrack = videoTracks.find((t) =>
    t.clips.some((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration)
  );
  const activeClip = activeTrack?.hidden
    ? null
    : activeTrack?.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration) ?? null;
  const playbackFileId = activeClip
    ? (activeClip.eyeContact && activeClip.eyeContactFileId)
      ? activeClip.eyeContactFileId
      : activeClip.fileId
    : null;
  const activeFile = playbackFileId
    ? (files.find((f) => f.id === playbackFileId) ?? { id: playbackFileId } as import("../../types/project").UploadedFile)
    : null;
  const effectiveMuted = !!activeClip?.muted || !!activeTrack?.muted;

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
  }, [isPlaying, activeClip?.startTime, playbackFileId]);

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
  const t = activeClip?.transform;
  const videoStyle: React.CSSProperties = {
    ...(t ? { transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`, transformOrigin: "center center" } : {}),
    ...(activeClip && (activeClip.brightness !== undefined || activeClip.contrast !== undefined || activeClip.saturation !== undefined)
      ? { filter: `brightness(${activeClip.brightness ?? 1}) contrast(${activeClip.contrast ?? 1}) saturate(${activeClip.saturation ?? 1})` }
      : {}),
  };

  const showOverlay = !!activeClip && selectedClipId === activeClip.id;

  return (
    <div
      ref={outerRef}
      className={`relative ${ratioClass} max-h-full`}
      style={{ maxWidth: "min(100%, 720px)" }}
    >
      {/* Inner canvas — clips video at frame edge */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        {activeFile ? (
          <video
            ref={videoRef}
            key={playbackFileId ?? undefined}
            src={fileUrl(playbackFileId!)}
            className="w-full h-full object-cover"
            muted={effectiveMuted}
            style={videoStyle}
            onPointerDown={(e) => {
              if (activeClip) {
                e.stopPropagation();
                selectClip(activeClip.id);
              }
            }}
          />
        ) : files.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Upload media to get started
          </div>
        ) : null}
        <TextOverlayRenderer time={playheadTime} />
        <CaptionOverlay time={playheadTime} />
        {activeClip && (activeClip.fadeIn || activeClip.fadeOut) && (() => {
          const elapsed = playheadTime - activeClip.startTime;
          const remaining = activeClip.duration - elapsed;
          let opacity = 0;
          if (activeClip.fadeIn && elapsed < activeClip.fadeIn) {
            opacity = 1 - elapsed / activeClip.fadeIn;
          } else if (activeClip.fadeOut && remaining < activeClip.fadeOut) {
            opacity = 1 - remaining / activeClip.fadeOut;
          }
          return opacity > 0 ? (
            <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity }} />
          ) : null;
        })()}
      </div>

      {/* Transform handles — NOT inside overflow-hidden, so they stay visible off-canvas */}
      {showOverlay && (
        <VideoTransformOverlay clip={activeClip} outerRef={outerRef} />
      )}
    </div>
  );
}
