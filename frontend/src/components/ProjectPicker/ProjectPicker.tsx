import { useState, useEffect } from "react";
import { listProjects, createProject, loadProject, renameProject, deleteProject } from "../../lib/api";
import { useProjectStore } from "../../store/useProjectStore";
import type { ProjectSummary } from "../../lib/api";

const THUMB_GRADIENTS = [
  "from-teal-400 to-emerald-500",
  "from-violet-400 to-indigo-500",
  "from-amber-400 to-orange-500",
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
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col"
      onClick={() => setOpenMenu(null)}
    >
      {/* Top bar */}
      <div className="h-[52px] bg-white border-b border-slate-200 flex items-center px-7 gap-3 flex-shrink-0">
        <div className="w-7 h-7 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="3" width="12" height="10" rx="2" />
            <path d="M5.5 6.5l4 2-4 2V6.5z" fill="white" stroke="none" />
          </svg>
        </div>
        <span className="text-[15px] font-bold text-slate-900 tracking-tight">Video Editor</span>
      </div>

      {/* Content */}
      <div className="p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-7">
          <h1 className="text-[18px] font-bold text-slate-900 tracking-tight">Projects</h1>
          <button
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            onClick={() => setCreating(true)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
            New Project
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map((project, i) => {
              const gradient = THUMB_GRADIENTS[i % THUMB_GRADIENTS.length];
              return (
                <div
                  key={project.id}
                  className="relative group bg-white rounded-xl overflow-hidden cursor-pointer border border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-px transition-all"
                  onClick={() => handleOpen(project.id)}
                >
                  <div className={`bg-gradient-to-br ${gradient} aspect-video flex items-center justify-center`}>
                    <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-slate-600 translate-x-px">
                        <polygon points="2,1 11,6 2,11" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                  </div>
                  <div className="p-3">
                    {renamingId === project.id ? (
                      <input
                        autoFocus
                        className="text-sm font-semibold bg-slate-100 text-slate-900 rounded px-1 w-full outline-none ring-1 ring-teal-500"
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
                      <p className="text-sm font-semibold text-slate-900 truncate">{project.name}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(project.updated_at)}</p>
                  </div>

                  <button
                    className="absolute top-2 right-2 w-6 h-6 rounded-md bg-white/85 border border-slate-200 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-white cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === project.id ? null : project.id);
                    }}
                  >
                    ···
                  </button>

                  {openMenu === project.id && (
                    <div
                      className="absolute top-8 right-2 bg-white border border-slate-200 rounded-lg shadow-xl z-10 min-w-28 overflow-hidden py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                        onClick={() => startRename(project.id, project.name)}
                      >
                        Rename
                      </button>
                      <button
                        className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
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
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2 justify-center min-h-32">
                <input
                  autoFocus
                  className="text-sm bg-slate-50 text-slate-900 rounded-lg px-2 py-1.5 outline-none ring-1 ring-teal-500 border border-slate-200 w-full"
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
                    className="flex-1 text-xs py-1.5 bg-teal-600 hover:bg-teal-700 rounded-lg text-white font-semibold transition-colors cursor-pointer"
                    onClick={handleCreate}
                  >
                    Create
                  </button>
                  <button
                    className="flex-1 text-xs py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
                    onClick={() => { setCreating(false); setNewName(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="bg-transparent rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-32 transition-all group"
                onClick={() => setCreating(true)}
              >
                <div className="w-8 h-8 rounded-full border-2 border-slate-300 group-hover:border-teal-500 flex items-center justify-center transition-colors">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400 group-hover:text-teal-500 transition-colors">
                    <path d="M7 1v12M1 7h12"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-400 group-hover:text-teal-600 transition-colors">New Project</span>
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
