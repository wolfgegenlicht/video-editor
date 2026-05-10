import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl, uploadFile } from "../../lib/api";
import type { Clip, Track, EffectOverlay, ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams } from "../../types/project";
import CaptionOverlay from "./CaptionOverlay";
import TextOverlayRenderer from "./TextOverlayRenderer";
import VideoTransformOverlay from "./VideoTransformOverlay";

function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 2 * c * c : -1 + (4 - 2 * c) * c;
}

function computeZoomScale(effect: EffectOverlay, playheadTime: number): number {
  const { startTime, endTime, params } = effect;
  const { scale, rampIn, rampOut } = params as ZoomParams;
  const duration = endTime - startTime;
  const progress = playheadTime - startTime;
  if (rampIn > 0 && progress < rampIn) {
    return 1 + (scale - 1) * easeInOut(progress / rampIn);
  }
  if (rampOut > 0 && progress > duration - rampOut) {
    return 1 + (scale - 1) * easeInOut((endTime - playheadTime) / rampOut);
  }
  return scale;
}

function computeColorGradeFilter(preset: string, intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity));
  switch (preset) {
    case "warm":
      return `sepia(${(0.3 * i).toFixed(2)}) saturate(${(1 + 0.4 * i).toFixed(2)}) hue-rotate(${(-10 * i).toFixed(1)}deg) brightness(${(1 + 0.05 * i).toFixed(2)})`;
    case "cool":
      return `saturate(${(1 - 0.1 * i).toFixed(2)}) hue-rotate(${(20 * i).toFixed(1)}deg) brightness(${(1 + 0.05 * i).toFixed(2)})`;
    case "bw":
      return `grayscale(${i.toFixed(2)})`;
    case "vintage":
      return `sepia(${(0.45 * i).toFixed(2)}) saturate(${(1 - 0.15 * i).toFixed(2)}) contrast(${(1 + 0.1 * i).toFixed(2)}) brightness(${(1 - 0.08 * i).toFixed(2)})`;
    default:
      return "";
  }
}

const RATIO_CLASSES: Record<string, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
};

// ─── Per-layer video element ────────────────────────────────────────────────

interface VideoLayerProps {
  clip: Clip;
  track: Track;
  playheadTime: number;
  isPlaying: boolean;
  isPrimary: boolean;
  muted: boolean;
  externalRef?: React.RefObject<HTMLVideoElement | null>;
  speedRampEffect: EffectOverlay | null;
  onSelect: () => void;
}

function VideoLayer({ clip, playheadTime, isPlaying, isPrimary, muted, externalRef, speedRampEffect, onSelect }: VideoLayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = isPrimary && externalRef ? externalRef : internalRef;
  const missingFileIds = useProjectStore((s) => s.missingFileIds);

  const playbackFileId = clip.eyeContact && clip.eyeContactFileId ? clip.eyeContactFileId : clip.fileId;

  // Play/pause + initial seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const speed = clip.speed ?? 1;
    const sourcePos = clip.sourceStart + (playheadTime - clip.startTime) * speed;
    video.currentTime = sourcePos;
    if (!speedRampEffect) video.playbackRate = speed;
    video.volume = Math.min(1, clip.volume ?? 1);
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, clip.startTime, playbackFileId]);

  // Scrub sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isPlaying) return;
    const speed = clip.speed ?? 1;
    const sourcePos = clip.sourceStart + (playheadTime - clip.startTime) * speed;
    if (Math.abs(video.currentTime - sourcePos) > 0.05) {
      video.currentTime = sourcePos;
    }
  }, [playheadTime, clip, isPlaying]);

  // Speed ramp: update playbackRate continuously
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !speedRampEffect) return;
    const p = speedRampEffect.params as SpeedRampParams;
    const t = (playheadTime - speedRampEffect.startTime) / (speedRampEffect.endTime - speedRampEffect.startTime);
    const clamped = Math.max(0, Math.min(1, t));
    const easedT = p.easing === "ease" ? easeInOut(clamped) : clamped;
    video.playbackRate = p.startSpeed + (p.endSpeed - p.startSpeed) * easedT;
  }, [playheadTime, speedRampEffect]);

  const t = clip.transform;
  const videoStyle: React.CSSProperties = {
    ...(t ? { transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`, transformOrigin: "center center" } : {}),
    ...(clip.brightness !== undefined || clip.contrast !== undefined || clip.saturation !== undefined
      ? { filter: `brightness(${clip.brightness ?? 1}) contrast(${clip.contrast ?? 1}) saturate(${clip.saturation ?? 1})` }
      : {}),
  };

  // Per-clip fade in/out
  const elapsed = playheadTime - clip.startTime;
  const remaining = clip.duration - elapsed;
  let fadeOpacity = 0;
  if (clip.fadeIn && elapsed < clip.fadeIn) {
    fadeOpacity = 1 - elapsed / clip.fadeIn;
  } else if (clip.fadeOut && remaining < clip.fadeOut) {
    fadeOpacity = 1 - remaining / clip.fadeOut;
  }

  if (missingFileIds.has(playbackFileId)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-neutral-400 text-sm select-none" onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}>
        File not found — re-upload to restore
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        key={playbackFileId}
        src={fileUrl(playbackFileId)}
        className="w-full h-full object-cover"
        muted={muted}
        style={videoStyle}
        onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
      />
      {fadeOpacity > 0 && (
        <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOpacity }} />
      )}
    </div>
  );
}

// ─── Main preview ────────────────────────────────────────────────────────────

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export default function VideoPreview({ videoRef }: Props) {
  const { project, files, playheadTime, isPlaying, selectedClipId, selectClip } = useProjectStore();
  const effectOverlays = useProjectStore((s) => s.project.effectOverlays);
  const clipTransitions = useProjectStore((s) => s.project.clipTransitions);
  const hiddenEffectLanes = useProjectStore((s) => s.project.hiddenEffectLanes);
  const outerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    const accepted = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("audio/")
    );
    if (!accepted.length) return;

    const { addFile, addTrackWithClip, setRightPanelTab, activeProjectId } = useProjectStore.getState();
    for (const file of accepted) {
      try {
        const uploaded = await uploadFile(file, activeProjectId ?? undefined);
        addFile(uploaded);
        addTrackWithClip("video", {
          fileId: uploaded.id,
          startTime: 0,
          duration: uploaded.duration,
          sourceStart: 0,
          sourceEnd: uploaded.duration,
        });
      } catch (err) {
        console.error("Failed to upload dropped file:", err);
      }
    }
    setRightPanelTab("media");
  };

  // All video tracks with an active clip at the current playhead, in track order (index 0 = front)
  const videoTracks = project.tracks.filter((t) => t.type !== "audio");
  const activeVideoLayers = videoTracks
    .map((track) => ({
      track,
      clip: track.hidden
        ? null
        : track.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration) ?? null,
    }))
    .filter((l): l is { track: Track; clip: Clip } => l.clip !== null);

  const primaryLayer = activeVideoLayers[0] ?? null;
  const effectiveMuted = !!primaryLayer?.clip.muted || !!primaryLayer?.track.muted;

  // Composite-level effects (apply to all layers together)
  const activeEffect = !hiddenEffectLanes?.zoom
    ? effectOverlays.find((e) => e.type === "zoom" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const zoomScale = activeEffect ? computeZoomScale(activeEffect, playheadTime) : 1;

  const activeFadeEffect = !hiddenEffectLanes?.fade
    ? effectOverlays.find((e) => e.type === "fade" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const fadeOverlayOpacity = activeFadeEffect ? (() => {
    const { direction } = activeFadeEffect.params as FadeParams;
    const progress = (playheadTime - activeFadeEffect.startTime) / (activeFadeEffect.endTime - activeFadeEffect.startTime);
    return direction === "in" ? 1 - progress : progress;
  })() : 0;

  const activeBlurEffect = !hiddenEffectLanes?.blur
    ? effectOverlays.find((e) => e.type === "blur" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const blurPx = activeBlurEffect ? (activeBlurEffect.params as BlurParams).intensity : 0;

  const activeColorGrade = !hiddenEffectLanes?.colorgrade
    ? effectOverlays.find((e) => e.type === "colorgrade" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;
  const colorGradeFilter = activeColorGrade
    ? computeColorGradeFilter((activeColorGrade.params as ColorGradeParams).preset, (activeColorGrade.params as ColorGradeParams).intensity)
    : "";

  const combinedFilter = [blurPx > 0 ? `blur(${blurPx}px)` : "", colorGradeFilter].filter(Boolean).join(" ");

  const activeSpeedRamp = !hiddenEffectLanes?.speedramp
    ? effectOverlays.find((e) => e.type === "speedramp" && playheadTime >= e.startTime && playheadTime < e.endTime) ?? null
    : null;

  const zoomWrapperStyle: React.CSSProperties = {
    ...(zoomScale !== 1 ? { transform: `scale(${zoomScale})`, transformOrigin: "center center" } : {}),
    ...(combinedFilter ? { filter: combinedFilter } : {}),
  };

  // Cross dissolve transition
  const activeTransition = (clipTransitions ?? []).find(
    (t) => playheadTime >= t.atTime - t.duration / 2 && playheadTime <= t.atTime + t.duration / 2
  ) ?? null;
  const transitionOverlayOpacity = activeTransition ? (() => {
    const { atTime, duration } = activeTransition;
    const half = duration / 2;
    if (playheadTime <= atTime) return (playheadTime - (atTime - half)) / half;
    return 1 - (playheadTime - atTime) / half;
  })() : 0;

  const ratioClass = RATIO_CLASSES[project.aspectRatio] ?? "aspect-video";
  const selectedActiveClip = activeVideoLayers.find((l) => l.clip.id === selectedClipId)?.clip ?? null;

  return (
    <div
      ref={outerRef}
      className={`relative ${ratioClass} w-full max-h-full`}
      style={{ maxWidth: "min(100%, 720px)" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Inner canvas — clips video at frame edge */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        {activeVideoLayers.length > 0 ? (
          // Composite-level effects wrapper
          <div className="absolute inset-0" style={zoomWrapperStyle}>
            {/* Render in reverse so tracks[0] (top of timeline) is last in DOM = on top */}
            {[...activeVideoLayers].reverse().map(({ track, clip }) => (
              <VideoLayer
                key={track.id}
                clip={clip}
                track={track}
                playheadTime={playheadTime}
                isPlaying={isPlaying}
                isPrimary={track.id === primaryLayer!.track.id}
                muted={track.id === primaryLayer!.track.id ? effectiveMuted : true}
                externalRef={videoRef}
                speedRampEffect={activeSpeedRamp}
                onSelect={() => selectClip(clip.id)}
              />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Upload media to get started
          </div>
        ) : null}
        <TextOverlayRenderer time={playheadTime} />
        <CaptionOverlay time={playheadTime} />
        {fadeOverlayOpacity > 0 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOverlayOpacity }} />
        )}
        {transitionOverlayOpacity > 0 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: transitionOverlayOpacity }} />
        )}
      </div>

      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded border-2 border-blue-400 bg-blue-500/20 pointer-events-none">
          <span className="text-white text-sm font-medium drop-shadow">Drop to add track</span>
        </div>
      )}

      {/* Transform handles — NOT inside overflow-hidden, so they stay visible off-canvas */}
      {selectedActiveClip && (
        <VideoTransformOverlay clip={selectedActiveClip} outerRef={outerRef} />
      )}
    </div>
  );
}
