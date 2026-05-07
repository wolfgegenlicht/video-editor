import { useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { AspectRatio } from "../../types/project";
import { exportProject } from "../../lib/api";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3"];

export default function Header() {
  const { project, setProjectName, setAspectRatio, undo, redo, history, future, saveAsJson, loadFromJson, closeProject } =
    useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      const blob = await exportProject(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      alert("Export failed: " + String(e));
    }
  }

  function handleLoadJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadFromJson(ev.target?.result as string);
    reader.readAsText(file);
  }

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
      <button
        onClick={closeProject}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mr-1"
      >
        ← Projects
      </button>
      <div className="w-px h-4 bg-gray-200" />
      <input
        className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 w-40"
        value={project.name}
        onChange={(e) => setProjectName(e.target.value)}
      />

      <div className="flex gap-1">
        <button
          onClick={undo}
          disabled={!history.length}
          className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          ↩
        </button>
        <button
          onClick={redo}
          disabled={!future.length}
          className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          ↪
        </button>
      </div>

      <select
        value={project.aspectRatio}
        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
      >
        {ASPECT_RATIOS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <div className="flex-1" />

      <button onClick={saveAsJson} className="px-2 py-1 text-xs rounded hover:bg-gray-100 border border-gray-200">
        Save JSON
      </button>
      <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-xs rounded hover:bg-gray-100 border border-gray-200">
        Load JSON
      </button>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadJson} />

      <button
        onClick={handleExport}
        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
      >
        Export
      </button>
    </header>
  );
}
