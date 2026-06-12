import { useState, useEffect } from "react";
import { listProjects, createProject, loadProject, renameProject, deleteProject } from "../../lib/api";
import { useProjectStore } from "../../store/useProjectStore";
import type { ProjectSummary } from "../../lib/api";

const THUMB_GRADIENTS = [
  "from-teal-400 to-emerald-500",
  "from-violet-400 to-indigo-500",
  "from-amber-400 to-orange-400",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
];

export default function ProjectPicker() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const { openProject } = useProjectStore();

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    try {
      setProjects(await listProjects());
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(id: string) {
    try {
      openProject(await loadProject(id));
    } catch (e) {
      alert("Failed to open project: " + String(e));
    }
  }

  async function handleCreate() {
    const name = newName.trim() || "Untitled Project";
    setCreating(false);
    setNewName("");
    try {
      openProject(await createProject(name));
    } catch (e) {
      alert("Failed to create project: " + String(e));
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch (e) {
      alert("Failed to rename: " + String(e));
    }
  }

  async function handleDelete(id: string) {
    setOpenMenu(null);
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert("Failed to delete: " + String(e));
    }
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
    setOpenMenu(null);
  }

  return (
    <div
      role="presentation"
      className="min-h-screen bg-[var(--shell)] text-[var(--txt1)] flex flex-col"
      onClick={() => setOpenMenu(null)}
      onKeyDown={(e) => { if (e.key === "Escape") setOpenMenu(null); }}
    >
      {/* Top bar */}
      <div className="h-[52px] bg-[var(--panel)] border-b border-[var(--border)] flex items-center px-7 gap-3 flex-shrink-0">
        <div className="size-7 bg-[var(--accent)] rounded-lg flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="3" width="12" height="10" rx="2" />
            <path d="M5.5 6.5l4 2-4 2V6.5z" fill="white" stroke="none" />
          </svg>
        </div>
        <span className="text-[15px] font-semibold text-[var(--txt1)] tracking-tight">Video Editor</span>
      </div>

      {/* Content */}
      <div className="p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-7">
          <h1 className="text-xl font-semibold text-[var(--txt1)] tracking-tight">Projects</h1>
          <button
            type="button"
            className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            onClick={() => setCreating(true)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
            New Project
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--txt2)] text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map((project, i) => {
              const gradient = THUMB_GRADIENTS[i % THUMB_GRADIENTS.length];
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  className="relative group bg-[var(--panel)] rounded-xl overflow-hidden cursor-pointer border border-[var(--border)] shadow-sm hover:shadow-md hover:border-[var(--accent)]/40 hover:-translate-y-px transition-all duration-200"
                  onClick={() => handleOpen(project.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(project.id); }}
                >
                  <div className={`bg-gradient-to-br ${gradient} aspect-video flex items-center justify-center`}>
                    <div className="size-8 rounded-full bg-white/80 border border-white/50 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-slate-700 translate-x-px">
                        <polygon points="2,1 11,6 2,11" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                  </div>
                  <div className="p-3 border-t border-[var(--border)]">
                    {renamingId === project.id ? (
                      <input
                        autoFocus
                        aria-label="Project name"
                        className="text-sm font-medium bg-[var(--label-bg)] text-[var(--txt1)] rounded px-1 w-full outline-none ring-1 ring-[var(--accent)] border-none"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => handleRename(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(project.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <p className="text-sm font-medium text-[var(--txt1)] truncate">{project.name}</p>
                    )}
                    <p className="text-xs text-[var(--txt2)] mt-0.5">{formatDate(project.updated_at)}</p>
                  </div>

                  <button
                    type="button"
                    aria-label="Project options"
                    className="absolute top-2 right-2 size-6 rounded-md bg-white/90 border border-[var(--border-strong)] text-[var(--txt2)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:text-[var(--txt1)] hover:bg-[var(--shell)] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === project.id ? null : project.id);
                    }}
                  >
                    ···
                  </button>

                  {openMenu === project.id && (
                    <div
                      role="menu"
                      className="absolute top-8 right-2 bg-[var(--panel)] border border-[var(--border-strong)] rounded-xl shadow-xl shadow-black/15 z-10 min-w-28 overflow-hidden py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full text-left px-3 py-2 text-xs text-[var(--txt1)] hover:bg-[var(--panel-2)] cursor-pointer"
                        onClick={() => startRename(project.id, project.name)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full text-left px-3 py-2 text-xs text-[#dc2626] hover:bg-red-50 cursor-pointer"
                        onClick={() => handleDelete(project.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {creating ? (
              <div className="bg-[var(--panel)] rounded-xl border border-[var(--border-strong)] p-4 flex flex-col gap-2 justify-center min-h-32">
                <input
                  autoFocus
                  aria-label="Project name"
                  className="text-sm bg-[var(--label-bg)] text-[var(--txt1)] rounded-lg px-2 py-1.5 outline-none ring-1 ring-[var(--accent)] focus:border-[var(--accent)] border border-[var(--border-strong)] w-full"
                  placeholder="Project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 text-xs py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg text-white font-semibold transition-colors cursor-pointer"
                    onClick={handleCreate}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    className="flex-1 text-xs py-1.5 bg-[var(--label-bg)] hover:bg-[var(--hover)] rounded-lg text-[var(--txt2)] transition-colors cursor-pointer"
                    onClick={() => { setCreating(false); setNewName(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="bg-transparent rounded-xl border-2 border-dashed border-black/[0.15] hover:border-[var(--accent)]/60 hover:bg-[rgba(14,165,160,0.04)] flex flex-col items-center justify-center gap-2 cursor-pointer min-h-32 transition-all group"
                onClick={() => setCreating(true)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCreating(true); }}
              >
                <div className="size-8 rounded-full border border-black/20 group-hover:border-[var(--accent)]/60 flex items-center justify-center transition-colors">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-[var(--txt2)] group-hover:text-[var(--accent)] transition-colors">
                    <path d="M7 1v12M1 7h12"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[var(--txt2)] group-hover:text-[var(--accent)] transition-colors">New Project</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}
