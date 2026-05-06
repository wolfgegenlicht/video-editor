import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Project, Track, Clip, Caption, AspectRatio, CaptionStyle, TrackType, UploadedFile, TextOverlay } from "../types/project";
import { saveProject } from "../lib/api";
import type { ProjectData } from "../lib/api";

const STORAGE_KEY = "video-editor-project";
const MAX_HISTORY = 50;

function makeDefaultProject(): Project {
  return {
    id: uuid(),
    name: "Untitled Project",
    aspectRatio: "16:9",
    captionStyle: "minimal",
    tracks: [{ id: uuid(), type: "video", clips: [] }],
    captions: [],
    textOverlays: [],
  };
}

function isValidProject(p: unknown): p is Project {
  if (!p || typeof p !== "object") return false;
  const proj = p as Record<string, unknown>;
  return typeof proj.id === "string" && Array.isArray(proj.tracks) && Array.isArray(proj.captions);
}


interface ProjectStore {
  project: Project;
  files: UploadedFile[];
  history: Project[];
  future: Project[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;
  activeProjectId: string | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;

  setProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setCaptionStyle: (style: CaptionStyle) => void;
  setCaptionSize: (size: number) => void;
  setCaptionPosition: (x: number, y: number) => void;

  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;

  addTrack: (type?: TrackType) => void;
  detachAudio: (clipId: string) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  addClip: (trackId: string, clip: Omit<Clip, "id">) => void;
  moveClip: (clipId: string, toTrackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, newStartTime: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;

  setClipSpeed: (clipId: string, speed: number) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  setClipFade: (clipId: string, fadeIn: number, fadeOut: number) => void;
  addTextOverlay: (overlay: Omit<TextOverlay, "id">) => void;
  updateTextOverlay: (id: string, patch: Partial<Omit<TextOverlay, "id">>) => void;
  deleteTextOverlay: (id: string) => void;
  selectOverlay: (id: string | null) => void;

  setCaption: (captions: Caption[], sourceFileId?: string) => void;

  setPlayhead: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  selectClip: (id: string | null) => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;

  undo: () => void;
  redo: () => void;

  saveAsJson: () => void;
  loadFromJson: (json: string) => void;
}

function findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function _scheduleSave(projectId: string, project: Project) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveProject(projectId, project).catch(console.error);
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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: makeDefaultProject(),
  files: [],
  history: [],
  future: [],
  playheadTime: 0,
  isPlaying: false,
  zoom: 50,
  activeProjectId: null,
  selectedClipId: null,
  selectedOverlayId: null,

  setProjectName: (name) => withHistory(set, get, (p) => ({ ...p, name })),
  setAspectRatio: (aspectRatio) => withHistory(set, get, (p) => ({ ...p, aspectRatio })),
  setCaptionStyle: (captionStyle) => withHistory(set, get, (p) => ({ ...p, captionStyle })),
  setCaptionSize: (captionSize) => set((s) => ({ project: { ...s.project, captionSize } })),
  setCaptionPosition: (captionX, captionY) => set((s) => ({ project: { ...s.project, captionX, captionY } })),

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
    };
    const right: Clip = {
      ...clip,
      id: uuid(),
      startTime: clip.startTime + splitOffset,
      duration: clip.duration - splitOffset,
      sourceStart: clip.sourceStart + sourceSplitOffset,
      sourceEnd: clip.sourceEnd,
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
    const dupe: Clip = { ...clip, id: uuid(), startTime: clip.startTime + clip.duration };
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
    withHistory(set, get, (p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
    }));
    set((s) => s.selectedClipId === clipId ? { selectedClipId: null } : {});
  },

  setCaption: (captions, sourceFileId) => withHistory(set, get, (p) => ({
    ...p,
    captions,
    ...(sourceFileId !== undefined ? { captionSourceFileId: sourceFileId } : {}),
  })),

  setTrackMuted: (trackId, muted) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => t.id === trackId ? { ...t, muted } : t),
  })),
  setTrackHidden: (trackId, hidden) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => t.id === trackId ? { ...t, hidden } : t),
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
    set((s) => s.selectedOverlayId === id ? { selectedOverlayId: null } : {});
  },

  selectOverlay: (selectedOverlayId) => set({ selectedOverlayId }),

  setPlayhead: (playheadTime) => set({ playheadTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(500, zoom)) }),
  selectClip: (selectedClipId) => set({ selectedClipId }),

  openProject: ({ project, files }) => {
    const normalized: Project = { ...project, textOverlays: project.textOverlays ?? [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    set({ project: normalized, files, activeProjectId: normalized.id, history: [], future: [], playheadTime: 0, isPlaying: false });
  },

  closeProject: () => {
    set({ activeProjectId: null, files: [], history: [], future: [], playheadTime: 0, isPlaying: false });
  },

  undo: () => {
    const { history, project, future, activeProjectId } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
    set({ project: prev, history: history.slice(0, -1), future: [project, ...future] });
    if (activeProjectId) _scheduleSave(activeProjectId, prev);
  },

  redo: () => {
    const { future, project, history, activeProjectId } = get();
    if (!future.length) return;
    const next = future[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ project: next, history: [...history, project], future: future.slice(1) });
    if (activeProjectId) _scheduleSave(activeProjectId, next);
  },

  saveAsJson: () => {
    const { project } = get();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  loadFromJson: (json) => {
    try {
      const parsed = JSON.parse(json);
      if (!isValidProject(parsed)) { alert("Invalid project JSON: missing required fields"); return; }
      const project = parsed;
      localStorage.setItem(STORAGE_KEY, json);
      set({ project, history: [], future: [] });
    } catch {
      alert("Invalid project JSON");
    }
  },
}));
