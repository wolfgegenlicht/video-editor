import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Project, Track, Clip, Caption, AspectRatio, CaptionTrackStyle, TrackType, UploadedFile, TextOverlay, ClipTransform, EffectOverlay, ZoomParams, FadeParams, BlurParams, ColorGradeParams, SpeedRampParams, ClipTransition, EffectType, AudioEnhanceType } from "../types/project";
import { saveProject, deleteEyeContactFile } from "../lib/api";
import type { ProjectData } from "../lib/api";

const STORAGE_KEY = "video-editor-project";
const MAX_HISTORY = 50;

export function makeDefaultCaptionStyle(): CaptionTrackStyle {
  return {
    fontFamily: "sans-serif",
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: 0,
    textAlign: "center",
    textShadow: true,
    outlineWidth: 0,
    outlineColor: "#000000",
    backgroundColor: "transparent",
    x: 10,
    y: 78,
    boxW: 80,
    boxH: 18,
    highlightColor: "#fde047",
  };
}

function makeDefaultProject(): Project {
  return {
    id: uuid(),
    name: "Untitled Project",
    aspectRatio: "16:9",
    captionTrackStyle: makeDefaultCaptionStyle(),
    tracks: [{ id: uuid(), type: "video", clips: [] }],
    captions: [],
    textOverlays: [],
    effectOverlays: [],
    clipTransitions: [],
    hiddenEffectLanes: {},
  };
}

interface ProjectStore {
  project: Project;
  files: UploadedFile[];
  missingFileIds: Set<string>;
  history: Project[];
  future: Project[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;
  previewWidth: number;
  setPreviewWidth: (w: number) => void;
  draggingEffectType: string | null;
  setDraggingEffectType: (type: string | null) => void;
  activeProjectId: string | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  selectedCaptionId: string | null;
  rightPanelTab: "properties" | "media" | "effects" | null;
  selectedEffectOverlayId: string | null;
  transcriptSelection: { startTime: number; endTime: number } | null;
  eyeContactStatus: Record<string, "processing" | "done" | "error">;
  audioEnhanceStatus: Record<string, "processing" | "done" | "error">;
  saveStatus: "saved" | "saving";
  selectedItemIds: Set<string>;
  focusedTrackId: string | null;
  setFocusedTrackId: (id: string | null) => void;
  toggleItemSelection: (id: string) => void;
  setSelectedItemIds: (ids: Set<string>) => void;
  selectMultiple: (ids: Set<string>) => void;
  moveSelectedItemsLive: (moves: Array<{ id: string; newStartTime: number }>) => void;
  moveSelectedItems: (moves: Array<{ id: string; newStartTime: number }>) => void;

  setProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setCaptionTrackStyle: (patch: Partial<CaptionTrackStyle>) => void;
  setCaptionPosition: (x: number, y: number) => void;
  setCaptionBox: (w: number, h: number) => void;

  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;

  addTrack: (type?: TrackType) => void;
  addTrackWithClip: (type: TrackType, clip: Omit<Clip, "id">) => void;
  detachAudio: (clipId: string) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  setTrackLabel: (trackId: string, label: string) => void;
  setRowLabel: (rowKey: string, label: string) => void;
  clearAllTextOverlays: () => void;
  clearAllCaptions: () => void;
  clearAllTransitions: () => void;
  clearEffectLane: (type: EffectType) => void;
  addClip: (trackId: string, clip: Omit<Clip, "id">) => void;
  moveClip: (clipId: string, toTrackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, newStartTime: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  trimClipLive: (clipId: string, newStartTime: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;
  deleteTrack: (trackId: string) => void;
  duplicateTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, toIndex: number) => void;

  setClipSpeed: (clipId: string, speed: number) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  setClipFade: (clipId: string, fadeIn: number, fadeOut: number) => void;
  setClipAdjustment: (clipId: string, key: "brightness" | "contrast" | "saturation", value: number) => void;
  setClipTransform: (clipId: string, transform: Partial<ClipTransform>) => void;
  setClipTransformLive: (clipId: string, transform: Partial<ClipTransform>) => void;
  setClipEyeContact: (clipId: string, enabled: boolean) => void;
  setClipEyeContactFileId: (clipId: string, fileId: string | null) => void;
  setEyeContactStatus: (clipId: string, status: "processing" | "done" | "error" | undefined) => void;
  setClipPan: (clipId: string, pan: number) => void;
  setClipAudioEnhance: (clipId: string, type: AudioEnhanceType, enabled: boolean, fileId?: string | null) => void;
  setAudioEnhanceStatus: (clipId: string, status: "processing" | "done" | "error" | undefined) => void;
  addTextOverlay: (overlay: Omit<TextOverlay, "id">) => void;
  updateTextOverlay: (id: string, patch: Partial<Omit<TextOverlay, "id">>) => void;
  deleteTextOverlay: (id: string) => void;
  selectOverlay: (id: string | null) => void;
  addEffectOverlay: (overlay: Omit<EffectOverlay, "id">) => void;
  addEffectOverlayWithId: (overlay: EffectOverlay) => void;
  moveEffectOverlay: (id: string, newStartTime: number) => void;
  moveEffectOverlayLive: (id: string, newStartTime: number) => void;
  resizeEffectOverlay: (id: string, newStartTime: number, newEndTime: number) => void;
  resizeEffectOverlayLive: (id: string, newStartTime: number, newEndTime: number) => void;
  deleteEffectOverlay: (id: string) => void;
  updateEffectOverlayParams: (id: string, params: Partial<ZoomParams> | Partial<FadeParams> | Partial<BlurParams> | Partial<ColorGradeParams> | Partial<SpeedRampParams>) => void;
  selectEffectOverlay: (id: string | null) => void;

  selectedTransitionId: string | null;
  addClipTransition: (t: Omit<ClipTransition, "id">) => void;
  removeClipTransition: (id: string) => void;
  updateClipTransition: (id: string, patch: Partial<Pick<ClipTransition, "duration">>) => void;
  selectTransition: (id: string | null) => void;

  setEffectLaneHidden: (type: EffectType, hidden: boolean) => void;

  setCaption: (captions: Caption[], sourceFileId?: string) => void;
  deleteCaption: (id: string) => void;
  trimCaptionLive: (id: string, newStartTime: number, newEndTime: number) => void;
  trimCaption: (id: string, newStartTime: number, newEndTime: number) => void;

  setPlayhead: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  selectClip: (id: string | null) => void;
  selectCaption: (id: string | null) => void;
  deselectAll: () => void;
  setRightPanelTab: (tab: "properties" | "media" | "effects" | null) => void;
  setTranscriptSelection: (sel: { startTime: number; endTime: number } | null) => void;
  deleteTimeRange: (startTime: number, endTime: number) => void;
  cutWord: (captionId: string, wordIndex: number) => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;

  undo: () => void;
  redo: () => void;
}

function findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function getItemStartTime(project: Project, id: string): number {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === id);
    if (clip) return clip.startTime;
  }
  const effect = project.effectOverlays.find((e) => e.id === id);
  if (effect) return effect.startTime;
  const overlay = project.textOverlays.find((o) => o.id === id);
  if (overlay) return overlay.startTime;
  const caption = project.captions.find((c) => c.id === id);
  if (caption) return caption.startTime;
  const transition = (project.clipTransitions ?? []).find((t) => t.id === id);
  if (transition) return transition.atTime;
  return 0;
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _storeSet: ((fn: (s: ProjectStore) => Partial<ProjectStore>) => void) | null = null;

function _scheduleSave(projectId: string, project: Project) {
  _storeSet?.((s) => ({ ...s, saveStatus: "saving" as const }));
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveProject(projectId, project)
      .then(() => _storeSet?.((s) => ({ ...s, saveStatus: "saved" as const })))
      .catch(console.error);
  }, 500);
}

function withHistory(set: any, _get: any, updater: (p: Project) => Project) {
  let activeProjectId: string | null = null;
  let newProject: Project | null = null;
  set((state: ProjectStore) => {
    const newHistory = [...state.history.slice(-MAX_HISTORY + 1), state.project];
    newProject = updater(state.project);
    activeProjectId = state.activeProjectId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProject));
    return { project: newProject, history: newHistory, future: [] };
  });
  if (activeProjectId && newProject) _scheduleSave(activeProjectId, newProject);
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  _storeSet = set as any;
  return ({
  project: makeDefaultProject(),
  files: [],
  missingFileIds: new Set(),
  history: [],
  future: [],
  playheadTime: 0,
  isPlaying: false,
  zoom: 50,
  previewWidth: 720,
  draggingEffectType: null,
  activeProjectId: null,
  selectedClipId: null,
  selectedOverlayId: null,
  selectedCaptionId: null,
  selectedEffectOverlayId: null,
  selectedTransitionId: null,
  rightPanelTab: null,
  transcriptSelection: null,
  eyeContactStatus: {},
  audioEnhanceStatus: {},
  saveStatus: "saved" as const,
  selectedItemIds: new Set<string>(),
  focusedTrackId: null,

  setProjectName: (name) => withHistory(set, get, (p) => ({ ...p, name })),
  setAspectRatio: (aspectRatio) => withHistory(set, get, (p) => ({ ...p, aspectRatio })),
  setCaptionTrackStyle: (patch) => withHistory(set, get, (p) => ({
    ...p,
    captionTrackStyle: { ...p.captionTrackStyle, ...patch },
  })),
  setCaptionPosition: (x, y) => {
    set((s) => ({ project: { ...s.project, captionTrackStyle: { ...s.project.captionTrackStyle, x, y } } }));
    const { project, activeProjectId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    if (activeProjectId) _scheduleSave(activeProjectId, project);
  },
  setCaptionBox: (boxW, boxH) => {
    set((s) => ({ project: { ...s.project, captionTrackStyle: { ...s.project.captionTrackStyle, boxW, boxH } } }));
    const { project, activeProjectId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    if (activeProjectId) _scheduleSave(activeProjectId, project);
  },

  addFile: (file) => set((s) => ({ files: [...s.files, file] })),
  removeFile: (fileId) => {
    const { files, project } = get();
    const isVideoFile = files.find((f) => f.id === fileId)?.width ?? 0 > 0;
    set((s) => ({ files: s.files.filter((f) => f.id !== fileId) }));
    // Clear captions when the source file is removed — check explicit link or
    // fall back to: any video file removed while captions exist clears them.
    const hasCaptions = project.captions.length > 0;
    const isLinked = project.captionSourceFileId === fileId;
    const isUnlinkedVideo = !project.captionSourceFileId && isVideoFile;
    if (hasCaptions && (isLinked || isUnlinkedVideo)) {
      withHistory(set, get, (p) => ({ ...p, captions: [], captionSourceFileId: undefined }));
    }
  },

  addTrack: (type = "video" as TrackType) => withHistory(set, get, (p) => ({
    ...p,
    tracks: [...p.tracks, { id: uuid(), type, clips: [] }],
  })),

  addTrackWithClip: (type, clip) => withHistory(set, get, (p) => {
    const trackId = uuid();
    return {
      ...p,
      tracks: [...p.tracks, { id: trackId, type, clips: [{ ...clip, id: uuid() }] }],
    };
  }),

  detachAudio: (clipId) => withHistory(set, get, (p) => {
    let targetClip: Clip | null = null;
    for (const track of p.tracks) {
      const c = track.clips.find((c) => c.id === clipId);
      if (c) { targetClip = c; break; }
    }
    if (!targetClip) return p;

    const audioClip: Clip = {
      id: uuid(),
      fileId: targetClip.fileId,
      startTime: targetClip.startTime,
      duration: targetClip.duration,
      sourceStart: targetClip.sourceStart,
      sourceEnd: targetClip.sourceEnd,
    };

    const tracksWithMuted = p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, muted: true } : c),
    }));

    const existingAudioTrack = tracksWithMuted.find((t) => t.type === "audio");
    if (existingAudioTrack) {
      return {
        ...p,
        tracks: tracksWithMuted.map((t) =>
          t.id === existingAudioTrack.id ? { ...t, clips: [...t.clips, audioClip] } : t
        ),
      };
    }
    return {
      ...p,
      tracks: [...tracksWithMuted, { id: uuid(), type: "audio" as const, clips: [audioClip] }],
    };
  }),

  addClip: (trackId, clip) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, { ...clip, id: uuid() }] } : t
    ),
  })),

  moveClip: (clipId, toTrackId, newStartTime) => withHistory(set, get, (p) => {
    const found = findClip(p, clipId);
    if (!found) return p;
    const { track: fromTrack, clip } = found;
    const movedClip = { ...clip, startTime: Math.max(0, newStartTime) };
    return {
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id === fromTrack.id && t.id !== toTrackId) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === toTrackId && t.id !== fromTrack.id) {
          return { ...t, clips: [...t.clips, movedClip] };
        }
        if (t.id === fromTrack.id && t.id === toTrackId) {
          return { ...t, clips: t.clips.map((c) => (c.id === clipId ? movedClip : c)) };
        }
        return t;
      }),
    };
  }),

  trimClip: (clipId, newStartTime, newDuration, newSourceStart, newSourceEnd) =>
    withHistory(set, get, (p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId
            ? { ...c, startTime: newStartTime, duration: newDuration, sourceStart: newSourceStart, sourceEnd: newSourceEnd }
            : c
        ),
      })),
    })),

  trimClipLive: (clipId, newStartTime, newDuration, newSourceStart, newSourceEnd) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? { ...c, startTime: newStartTime, duration: newDuration, sourceStart: newSourceStart, sourceEnd: newSourceEnd }
              : c
          ),
        })),
      },
    })),

  splitClip: (clipId, atTime) => withHistory(set, get, (p) => {
    const found = findClip(p, clipId);
    if (!found) return p;
    const { track, clip } = found;
    const splitOffset = atTime - clip.startTime;
    if (splitOffset <= 0 || splitOffset >= clip.duration) return p;
    const speed = clip.speed ?? 1;
    const sourceSplitOffset = splitOffset * speed;
    const left: Clip = {
      ...clip,
      id: uuid(),
      startTime: clip.startTime,
      duration: splitOffset,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceStart + sourceSplitOffset,
      eyeContact: undefined,
      eyeContactFileId: undefined,
    };
    const right: Clip = {
      ...clip,
      id: uuid(),
      startTime: clip.startTime + splitOffset,
      duration: clip.duration - splitOffset,
      sourceStart: clip.sourceStart + sourceSplitOffset,
      sourceEnd: clip.sourceEnd,
      eyeContact: undefined,
      eyeContactFileId: undefined,
    };
    return {
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === track.id
          ? { ...t, clips: t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])) }
          : t
      ),
    };
  }),

  duplicateClip: (clipId) => withHistory(set, get, (p) => {
    const found = findClip(p, clipId);
    if (!found) return p;
    const { track, clip } = found;
    const dupe: Clip = { ...clip, id: uuid(), startTime: clip.startTime + clip.duration, eyeContact: undefined, eyeContactFileId: undefined };
    return {
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === track.id
          ? { ...t, clips: t.clips.flatMap((c) => (c.id === clipId ? [c, dupe] : [c])) }
          : t
      ),
    };
  }),

  deleteClip: (clipId) => {
    const found = findClip(get().project, clipId);
    if (found?.clip.eyeContactFileId) {
      deleteEyeContactFile(found.clip.eyeContactFileId).catch(console.error);
    }
    withHistory(set, get, (p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
    }));
    set((s) => {
      const updates: Partial<typeof s> = {};
      if (s.selectedClipId === clipId) updates.selectedClipId = null;
      if (s.selectedItemIds.has(clipId)) {
        const next = new Set(s.selectedItemIds);
        next.delete(clipId);
        updates.selectedItemIds = next;
      }
      return updates;
    });
    set((s) => {
      const { [clipId]: _, ...rest } = s.eyeContactStatus;
      return { eyeContactStatus: rest };
    });
  },

  duplicateTrack: (trackId) => withHistory(set, get, (p) => {
    const idx = p.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return p;
    const orig = p.tracks[idx];
    const newTrack = {
      ...orig,
      id: uuid(),
      label: (orig.label ?? orig.type) + " copy",
      clips: orig.clips.map((c) => ({ ...c, id: uuid() })),
    };
    const newTracks = [...p.tracks];
    newTracks.splice(idx + 1, 0, newTrack);
    return { ...p, tracks: newTracks };
  }),

  reorderTrack: (trackId, toIndex) => withHistory(set, get, (p) => {
    const fromIdx = p.tracks.findIndex((t) => t.id === trackId);
    if (fromIdx === -1) return p;
    const newTracks = [...p.tracks];
    newTracks.splice(fromIdx, 1);
    const insertAt = toIndex > fromIdx ? toIndex - 1 : toIndex;
    newTracks.splice(insertAt, 0, p.tracks[fromIdx]);
    return { ...p, tracks: newTracks };
  }),

  deleteTrack: (trackId) => {
    const track = get().project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const clipIds = new Set(track.clips.map((c) => c.id));
    const transitionIds = new Set((get().project.clipTransitions ?? []).filter((t) => t.trackId === trackId).map((t) => t.id));
    withHistory(set, get, (p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== trackId),
      clipTransitions: (p.clipTransitions ?? []).filter((t) => t.trackId !== trackId),
    }));
    set((s) => {
      const updates: Partial<typeof s> = {};
      if (s.selectedClipId && clipIds.has(s.selectedClipId)) updates.selectedClipId = null;
      const staleIds = new Set([...clipIds, ...transitionIds]);
      if ([...staleIds].some((id) => s.selectedItemIds.has(id))) {
        const next = new Set(s.selectedItemIds);
        staleIds.forEach((id) => next.delete(id));
        updates.selectedItemIds = next;
      }
      return updates;
    });
  },

  setCaption: (captions, sourceFileId) => withHistory(set, get, (p) => ({
    ...p,
    captions,
    ...(sourceFileId !== undefined ? { captionSourceFileId: sourceFileId } : {}),
  })),

  deleteCaption: (id) => {
    withHistory(set, get, (p) => ({ ...p, captions: p.captions.filter((c) => c.id !== id) }));
    set((s) => {
      const updates: Partial<typeof s> = {};
      if (s.selectedCaptionId === id) updates.selectedCaptionId = null;
      if (s.selectedItemIds.has(id)) {
        const next = new Set(s.selectedItemIds);
        next.delete(id);
        updates.selectedItemIds = next;
      }
      return updates;
    });
  },

  trimCaptionLive: (id, newStartTime, newEndTime) =>
    set((s) => ({
      project: {
        ...s.project,
        captions: s.project.captions.map((c) =>
          c.id === id ? { ...c, startTime: newStartTime, endTime: newEndTime } : c
        ),
      },
    })),

  trimCaption: (id, newStartTime, newEndTime) =>
    withHistory(set, get, (p) => ({
      ...p,
      captions: p.captions.map((c) =>
        c.id === id ? { ...c, startTime: newStartTime, endTime: newEndTime } : c
      ),
    })),

  setTrackMuted: (trackId, muted) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => t.id === trackId ? { ...t, muted } : t),
  })),
  setTrackHidden: (trackId, hidden) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => t.id === trackId ? { ...t, hidden } : t),
  })),
  setTrackLabel: (trackId, label) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => t.id === trackId ? { ...t, label } : t),
  })),
  setRowLabel: (rowKey, label) => withHistory(set, get, (p) => ({
    ...p,
    rowLabels: { ...p.rowLabels, [rowKey]: label },
  })),
  clearAllTextOverlays: () => withHistory(set, get, (p) => ({ ...p, textOverlays: [] })),
  clearAllCaptions: () => withHistory(set, get, (p) => ({ ...p, captions: [] })),
  clearAllTransitions: () => withHistory(set, get, (p) => ({ ...p, clipTransitions: [] })),
  clearEffectLane: (type) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.filter((e) => e.type !== type),
  })),

  setClipSpeed: (clipId, speed) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId
        ? { ...c, speed, duration: (c.sourceEnd - c.sourceStart) / speed }
        : c),
    })),
  })),

  setClipVolume: (clipId, volume) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, volume } : c),
    })),
  })),

  setClipFade: (clipId, fadeIn, fadeOut) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, fadeIn, fadeOut } : c),
    })),
  })),

  setClipAdjustment: (clipId, key, value) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, [key]: value } : c),
    })),
  })),

  setClipTransform: (clipId, patch) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        const current = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
        const merged = { ...current, ...patch };
        merged.scale = Math.max(1.0, Math.min(5.0, merged.scale));
        return { ...c, transform: merged };
      }),
    })),
  })),

  setClipTransformLive: (clipId, patch) => set((s) => ({
    project: {
      ...s.project,
      tracks: s.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          const current = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
          const merged = { ...current, ...patch };
          merged.scale = Math.max(1.0, Math.min(5.0, merged.scale));
          return { ...c, transform: merged };
        }),
      })),
    },
  })),

  setClipEyeContact: (clipId, eyeContact) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, eyeContact } : c),
    })),
  })),

  setClipEyeContactFileId: (clipId, fileId) => {
    const eyeContactFileId = fileId ?? undefined;
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, eyeContactFileId } : c)),
        })),
      },
    }));
    const { project, activeProjectId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    if (activeProjectId) _scheduleSave(activeProjectId, project);
  },

  setEyeContactStatus: (clipId, status) => set((s) => {
    if (status === undefined) {
      const { [clipId]: _, ...rest } = s.eyeContactStatus;
      return { eyeContactStatus: rest };
    }
    return { eyeContactStatus: { ...s.eyeContactStatus, [clipId]: status } };
  }),

  setClipPan: (clipId, pan) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => c.id === clipId ? { ...c, pan } : c),
    })),
  })),

  setClipAudioEnhance: (clipId, type, enabled, fileId) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        const updated: typeof c = { ...c, audioEnhanceType: type, audioEnhanceEnabled: enabled };
        if (fileId !== undefined) {
          updated.audioEnhanceFileId = fileId ?? undefined;
        }
        return updated;
      }),
    })),
  })),

  setAudioEnhanceStatus: (clipId, status) => set((s) => {
    if (status === undefined) {
      const { [clipId]: _, ...rest } = s.audioEnhanceStatus;
      return { audioEnhanceStatus: rest };
    }
    return { audioEnhanceStatus: { ...s.audioEnhanceStatus, [clipId]: status } };
  }),

  addTextOverlay: (overlay) => withHistory(set, get, (p) => ({
    ...p,
    textOverlays: [...p.textOverlays, { ...overlay, id: uuid() }],
  })),

  updateTextOverlay: (id, patch) => withHistory(set, get, (p) => ({
    ...p,
    textOverlays: p.textOverlays.map((o) => o.id === id ? { ...o, ...patch } : o),
  })),

  deleteTextOverlay: (id) => {
    withHistory(set, get, (p) => ({
      ...p,
      textOverlays: p.textOverlays.filter((o) => o.id !== id),
    }));
    set((s) => {
      const updates: Partial<typeof s> = {};
      if (s.selectedOverlayId === id) updates.selectedOverlayId = null;
      if (s.selectedItemIds.has(id)) {
        const next = new Set(s.selectedItemIds);
        next.delete(id);
        updates.selectedItemIds = next;
      }
      return updates;
    });
  },

  selectOverlay: (id) =>
    set(
      id
        ? { selectedOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedOverlayId: null, selectedItemIds: new Set() }
    ),

  addEffectOverlay: (overlay) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: [...p.effectOverlays, { ...overlay, id: uuid() }],
  })),
  addEffectOverlayWithId: (overlay) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: [...p.effectOverlays, overlay],
  })),

  moveEffectOverlay: (id, newStartTime) => withHistory(set, get, (p) => {
    const effect = p.effectOverlays.find((e) => e.id === id);
    if (!effect) return p;
    const duration = effect.endTime - effect.startTime;
    return {
      ...p,
      effectOverlays: p.effectOverlays.map((e) =>
        e.id === id ? { ...e, startTime: newStartTime, endTime: newStartTime + duration } : e
      ),
    };
  }),

  moveEffectOverlayLive: (id, newStartTime) => set((s) => {
    const effect = s.project.effectOverlays.find((e) => e.id === id);
    if (!effect) return s;
    const duration = effect.endTime - effect.startTime;
    return {
      project: {
        ...s.project,
        effectOverlays: s.project.effectOverlays.map((e) =>
          e.id === id ? { ...e, startTime: newStartTime, endTime: newStartTime + duration } : e
        ),
      },
    };
  }),

  resizeEffectOverlay: (id, newStartTime, newEndTime) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.map((e) =>
      e.id === id ? { ...e, startTime: newStartTime, endTime: newEndTime } : e
    ),
  })),

  resizeEffectOverlayLive: (id, newStartTime, newEndTime) => set((s) => ({
    project: {
      ...s.project,
      effectOverlays: s.project.effectOverlays.map((e) =>
        e.id === id ? { ...e, startTime: newStartTime, endTime: newEndTime } : e
      ),
    },
  })),

  deleteEffectOverlay: (id) => {
    withHistory(set, get, (p) => ({
      ...p,
      effectOverlays: p.effectOverlays.filter((e) => e.id !== id),
    }));
    set((s) => {
      if (!s.selectedItemIds.has(id)) return {};
      const next = new Set(s.selectedItemIds);
      next.delete(id);
      return { selectedItemIds: next };
    });
  },

  updateEffectOverlayParams: (id, params) => withHistory(set, get, (p) => ({
    ...p,
    effectOverlays: p.effectOverlays.map((e) =>
      e.id === id ? { ...e, params: { ...e.params, ...params } } : e
    ),
  })),

  selectEffectOverlay: (id) =>
    set(
      id
        ? { selectedEffectOverlayId: id, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedEffectOverlayId: null, selectedItemIds: new Set() }
    ),

  addClipTransition: (t) => withHistory(set, get, (p) => ({
    ...p,
    clipTransitions: [...(p.clipTransitions ?? []), { ...t, id: uuid() }],
  })),
  removeClipTransition: (id) => {
    withHistory(set, get, (p) => ({
      ...p,
      clipTransitions: (p.clipTransitions ?? []).filter((t) => t.id !== id),
    }));
    set((s) => {
      const updates: Partial<typeof s> = {};
      if (s.selectedTransitionId === id) updates.selectedTransitionId = null;
      if (s.selectedItemIds.has(id)) {
        const next = new Set(s.selectedItemIds);
        next.delete(id);
        updates.selectedItemIds = next;
      }
      return updates;
    });
  },
  updateClipTransition: (id, patch) => withHistory(set, get, (p) => ({
    ...p,
    clipTransitions: (p.clipTransitions ?? []).map((t) => t.id === id ? { ...t, ...patch } : t),
  })),
  selectTransition: (id) =>
    set(
      id
        ? { selectedTransitionId: id, selectedEffectOverlayId: null, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedTransitionId: null, selectedItemIds: new Set() }
    ),

  setEffectLaneHidden: (type, hidden) => withHistory(set, get, (p) => ({
    ...p,
    hiddenEffectLanes: { ...(p.hiddenEffectLanes ?? {}), [type]: hidden },
  })),

  setDraggingEffectType: (type) => set({ draggingEffectType: type }),
  setPlayhead: (playheadTime) => set({ playheadTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(500, zoom)) }),
  setPreviewWidth: (w) => set({ previewWidth: w }),
  selectClip: (id) =>
    set(
      id
        ? { selectedClipId: id, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const, focusedTrackId: null }
        : { selectedClipId: null, selectedItemIds: new Set(), focusedTrackId: null }
    ),
  selectCaption: (id) =>
    set(
      id
        ? { selectedCaptionId: id, selectedClipId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set([id]), rightPanelTab: "properties" as const }
        : { selectedCaptionId: null, selectedItemIds: new Set() }
    ),
  setFocusedTrackId: (id) => set({ focusedTrackId: id }),
  deselectAll: () => set({ selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, selectedItemIds: new Set(), focusedTrackId: null }),
  toggleItemSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedItemIds);
      if (next.has(id)) next.delete(id); else next.add(id);

      if (next.size === 0) {
        return {
          selectedItemIds: next,
          selectedClipId: null, selectedCaptionId: null,
          selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null,
        };
      }

      if (next.size === 1) {
        const [remainingId] = [...next];
        const p = s.project;
        for (const track of p.tracks) {
          if (track.clips.some((c) => c.id === remainingId)) {
            return { selectedItemIds: next, selectedClipId: remainingId, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, rightPanelTab: "properties" as const };
          }
        }
        if (p.effectOverlays.some((e) => e.id === remainingId)) {
          return { selectedItemIds: next, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: remainingId, selectedTransitionId: null, rightPanelTab: "properties" as const };
        }
        if (p.textOverlays.some((o) => o.id === remainingId)) {
          return { selectedItemIds: next, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: remainingId, selectedEffectOverlayId: null, selectedTransitionId: null, rightPanelTab: "properties" as const };
        }
        if (p.captions.some((c) => c.id === remainingId)) {
          return { selectedItemIds: next, selectedClipId: null, selectedCaptionId: remainingId, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null, rightPanelTab: "properties" as const };
        }
        const transitions = p.clipTransitions ?? [];
        if (transitions.some((t) => t.id === remainingId)) {
          return { selectedItemIds: next, selectedClipId: null, selectedCaptionId: null, selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: remainingId, rightPanelTab: "properties" as const };
        }
        // Unknown ID (stale) — just update the set
        return { selectedItemIds: next };
      }

      // size > 1: clear all single-select fields
      return {
        selectedItemIds: next,
        selectedClipId: null, selectedCaptionId: null,
        selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null,
      };
    }),
  // Low-level: only updates selectedItemIds. Use selectMultiple when single-select fields should also be cleared.
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  selectMultiple: (ids) =>
    set({
      selectedItemIds: ids,
      selectedClipId: null,
      selectedCaptionId: null,
      selectedOverlayId: null,
      selectedEffectOverlayId: null,
      selectedTransitionId: null,
      rightPanelTab: ids.size > 0 ? ("properties" as const) : null,
    }),
  moveSelectedItemsLive: (moves) =>
    set((s) => {
      const map = new Map(moves.map((m) => [m.id, m.newStartTime]));
      const p = s.project;
      return {
        project: {
          ...p,
          tracks: p.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) =>
              map.has(clip.id) ? { ...clip, startTime: map.get(clip.id)! } : clip
            ),
          })),
          effectOverlays: p.effectOverlays.map((e) => {
            if (!map.has(e.id)) return e;
            const dur = e.endTime - e.startTime;
            const ns = map.get(e.id)!;
            return { ...e, startTime: ns, endTime: ns + dur };
          }),
          textOverlays: p.textOverlays.map((o) => {
            if (!map.has(o.id)) return o;
            const dur = o.endTime - o.startTime;
            const ns = map.get(o.id)!;
            return { ...o, startTime: ns, endTime: ns + dur };
          }),
          captions: p.captions.map((c) => {
            if (!map.has(c.id)) return c;
            const dur = c.endTime - c.startTime;
            const ns = map.get(c.id)!;
            const delta = ns - c.startTime;
            return { ...c, startTime: ns, endTime: ns + dur, words: c.words?.map((w) => ({ ...w, start: w.start + delta, end: w.end + delta })) };
          }),
          clipTransitions: (p.clipTransitions ?? []).map((t) =>
            map.has(t.id) ? { ...t, atTime: map.get(t.id)! } : t
          ),
        },
      };
    }),
  moveSelectedItems: (moves) =>
    withHistory(set, get, (p) => {
      const map = new Map(moves.map((m) => [m.id, m.newStartTime]));
      return {
        ...p,
        tracks: p.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            map.has(clip.id) ? { ...clip, startTime: map.get(clip.id)! } : clip
          ),
        })),
        effectOverlays: p.effectOverlays.map((e) => {
          if (!map.has(e.id)) return e;
          const dur = e.endTime - e.startTime;
          const ns = map.get(e.id)!;
          return { ...e, startTime: ns, endTime: ns + dur };
        }),
        textOverlays: p.textOverlays.map((o) => {
          if (!map.has(o.id)) return o;
          const dur = o.endTime - o.startTime;
          const ns = map.get(o.id)!;
          return { ...o, startTime: ns, endTime: ns + dur };
        }),
        captions: p.captions.map((c) => {
          if (!map.has(c.id)) return c;
          const dur = c.endTime - c.startTime;
          const ns = map.get(c.id)!;
          const delta = ns - c.startTime;
          return { ...c, startTime: ns, endTime: ns + dur, words: c.words?.map((w) => ({ ...w, start: w.start + delta, end: w.end + delta })) };
        }),
        clipTransitions: (p.clipTransitions ?? []).map((t) =>
          map.has(t.id) ? { ...t, atTime: map.get(t.id)! } : t
        ),
      };
    }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  setTranscriptSelection: (transcriptSelection) => set({ transcriptSelection }),
  deleteTimeRange: (dStart, dEnd) => withHistory(set, get, (p) => {
    const gap = dEnd - dStart;
    if (gap <= 0) return p;

    const newTracks = p.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip): Clip[] => {
        const cStart = clip.startTime;
        const cEnd = clip.startTime + clip.duration;
        const speed = clip.speed ?? 1;

        if (cEnd <= dStart) return [clip];
        if (cStart >= dEnd) return [{ ...clip, startTime: cStart - gap }];
        if (cStart >= dStart && cEnd <= dEnd) return [];

        // Clip spans entire deletion range
        if (cStart < dStart && cEnd > dEnd) {
          const leftDur = dStart - cStart;
          const rightDur = cEnd - dEnd;
          return [
            { ...clip, duration: leftDur, sourceEnd: clip.sourceStart + leftDur * speed },
            { ...clip, id: uuid(), startTime: dStart, duration: rightDur, sourceStart: clip.sourceStart + (dEnd - cStart) * speed },
          ];
        }

        // Clip overlaps from left (cStart < dStart, cEnd in (dStart, dEnd])
        if (cStart < dStart) {
          const newDur = dStart - cStart;
          return [{ ...clip, duration: newDur, sourceEnd: clip.sourceStart + newDur * speed }];
        }

        // Clip overlaps from right (cStart in [dStart, dEnd), cEnd > dEnd)
        const trimDur = dEnd - cStart;
        return [{ ...clip, startTime: dStart, duration: cEnd - dEnd, sourceStart: clip.sourceStart + trimDur * speed }];
      }),
    }));

    const newCaptions = p.captions
      .filter((c) => !(c.startTime < dEnd && c.endTime > dStart))
      .map((c) => c.startTime >= dEnd ? { ...c, startTime: c.startTime - gap, endTime: c.endTime - gap } : c);

    const newTextOverlays = (p.textOverlays ?? [])
      .filter((o) => !(o.startTime < dEnd && o.endTime > dStart))
      .map((o) => o.startTime >= dEnd ? { ...o, startTime: o.startTime - gap, endTime: o.endTime - gap } : o);

    return { ...p, tracks: newTracks, captions: newCaptions, textOverlays: newTextOverlays };
  }),

  cutWord: (captionId, wordIndex) => withHistory(set, get, (p) => {
    const capIdx = p.captions.findIndex((c) => c.id === captionId);
    if (capIdx === -1) return p;
    const cap = p.captions[capIdx];
    const words = cap.words ?? [];
    const word = words[wordIndex];
    if (!word) return p;

    // End of cut = next word's start (more reliable than word.end from Whisper)
    const cutStart = word.start;
    const cutEnd = wordIndex + 1 < words.length
      ? words[wordIndex + 1].start
      : p.captions[capIdx + 1]?.words?.[0]?.start ?? word.end;
    const gap = cutEnd - cutStart;
    if (gap <= 0) return p;

    // Trim video clips (same logic as deleteTimeRange)
    const newTracks = p.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip): Clip[] => {
        const cStart = clip.startTime;
        const cEnd = clip.startTime + clip.duration;
        const speed = clip.speed ?? 1;
        if (cEnd <= cutStart) return [clip];
        if (cStart >= cutEnd) return [{ ...clip, startTime: cStart - gap }];
        if (cStart >= cutStart && cEnd <= cutEnd) return [];
        if (cStart < cutStart && cEnd > cutEnd) {
          const leftDur = cutStart - cStart;
          const rightDur = cEnd - cutEnd;
          return [
            { ...clip, duration: leftDur, sourceEnd: clip.sourceStart + leftDur * speed },
            { ...clip, id: uuid(), startTime: cutStart, duration: rightDur, sourceStart: clip.sourceStart + (cutEnd - cStart) * speed },
          ];
        }
        if (cStart < cutStart) {
          const newDur = cutStart - cStart;
          return [{ ...clip, duration: newDur, sourceEnd: clip.sourceStart + newDur * speed }];
        }
        const trimDur = cutEnd - cStart;
        return [{ ...clip, startTime: cutStart, duration: cEnd - cutEnd, sourceStart: clip.sourceStart + trimDur * speed }];
      }),
    }));

    // Word-level caption editing: remove just this word, shift subsequent timestamps
    const newCaptions = p.captions.flatMap((c, idx): Caption[] => {
      if (c.id === captionId) {
        const remaining = words
          .filter((_, i) => i !== wordIndex)
          .map((w) => w.start >= cutEnd ? { ...w, start: w.start - gap, end: w.end - gap } : w);
        if (remaining.length === 0) return [];
        return [{ ...c, words: remaining, text: remaining.map((w) => w.text).join(""), endTime: remaining[remaining.length - 1].end }];
      }
      if (idx > capIdx) {
        return [{ ...c,
          startTime: c.startTime - gap,
          endTime: c.endTime - gap,
          words: (c.words ?? []).map((w) => ({ ...w, start: w.start - gap, end: w.end - gap })),
        }];
      }
      return [c];
    });

    const newTextOverlays = (p.textOverlays ?? [])
      .filter((o) => !(o.startTime < cutEnd && o.endTime > cutStart))
      .map((o) => o.startTime >= cutEnd ? { ...o, startTime: o.startTime - gap, endTime: o.endTime - gap } : o);

    return { ...p, tracks: newTracks, captions: newCaptions, textOverlays: newTextOverlays };
  }),

  openProject: ({ project, files, missingFileIds }) => {
    const normalized: Project = {
      ...project,
      textOverlays: project.textOverlays ?? [],
      effectOverlays: (project as any).effectOverlays ?? [],
      clipTransitions: (project as any).clipTransitions ?? [],
      hiddenEffectLanes: (project as any).hiddenEffectLanes ?? {},
      captionTrackStyle: {
        ...makeDefaultCaptionStyle(),
        ...((project as any).captionX !== undefined ? { x: (project as any).captionX } : {}),
        ...((project as any).captionY !== undefined ? { y: (project as any).captionY } : {}),
        ...((project as any).captionBoxW !== undefined ? { boxW: (project as any).captionBoxW } : {}),
        ...((project as any).captionBoxH !== undefined ? { boxH: (project as any).captionBoxH } : {}),
        ...((project as any).captionSize !== undefined ? { fontSize: (project as any).captionSize } : {}),
        ...(project.captionTrackStyle ?? {}),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    localStorage.setItem("video-editor-active-project", normalized.id);
    set({ project: normalized, files, missingFileIds: new Set(missingFileIds ?? []), activeProjectId: normalized.id, history: [], future: [], playheadTime: 0, isPlaying: false });
  },

  closeProject: () => {
    localStorage.removeItem("video-editor-active-project");
    set({ activeProjectId: null, files: [], missingFileIds: new Set(), history: [], future: [], playheadTime: 0, isPlaying: false });
  },

  undo: () => {
    const { history, project, future, activeProjectId } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
    set({
      project: prev, history: history.slice(0, -1), future: [project, ...future],
      selectedItemIds: new Set<string>(),
      selectedClipId: null, selectedCaptionId: null,
      selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null,
    });
    if (activeProjectId) _scheduleSave(activeProjectId, prev);
  },

  redo: () => {
    const { future, project, history, activeProjectId } = get();
    if (!future.length) return;
    const next = future[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({
      project: next, history: [...history, project], future: future.slice(1),
      selectedItemIds: new Set<string>(),
      selectedClipId: null, selectedCaptionId: null,
      selectedOverlayId: null, selectedEffectOverlayId: null, selectedTransitionId: null,
    });
    if (activeProjectId) _scheduleSave(activeProjectId, next);
  },

});
});
