import { useRef, useCallback, useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";

export function usePlayback() {
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const playingRef = useRef(false);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play();
    playingRef.current = true;
    function tick() {
      if (!playingRef.current) return;
      setPlayhead(videoRef.current?.currentTime ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [setPlayhead]);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  const toggle = useCallback(() => {
    if (videoRef.current?.paused) play(); else pause();
  }, [play, pause]);

  const seek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
    setPlayhead(time);
  }, [setPlayhead]);

  useEffect(() => () => {
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  return { videoRef, toggle, seek, play, pause };
}
