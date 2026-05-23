import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { AspectRatio } from "../../types/project";
import { UndoIcon, RedoIcon, ChevronLeftIcon } from "../Icons";
import ExportDialog from "./ExportDialog";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3"];

export default function Header() {
  const { project, setProjectName, setAspectRatio, undo, redo, history, future, saveStatus, closeProject } =
    useProjectStore();
  const [showExport, setShowExport] = useState(false);

  return (
    <>
    <header className="h-9 flex items-center px-3 gap-2 flex-shrink-0 bg-white border-b border-black/[0.08]">
      {/* Left group */}
      <div className="flex items-center gap-2 flex-1">
        <button
          onClick={closeProject}
          className="flex items-center gap-1 text-xs text-[#6b6b78] hover:text-[#141416] cursor-pointer transition-colors"
        >
          <ChevronLeftIcon />
          Projects
        </button>
        <div className="w-px h-3.5 bg-black/[0.08]" />
        <div className="flex gap-0.5">
          <button
            onClick={undo}
            disabled={!history.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#ebebef] disabled:opacity-30 cursor-pointer transition-colors"
            title="Undo (⌘Z)"
          >
            <UndoIcon />
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#ebebef] disabled:opacity-30 cursor-pointer transition-colors"
            title="Redo (⌘⇧Z)"
          >
            <RedoIcon />
          </button>
        </div>
        <select
          value={project.aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          className="text-xs border border-black/10 rounded-md px-2 py-0.5 bg-[#f2f2f6] text-[#141416] cursor-pointer"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Center group — project name */}
      <div className="flex items-center justify-center">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-[#0ea5a0] rounded px-1 w-44 text-center text-[#141416]"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        <span className="text-xs text-[#6b6b78] select-none">
          {saveStatus === "saving" ? "Saving…" : "Saved"}
        </span>
        <button
          onClick={() => setShowExport(true)}
          className="px-3 py-0.5 text-xs bg-[#0ea5a0] hover:bg-[#0c9490] text-white rounded font-semibold cursor-pointer transition-colors"
        >
          Export
        </button>
      </div>
    </header>
    {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </>
  );
}
