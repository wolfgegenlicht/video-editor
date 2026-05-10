import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { AspectRatio } from "../../types/project";
import { UndoIcon, RedoIcon, ChevronLeftIcon } from "../Icons";
import ExportDialog from "./ExportDialog";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3"];

export default function Header() {
  const { project, setProjectName, setAspectRatio, undo, redo, history, future, saveAsJson, loadFromJson, closeProject } =
    useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);

  function handleLoadJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadFromJson(ev.target?.result as string);
    reader.readAsText(file);
  }

  return (
    <>
    <header className="h-9 flex items-center px-3 gap-2 flex-shrink-0 bg-white border-b border-slate-200">
      {/* Left group */}
      <div className="flex items-center gap-2 flex-1">
        <button
          onClick={closeProject}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
        >
          <ChevronLeftIcon />
          Projects
        </button>
        <div className="w-px h-3.5 bg-slate-200" />
        <div className="flex gap-0.5">
          <button
            onClick={undo}
            disabled={!history.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors"
            title="Undo (⌘Z)"
          >
            <UndoIcon />
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors"
            title="Redo (⌘⇧Z)"
          >
            <RedoIcon />
          </button>
        </div>
        <select
          value={project.aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          className="text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700 cursor-pointer"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Center group — project name */}
      <div className="flex items-center justify-center">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-teal-500 rounded px-1 w-44 text-center text-slate-900"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        <button onClick={saveAsJson} className="px-2 py-0.5 text-xs rounded hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer transition-colors">
          Save JSON
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="px-2 py-0.5 text-xs rounded hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer transition-colors">
          Load JSON
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadJson} />
        <button
          onClick={() => setShowExport(true)}
          className="px-3 py-0.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 font-semibold cursor-pointer transition-colors"
        >
          Export
        </button>
      </div>
    </header>
    {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </>
  );
}
