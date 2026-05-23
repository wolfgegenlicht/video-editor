import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import Header from "./components/Header/Header";
import LeftPanel from "./components/LeftPanel/LeftPanel";
import VideoPreview from "./components/Preview/VideoPreview";
import AudioTrackPlayer from "./components/Preview/AudioTrackPlayer";
import Timeline from "./components/Timeline/Timeline";
import RightPanel from "./components/RightPanel/RightPanel";
import ProjectPicker from "./components/ProjectPicker/ProjectPicker";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePlayback } from "./hooks/usePlayback";
import { useProjectStore } from "./store/useProjectStore";
import { loadProject } from "./lib/api";

function Editor() {
  const { videoRef, toggle, seek } = usePlayback();
  const deselectAll = useProjectStore((s) => s.deselectAll);
  useKeyboardShortcuts(toggle);
  return (
    <div className="flex flex-col h-screen bg-[#f0f0f4] text-[#141416] overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        {/* Floating card — contains the editing area and timeline */}
        <div className="flex-1 flex flex-col ml-2 mb-2 rounded-xl border border-black/[0.06] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-1 min-h-0">
            <LeftPanel seek={seek} />
            <main className="flex-1 flex items-center justify-center bg-[#f0f0f4] min-w-0" onPointerDown={deselectAll}>
              <VideoPreview videoRef={videoRef} />
            </main>
          </div>
          <AudioTrackPlayer />
          <Timeline toggle={toggle} seek={seek} />
        </div>
        {/* Right panel — sits outside the card on the recessed shell */}
        <RightPanel />
      </div>
    </div>
  );
}

export default function App() {
  const { activeProjectId, openProject } = useProjectStore();
  const [restoring, setRestoring] = useState(() => !!localStorage.getItem("video-editor-active-project"));

  useEffect(() => {
    const savedId = localStorage.getItem("video-editor-active-project");
    if (!savedId) return;
    loadProject(savedId)
      .then(openProject)
      .catch(() => localStorage.removeItem("video-editor-active-project"))
      .finally(() => setRestoring(false));
  }, []);

  if (restoring) {
    return (
      <div className="min-h-screen bg-[#f0f0f4] flex items-center justify-center">
        <span className="text-[#6b6b78] text-sm">Opening project…</span>
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
      {activeProjectId ? <Editor /> : <ProjectPicker />}
    </>
  );
}
