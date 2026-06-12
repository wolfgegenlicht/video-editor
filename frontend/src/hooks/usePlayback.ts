import { useRef, useCallback, useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { compiledDuration } from "../lib/speedRamp";

export function usePlayback() {
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const playingRef = useRef(false);
  const playStartWallRef = useRef(0);
  const playStartTimeRef = useRef(0);

  const play = useCallback(() => {
    playStartWallRef.current = performance.now();
    playStartTimeRef.current = useProjectStore.getState().playheadTime;
    playingRef.current = true;
    setIsPlaying(true);
    function tick() {
      if (!playingRef.current) return;
      const elapsed = (performance.now() - playStartWallRef.current) / 1000;
      const next = playStartTimeRef.current + elapsed;
      // Stop at the compiled (output-space) end so playback doesn't run past the
      // last frame into empty time after speed ramps have shortened the timeline.
      const proj = useProjectStore.getState().project;
      const total = compiledDuration(
        proj.tracks.flatMap((t) => t.clips),
        proj.hiddenEffectLanes?.speedramp ? [] : proj.effectOverlays ?? []
      );
      if (next >= total) {
        setPlayhead(total);
        playingRef.current = false;
        setIsPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [setPlayhead, setIsPlaying]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    playingRef.current = false;
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, [setIsPlaying]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause(); else play();
  }, [play, pause]);

  const seek = useCallback((time: number) => {
    if (playingRef.current) {
      playStartWallRef.current = performance.now();
      playStartTimeRef.current = time;
    }
    setPlayhead(time);
  }, [setPlayhead]);

  useEffect(() => () => {
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  return { videoRef, toggle, seek, play, pause };
}
