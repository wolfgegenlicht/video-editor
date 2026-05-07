import { useRef, useCallback, useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";

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
      setPlayhead(playStartTimeRef.current + elapsed);
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
