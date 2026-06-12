import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProjectStore, getLayerOrder } from "../../store/useProjectStore";
import { fileUrl, uploadFile } from "../../lib/api";
import type { Clip, Track, EffectOverlay, ZoomParams, FadeParams, BlurParams, ColorGradeParams, ReframeTrackPoint } from "../../types/project";
import CaptionOverlay from "./CaptionOverlay";
import LibassCaptions from "./LibassCaptions";
import TextOverlayRenderer from "./TextOverlayRenderer";
import VideoTransformOverlay from "./VideoTransformOverlay";
import BlurRegionEditor, { featherMaskStyle } from "./BlurRegionEditor";
import ZoomAnchorEditor from "./ZoomAnchorEditor";
import { interpolateBlurAt } from "../../lib/blurKeyframes";
import { easeInOut, outputToEdit, instantaneousSpeed, activeSpeedRampAtEdit } from "../../lib/speedRamp";

function interpolateX(points: ReframeTrackPoint[], t: number): number {
  if (points.length === 0) return 0.5;
  if (t <= points[0].t) return points[0].x;
  if (t >= points[points.length - 1].t) return points[points.length - 1].x;
  const i = points.findIndex((p) => p.t > t) - 1;
  const a = points[i], b = points[i + 1];
  return a.x + (b.x - a.x) * (t - a.t) / (b.t - a.t);
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
  editTime: number;            // playhead mapped to EDIT space (source/ramp math live here)
  ramps: EffectOverlay[];
  isPlaying: boolean;
  isPrimary: boolean;
  muted: boolean;
  externalRef?: React.RefObject<HTMLVideoElement | null>;
  speedRampEffect: EffectOverlay | null;
  onSelect: () => void;
  reframeLeft?: number;
  reframeVideoWidth?: number;
  onNativeSizeChange?: (w: number, h: number) => void;
}

function VideoLayer({ clip, editTime, ramps, isPlaying, isPrimary, muted, externalRef, speedRampEffect, onSelect, reframeLeft, reframeVideoWidth, onNativeSizeChange }: VideoLayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = isPrimary && externalRef ? externalRef : internalRef;
  const missingFileIds = useProjectStore((s) => s.missingFileIds);
  const previewOriginalClipId = useProjectStore((s) => s.previewOriginalClipId);
  const prevPlayheadTimeRef = useRef(editTime);

  const ok = (id?: string) => !!id && !missingFileIds.has(id);
  const playbackFileId = previewOriginalClipId === clip.id ? clip.fileId :
    (clip.blurBackground && ok(clip.blurBackgroundFileId)) ? clip.blurBackgroundFileId! :
    clip.fileId;

  // Play/pause + initial seek. Source position is linear in EDIT time; the ramp
  // only changes the playback RATE, so seek uses editTime and rate uses the
  // instantaneous ramp speed (set even mid-ramp to avoid a stale rate).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const speed = clip.speed ?? 1;
    const sourcePos = clip.sourceStart + (editTime - clip.startTime) * speed;
    video.currentTime = sourcePos;
    video.playbackRate = speed * instantaneousSpeed(editTime, ramps);
    video.volume = Math.min(1, clip.volume ?? 1);
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, clip.startTime, playbackFileId]);

  // Scrub sync (EDIT space). During smooth ramp playback the video element
  // advances its own currentTime via playbackRate (which integrates to the
  // correct source position), so we skip re-seeking unless the user jumps.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const prevEdit = prevPlayheadTimeRef.current;
    prevPlayheadTimeRef.current = editTime;

    const isSeek = Math.abs(editTime - prevEdit) > 0.5;
    if (speedRampEffect && isPlaying && !isSeek) return;

    const speed = clip.speed ?? 1;
    const sourcePos = clip.sourceStart + (editTime - clip.startTime) * speed;
    const threshold = isPlaying ? 0.3 : 0.05;
    if (Math.abs(video.currentTime - sourcePos) > threshold) {
      video.currentTime = sourcePos;
    }
  }, [editTime, clip, isPlaying, speedRampEffect]);

  // Speed ramp: drive playbackRate from the instantaneous ramp speed (× base).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = (clip.speed ?? 1) * instantaneousSpeed(editTime, ramps);
  }, [editTime, ramps, speedRampEffect, clip.speed]);

  const t = clip.transform;
  const videoStyle: React.CSSProperties = {
    ...(t ? { transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${t.rotation}deg)`, transformOrigin: "center center" } : {}),
    ...(clip.brightness !== undefined || clip.contrast !== undefined || clip.saturation !== undefined
      ? { filter: `brightness(${clip.brightness ?? 1}) contrast(${clip.contrast ?? 1}) saturate(${clip.saturation ?? 1})` }
      : {}),
  };

  const elapsed = editTime - clip.startTime;
  const remaining = clip.duration - elapsed;
  let fadeOpacity = 0;
  if (clip.fadeIn && elapsed < clip.fadeIn) {
    fadeOpacity = 1 - elapsed / clip.fadeIn;
  } else if (clip.fadeOut && remaining < clip.fadeOut) {
    fadeOpacity = 1 - remaining / clip.fadeOut;
  }

  if (missingFileIds.has(playbackFileId)) {
    return (
      <div role="presentation" className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-neutral-400 text-sm select-none" onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}>
        File not found: re-upload to restore
      </div>
    );
  }

  return (
    <div className={`absolute inset-0${reframeLeft !== undefined ? " overflow-hidden" : ""}`}>
      <video
        ref={videoRef}
        key={playbackFileId}
        src={fileUrl(playbackFileId)}
        className={reframeLeft !== undefined ? "" : "w-full h-full object-cover"}
        muted={muted}
        style={reframeLeft !== undefined
          ? {
              position: "absolute",
              height: "100%",
              width: reframeVideoWidth !== undefined ? `${reframeVideoWidth}px` : "auto",
              maxWidth: "none",
              left: reframeLeft,
              top: 0,
              ...videoStyle,
            }
          : videoStyle
        }
        onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
        onLoadedMetadata={(e) => { onNativeSizeChange?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight); }}
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
      role="presentation"
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
      role="presentation"
      data-zoom-controls
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs select-none pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <select
        aria-label="Preview zoom"
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
        type="button"
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
  const [videoNativeSize, setVideoNativeSize] = useState<{ w: number; h: number } | null>(null);

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

  // Playhead is OUTPUT time; clips/effects are stored in EDIT time. Map once and
  // use editTime for every clip/effect lookup and relative-time computation.
  const ramps = hiddenEffectLanes?.speedramp ? [] : effectOverlays;
  const editTime = outputToEdit(playheadTime, ramps);

  const videoTracks = project.tracks.filter((t) => t.type !== "audio");
  const activeVideoLayers = videoTracks
    .map((track) => ({
      track,
      clip: track.hidden
        ? null
        : track.clips.find((c) => editTime >= c.startTime && editTime < c.startTime + c.duration) ?? null,
    }))
    .filter((l): l is { track: Track; clip: Clip } => l.clip !== null);

  const primaryLayer = activeVideoLayers[0] ?? null;
  const effectiveMuted = !!primaryLayer?.clip.muted || !!primaryLayer?.track.muted;

  // Compute reframe translation if the primary clip has tracking data
  const primaryClip = primaryLayer?.clip ?? null;
  const isReframeActive = !!(primaryClip?.reframe && primaryClip?.reframeData);
  // Use UploadedFile dimensions (available immediately) with videoNativeSize as runtime fallback
  const primarySrcFile = primaryClip ? files.find((f) => f.id === primaryClip.fileId) ?? null : null;
  const reframeNativeW = primarySrcFile?.width ?? videoNativeSize?.w ?? 0;
  const reframeNativeH = primarySrcFile?.height ?? videoNativeSize?.h ?? 0;
  const reframeNativeSize = reframeNativeW > 0 && reframeNativeH > 0 ? { w: reframeNativeW, h: reframeNativeH } : null;

  let reframeLeft: number = 0;
  let reframeVideoWidth: number | undefined;
  if (isReframeActive && primaryClip && primaryClip.reframeData && reframeNativeSize) {
    const sourceT = editTime - primaryClip.startTime + primaryClip.sourceStart;
    const x_norm = interpolateX(primaryClip.reframeData.trackPoints, sourceT);
    const container = outerRef.current;
    if (container) {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const videoDisplayWidth = containerHeight * (reframeNativeW / reframeNativeH);
      reframeVideoWidth = videoDisplayWidth;
      const translateX = containerWidth / 2 - x_norm * videoDisplayWidth;
      reframeLeft = Math.max(containerWidth - videoDisplayWidth, Math.min(0, translateX));
    }
  }

  const activeEffect = !hiddenEffectLanes?.zoom
    ? effectOverlays.find((e) => e.type === "zoom" && editTime >= e.startTime && editTime < e.endTime) ?? null
    : null;
  const zoomScale = activeEffect ? computeZoomScale(activeEffect, editTime) : 1;

  const activeFadeEffect = !hiddenEffectLanes?.fade
    ? effectOverlays.find((e) => e.type === "fade" && editTime >= e.startTime && editTime < e.endTime) ?? null
    : null;
  const fadeOverlayOpacity = activeFadeEffect ? (() => {
    const { direction } = activeFadeEffect.params as FadeParams;
    const progress = (editTime - activeFadeEffect.startTime) / (activeFadeEffect.endTime - activeFadeEffect.startTime);
    return direction === "in" ? 1 - progress : progress;
  })() : 0;

  const activeBlurEffect = !hiddenEffectLanes?.blur
    ? effectOverlays.find((e) => e.type === "blur" && editTime >= e.startTime && editTime < e.endTime) ?? null
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
          ? interpolateBlurAt(raw.keyframes, editTime - activeBlurEffect.startTime, raw)
          : raw;
      })()
    : null;
  const activeBlurRegion = activeBlurParams?.region;
  const blurPx = activeBlurEffect && !activeBlurRegion ? (activeBlurParams?.intensity ?? 0) : 0;

  const activeColorGrade = !hiddenEffectLanes?.colorgrade
    ? effectOverlays.find((e) => e.type === "colorgrade" && editTime >= e.startTime && editTime < e.endTime) ?? null
    : null;
  const colorGradeFilter = activeColorGrade
    ? computeColorGradeFilter((activeColorGrade.params as ColorGradeParams).preset, (activeColorGrade.params as ColorGradeParams).intensity)
    : "";

  const activeSpeedRamp = activeSpeedRampAtEdit(editTime, ramps);

  const ax = activeEffect ? ((activeEffect.params as ZoomParams).anchorX ?? 0.5) : 0.5;
  const ay = activeEffect ? ((activeEffect.params as ZoomParams).anchorY ?? 0.5) : 0.5;
  // Zoom stays a global geometric transform on the whole composite — not a layered element
  const zoomWrapperStyle: React.CSSProperties = zoomScale !== 1
    ? { transform: `scale(${zoomScale})`, transformOrigin: `${ax * 100}% ${ay * 100}%` }
    : {};

  const activeTransition = (clipTransitions ?? []).find(
    (t) => editTime >= t.atTime - t.duration / 2 && editTime <= t.atTime + t.duration / 2
  ) ?? null;
  const transitionOverlayOpacity = activeTransition ? (() => {
    const { atTime, duration } = activeTransition;
    const half = duration / 2;
    if (editTime <= atTime) return (editTime - (atTime - half)) / half;
    return 1 - (editTime - atTime) / half;
  })() : 0;

  const selectedActiveClip = activeVideoLayers.find((l) => l.clip.id === selectedClipId)?.clip ?? null;

  // ─── Shared inner canvas renderer ───────────────────────────────────────
  // Layer order: top = front (rendered last/on top), bottom = back (rendered first).
  // We iterate layerOrder REVERSED so we paint back→front = DOM order = CSS z-order.
  // Each row's element uses backdrop-filter (blur, colorgrade) or opacity (fade,
  // transition) so it only affects what's already painted behind it.

  function renderInnerCanvas(allMuted: boolean) {
    const layerOrder = getLayerOrder(project);
    // Track rows are the base. We need to know which track IDs exist so we can
    // render the video-layers block once, anchored to where tracks appear in the order.
    const trackIds = new Set(project.tracks.map((t) => t.id));
    let tracksRendered = false;

    const layerElements = [...layerOrder].reverse().map((key) => {
      // ── Video tracks (base) ──────────────────────────────────────────
      if (trackIds.has(key)) {
        if (tracksRendered) return null; // render once even if multiple track rows
        tracksRendered = true;
        if (activeVideoLayers.length === 0) {
          return files.length === 0 ? (
            <div key="__empty" className="absolute inset-0 w-full h-full flex items-center justify-center text-[var(--txt2)] text-sm">
              Upload media to get started
            </div>
          ) : null;
        }
        return (
          <div key="__tracks" className="absolute inset-0">
            {[...activeVideoLayers].reverse().map(({ track, clip }) => {
              const isPrimary = track.id === primaryLayer!.track.id;
              return (
                <VideoLayer
                  key={track.id}
                  clip={clip}
                  track={track}
                  editTime={editTime}
                  ramps={ramps}
                  isPlaying={isPlaying}
                  isPrimary={isPrimary}
                  muted={allMuted || (isPrimary ? effectiveMuted : true)}
                  externalRef={allMuted ? undefined : videoRef}
                  speedRampEffect={activeSpeedRamp}
                  onSelect={() => selectClip(clip.id)}
                  reframeLeft={isPrimary && isReframeActive ? reframeLeft : undefined}
                  reframeVideoWidth={isPrimary && isReframeActive ? reframeVideoWidth : undefined}
                  onNativeSizeChange={isPrimary ? (w, h) => setVideoNativeSize({ w, h }) : undefined}
                />
              );
            })}
          </div>
        );
      }

      // ── Text overlays ─────────────────────────────────────────────────
      if (key === "text") return <TextOverlayRenderer key="text" time={editTime} />;

      // ── Captions ──────────────────────────────────────────────────────
      if (key === "captions") return <LibassCaptions key="captions" time={editTime} />;

      // ── Transitions (dissolve dip-to-black) ───────────────────────────
      if (key === "transitions") {
        return transitionOverlayOpacity > 0 ? (
          <div key="transitions" className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: transitionOverlayOpacity }} />
        ) : null;
      }

      // ── Effect lanes ──────────────────────────────────────────────────
      if (key === "fx-fade") {
        return fadeOverlayOpacity > 0 ? (
          <div key="fx-fade" className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOverlayOpacity }} />
        ) : null;
      }

      if (key === "fx-blur") {
        if (!activeBlurEffect || activeBlurEffect.id === selectedEffectOverlayId) return null;
        if (activeBlurRegion) {
          // Regional blur
          return (
            <div
              key="fx-blur"
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
          );
        }
        // Full-frame blur via backdrop-filter (only affects what's painted behind)
        if (blurPx > 0) {
          return (
            <div
              key="fx-blur"
              className="absolute inset-0 pointer-events-none"
              style={{ backdropFilter: `blur(${blurPx}px)`, WebkitBackdropFilter: `blur(${blurPx}px)` }}
            />
          );
        }
        return null;
      }

      if (key === "fx-colorgrade") {
        return colorGradeFilter ? (
          <div
            key="fx-colorgrade"
            className="absolute inset-0 pointer-events-none"
            style={{ backdropFilter: colorGradeFilter, WebkitBackdropFilter: colorGradeFilter }}
          />
        ) : null;
      }

      // fx-zoom and fx-speedramp have no visual layer element (zoom is the wrapper transform)
      return null;
    });

    return (
      <div className="absolute inset-0 bg-black overflow-hidden">
        <div className="absolute inset-0" style={zoomWrapperStyle}>
          {layerElements}
        </div>
        {/* Always-on-top UI affordances — outside the z-stack */}
        <CaptionOverlay time={editTime} />
      </div>
    );
  }

  // ─── Fullscreen modal ────────────────────────────────────────────────────

  const fullscreenModal = isFullscreen && createPortal(
    <div
      role="presentation"
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
        type="button"
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
        role="presentation"
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
              ? interpolateBlurAt(sbp.keyframes, editTime - selectedBlurEffect.startTime, sbp)
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
