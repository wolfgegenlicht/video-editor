import React, { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import TimelineToolbar from "./TimelineToolbar";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TextOverlayTrack from "./TextOverlayTrack";
import CaptionTimelineTrack from "./CaptionTimelineTrack";
import EffectOverlayTrack from "./EffectOverlayTrack";
import TransitionsTrack from "./TransitionsTrack";
import { Volume2Icon, VolumeXIcon, EyeIcon, EyeOffIcon } from "../Icons";
import type { EffectType } from "../../types/project";

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
  video: "bg-teal-500",
  audio: "bg-emerald-500",
};

interface Props {
  toggle: () => void;
  seek: (time: number) => void;
}

export default function Timeline({ toggle, seek }: Props) {
  const { project, zoom, playheadTime, splitClip, setTrackMuted, setTrackHidden, setTrackLabel, setRowLabel, setEffectLaneHidden, selectMultiple, deselectAll, deleteTrack, reorderTrack, setFocusedTrackId, selectedItemIds, draggingEffectType, setDraggingEffectType, clearAllTextOverlays, clearAllCaptions, clearAllTransitions, clearEffectLane } = useProjectStore();
  const [height, setHeight] = useState(260);
  const [labelWidth, setLabelWidth] = useState(LABEL_WIDTH);
  const [snapIndicatorTime, setSnapIndicatorTime] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ rowKey: string; isRealTrack: boolean; x: number; y: number } | null>(null);
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});
  const [lastClickedRowKey, setLastClickedRowKey] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const dragTrackRef = useRef<{ key: string; startY: number; startH: number } | null>(null);
  const dragLabelRef = useRef<{ startX: number; startW: number } | null>(null);
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
      setHeight(Math.min(MAX_HEIGHT, Math.max(minHeight, dragState.current.startHeight + delta)));
    }

    function onMouseUp() {
      dragState.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
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

  const activeLanes = EFFECT_LANE_ORDER.filter((t) =>
    project.effectOverlays.some((e) => e.type === t)
  );
  const hasTransitions = (project.clipTransitions ?? []).length > 0;

  const GHOST_COLORS: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
    zoom:       { bg: "bg-violet-50",  border: "border-violet-300", dot: "bg-violet-500",  text: "text-violet-500",  label: "zoom" },
    fade:       { bg: "bg-amber-50",   border: "border-amber-300",  dot: "bg-amber-400",   text: "text-amber-500",   label: "fade" },
    blur:       { bg: "bg-sky-50",     border: "border-sky-300",    dot: "bg-sky-500",     text: "text-sky-500",     label: "blur" },
    colorgrade: { bg: "bg-rose-50",    border: "border-rose-300",   dot: "bg-rose-400",    text: "text-rose-500",    label: "color" },
    speedramp:  { bg: "bg-orange-50",  border: "border-orange-300", dot: "bg-orange-500",  text: "text-orange-500",  label: "speed" },
    dissolve:   { bg: "bg-teal-50",    border: "border-teal-300",   dot: "bg-teal-500",    text: "text-teal-500",    label: "transitions" },
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

  const trackRowKeys = [
    ...project.tracks.map((t) => t.id),
    ...(project.textOverlays.length > 0 ? ["text"] : []),
    ...(project.captions.length > 0 ? ["captions"] : []),
    ...(hasTransitions ? ["transitions"] : []),
    ...activeLanes.map((type) => `fx-${type}`),
  ];

  function getItemsInRow(key: string): string[] {
    const track = project.tracks.find((t) => t.id === key);
    if (track) {
      const clipIds = track.clips.map((c) => c.id);
      const transitionIds = (project.clipTransitions ?? [])
        .filter((t) => t.trackId === track.id)
        .map((t) => t.id);
      return [...clipIds, ...transitionIds];
    }
    if (key === "text") return project.textOverlays.map((o) => o.id);
    if (key === "captions") return project.captions.map((c) => c.id);
    if (key === "transitions") return (project.clipTransitions ?? []).map((t) => t.id);
    if (key.startsWith("fx-")) {
      const type = key.slice(3) as EffectType;
      return project.effectOverlays.filter((e) => e.type === type).map((e) => e.id);
    }
    return [];
  }

  const RULER_H = 24;
  function getTrackRowYRanges(): Array<{ key: string; top: number; bottom: number }> {
    let y = RULER_H;
    const ranges: Array<{ key: string; top: number; bottom: number }> = [];
    for (const track of project.tracks) {
      const h = trackH(track.id);
      ranges.push({ key: track.id, top: y, bottom: y + h });
      y += h;
    }
    if (project.textOverlays.length > 0) {
      const h = trackH("text");
      ranges.push({ key: "text", top: y, bottom: y + h });
      y += h;
    }
    if (project.captions.length > 0) {
      const h = trackH("captions");
      ranges.push({ key: "captions", top: y, bottom: y + h });
      y += h;
    }
    if (hasTransitions) {
      const h = trackH("transitions");
      ranges.push({ key: "transitions", top: y, bottom: y + h });
      y += h;
    }
    for (const type of activeLanes) {
      const h = trackH(`fx-${type}`);
      ranges.push({ key: `fx-${type}`, top: y, bottom: y + h });
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
    const x1 = e.clientX - rect.left + scrollLeft;
    const y1 = e.clientY - rect.top;

    let moved = false;
    let x2 = x1;
    let y2 = y1;

    function onMouseMove(ev: MouseEvent) {
      const currentScroll = scrollAreaRef.current?.scrollLeft ?? scrollLeft;
      x2 = ev.clientX - rect.left + currentScroll;
      y2 = ev.clientY - rect.top;
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

  const minHeight = CHROME_H
    + project.tracks.reduce((sum, t) => sum + trackH(t.id), 0)
    + (project.textOverlays.length > 0 ? trackH("text") : 0)
    + (project.captions.length > 0 ? trackH("captions") : 0)
    + (hasTransitions ? trackH("transitions") : 0)
    + activeLanes.reduce((sum, t) => sum + trackH(`fx-${t}`), 0);

  const totalDuration = Math.max(
    30,
    ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration))
  );
  const totalWidth = totalDuration * zoom + 200;

  function handleSplit() {
    const allClips = project.tracks.flatMap((t) => t.clips);
    const active = allClips.find(
      (c) => playheadTime > c.startTime && playheadTime < c.startTime + c.duration
    );
    if (active) splitClip(active.id, playheadTime);
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
    <div className="flex flex-col bg-white border-t border-slate-200 flex-shrink-0" style={{ height: Math.max(minHeight, height) }}>
      {/* Scrubber bar */}
      <div
        className="h-1 bg-slate-200 flex-shrink-0 relative cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width * totalDuration);
        }}
      >
        <div className="absolute left-0 top-0 h-full bg-teal-500 transition-none" style={{ width: `${scrubberPct}%` }} />
      </div>
      {/* Height resize handle */}
      <div
        className="h-1 cursor-ns-resize bg-transparent hover:bg-teal-400 transition-colors flex-shrink-0"
        onMouseDown={onDragHandleMouseDown}
      />
      <TimelineToolbar onSplit={handleSplit} toggle={toggle} seek={seek} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels */}
        <div
          className="flex-shrink-0 bg-slate-50 border-r border-slate-200 relative"
          style={{ width: labelWidth }}
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
          <div className="h-6 border-b border-slate-200" />
          {project.tracks.map((track, trackIdx) => {
            const trackSelected = track.clips.some((c) => selectedItemIds.has(c.id));
            return (
            <React.Fragment key={track.id}>
              {dragOverIndex === trackIdx && draggedTrackId !== null && (
                <div className="h-0.5 bg-blue-500 mx-2 flex-shrink-0 rounded-full" />
              )}
              <div
                draggable
                className={`relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none transition-colors
                  ${trackSelected ? "bg-blue-50 border-l-2 border-l-blue-400 hover:bg-blue-100" : "hover:bg-slate-100"}`}
                style={{ height: trackH(track.id), opacity: draggedTrackId === track.id ? 0.4 : 1 }}
                onContextMenu={(e) => openContextMenu(track.id, e)}
                onClick={(e) => onTrackLabelClick(e, track.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("trackId", track.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedTrackId(track.id);
                }}
                onDragEnd={() => { setDraggedTrackId(null); setDragOverIndex(null); }}
                onDragOver={(e) => {
                  if (!draggedTrackId) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  setDragOverIndex(e.clientY < midY ? trackIdx : trackIdx + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("trackId");
                  if (id && dragOverIndex !== null) reorderTrack(id, dragOverIndex);
                  setDraggedTrackId(null);
                  setDragOverIndex(null);
                }}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${TRACK_DOT_COLORS[track.type] ?? "bg-slate-400"}`} />
                {renamingTrackId === track.id ? (
                  <input
                    draggable={false}
                    autoFocus
                    className="flex-1 text-[10px] font-bold text-slate-700 bg-white border border-teal-400 rounded px-1 outline-none min-w-0"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 flex-1 truncate pointer-events-none">
                    {track.label ?? track.type}
                  </span>
                )}
                <button
                  draggable={false}
                  title={track.muted ? "Unmute track" : "Mute track"}
                  onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !track.muted); }}
                  className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                    ${track.muted ? "text-amber-500 hover:text-amber-700" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {track.muted ? <VolumeXIcon /> : <Volume2Icon />}
                </button>
                {track.type !== "audio" && (
                  <button
                    draggable={false}
                    title={track.hidden ? "Show track" : "Hide track"}
                    onClick={(e) => { e.stopPropagation(); setTrackHidden(track.id, !track.hidden); }}
                    className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer
                      ${track.hidden ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {track.hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
                <div
                  draggable={false}
                  className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                  onMouseDown={(e) => onTrackResizeDown(track.id, e)}
                />
              </div>
            </React.Fragment>
            );
          })}
          {dragOverIndex === project.tracks.length && draggedTrackId !== null && (
            <div className="h-0.5 bg-blue-500 mx-2 flex-shrink-0 rounded-full" />
          )}
          {project.textOverlays.length > 0 && (() => {
            const rowSelected = project.textOverlays.some((o) => selectedItemIds.has(o.id));
            return (
            <div className={`relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-pointer select-none transition-colors
              ${rowSelected ? "bg-blue-50 border-l-2 border-l-blue-400 hover:bg-blue-100" : "hover:bg-slate-100"}`}
              style={{ height: trackH("text") }}
              onClick={(e) => onTrackLabelClick(e, "text")}
              onContextMenu={(e) => openContextMenu("text", e)}>
              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              {renamingTrackId === "text" ? (
                <input
                  autoFocus
                  className="flex-1 text-[10px] font-bold text-slate-700 bg-white border border-teal-400 rounded px-1 outline-none min-w-0"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 flex-1 truncate pointer-events-none">
                  {project.rowLabels?.["text"] ?? "text"}
                </span>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("text", e)}
              />
            </div>
            );
          })()}
          {project.captions.length > 0 && (() => {
            const rowSelected = project.captions.some((c) => selectedItemIds.has(c.id));
            return (
            <div className={`relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-pointer select-none transition-colors
              ${rowSelected ? "bg-blue-50 border-l-2 border-l-blue-400 hover:bg-blue-100" : "hover:bg-slate-100"}`}
              style={{ height: trackH("captions") }}
              onClick={(e) => onTrackLabelClick(e, "captions")}
              onContextMenu={(e) => openContextMenu("captions", e)}>
              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
              {renamingTrackId === "captions" ? (
                <input
                  autoFocus
                  className="flex-1 text-[10px] font-bold text-slate-700 bg-white border border-teal-400 rounded px-1 outline-none min-w-0"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 flex-1 truncate pointer-events-none">
                  {project.rowLabels?.["captions"] ?? "captions"}
                </span>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("captions", e)}
              />
            </div>
            );
          })()}
          {hasTransitions && (() => {
            const rowSelected = (project.clipTransitions ?? []).some((t) => selectedItemIds.has(t.id));
            return (
            <div className={`relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-pointer select-none transition-colors
              ${rowSelected ? "bg-blue-50 border-l-2 border-l-blue-400 hover:bg-blue-100" : "hover:bg-slate-100"}`}
              style={{ height: trackH("transitions") }}
              onClick={(e) => onTrackLabelClick(e, "transitions")}
              onContextMenu={(e) => openContextMenu("transitions", e)}>
              <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
              {renamingTrackId === "transitions" ? (
                <input
                  autoFocus
                  className="flex-1 text-[10px] font-bold text-slate-700 bg-white border border-teal-400 rounded px-1 outline-none min-w-0"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 flex-1 truncate pointer-events-none">
                  {project.rowLabels?.["transitions"] ?? "transitions"}
                </span>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                onMouseDown={(e) => onTrackResizeDown("transitions", e)}
              />
            </div>
            );
          })()}
          {activeLanes.map((effectType) => {
            const isHidden = !!project.hiddenEffectLanes?.[effectType];
            const rowKey = `fx-${effectType}`;
            const rowSelected = project.effectOverlays.filter((e) => e.type === effectType).some((e) => selectedItemIds.has(e.id));
            return (
              <div key={effectType} className={`relative flex items-center gap-1.5 px-2 border-b border-slate-100 cursor-pointer select-none transition-colors
                ${rowSelected ? "bg-blue-50 border-l-2 border-l-blue-400 hover:bg-blue-100" : "hover:bg-slate-100"}`}
                style={{ height: trackH(rowKey) }}
                onClick={(e) => onTrackLabelClick(e, rowKey)}
                onContextMenu={(e) => openContextMenu(rowKey, e)}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${EFFECT_LANE_COLORS[effectType]} ${isHidden ? "opacity-40" : ""}`} />
                {renamingTrackId === rowKey ? (
                  <input
                    autoFocus
                    className="flex-1 text-[10px] font-bold text-slate-700 bg-white border border-teal-400 rounded px-1 outline-none min-w-0"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingTrackId(null); }}
                  />
                ) : (
                  <span className={`text-[10px] font-bold flex-1 truncate pointer-events-none ${isHidden ? "text-slate-300" : "text-slate-500"}`}>
                    {project.rowLabels?.[rowKey] ?? EFFECT_LANE_LABELS[effectType]}
                  </span>
                )}
                <button
                  title={isHidden ? "Enable effects" : "Disable effects"}
                  onClick={(e) => { e.stopPropagation(); setEffectLaneHidden(effectType, !isHidden); }}
                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer text-slate-400 hover:text-slate-600"
                >
                  {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
                <div
                  className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-teal-400 transition-colors z-10"
                  onMouseDown={(e) => onTrackResizeDown(rowKey, e)}
                />
              </div>
            );
          })}
          {draggingEffectType && GHOST_COLORS[draggingEffectType] && (() => {
            const g = GHOST_COLORS[draggingEffectType];
            return (
              <div
                className={`relative flex items-center gap-1.5 px-2 border-2 border-dashed ${g.bg} ${g.border}`}
                style={{ height: DEFAULT_TRACK_H }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleGhostDrop}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${g.dot}`} />
                <span className={`text-[10px] font-bold ${g.text}`}>+ {g.label}</span>
              </div>
            );
          })()}
          {/* Label column right-border resize handle */}
          <div
            className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-teal-400 transition-colors z-20"
            onMouseDown={onLabelResizeDown}
          />
        </div>

        {/* Scrollable timeline */}
        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onWheel={handleWheelZoom}
        >
          <div style={{ width: totalWidth, position: "relative" }} onMouseDown={onContentMouseDown}>
            <TimelineRuler totalWidth={totalWidth} zoom={zoom} seek={seek} />
            {project.tracks.map((track) => (
              <TimelineTrack key={track.id} track={track} zoom={zoom} height={trackH(track.id)} onSnapChange={setSnapIndicatorTime} />
            ))}
            {project.textOverlays.length > 0 && (
              <TextOverlayTrack zoom={zoom} totalWidth={totalWidth} height={trackH("text")} />
            )}
            {project.captions.length > 0 && (
              <CaptionTimelineTrack zoom={zoom} totalWidth={totalWidth} seek={seek} height={trackH("captions")} onSnapChange={setSnapIndicatorTime} />
            )}
            {hasTransitions && (
              <TransitionsTrack zoom={zoom} totalWidth={totalWidth} height={trackH("transitions")} />
            )}
            {activeLanes.map((effectType) => (
              <EffectOverlayTrack
                key={effectType}
                effectType={effectType}
                hidden={!!project.hiddenEffectLanes?.[effectType]}
                zoom={zoom}
                totalWidth={totalWidth}
                height={trackH(`fx-${effectType}`)}
                onSnapChange={setSnapIndicatorTime}
              />
            ))}
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
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
              style={{ left: playheadX }}
            />
            {/* Snap indicator */}
            {snapIndicatorTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-amber-400 pointer-events-none z-20 opacity-80"
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
                  className="absolute pointer-events-none z-20 border border-blue-400 bg-blue-400/10"
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
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100 transition-colors"
            onClick={() => startRename(contextMenu.rowKey)}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
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
