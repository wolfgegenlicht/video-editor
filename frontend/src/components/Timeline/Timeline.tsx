import React, { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore, getLayerOrder } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TextOverlayTrack from "./TextOverlayTrack";
import CaptionTimelineTrack from "./CaptionTimelineTrack";
import EffectOverlayTrack from "./EffectOverlayTrack";
import TransitionsTrack from "./TransitionsTrack";
import { Volume2Icon, VolumeXIcon, EyeIcon, EyeOffIcon } from "../Icons";
import type { EffectType } from "../../types/project";
import { compiledDuration, outputToEdit } from "../../lib/speedRamp";

const EFFECT_LANE_ORDER: EffectType[] = ["zoom", "fade", "blur", "colorgrade", "speedramp"];
const EFFECT_LANE_COLORS: Record<EffectType, string> = {
  zoom: "bg-violet-500",
  fade: "bg-amber-400",
  blur: "bg-sky-500",
  colorgrade: "bg-rose-400",
  speedramp: "bg-orange-500",
};
const EFFECT_LANE_LABELS: Record<EffectType, string> = {
  zoom: "zoom",
  fade: "fade",
  blur: "blur",
  colorgrade: "color",
  speedramp: "speed",
};

const LABEL_WIDTH = 140;
const MIN_LABEL_WIDTH = 60;
const MAX_LABEL_WIDTH = 260;
const MAX_HEIGHT = 600;
const DEFAULT_TRACK_H = 40;
const MIN_TRACK_H = 28;
const MAX_TRACK_H = 160;
// scrubber (4) + resize handle (4) + toolbar (~32) + ruler (24)
const CHROME_H = 64;

const TRACK_DOT_COLORS: Record<string, string> = {
  video: "bg-[var(--accent)]",
  audio: "bg-emerald-500",
};

interface Props {
  toggle: () => void;
  seek: (time: number) => void;
}

export default function Timeline({ toggle, seek }: Props) {
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden, setTrackLabel, setRowLabel, setEffectLaneHidden, selectMultiple, deselectAll, deleteTrack, reorderLayer, setFocusedTrackId, selectedItemIds, draggingEffectType, setDraggingEffectType, clearAllTextOverlays, clearAllCaptions, clearAllTransitions, clearEffectLane } = useProjectStore();
  const [height, setHeight] = useState(220);
  const [labelWidth, setLabelWidth] = useState(LABEL_WIDTH);
  const [snapIndicatorTime, setSnapIndicatorTime] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ rowKey: string; isRealTrack: boolean; x: number; y: number } | null>(null);
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});
  const [lastClickedRowKey, setLastClickedRowKey] = useState<string | null>(null);
  const [draggedRowKey, setDraggedRowKey] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const dragTrackRef = useRef<{ key: string; startY: number; startH: number } | null>(null);
  const dragLabelRef = useRef<{ startX: number; startW: number } | null>(null);
  const labelsScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const trackH = (key: string) => trackHeights[key] ?? DEFAULT_TRACK_H;

  function onTrackResizeDown(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragTrackRef.current = { key, startY: e.clientY, startH: trackH(key) };
    function onMove(ev: MouseEvent) {
      if (!dragTrackRef.current) return;
      const newH = Math.min(MAX_TRACK_H, Math.max(MIN_TRACK_H, dragTrackRef.current.startH + ev.clientY - dragTrackRef.current.startY));
      setTrackHeights((p) => ({ ...p, [dragTrackRef.current!.key]: newH }));
    }
    function onUp() {
      dragTrackRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };

    function onMouseMove(ev: MouseEvent) {
      if (!dragState.current) return;
      const delta = dragState.current.startY - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(CHROME_H + MIN_TRACK_H, dragState.current.startHeight + delta)));
    }

    function onMouseUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onTrackAreaScroll() {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (labelsScrollRef.current && scrollAreaRef.current) {
      labelsScrollRef.current.scrollTop = scrollAreaRef.current.scrollTop;
    }
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  }

  useEffect(() => {
    if (!contextMenu) return;
    function dismiss() { setContextMenu(null); }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [contextMenu]);

  function openContextMenu(rowKey: string, e: React.MouseEvent) {
    e.preventDefault();
    const isRealTrack = project.tracks.some((t) => t.id === rowKey);
    setContextMenu({ rowKey, isRealTrack, x: e.clientX, y: e.clientY });
  }

  const SYNTHETIC_ROW_DEFAULTS: Record<string, string> = {
    text: "text",
    captions: "captions",
    transitions: "transitions",
    ...Object.fromEntries(EFFECT_LANE_ORDER.map((t) => [`fx-${t}`, EFFECT_LANE_LABELS[t]])),
  };

  function startRename(rowKey: string) {
    const track = project.tracks.find((t) => t.id === rowKey);
    const currentLabel = track
      ? (track.label ?? track.type)
      : (project.rowLabels?.[rowKey] ?? SYNTHETIC_ROW_DEFAULTS[rowKey] ?? rowKey);
    setContextMenu(null);
    setRenamingTrackId(rowKey);
    setRenameValue(currentLabel);
  }

  function commitRename() {
    if (renamingTrackId) {
      const trimmed = renameValue.trim();
      if (trimmed) {
        const isRealTrack = project.tracks.some((t) => t.id === renamingTrackId);
        if (isRealTrack) setTrackLabel(renamingTrackId, trimmed);
        else setRowLabel(renamingTrackId, trimmed);
      }
    }
    setRenamingTrackId(null);
  }

  function onLabelResizeDown(e: React.MouseEvent) {
    e.preventDefault();
    dragLabelRef.current = { startX: e.clientX, startW: labelWidth };
    function onMove(ev: MouseEvent) {
      if (!dragLabelRef.current) return;
      const newW = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, dragLabelRef.current.startW + ev.clientX - dragLabelRef.current.startX));
      setLabelWidth(newW);
    }
    function onUp() {
      dragLabelRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const hasTransitions = (project.clipTransitions ?? []).length > 0;

  const GHOST_COLORS: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
    zoom:       { bg: "bg-violet-500/10",  border: "border-violet-400/40", dot: "bg-violet-500",  text: "text-violet-400",  label: "zoom" },
    fade:       { bg: "bg-amber-500/10",   border: "border-amber-400/40",  dot: "bg-amber-400",   text: "text-amber-400",   label: "fade" },
    blur:       { bg: "bg-sky-500/10",     border: "border-sky-400/40",    dot: "bg-sky-500",     text: "text-sky-400",     label: "blur" },
    colorgrade: { bg: "bg-rose-500/10",    border: "border-rose-400/40",   dot: "bg-rose-400",    text: "text-rose-400",    label: "color" },
    speedramp:  { bg: "bg-orange-500/10",  border: "border-orange-400/40", dot: "bg-orange-500",  text: "text-orange-400",  label: "speed" },
    dissolve:   { bg: "bg-[var(--accent-soft)]",   border: "border-[var(--accent)]/40",  dot: "bg-[var(--accent)]",   text: "text-[var(--accent)]",   label: "transitions" },
  };
  const EFFECT_DURATION_GHOST: Record<string, number> = { zoom: 3, fade: 1, blur: 3, colorgrade: 3, speedramp: 2 };
  const EFFECT_PARAMS_GHOST: Record<string, object> = {
    zoom: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
    fade: { direction: "in" },
    blur: { intensity: 10 },
    colorgrade: { preset: "warm", intensity: 0.8 },
    speedramp: { startSpeed: 1, endSpeed: 0.5, easing: "ease" },
  };

  function handleGhostDrop(e: React.DragEvent) {
    e.preventDefault();
    const effectType = e.dataTransfer.getData("effectType");
    if (!effectType) return;
    setDraggingEffectType(null);
    const { addEffectOverlay, addClipTransition, project: p } = useProjectStore.getState();
    if (effectType === "dissolve") {
      const videoTracks = p.tracks.filter((t) => t.type !== "audio");
      let nearest: { trackId: string; atTime: number } | null = null;
      for (const vt of videoTracks) {
        const sorted = [...vt.clips].sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < sorted.length - 1; i++) {
          const boundary = sorted[i].startTime + sorted[i].duration;
          if (!nearest || boundary < nearest.atTime) nearest = { trackId: vt.id, atTime: boundary };
        }
      }
      if (!nearest) return;
      const exists = (p.clipTransitions ?? []).some(
        (t) => t.trackId === nearest!.trackId && Math.abs(t.atTime - nearest!.atTime) < 0.1
      );
      if (!exists) addClipTransition({ trackId: nearest.trackId, atTime: nearest.atTime, type: "dissolve", duration: 0.5 });
    } else if (effectType in EFFECT_DURATION_GHOST) {
      addEffectOverlay({ type: effectType as never, startTime: 0, endTime: EFFECT_DURATION_GHOST[effectType], params: EFFECT_PARAMS_GHOST[effectType] as never });
    }
  }

  const trackRowKeys = getLayerOrder(project);

  function getItemsInRow(key: string): string[] {
    const track = project.tracks.find((t) => t.id === key);
    if (track) {
      const clipIds = track.clips.map((c) => c.id);
      const transitionIds: string[] = [];
      for (const t of project.clipTransitions ?? []) {
        if (t.trackId === track.id) transitionIds.push(t.id);
      }
      return [...clipIds, ...transitionIds];
    }
    if (key === "text") return project.textOverlays.map((o) => o.id);
    if (key === "captions") return project.captions.map((c) => c.id);
    if (key === "transitions") return (project.clipTransitions ?? []).map((t) => t.id);
    if (key.startsWith("fx-")) {
      const type = key.slice(3) as EffectType;
      const ids: string[] = [];
      for (const e of project.effectOverlays) {
        if (e.type === type) ids.push(e.id);
      }
      return ids;
    }
    return [];
  }

  const RULER_H = 24;
  function getTrackRowYRanges(): Array<{ key: string; top: number; bottom: number }> {
    let y = RULER_H;
    const ranges: Array<{ key: string; top: number; bottom: number }> = [];
    for (const key of trackRowKeys) {
      const h = trackH(key);
      ranges.push({ key, top: y, bottom: y + h });
      y += h;
    }
    return ranges;
  }

  function onContentMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const scrollLeft = scrollEl.scrollLeft;
    const scrollTop = scrollEl.scrollTop;
    const x1 = e.clientX - rect.left + scrollLeft;
    const y1 = e.clientY - rect.top + scrollTop;

    let moved = false;
    let x2 = x1;
    let y2 = y1;

    function onMouseMove(ev: MouseEvent) {
      const currentScroll = scrollAreaRef.current?.scrollLeft ?? scrollLeft;
      const currentScrollTop = scrollAreaRef.current?.scrollTop ?? 0;
      x2 = ev.clientX - rect.left + currentScroll;
      y2 = ev.clientY - rect.top + currentScrollTop;
      if (!moved && (Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3)) moved = true;
      if (moved) setRubberBand({ x1, y1, x2, y2 });
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setRubberBand(null);
      if (!moved) { deselectAll(); return; }

      const selTimeStart = Math.min(x1, x2) / zoom;
      const selTimeEnd = Math.max(x1, x2) / zoom;
      const selYTop = Math.min(y1, y2);
      const selYBot = Math.max(y1, y2);
      const rowRanges = getTrackRowYRanges();
      const ids: string[] = [];

      for (const row of rowRanges) {
        if (row.bottom <= selYTop || row.top >= selYBot) continue;
        const track = project.tracks.find((t) => t.id === row.key);
        if (track) {
          for (const clip of track.clips) {
            if (clip.startTime < selTimeEnd && clip.startTime + clip.duration > selTimeStart) ids.push(clip.id);
          }
          for (const trans of (project.clipTransitions ?? []).filter((t) => t.trackId === track.id)) {
            const tStart = trans.atTime - trans.duration / 2;
            const tEnd = trans.atTime + trans.duration / 2;
            if (tStart < selTimeEnd && tEnd > selTimeStart) ids.push(trans.id);
          }
        } else if (row.key === "text") {
          for (const o of project.textOverlays) {
            if (o.startTime < selTimeEnd && o.endTime > selTimeStart) ids.push(o.id);
          }
        } else if (row.key === "captions") {
          for (const c of project.captions) {
            if (c.startTime < selTimeEnd && c.endTime > selTimeStart) ids.push(c.id);
          }
        } else if (row.key === "transitions") {
          for (const t of (project.clipTransitions ?? [])) {
            const tStart = t.atTime - t.duration / 2;
            const tEnd = t.atTime + t.duration / 2;
            if (tStart < selTimeEnd && tEnd > selTimeStart) ids.push(t.id);
          }
        } else if (row.key.startsWith("fx-")) {
          const type = row.key.slice(3) as EffectType;
          for (const eff of project.effectOverlays) {
            if (eff.type === type && eff.startTime < selTimeEnd && eff.endTime > selTimeStart) ids.push(eff.id);
          }
        }
      }

      selectMultiple(new Set(ids));
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onTrackLabelClick(e: React.MouseEvent, rowKey: string) {
    e.stopPropagation();
    const isRealTrack = project.tracks.some((t) => t.id === rowKey);
    if (e.shiftKey && lastClickedRowKey !== null) {
      const anchorIdx = trackRowKeys.indexOf(lastClickedRowKey);
      const clickedIdx = trackRowKeys.indexOf(rowKey);
      if (anchorIdx === -1 || clickedIdx === -1) {
        selectMultiple(new Set(getItemsInRow(rowKey)));
        setLastClickedRowKey(rowKey);
        setFocusedTrackId(isRealTrack ? rowKey : null);
        return;
      }
      const from = Math.min(anchorIdx, clickedIdx);
      const to = Math.max(anchorIdx, clickedIdx);
      const ids: string[] = [];
      for (let i = from; i <= to; i++) ids.push(...getItemsInRow(trackRowKeys[i]));
      selectMultiple(new Set(ids));
    } else if (e.metaKey || e.ctrlKey) {
      const rowIds = getItemsInRow(rowKey);
      if (rowIds.length === 0) { setLastClickedRowKey(rowKey); setFocusedTrackId(isRealTrack ? rowKey : null); return; }
      const current = new Set(useProjectStore.getState().selectedItemIds);
      const allIn = rowIds.every((id) => current.has(id));
      if (allIn) rowIds.forEach((id) => current.delete(id));
      else rowIds.forEach((id) => current.add(id));
      selectMultiple(current);
      setLastClickedRowKey(rowKey);
      setFocusedTrackId(isRealTrack ? rowKey : null);
    } else {
      selectMultiple(new Set(getItemsInRow(rowKey)));
      setLastClickedRowKey(rowKey);
      setFocusedTrackId(isRealTrack ? rowKey : null);
    }
  }

  // Timeline is rendered in OUTPUT space so speed ramps visibly compress and
  // later content ripples left. `ramps` drives every EDIT→OUTPUT conversion.
  const ramps = project.hiddenEffectLanes?.speedramp ? [] : project.effectOverlays ?? [];
  const totalDuration = Math.max(
    30,
    compiledDuration(project.tracks.flatMap((t) => t.clips), ramps)
  );
  const totalWidth = totalDuration * zoom + 200;

  function handleSplit() {
    const editPlayhead = outputToEdit(playheadTime, ramps);
    const allClips = project.tracks.flatMap((t) => t.clips);
    const active = allClips.find(
      (c) => editPlayhead > c.startTime && editPlayhead < c.startTime + c.duration
    );
    if (active) splitClip(active.id, editPlayhead);
  }

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        useProjectStore.getState().setZoom(zoom - e.deltaY * 0.5);
      }
    },
    [zoom]
  );

  const playheadX = playheadTime * zoom;
  const scrubberPct = totalDuration > 0 ? Math.min(1, playheadTime / totalDuration) * 100 : 0;

  return (
    <div className="flex flex-col bg-[var(--bed)] border-t border-[var(--border)] flex-shrink-0" style={{ height }}>
      {/* Scrubber bar */}
      <div
        role="presentation"
        className="h-1 bg-[var(--border-soft)] flex-shrink-0 relative cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width * totalDuration);
        }}
      >
        <div className="absolute left-0 top-0 h-full bg-[var(--accent)] transition-none" style={{ width: `${scrubberPct}%` }} />
      </div>
      {/* Height resize handle */}
      <div
        role="presentation"
        className="h-1 cursor-ns-resize bg-transparent hover:bg-[var(--accent-line)] transition-colors flex-shrink-0"
        onMouseDown={onDragHandleMouseDown}
      />
      <TimelineToolbar onSplit={handleSplit} toggle={toggle} seek={seek} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div
          ref={labelsScrollRef}
          className="flex-shrink-0 bg-[var(--label-bg)] border-r border-[var(--border)] relative"
          style={{ width: labelWidth, overflowY: 'hidden' }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("effecttype")) e.preventDefault(); }}
          onDrop={(e) => {
            const effectType = e.dataTransfer.getData("effectType");
            if (!effectType) return;
            e.preventDefault();
            const { addEffectOverlay, addClipTransition, project } = useProjectStore.getState();
            if (effectType === "dissolve") {
              const videoTracks = project.tracks.filter((t) => t.type !== "audio");
              let nearest: { trackId: string; atTime: number; dist: number } | null = null;
              for (const vt of videoTracks) {
                const sorted = [...vt.clips].sort((a, b) => a.startTime - b.startTime);
                for (let i = 0; i < sorted.length - 1; i++) {
                  const boundary = sorted[i].startTime + sorted[i].duration;
                  if (!nearest || boundary < nearest.atTime) nearest = { trackId: vt.id, atTime: boundary, dist: 0 };
                }
              }
              if (!nearest) return;
              const existing = (project.clipTransitions ?? []).find(
                (t) => t.trackId === nearest!.trackId && Math.abs(t.atTime - nearest!.atTime) < 0.1
              );
              if (!existing) addClipTransition({ trackId: nearest.trackId, atTime: nearest.atTime, type: "dissolve", duration: 0.5 });
            } else {
              const DURATION: Record<string, number> = { zoom: 3, fade: 1, blur: 3, colorgrade: 3, speedramp: 2 };
              const PARAMS: Record<string, object> = {
                zoom: { scale: 1.5, rampIn: 0.3, rampOut: 0.3 },
                fade: { direction: "in" },
                blur: { intensity: 10 },
                colorgrade: { preset: "warm", intensity: 0.8 },
                speedramp: { startSpeed: 1, endSpeed: 0.5, easing: "ease" },
              };
              if (effectType in DURATION) {
                addEffectOverlay({ type: effectType as never, startTime: 0, endTime: DURATION[effectType], params: PARAMS[effectType] as never });
              }
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIndex(null);
          }}
        >
          <div className="h-6 border-b border-[var(--border)]" />
          {trackRowKeys.map((key, rowIdx) => {
            const isTrack = project.tracks.some((t) => t.id === key);
            const track = isTrack ? project.tracks.find((t) => t.id === key)! : null;
            const effectType = key.startsWith("fx-") ? (key.slice(3) as EffectType) : null;
            const isHidden = effectType ? !!project.hiddenEffectLanes?.[effectType] : false;

            let dotColor = "bg-[var(--txt2)]";
            let rowLabel = key;
            let rowSelected = false;
            if (track) {
              dotColor = TRACK_DOT_COLORS[track.type] ?? "bg-[var(--txt2)]";
              rowLabel = track.label ?? track.type;
              rowSelected = track.clips.some((c) => selectedItemIds.has(c.id));
            } else if (key === "text") {
              dotColor = "bg-amber-400";
              rowLabel = project.rowLabels?.["text"] ?? "text";
              rowSelected = project.textOverlays.some((o) => selectedItemIds.has(o.id));
            } else if (key === "captions") {
              dotColor = "bg-violet-500";
              rowLabel = project.rowLabels?.["captions"] ?? "captions";
              rowSelected = project.captions.some((c) => selectedItemIds.has(c.id));
            } else if (key === "transitions") {
              dotColor = "bg-[var(--accent)]";
              rowLabel = project.rowLabels?.["transitions"] ?? "transitions";
              rowSelected = (project.clipTransitions ?? []).some((t) => selectedItemIds.has(t.id));
            } else if (effectType) {
              dotColor = `${EFFECT_LANE_COLORS[effectType]}`;
              rowLabel = project.rowLabels?.[key] ?? EFFECT_LANE_LABELS[effectType];
              rowSelected = project.effectOverlays.filter((e) => e.type === effectType).some((e) => selectedItemIds.has(e.id));
            }

            return (
              <React.Fragment key={key}>
                {dragOverIndex === rowIdx && draggedRowKey !== null && (
                  <div className="h-0.5 bg-[var(--accent)] mx-2 flex-shrink-0 rounded-full" />
                )}
                <div
                  draggable
                  role="button"
                  tabIndex={0}
                  className={`relative flex items-center gap-1.5 px-2 border-b border-[var(--border)] cursor-grab active:cursor-grabbing select-none transition-colors
                    ${rowSelected ? "bg-[var(--accent-soft)] border-l-2 border-l-[var(--accent)] hover:bg-[oklch(70% 0.16 55 / 0.18)]" : "hover:bg-[var(--hover)]"}`}
                  style={{ height: trackH(key), opacity: draggedRowKey === key ? 0.4 : 1 }}
                  onContextMenu={(e) => openContextMenu(key, e)}
                  onClick={(e) => onTrackLabelClick(e, key)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); selectMultiple(new Set(getItemsInRow(key))); setLastClickedRowKey(key); setFocusedTrackId(track ? key : null); } }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("rowKey", key);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedRowKey(key);
                  }}
                  onDragEnd={() => { setDraggedRowKey(null); setDragOverIndex(null); }}
                  onDragOver={(e) => {
                    if (!draggedRowKey) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    setDragOverIndex(e.clientY < midY ? rowIdx : rowIdx + 1);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("rowKey");
                    if (id && dragOverIndex !== null) reorderLayer(id, dragOverIndex);
                    setDraggedRowKey(null);
                    setDragOverIndex(null);
                  }}
                >
                  <div className={`size-2 rounded-full flex-shrink-0 ${dotColor}${isHidden ? " opacity-40" : ""}`} />
                  {renamingTrackId === key ? (
                    <input
                      draggable={false}
                      autoFocus
                      className="flex-1 text-[11px] font-bold text-[var(--txt1)] bg-[var(--label-bg)] border border-[var(--accent)]/60 rounded px-1 outline-none min-w-0"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                    />
                  ) : (
                    <span className={`text-[11px] font-bold flex-1 truncate pointer-events-none ${isHidden ? "text-[var(--txt2)] opacity-50" : "text-[var(--txt2)]"}`}>
                      {rowLabel}
                    </span>
                  )}
                  {track && (
                    <>
                      <button
                        type="button"
                        draggable={false}
                        title={track.muted ? "Unmute track" : "Mute track"}
                        onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !track.muted); }}
                        className={`flex-shrink-0 size-5 rounded flex items-center justify-center transition-colors cursor-pointer
                          ${track.muted ? "text-amber-400 hover:text-amber-300" : "text-[var(--txt2)] hover:text-[var(--txt1)]"}`}
                      >
                        {track.muted ? <VolumeXIcon /> : <Volume2Icon />}
                      </button>
                      {track.type !== "audio" && (
                        <button
                          type="button"
                          draggable={false}
                          title={track.hidden ? "Show track" : "Hide track"}
                          onClick={(e) => { e.stopPropagation(); setTrackHidden(track.id, !track.hidden); }}
                          className="flex-shrink-0 size-5 rounded flex items-center justify-center transition-colors cursor-pointer text-[var(--txt2)] hover:text-[var(--txt1)]"
                        >
                          {track.hidden ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      )}
                    </>
                  )}
                  {effectType && (
                    <button
                      type="button"
                      draggable={false}
                      title={isHidden ? "Enable effects" : "Disable effects"}
                      onClick={(e) => { e.stopPropagation(); setEffectLaneHidden(effectType, !isHidden); }}
                      className="flex-shrink-0 size-5 rounded flex items-center justify-center transition-colors cursor-pointer text-[var(--txt2)] hover:text-[var(--txt1)]"
                    >
                      {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  )}
                  <div
                    role="presentation"
                    draggable={false}
                    className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-[var(--accent-line)] transition-colors z-10"
                    onMouseDown={(e) => onTrackResizeDown(key, e)}
                  />
                </div>
              </React.Fragment>
            );
          })}
          {dragOverIndex === trackRowKeys.length && draggedRowKey !== null && (
            <div className="h-0.5 bg-[var(--accent)] mx-2 flex-shrink-0 rounded-full" />
          )}
          {draggingEffectType && GHOST_COLORS[draggingEffectType] && (() => {
            const g = GHOST_COLORS[draggingEffectType];
            return (
              <div
                className={`relative flex items-center gap-1.5 px-2 border-2 border-dashed ${g.bg} ${g.border}`}
                style={{ height: DEFAULT_TRACK_H }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleGhostDrop}
              >
                <div className={`size-2 rounded-full flex-shrink-0 ${g.dot}`} />
                <span className={`text-[11px] font-bold ${g.text}`}>+ {g.label}</span>
              </div>
            );
          })()}
          {/* Label column right-border resize handle */}
          <div
            role="presentation"
            className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--accent-line)] transition-colors z-20"
            onMouseDown={onLabelResizeDown}
          />
        </div>

        {/* Scrollable timeline */}
        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          onWheel={handleWheelZoom}
          onScroll={onTrackAreaScroll}
        >
          <div role="presentation" style={{ width: totalWidth, position: "relative" }} onMouseDown={onContentMouseDown}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} seek={seek} />
            {trackRowKeys.map((key) => {
              const track = project.tracks.find((t) => t.id === key);
              if (track) return <TimelineTrack key={key} track={track} zoom={zoom} height={trackH(key)} onSnapChange={setSnapIndicatorTime} />;
              if (key === "text" && project.textOverlays.length > 0) return <TextOverlayTrack key="text" zoom={zoom} totalWidth={totalWidth} height={trackH("text")} onSnapChange={setSnapIndicatorTime} />;
              if (key === "captions" && project.captions.length > 0) return <CaptionTimelineTrack key="captions" zoom={zoom} totalWidth={totalWidth} seek={seek} height={trackH("captions")} onSnapChange={setSnapIndicatorTime} />;
              if (key === "transitions" && hasTransitions) return <TransitionsTrack key="transitions" zoom={zoom} totalWidth={totalWidth} height={trackH("transitions")} />;
              if (key.startsWith("fx-")) {
                const effectType = key.slice(3) as EffectType;
                return <EffectOverlayTrack key={effectType} effectType={effectType} hidden={!!project.hiddenEffectLanes?.[effectType]} zoom={zoom} totalWidth={totalWidth} height={trackH(key)} onSnapChange={setSnapIndicatorTime} />;
              }
              return null;
            })}
            {draggingEffectType && GHOST_COLORS[draggingEffectType] && (() => {
              const g = GHOST_COLORS[draggingEffectType];
              return (
                <div
                  className={`border-2 border-dashed flex items-center justify-center ${g.bg} ${g.border}`}
                  style={{ width: totalWidth, height: DEFAULT_TRACK_H }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleGhostDrop}
                >
                  <span className={`text-[11px] font-semibold ${g.text} pointer-events-none`}>
                    Drop here to add {g.label} from the start
                  </span>
                </div>
              );
            })()}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-[1.5px] bg-[var(--playhead)] pointer-events-none z-10
                         before:content-[''] before:absolute before:top-[-1px] before:left-1/2
                         before:-translate-x-1/2 before:rotate-45 before:size-[9px]
                         before:bg-[var(--playhead)] before:shadow-[0_0_8px_var(--playhead)]"
              style={{ left: playheadX }}
            />
            {/* Snap indicator */}
            {snapIndicatorTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-[var(--accent)] pointer-events-none z-20 opacity-60"
                style={{ left: snapIndicatorTime * zoom }}
              />
            )}
            {rubberBand && (() => {
              const left = Math.min(rubberBand.x1, rubberBand.x2);
              const top = Math.min(rubberBand.y1, rubberBand.y2);
              const width = Math.abs(rubberBand.x2 - rubberBand.x1);
              const bandHeight = Math.abs(rubberBand.y2 - rubberBand.y1);
              return (
                <div
                  className="absolute pointer-events-none z-20 border border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                  style={{ left, top, width, height: bandHeight }}
                />
              );
            })()}
          </div>
        </div>
      </div>
      {/* Track context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-[0_8px_30px_oklch(0%_0_0_/_0.5)] py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--txt1)] hover:bg-[var(--panel-2)] transition-colors"
            onClick={() => startRename(contextMenu.rowKey)}
          >
            Rename
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
            onClick={() => {
              const { rowKey, isRealTrack } = contextMenu;
              if (isRealTrack) {
                deleteTrack(rowKey);
              } else if (rowKey === "text") {
                clearAllTextOverlays();
              } else if (rowKey === "captions") {
                clearAllCaptions();
              } else if (rowKey === "transitions") {
                clearAllTransitions();
              } else if (rowKey.startsWith("fx-")) {
                clearEffectLane(rowKey.slice(3) as EffectType);
              }
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
