// frontend/src/App.tsx — DARK + AMBER. Only className/token swaps; logic untouched.
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
    <div className="flex flex-col h-screen bg-[var(--shell)] text-[var(--txt1)] overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        {/* Floating card — borderless seam in dark theme: 1px hairline, no shadow */}
        <div className="flex-1 flex flex-col ml-2 mb-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden">
          <div className="flex flex-1 min-h-0">
            <LeftPanel seek={seek} />
            {/* Preview area: a touch darker than the shell so the video frame separates */}
            <main className="flex-1 flex items-center justify-center bg-[var(--preview-bg)] min-w-0" onPointerDown={deselectAll}>
              <VideoPreview videoRef={videoRef} />
            </main>
          </div>
          <AudioTrackPlayer />
          <Timeline toggle={toggle} seek={seek} />
        </div>
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
      <div className="min-h-screen bg-[var(--shell)] flex items-center justify-center">
        <span className="text-[var(--txt2)] text-sm">Opening project…</span>
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" theme="dark" toastOptions={{ duration: 4000 }} />
      {activeProjectId ? <Editor /> : <ProjectPicker />}
    </>
  );
}
