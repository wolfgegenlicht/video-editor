// frontend/src/components/Header/Header.tsx — DARK + AMBER
// Changes: h-9 → h-10 (40px), px-3 → px-4 (16px), white→panel, teal→amber,
// Export button amber-filled. No logic / handlers / state touched.
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
    <header className="h-10 flex items-center px-4 gap-2.5 flex-shrink-0 bg-[var(--panel)] border-b border-[var(--border)]">
      {/* Left group */}
      <div className="flex items-center gap-2.5 flex-1">
        <button
          type="button"
          onClick={closeProject}
          className="flex items-center gap-1 text-xs text-[var(--txt2)] hover:text-[var(--txt1)] cursor-pointer transition-colors"
        >
          <ChevronLeftIcon />
          Projects
        </button>
        <div className="w-px h-3.5 bg-[var(--border-strong)]" />
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            className="size-7 flex items-center justify-center rounded-md hover:bg-[var(--hover)] disabled:opacity-30 cursor-pointer transition-colors"
            title="Undo (⌘Z)"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!future.length}
            className="size-7 flex items-center justify-center rounded-md hover:bg-[var(--hover)] disabled:opacity-30 cursor-pointer transition-colors"
            title="Redo (⌘⇧Z)"
          >
            <RedoIcon />
          </button>
        </div>
        <select
          aria-label="Aspect ratio"
          value={project.aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          className="text-xs border border-[var(--border-strong)] rounded-md px-2 py-1 bg-[var(--label-bg)] text-[var(--txt1)] cursor-pointer"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Center group — project name */}
      <div className="flex items-center justify-center">
        <input
          aria-label="Project name"
          className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 w-44 text-center text-[var(--txt1)]"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2.5 flex-1 justify-end">
        <span className="text-xs text-[var(--txt2)] select-none">
          {saveStatus === "saving" ? "Saving…" : "Saved"}
        </span>
        <button
          type="button"
          onClick={() => setShowExport(true)}
          className="px-3.5 py-1 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-on)] rounded-md font-semibold cursor-pointer transition-colors"
        >
          Export
        </button>
      </div>
    </header>
    {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </>
  );
}
