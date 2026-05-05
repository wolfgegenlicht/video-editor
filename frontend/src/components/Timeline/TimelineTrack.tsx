import type { Track } from "../../types/project";

interface Props { track: Track; zoom: number }

export default function TimelineTrack({ track: _track, zoom: _zoom }: Props) {
  return <div className="h-10 border-b border-gray-100 relative bg-white hover:bg-gray-50" />;
}
