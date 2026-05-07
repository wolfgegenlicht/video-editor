import { useState, useEffect } from "react";
import { listProjects, createProject, loadProject, renameProject, deleteProject } from "../../lib/api";
import { useProjectStore } from "../../store/useProjectStore";
import type { ProjectSummary } from "../../lib/api";

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
      className="min-h-screen bg-gray-900 text-white flex flex-col"
      onClick={() => setOpenMenu(null)}
    >
      <div className="p-8 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-semibold mb-8 text-gray-100">Projects</h1>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="relative group bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-gray-700 hover:border-gray-500 transition-colors"
                onClick={() => handleOpen(project.id)}
              >
                <div className="bg-gray-700 aspect-video flex items-center justify-center">
                  <span className="text-gray-500 text-lg">▶</span>
                </div>
                <div className="p-3">
                  {renamingId === project.id ? (
                    <input
                      autoFocus
                      className="text-sm font-medium bg-gray-700 text-white rounded px-1 w-full outline-none ring-1 ring-blue-400"
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
                    <p className="text-sm font-medium text-gray-100 truncate">{project.name}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{formatDate(project.updated_at)}</p>
                </div>

                <button
                  className="absolute top-2 right-2 w-6 h-6 rounded bg-black/60 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-black/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === project.id ? null : project.id);
                  }}
                >
                  ⋯
                </button>

                {openMenu === project.id && (
                  <div
                    className="absolute top-8 right-2 bg-gray-800 border border-gray-600 rounded shadow-xl z-10 min-w-28 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="block w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700"
                      onClick={() => startRename(project.id, project.name)}
                    >
                      Rename
                    </button>
                    <button
                      className="block w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-gray-700"
                      onClick={() => handleDelete(project.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}

            {creating ? (
              <div className="bg-gray-800 rounded-lg border border-dashed border-gray-600 p-4 flex flex-col gap-2 justify-center min-h-32">
                <input
                  autoFocus
                  className="text-sm bg-gray-700 text-white rounded px-2 py-1 outline-none ring-1 ring-blue-400 w-full"
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
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                    onClick={handleCreate}
                  >
                    Create
                  </button>
                  <button
                    className="flex-1 text-xs py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                    onClick={() => { setCreating(false); setNewName(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-500 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-32 hover:bg-gray-800 transition-all"
                onClick={() => setCreating(true)}
              >
                <span className="text-2xl text-gray-600">+</span>
                <span className="text-xs text-gray-500">New Project</span>
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
