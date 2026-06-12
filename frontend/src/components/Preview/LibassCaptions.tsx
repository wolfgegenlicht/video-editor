import { useCallback, useEffect, useRef } from "react";
import type JASSUB from "jassub";
import { useProjectStore } from "../../store/useProjectStore";
import { fetchCaptionAss } from "../../lib/api";
import { createJassub } from "../../lib/jassub";
import { outputToEdit } from "../../lib/speedRamp";

interface Props {
  time: number;
}

// Backing-store resolution per aspect ratio — matches the backend CANVAS_SIZES at
// 1080p and the ASS PlayResX/Y, so libass renders the preview at the SAME resolution
// as the export. CSS scales the canvas down to the preview area (crisp downscale),
// so we never call JASSUB.resize() — which is broken for canvas-only mode in 1.8.8.
const CANVAS_SIZE: Record<string, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:3": [1440, 1080],
};

// Min gap between ASS rebuilds. A *throttle*, not a debounce: during a slider drag
// it fires every ~THROTTLE_MS so the preview tracks the change live, instead of a
// debounce that resets on every tick and only updates once you stop dragging.
const THROTTLE_MS = 40;

/**
 * Renders captions in the preview with libass (JASSUB), fed the exact ASS the export
 * burns. Because both preview and export are libass on the identical ASS at the same
 * PlayRes, captions match by construction. See [[caption-render-architecture]].
 *
 * Playback is rAF-driven (the store's playheadTime is the clock), so we drive libass
 * manually via setCurrentTime(true, time) rather than binding it to a <video>.
 */
export default function LibassCaptions({ time }: Props) {
  const project = useProjectStore((s) => s.project);
  const { captions, captionTrackStyle: style, aspectRatio } = project;
  const [cw, ch] = CANVAS_SIZE[aspectRatio] ?? [1920, 1080];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jassubRef = useRef<JASSUB | null>(null);
  const readyRef = useRef(false);

  // Latest inputs, read by the throttled flush. Updated every render (cheap) so the
  // flush always rebuilds from the current style even while a request is in flight.
  const latestRef = useRef({ captions, style, aspectRatio, cw, ch });
  latestRef.current = { captions, style, aspectRatio, cw, ch };

  const flushTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // Schedule a throttled rebuild. If one is already scheduled we do nothing, so a
  // burst of changes (slider drag) collapses to one rebuild per THROTTLE_MS rather
  // than pushing the update to the end of the burst.
  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = window.setTimeout(async () => {
      flushTimerRef.current = null;
      // Don't overlap requests — if one is in flight, retry on the next tick so we
      // self-pace to however fast the fetch + libass render actually is.
      if (inFlightRef.current) {
        scheduleFlush();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { captions, style, aspectRatio, cw, ch } = latestRef.current;
      inFlightRef.current = true;
      try {
        const ass = await fetchCaptionAss(captions, style, aspectRatio);
        if (!mountedRef.current || !canvasRef.current) return;
        // Recreate only when the backing-store size changes (aspect ratio); otherwise
        // setTrack swaps the subtitle content in place (fast, no worker restart).
        const needCreate = !jassubRef.current || canvas.width !== cw || canvas.height !== ch;
        if (needCreate) {
          jassubRef.current?.destroy();
          canvas.width = cw;
          canvas.height = ch;
          jassubRef.current = createJassub(canvas, ass);
          readyRef.current = true;
        } else {
          jassubRef.current!.setTrack(ass);
        }
        // The ASS is authored in EDIT space; the store playhead is OUTPUT time.
        const st = useProjectStore.getState();
        const ramps = st.project.hiddenEffectLanes?.speedramp ? [] : st.project.effectOverlays;
        jassubRef.current!.setCurrentTime(true, outputToEdit(st.playheadTime, ramps));
      } catch (e) {
        console.error("[LibassCaptions] failed to load ASS", e);
      } finally {
        inFlightRef.current = false;
      }
    }, THROTTLE_MS);
  }, []);

  // Rebuild the ASS whenever captions / style / aspect ratio change (throttled).
  useEffect(() => {
    scheduleFlush();
  }, [captions, style, aspectRatio, cw, ch, scheduleFlush]);

  // Render the frame at the current playhead.
  useEffect(() => {
    if (!jassubRef.current || !readyRef.current) return;
    jassubRef.current.setCurrentTime(true, time);
  }, [time]);

  // Tear down the worker on unmount. Reset mountedRef here (not just at init) so a
  // StrictMode mount→cleanup→mount cycle leaves it true — otherwise the cleanup's
  // mountedRef=false sticks and the flush bails out forever (captions never appear).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null; // else scheduleFlush's guard blocks all future flushes
      }
      inFlightRef.current = false;
      jassubRef.current?.destroy();
      jassubRef.current = null;
      readyRef.current = false;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
