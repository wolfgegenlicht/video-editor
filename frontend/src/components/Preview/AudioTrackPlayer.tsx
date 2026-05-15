import { useEffect, useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl } from "../../lib/api";

// One AudioContext shared across the whole app (browsers limit the number)
let _ac: AudioContext | null = null;
function getAC(): AudioContext {
  if (!_ac || _ac.state === "closed") _ac = new AudioContext();
  return _ac;
}

// MediaElementAudioSourceNode can only be created once per element. Store the nodes on globalThis
// so the WeakMap survives HMR hot-reloads (which replace module scope but keep DOM alive).
type NodeCache = WeakMap<HTMLAudioElement, { gain: GainNode; panner: StereoPannerNode }>;
const _nodes: NodeCache =
  (globalThis as any).__audioPlayerNodes ??
  ((globalThis as any).__audioPlayerNodes = new WeakMap<HTMLAudioElement, { gain: GainNode; panner: StereoPannerNode }>());

export default function AudioTrackPlayer() {
  const { project, playheadTime, isPlaying } = useProjectStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const gainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);

  const audioTracks = project.tracks.filter((t) => t.type === "audio");
  const activeTrack = audioTracks.find((t) =>
    t.clips.some((c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration)
  );
  const activeClip = activeTrack?.muted
    ? null
    : activeTrack?.clips.find(
        (c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration
      ) ?? null;

  // Use enhanced file when enabled, fall back to original
  const srcFileId = (activeClip?.audioEnhanceEnabled && activeClip?.audioEnhanceFileId)
    ? activeClip.audioEnhanceFileId
    : activeClip?.fileId;

  // Build the Web Audio graph once per audio element (recreated when srcFileId changes via key=).
  // WeakMap prevents the StrictMode double-invoke from calling createMediaElementSource twice
  // on the same element, which would throw an InvalidStateError.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const existing = _nodes.get(audio);
    if (existing) {
      gainRef.current = existing.gain;
      pannerRef.current = existing.panner;
      return;
    }
    try {
      const ac = getAC();
      const source = ac.createMediaElementSource(audio);
      const gain = ac.createGain();
      const panner = ac.createStereoPanner();
      source.connect(gain);
      gain.connect(panner);
      panner.connect(ac.destination);
      gain.gain.value = activeClip?.volume ?? 1;
      panner.pan.value = activeClip?.pan ?? 0;
      gainRef.current = gain;
      pannerRef.current = panner;
      _nodes.set(audio, { gain, panner });
    } catch {
      // Element was already connected (can happen during HMR); ignore and fall back to raw playback
    }
    // No cleanup disconnect — once connected, a MediaElementAudioSourceNode can't be reconnected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcFileId]);

  // Play / pause + seek when playback state or clip changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeClip) {
      audioRef.current?.pause();
      return;
    }
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    audio.currentTime = sourcePos;
    audio.playbackRate = speed;
    if (isPlaying) {
      getAC().resume().then(() => audio.play()).catch(() => {});
    } else {
      audio.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeClip?.startTime, srcFileId]);

  // Reactively update volume via GainNode (supports >100%)
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = activeClip?.volume ?? 1;
  }, [activeClip?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactively update stereo pan
  useEffect(() => {
    if (pannerRef.current) pannerRef.current.pan.value = activeClip?.pan ?? 0;
  }, [activeClip?.pan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactively update playback speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = activeClip?.speed ?? 1;
  }, [activeClip?.speed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrubbing: keep position in sync when not playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeClip || isPlaying) return;
    const speed = activeClip.speed ?? 1;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
    if (Math.abs(audio.currentTime - sourcePos) > 0.05) audio.currentTime = sourcePos;
  }, [playheadTime, activeClip, isPlaying]);

  if (!activeClip || !srcFileId) return null;

  return (
    <audio
      ref={audioRef}
      key={srcFileId}
      src={fileUrl(srcFileId)}
    />
  );
}
