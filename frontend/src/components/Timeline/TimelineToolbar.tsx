import { useProjectStore } from "../../store/useProjectStore";

interface Props {
  onSplit: () => void;
}

export default function TimelineToolbar({ onSplit }: Props) {
  const { zoom, setZoom, addTrack, playheadTime } = useProjectStore();

  function fmt(t: number) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2).padStart(5, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs flex-shrink-0">
      <button onClick={() => setZoom(zoom + 15)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">+</button>
      <button onClick={() => setZoom(zoom - 15)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">−</button>
      <span className="text-gray-400 w-14">{zoom}px/s</span>
      <button onClick={onSplit} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">Split (S)</button>
      <button onClick={addTrack} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">+ Track</button>
      <div className="flex-1" />
      <span className="font-mono text-gray-600">{fmt(playheadTime)}</span>
    </div>
  );
}
