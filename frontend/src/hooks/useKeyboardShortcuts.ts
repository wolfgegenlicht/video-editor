import { useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { usePlayback } from "./usePlayback";


export function useKeyboardShortcuts() {
  const { toggle } = usePlayback();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggle();
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
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}
