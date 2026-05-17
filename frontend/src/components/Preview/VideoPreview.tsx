import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl, uploadFile } from "../../lib/api";
import type { Clip, Track, EffectOverlay, ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams } from "../../types/project";
import CaptionOverlay from "./CaptionOverlay";
import TextOverlayRenderer from "./TextOverlayRenderer";
import VideoTransformOverlay from "./VideoTransformOverlay";
import BlurRegionEditor, { featherMaskStyle } from "./BlurRegionEditor";
import ZoomAnchorEditor from "./ZoomAnchorEditor";
import { interpolateBlurAt } from "../../lib/blurKeyframes";

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

const RATIO_NUMBERS: Record<string, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:3": 4 / 3,
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
  const previewOriginalClipId = useProjectStore((s) => s.previewOriginalClipId);
  const prevPlayheadTimeRef = useRef(playheadTime);

  const ok = (id?: string) => !!id && !missingFileIds.has(id);
  const playbackFileId = previewOriginalClipId === clip.id ? clip.fileId :
    (clip.blurBackground && ok(clip.blurBackgroundFileId)) ? clip.blurBackgroundFileId! :
    (clip.eyeContact && ok(clip.eyeContactFileId)) ? clip.eyeContactFileId! :
    clip.fileId;

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
    if (!video) return;

    const prevPlayhead = prevPlayheadTimeRef.current;
    prevPlayheadTimeRef.current = playheadTime;

    const isSeek = Math.abs(playheadTime - prevPlayhead) > 0.5;
    if (speedRampEffect && isPlaying && !isSeek) return;

    const speed = clip.speed ?? 1;
    const sourcePos = clip.sourceStart + (playheadTime - clip.startTime) * speed;
    const threshold = isPlaying ? 0.3 : 0.05;
    if (Math.abs(video.currentTime - sourcePos) > threshold) {
      video.currentTime = sourcePos;
    }
  }, [playheadTime, clip, isPlaying, speedRampEffect]);

  // Speed ramp: update playbackRate continuously
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!speedRampEffect) {
      video.playbackRate = clip.speed ?? 1;
      return;
    }
    const p = speedRampEffect.params as SpeedRampParams;
    const t = (playheadTime - speedRampEffect.startTime) / (speedRampEffect.endTime - speedRampEffect.startTime);
    const clamped = Math.max(0, Math.min(1, t));
    const easedT = p.easing === "ease" ? easeInOut(clamped) : clamped;
    video.playbackRate = p.startSpeed + (p.endSpeed - p.startSpeed) * easedT;
  }, [playheadTime, speedRampEffect, clip.speed]);

  const t = clip.transform;
  const videoStyle: React.CSSProperties = {
    ...(t ? { transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`, transformOrigin: "center center" } : {}),
    ...(clip.brightness !== undefined || clip.contrast !== undefined || clip.saturation !== undefined
      ? { filter: `brightness(${clip.brightness ?? 1}) contrast(${clip.contrast ?? 1}) saturate(${clip.saturation ?? 1})` }
      : {}),
  };

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

// ─── Minimap navigator ───────────────────────────────────────────────────────

interface MinimapProps {
  zoom: number;
  panOffset: { x: number; y: number };
  aspectRatio: string;
  onPanChange: (offset: { x: number; y: number }) => void;
}

function Minimap({ zoom, panOffset, aspectRatio, onPanChange }: MinimapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = RATIO_NUMBERS[aspectRatio] ?? (16 / 9);
  const mapW = ratio >= 1 ? 120 : Math.round(120 * ratio);
  const mapH = ratio >= 1 ? Math.round(120 / ratio) : 120;

  const vpW    = 1 / zoom;
  const vpH    = 1 / zoom;
  const vpLeft = 0.5 - panOffset.x / 100 - vpW / 2;
  const vpTop  = 0.5 - panOffset.y / 100 - vpH / 2;

  function moveTo(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const maxPan = ((zoom - 1) / zoom) * 50;
    onPanChange({
      x: Math.max(-maxPan, Math.min(maxPan, (0.5 - nx) * 100)),
      y: Math.max(-maxPan, Math.min(maxPan, (0.5 - ny) * 100)),
    });
  }

  return (
    <div
      ref={ref}
      className="absolute top-2 right-2 z-30 rounded overflow-hidden cursor-crosshair border border-white/30 bg-black/70"
      style={{ width: mapW, height: mapH }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => { if (e.buttons & 1) moveTo(e); }}
    >
      <div className="absolute inset-0 bg-white/5" />
      <div
        className="absolute border border-teal-400 bg-teal-400/20 pointer-events-none"
        style={{
          left:   `${Math.max(0, vpLeft) * 100}%`,
          top:    `${Math.max(0, vpTop) * 100}%`,
          width:  `${Math.min(1 - Math.max(0, vpLeft), vpW) * 100}%`,
          height: `${Math.min(1 - Math.max(0, vpTop), vpH) * 100}%`,
        }}
      />
    </div>
  );
}

// ─── Preview controls pill ───────────────────────────────────────────────────

const ZOOM_OPTIONS = [
  { label: "Fit",  value: 1   },
  { label: "1.5×", value: 1.5 },
  { label: "2×",   value: 2   },
  { label: "3×",   value: 3   },
  { label: "4×",   value: 4   },
];

interface PreviewControlsProps {
  zoom: number;
  onChange: (z: number) => void;
  onFullscreen: () => void;
}

function PreviewControls({ zoom, onChange, onFullscreen }: PreviewControlsProps) {
  return (
    <div
      data-zoom-controls
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs select-none pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <select
        value={zoom}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent text-white text-xs outline-none cursor-pointer"
      >
        {ZOOM_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-800 text-white">
            {o.label}
          </option>
        ))}
      </select>
      <div className="w-px h-4 bg-white/20" />
      <button
        onClick={onFullscreen}
        className="hover:text-white/70 transition-colors"
        title="Fullscreen (F)"
      >
        ⛶
      </button>
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
  const selectedEffectOverlayId = useProjectStore((s) => s.selectedEffectOverlayId);
  const outerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  // Pan/zoom + fullscreen state
  const [viewZoom, setViewZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setFullscreen] = useState(false);
  const [isHovered, setHovered] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Computed preview dimensions — fit the video (maintaining aspect ratio) inside the parent panel.
  // CSS can't do "object-fit: contain" on a div, so we compute it in JS.
  const [previewSize, setPreviewSize] = useState({ w: 720, h: 405 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const ratio = RATIO_NUMBERS[project.aspectRatio] ?? (16 / 9);
    const compute = () => {
      const { width: pw, height: ph } = parent.getBoundingClientRect();
      const w = Math.min(pw, ph * ratio);
      const h = w / ratio;
      const rw = Math.round(w);
      setPreviewSize({ w: rw, h: Math.round(h) });
      useProjectStore.getState().setPreviewWidth(rw);
    };
    const ro = new ResizeObserver(compute);
    ro.observe(parent);
    compute();
    return () => ro.disconnect();
  }, [project.aspectRatio]);

  // Esc closes fullscreen; F key toggles it
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setFullscreen(false);
      if (e.key === "f" && !isFullscreen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setFullscreen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

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

  // Pan handlers
  function handlePanStart(e: React.PointerEvent) {
    if (viewZoom <= 1) return;
    setDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: panOffset.x, oy: panOffset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePanMove(e: React.PointerEvent) {
    if (!isDragging || !dragStart.current) return;
    const rect = outerRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.current.px) / rect.width) * 100 / viewZoom;
    const dy = ((e.clientY - dragStart.current.py) / rect.height) * 100 / viewZoom;
    const maxPan = ((viewZoom - 1) / viewZoom) * 50;
    setPanOffset({
      x: Math.max(-maxPan, Math.min(maxPan, dragStart.current.ox + dx)),
      y: Math.max(-maxPan, Math.min(maxPan, dragStart.current.oy + dy)),
    });
  }

  function handlePanEnd() {
    setDragging(false);
    dragStart.current = null;
  }

  function handleZoomChange(z: number) {
    const next = Math.max(1, Math.min(4, z));
    setViewZoom(next);
    if (next <= 1) setPanOffset({ x: 0, y: 0 });
  }

  // ─── Computed display values ─────────────────────────────────────────────

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
  const selectedBlurEffect = effectOverlays.find(
    (e) => e.id === selectedEffectOverlayId && e.type === "blur"
  ) ?? null;
  const selectedZoomEffect = effectOverlays.find(
    (e) => e.id === selectedEffectOverlayId && e.type === "zoom"
  ) ?? null;
  const activeBlurParams: BlurParams | null = activeBlurEffect
    ? (() => {
        const raw = activeBlurEffect.params as BlurParams;
        return raw.keyframes?.length
          ? interpolateBlurAt(raw.keyframes, playheadTime - activeBlurEffect.startTime, raw)
          : raw;
      })()
    : null;
  const activeBlurRegion = activeBlurParams?.region;
  const blurPx = activeBlurEffect && !activeBlurRegion ? (activeBlurParams?.intensity ?? 0) : 0;

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

  const ax = activeEffect ? ((activeEffect.params as ZoomParams).anchorX ?? 0.5) : 0.5;
  const ay = activeEffect ? ((activeEffect.params as ZoomParams).anchorY ?? 0.5) : 0.5;
  const zoomWrapperStyle: React.CSSProperties = {
    ...(zoomScale !== 1 ? { transform: `scale(${zoomScale})`, transformOrigin: `${ax * 100}% ${ay * 100}%` } : {}),
    ...(combinedFilter ? { filter: combinedFilter } : {}),
  };

  const activeTransition = (clipTransitions ?? []).find(
    (t) => playheadTime >= t.atTime - t.duration / 2 && playheadTime <= t.atTime + t.duration / 2
  ) ?? null;
  const transitionOverlayOpacity = activeTransition ? (() => {
    const { atTime, duration } = activeTransition;
    const half = duration / 2;
    if (playheadTime <= atTime) return (playheadTime - (atTime - half)) / half;
    return 1 - (playheadTime - atTime) / half;
  })() : 0;

  const selectedActiveClip = activeVideoLayers.find((l) => l.clip.id === selectedClipId)?.clip ?? null;

  // ─── Shared inner canvas renderer ───────────────────────────────────────

  function renderInnerCanvas(allMuted: boolean) {
    return (
      <div className="absolute inset-0 bg-black overflow-hidden">
        {activeVideoLayers.length > 0 ? (
          <div className="absolute inset-0" style={zoomWrapperStyle}>
            {[...activeVideoLayers].reverse().map(({ track, clip }) => (
              <VideoLayer
                key={track.id}
                clip={clip}
                track={track}
                playheadTime={playheadTime}
                isPlaying={isPlaying}
                isPrimary={track.id === primaryLayer!.track.id}
                muted={allMuted || (track.id === primaryLayer!.track.id ? effectiveMuted : true)}
                externalRef={allMuted ? undefined : videoRef}
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
        {activeBlurRegion && activeBlurEffect?.id !== selectedEffectOverlayId && (
          <div
            className="absolute pointer-events-none"
            style={{
              left:   `${activeBlurRegion.x * 100}%`,
              top:    `${activeBlurRegion.y * 100}%`,
              width:  `${activeBlurRegion.width * 100}%`,
              height: `${activeBlurRegion.height * 100}%`,
              backdropFilter: `blur(${activeBlurParams!.intensity}px)`,
              WebkitBackdropFilter: `blur(${activeBlurParams!.intensity}px)`,
              ...featherMaskStyle(activeBlurRegion.feather ?? 0),
            }}
          />
        )}
        {fadeOverlayOpacity > 0 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOverlayOpacity }} />
        )}
        {transitionOverlayOpacity > 0 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: transitionOverlayOpacity }} />
        )}
      </div>
    );
  }

  // ─── Fullscreen modal ────────────────────────────────────────────────────

  const fullscreenModal = isFullscreen && createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onClick={() => setFullscreen(false)}
    >
      <div
        className="relative overflow-hidden"
        style={(() => {
          const r = RATIO_NUMBERS[project.aspectRatio] ?? (16 / 9);
          return { width: `min(100vw, calc(100vh * ${r}))`, height: `min(100vh, calc(100vw / ${r}))` };
        })()}
        onClick={(e) => e.stopPropagation()}
      >
        {renderInnerCanvas(true)}
      </div>
      <button
        className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl leading-none transition-colors"
        onClick={() => setFullscreen(false)}
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>,
    document.body
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={outerRef}
        className="relative overflow-hidden"
        style={{ width: previewSize.w, height: previewSize.h }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); }}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* User pan/zoom wrapper — wraps all visual content */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: viewZoom !== 1
              ? `scale(${viewZoom}) translate(${panOffset.x}%, ${panOffset.y}%)`
              : undefined,
            transformOrigin: "center center",
            cursor: viewZoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
          }}
        >
          {renderInnerCanvas(false)}

          {/* Transform/blur editors hidden while zoomed — their rect calc uses outerRef and breaks under CSS scale */}
          {viewZoom === 1 && selectedActiveClip && (
            <VideoTransformOverlay clip={selectedActiveClip} outerRef={outerRef} />
          )}
          {viewZoom === 1 && selectedBlurEffect && (() => {
            const sbp = selectedBlurEffect.params as BlurParams;
            const selectedBlurParams = sbp.keyframes?.length
              ? interpolateBlurAt(sbp.keyframes, playheadTime - selectedBlurEffect.startTime, sbp)
              : sbp;
            return (
              <BlurRegionEditor
                effectId={selectedBlurEffect.id}
                effectStartTime={selectedBlurEffect.startTime}
                intensity={selectedBlurParams.intensity}
                initialRegion={selectedBlurParams.region}
                outerRef={outerRef}
              />
            );
          })()}
          {viewZoom === 1 && selectedZoomEffect && (
            <ZoomAnchorEditor
              effectId={selectedZoomEffect.id}
              anchorX={(selectedZoomEffect.params as ZoomParams).anchorX ?? 0.5}
              anchorY={(selectedZoomEffect.params as ZoomParams).anchorY ?? 0.5}
              scale={(selectedZoomEffect.params as ZoomParams).scale}
              outerRef={outerRef}
            />
          )}
        </div>

        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded border-2 border-blue-400 bg-blue-500/20 pointer-events-none">
            <span className="text-white text-sm font-medium drop-shadow">Drop to add track</span>
          </div>
        )}

        {viewZoom > 1 && (
          <Minimap
            zoom={viewZoom}
            panOffset={panOffset}
            aspectRatio={project.aspectRatio}
            onPanChange={setPanOffset}
          />
        )}

        {(isHovered || viewZoom !== 1) && (
          <PreviewControls
            zoom={viewZoom}
            onChange={handleZoomChange}
            onFullscreen={() => setFullscreen(true)}
          />
        )}
      </div>

      {fullscreenModal}
    </>
  );
}
