import Header from "./components/Header/Header";
import LeftPanel from "./components/LeftPanel/LeftPanel";
import VideoPreview from "./components/Preview/VideoPreview";
import AudioTrackPlayer from "./components/Preview/AudioTrackPlayer";
import Timeline from "./components/Timeline/Timeline";
import ProjectPicker from "./components/ProjectPicker/ProjectPicker";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePlayback } from "./hooks/usePlayback";
import { useProjectStore } from "./store/useProjectStore";

function Editor() {
  const { videoRef, toggle, seek } = usePlayback();
  useKeyboardShortcuts(toggle);
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <LeftPanel seek={seek} />
        <main className="flex-1 flex items-center justify-center bg-gray-100 min-w-0">
          <VideoPreview videoRef={videoRef} toggle={toggle} />
        </main>
      </div>
      <AudioTrackPlayer />
      <Timeline toggle={toggle} seek={seek} />
    </div>
  );
}

export default function App() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  return activeProjectId ? <Editor /> : <ProjectPicker />;
}
