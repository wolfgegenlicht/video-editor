import { useCallback, useRef } from "react";

interface Props {
  totalWidth: number;
  zoom: number;
  seek: (time: number) => void;
}

export default function TimelineRuler({ totalWidth, zoom, seek }: Props) {
  const rulerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      seek(Math.max(0, x / zoom));
    },
    [zoom, seek]
  );

  const ticks: React.ReactElement[] = [];
  const step = zoom >= 80 ? 1 : zoom >= 30 ? 5 : 10;
  const totalSeconds = Math.ceil(totalWidth / zoom) + step;
  for (let t = 0; t <= totalSeconds; t += step) {
    const x = t * zoom;
    ticks.push(
      <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: x }}>
        <div className="w-px h-2 bg-gray-300" />
        <span className="text-gray-400 text-[9px] mt-0.5 select-none whitespace-nowrap">{t}s</span>
      </div>
    );
  }

  return (
    <div
      ref={rulerRef}
      className="relative h-6 bg-gray-100 border-b border-gray-200 cursor-pointer flex-shrink-0"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {ticks}
    </div>
  );
}
