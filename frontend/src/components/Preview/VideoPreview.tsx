import { useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { fileUrl } from "../../lib/api";
import { usePlayback } from "../../hooks/usePlayback";
import CaptionOverlay from "./CaptionOverlay";

const RATIO_CLASSES: Record<string, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
};

export default function VideoPreview() {
  const { project, files, playheadTime } = useProjectStore();
  const { videoRef, toggle } = usePlayback();

  const allClips = project.tracks.flatMap((t) => t.clips);
  const activeClip = allClips.find(
    (c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration
  );
  const activeFile = activeClip ? files.find((f) => f.id === activeClip.fileId) : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime);
    if (Math.abs(video.currentTime - sourcePos) > 0.15) {
      video.currentTime = sourcePos;
    }
  }, [playheadTime, activeClip]);

  const ratioClass = RATIO_CLASSES[project.aspectRatio] ?? "aspect-video";

  return (
    <div
      className={`relative bg-black ${ratioClass} max-h-full`}
      style={{ maxWidth: "min(100%, 720px)" }}
    >
      {activeFile ? (
        <video
          ref={videoRef}
          key={activeFile.id}
          src={fileUrl(activeFile.id)}
          className="w-full h-full object-contain"
          onClick={toggle}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          {files.length ? "Position playhead over a clip" : "Upload media to get started"}
        </div>
      )}
      <CaptionOverlay time={playheadTime} />
    </div>
  );
}
