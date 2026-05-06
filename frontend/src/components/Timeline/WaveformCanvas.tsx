import { useEffect, useRef } from "react";
import { useWaveform } from "../../hooks/useWaveform";

interface Props {
  fileId: string;
  fileDuration: number;
  sourceStart: number;
  sourceEnd: number;
  width: number;
}

export default function WaveformCanvas({ fileId, fileDuration, sourceStart, sourceEnd, width }: Props) {
  const waveform = useWaveform(fileId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio || 1;
  const H = 30;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const CH = canvas.height;
    ctx.clearRect(0, 0, W, CH);

    const totalSamples = waveform.length;
    const startIdx = Math.floor((sourceStart / fileDuration) * totalSamples);
    const endIdx = Math.ceil((sourceEnd / fileDuration) * totalSamples);
    const visibleSamples = Math.max(1, endIdx - startIdx);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let x = 0; x < W; x++) {
      const sIdx = startIdx + Math.floor((x / W) * visibleSamples);
      const amp = waveform[Math.min(sIdx, totalSamples - 1)] ?? 0;
      const barH = amp * CH;
      ctx.fillRect(x, (CH - barH) / 2, 1, Math.max(1, barH));
    }
  }, [waveform, sourceStart, sourceEnd, fileDuration, width]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(width * dpr)}
      height={Math.round(H * dpr)}
      style={{
        width,
        height: H,
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
