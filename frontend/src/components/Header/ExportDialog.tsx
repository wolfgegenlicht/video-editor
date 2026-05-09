import { useRef, useState, useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { startExportJob, getExportStatus, downloadExport, type ExportOptions } from "../../lib/api";

type DialogState = "idle" | "exporting" | "done" | "error";
type SpeedLabel = "Fast" | "Balanced" | "Small";

const SPEED_PRESETS: Record<SpeedLabel, string> = {
  Fast: "ultrafast",
  Balanced: "medium",
  Small: "slow",
};

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const { project } = useProjectStore();

  const [dialogState, setDialogState] = useState<DialogState>("idle");
  const [resolution, setResolution] = useState<1080 | 720 | 480>(1080);
  const [burnCaptions, setBurnCaptions] = useState(project.captions.length > 0);
  const [speed, setSpeed] = useState<SpeedLabel>("Fast");
  const [filename, setFilename] = useState(project.name || "export");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [exportedFilename, setExportedFilename] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleExport() {
    const safeName = filename.replace(/\.mp4$/i, "").trim() || "export";
    const finalFilename = `${safeName}.mp4`;
    const options: ExportOptions = {
      resolution,
      burn_captions: burnCaptions,
      preset: SPEED_PRESETS[speed],
    };
    try {
      const { jobId: id } = await startExportJob(project, options, finalFilename);
      setJobId(id);
      setExportedFilename(finalFilename);
      setDialogState("exporting");
      setProgress(0);

      pollRef.current = setInterval(async () => {
        try {
          const status = await getExportStatus(id);
          setProgress(status.progress);
          if (status.status === "done") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setDialogState("done");
            downloadExport(id, finalFilename).catch(console.error);
          } else if (status.status === "error") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setError(status.error ?? "Unknown error");
            setDialogState("error");
          }
        } catch {
          // network blip — keep polling
        }
      }, 2000);
    } catch (e) {
      setError(String(e));
      setDialogState("error");
    }
  }

  function handleAbandon() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setDialogState("idle");
    setProgress(0);
    setJobId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-96 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-lg leading-none cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-sm font-semibold text-slate-800 mb-4">Export Video</h2>

        {dialogState === "idle" && (
          <div className="space-y-4">
            {/* Resolution */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value) as 1080 | 720 | 480)}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-slate-50 text-slate-700"
              >
                <option value={1080}>1080p (Full HD)</option>
                <option value={720}>720p (HD)</option>
                <option value={480}>480p (SD)</option>
              </select>
            </div>

            {/* Burn captions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Burn captions into video</span>
              <button
                onClick={() => setBurnCaptions((v) => !v)}
                disabled={project.captions.length === 0}
                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 ${
                  burnCaptions ? "bg-teal-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    burnCaptions ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Encoding speed */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Encoding speed</label>
              <div className="flex rounded overflow-hidden border border-slate-200">
                {(["Fast", "Balanced", "Small"] as SpeedLabel[]).map((label) => (
                  <button
                    key={label}
                    onClick={() => setSpeed(label)}
                    className={`flex-1 text-xs py-1 cursor-pointer transition-colors ${
                      speed === label
                        ? "bg-teal-600 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {speed === "Fast" && "Fastest encode, larger file"}
                {speed === "Balanced" && "Good balance of speed and size"}
                {speed === "Small" && "Smallest file, slowest encode"}
              </p>
            </div>

            {/* Filename */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Filename</label>
              <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 outline-none bg-slate-50 text-slate-700"
                />
                <span className="text-xs text-slate-400 px-2 bg-slate-100 border-l border-slate-200 py-1.5">.mp4</span>
              </div>
            </div>

            <button
              onClick={handleExport}
              className="w-full py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold cursor-pointer transition-colors mt-2"
            >
              Export
            </button>
          </div>
        )}

        {dialogState === "exporting" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">Exporting your video…</p>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center">{Math.round(progress * 100)}%</p>
            <button
              onClick={handleAbandon}
              className="w-full py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {dialogState === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-2xl">✓</p>
            <p className="text-xs text-slate-700 font-medium">Export complete!</p>
            <p className="text-xs text-slate-400">Your file downloaded automatically.</p>
            <button
              onClick={() => jobId && downloadExport(jobId, exportedFilename)}
              className="w-full py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Download again
            </button>
            <button
              onClick={onClose}
              className="w-full py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 cursor-pointer font-semibold"
            >
              Close
            </button>
          </div>
        )}

        {dialogState === "error" && (
          <div className="space-y-4">
            <p className="text-xs text-red-600 font-medium">Export failed</p>
            <p className="text-xs text-slate-500 break-words">{error}</p>
            <button
              onClick={() => { setDialogState("idle"); setError(null); }}
              className="w-full py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 cursor-pointer font-semibold"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
