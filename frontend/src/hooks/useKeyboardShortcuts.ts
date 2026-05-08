import { useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";

export function useKeyboardShortcuts(toggle: () => void) {

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }

      if (e.code === "Delete" || e.code === "Backspace") {
        const { selectedClipId, deleteClip, selectedOverlayId, deleteTextOverlay, selectedEffectOverlayId, deleteEffectOverlay } = useProjectStore.getState();
        if (selectedClipId) {
          e.preventDefault();
          deleteClip(selectedClipId);
        } else if (selectedOverlayId) {
          e.preventDefault();
          deleteTextOverlay(selectedOverlayId);
        } else if (selectedEffectOverlayId) {
          e.preventDefault();
          deleteEffectOverlay(selectedEffectOverlayId);
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
        const { playheadTime, project, duplicateClip } = useProjectStore.getState();
        const allClips = project.tracks.flatMap((t) => t.clips);
        const active = allClips.find(
          (c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration
        );
        if (active) duplicateClip(active.id);
        return;
      }

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

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const { playheadTime, project, setPlayhead, isPlaying } = useProjectStore.getState();
        const step = e.shiftKey ? 1 : 1 / 30;
        const direction = e.code === "ArrowLeft" ? -1 : 1;
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
