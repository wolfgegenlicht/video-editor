import { useEffect } from "react";
import { useProjectStore, getItemStartTime } from "../store/useProjectStore";

export function useKeyboardShortcuts(toggle: () => void) {

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        useProjectStore.getState().redo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        useProjectStore.getState().undo();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }

      if (e.code === "Delete" || e.code === "Backspace") {
        const state = useProjectStore.getState();
        const { focusedTrackId, deleteTrack, setFocusedTrackId, selectedItemIds, deleteClip, deleteCaption, deleteTextOverlay, deleteEffectOverlay, project } = state;
        if (focusedTrackId) {
          e.preventDefault();
          deleteTrack(focusedTrackId);
          setFocusedTrackId(null);
        } else if (selectedItemIds.size > 0) {
          e.preventDefault();
          const captionIds = new Set(project.captions.map((c) => c.id));
          const clipIds = new Set(project.tracks.flatMap((t) => t.clips).map((c) => c.id));
          const overlayIds = new Set((project.textOverlays ?? []).map((o) => o.id));
          const effectIds = new Set((project.effectOverlays ?? []).map((ef) => ef.id));
          for (const id of [...selectedItemIds]) {
            if (captionIds.has(id)) deleteCaption(id);
            else if (clipIds.has(id)) deleteClip(id);
            else if (overlayIds.has(id)) deleteTextOverlay(id);
            else if (effectIds.has(id)) deleteEffectOverlay(id);
          }
        }
        return;
      }

      if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const { playheadTime, project, splitClip } = useProjectStore.getState();
        const allClips = project.tracks.flatMap((t) => t.clips);
        const active = allClips.find(
          (c) => playheadTime > c.startTime && playheadTime < c.startTime + c.duration
        );
        if (active) splitClip(active.id, playheadTime);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.code === "KeyD") {
        e.preventDefault();
        const { focusedTrackId, duplicateTrack, selectedClipId, playheadTime, project, duplicateClip } = useProjectStore.getState();
        if (focusedTrackId) {
          duplicateTrack(focusedTrackId);
        } else if (selectedClipId) {
          duplicateClip(selectedClipId);
        } else {
          const allClips = project.tracks.flatMap((t) => t.clips);
          const active = allClips.find(
            (c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration
          );
          if (active) duplicateClip(active.id);
        }
        return;
      }

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const { selectedClipId, selectedItemIds, moveSelectedItems, playheadTime, project, setPlayhead, isPlaying } = useProjectStore.getState();
        const step = e.shiftKey ? 1 : 1 / 30;
        const direction = e.code === "ArrowLeft" ? -1 : 1;

        if (selectedClipId || selectedItemIds.size > 0) {
          const ids = selectedItemIds.size > 0 ? [...selectedItemIds] : [selectedClipId!];
          const moves = ids.map((id) => ({
            id,
            newStartTime: Math.max(0, getItemStartTime(project, id) + direction * step),
          }));
          moveSelectedItems(moves);
          return;
        }

        const totalDuration = project.tracks
          .flatMap((t) => t.clips)
          .reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
        const newTime = Math.min(Math.max(0, playheadTime + direction * step), totalDuration);
        if (isPlaying) toggle();
        setPlayhead(newTime);
        return;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}
