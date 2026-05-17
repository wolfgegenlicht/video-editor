import { useState, useEffect } from "react";
import { fileUrl } from "../lib/api";

const SAMPLE_COUNT = 8192;
const cache = new Map<string, Float32Array | "error">();
const inflight = new Map<string, Promise<Float32Array | "error">>();

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

    const decode = (): Promise<Float32Array | "error"> => {
      const ac = new AudioContext();
      return fetch(fileUrl(fileId))
        .then((r) => r.arrayBuffer())
        .then((buf) => ac.decodeAudioData(buf))
        .then((decoded) => {
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
          return samples as Float32Array | "error";
        })
        .catch((): "error" => "error")
        .finally(() => ac.close());
    };

    const promise = inflight.get(fileId) ?? (() => {
      const p = decode();
      inflight.set(fileId, p);
      p.then((result) => {
        cache.set(fileId, result);
        inflight.delete(fileId);
      });
      return p;
    })();

    promise.then((result) => {
      if (!cancelled) setWaveform(result instanceof Float32Array ? result : null);
    });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return waveform;
}
