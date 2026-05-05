import Header from "./components/Header/Header";
import LeftPanel from "./components/LeftPanel/LeftPanel";
import VideoPreview from "./components/Preview/VideoPreview";
import Timeline from "./components/Timeline/Timeline";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

export default function App() {
  useKeyboardShortcuts();
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <LeftPanel />
        <main className="flex-1 flex items-center justify-center bg-gray-100 min-w-0">
          <VideoPreview />
        </main>
      </div>
      <Timeline />
    </div>
  );
}
