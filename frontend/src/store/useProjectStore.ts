import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Project, Track, Clip, Caption, AspectRatio, CaptionStyle, UploadedFile } from "../types/project";

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
  };
}

function loadFromStorage(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return makeDefaultProject();
}

interface ProjectStore {
  project: Project;
  files: UploadedFile[];
  history: Project[];
  future: Project[];
  playheadTime: number;
  zoom: number;

  setProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setCaptionStyle: (style: CaptionStyle) => void;

  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;

  addTrack: () => void;
  addClip: (trackId: string, clip: Omit<Clip, "id">) => void;
  moveClip: (clipId: string, toTrackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, newStartTime: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;

  setCaption: (captions: Caption[]) => void;

  setPlayhead: (time: number) => void;
  setZoom: (zoom: number) => void;

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

function withHistory(set: any, get: any, updater: (p: Project) => Project) {
  const { project, history } = get();
  const newHistory = [...history.slice(-MAX_HISTORY + 1), project];
  const newProject = updater(project);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newProject));
  set({ project: newProject, history: newHistory, future: [] });
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: loadFromStorage(),
  files: [],
  history: [],
  future: [],
  playheadTime: 0,
  zoom: 50,

  setProjectName: (name) => withHistory(set, get, (p) => ({ ...p, name })),
  setAspectRatio: (aspectRatio) => withHistory(set, get, (p) => ({ ...p, aspectRatio })),
  setCaptionStyle: (captionStyle) => withHistory(set, get, (p) => ({ ...p, captionStyle })),

  addFile: (file) => set((s) => ({ files: [...s.files, file] })),
  removeFile: (fileId) => set((s) => ({ files: s.files.filter((f) => f.id !== fileId) })),

  addTrack: () => withHistory(set, get, (p) => ({
    ...p,
    tracks: [...p.tracks, { id: uuid(), type: "video" as const, clips: [] }],
  })),

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
    const left: Clip = {
      id: uuid(),
      fileId: clip.fileId,
      startTime: clip.startTime,
      duration: splitOffset,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceStart + splitOffset,
    };
    const right: Clip = {
      id: uuid(),
      fileId: clip.fileId,
      startTime: clip.startTime + splitOffset,
      duration: clip.duration - splitOffset,
      sourceStart: clip.sourceStart + splitOffset,
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

  deleteClip: (clipId) => withHistory(set, get, (p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
  })),

  setCaption: (captions) => withHistory(set, get, (p) => ({ ...p, captions })),

  setPlayhead: (playheadTime) => set({ playheadTime }),
  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(500, zoom)) }),

  undo: () => {
    const { history, project, future } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
    set({ project: prev, history: history.slice(0, -1), future: [project, ...future] });
  },

  redo: () => {
    const { future, project, history } = get();
    if (!future.length) return;
    const next = future[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ project: next, history: [...history, project], future: future.slice(1) });
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
      const project = JSON.parse(json) as Project;
      localStorage.setItem(STORAGE_KEY, json);
      set({ project, history: [], future: [] });
    } catch {
      alert("Invalid project JSON");
    }
  },
}));
