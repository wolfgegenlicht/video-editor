import { useState, useEffect } from "react";
import { fileUrl } from "../lib/api";

const SAMPLE_COUNT = 2048;
const cache = new Map<string, Float32Array | "error">();

export function useWaveform(fileId: string): Float32Array | null {
  const cached = cache.get(fileId);
  const [waveform, setWaveform] = useState<Float32Array | null>(
    cached instanceof Float32Array ? cached : null
  );

  useEffect(() => {
    if (cache.has(fileId)) {
      const v = cache.get(fileId);
      setWaveform(v instanceof Float32Array ? v : null);
      return;
    }

    let cancelled = false;
    const ac = new AudioContext();

    fetch(fileUrl(fileId))
      .then((r) => r.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return;
        const channel = decoded.getChannelData(0);
        const blockSize = Math.max(1, Math.floor(channel.length / SAMPLE_COUNT));
        const samples = new Float32Array(SAMPLE_COUNT);
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          let max = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            const abs = Math.abs(channel[start + j] ?? 0);
            if (abs > max) max = abs;
          }
          samples[i] = max;
        }
        cache.set(fileId, samples);
        if (!cancelled) setWaveform(samples);
      })
      .catch(() => {
        cache.set(fileId, "error");
      })
      .finally(() => ac.close());

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return waveform;
}
