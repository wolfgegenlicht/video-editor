import { useRef, useState, useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { startExportJob, getExportStatus, downloadExport, type ExportOptions } from "../../lib/api";

type DialogState = "idle" | "submitting" | "exporting" | "done" | "error";
type SpeedLabel = "Fast" | "Balanced" | "Small";

const SPEED_PRESETS: Record<SpeedLabel, string> = {
  Fast: "ultrafast",
  Balanced: "medium",
  Small: "slow",
};

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const { project, previewWidth } = useProjectStore();

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
    await document.fonts.ready;
    // Wrapping is handled by libass (the same engine the preview uses), so we no
    // longer send browser-measured line breaks — that kept preview and export in sync.
    const options: ExportOptions = {
      resolution,
      burn_captions: burnCaptions,
      preset: SPEED_PRESETS[speed],
      preview_width: previewWidth,
    };
    setDialogState("submitting");
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
      <div className="bg-[var(--panel)] rounded-xl shadow-xl p-6 w-96 relative border border-[var(--border-strong)]">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--txt2)] hover:text-[var(--txt1)] text-lg leading-none cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-sm font-semibold text-[var(--txt1)] mb-4">Export Video</h2>

        {dialogState === "idle" && (
          <div className="space-y-4">
            {/* Resolution */}
            <div>
              <label htmlFor="export-resolution" className="block text-xs text-[var(--txt2)] mb-1">Resolution</label>
              <select
                id="export-resolution"
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value) as 1080 | 720 | 480)}
                className="w-full text-xs border border-[var(--border-strong)] rounded px-2 py-1.5 bg-[var(--label-bg)] text-[var(--txt1)]"
              >
                <option value={1080}>1080p (Full HD)</option>
                <option value={720}>720p (HD)</option>
                <option value={480}>480p (SD)</option>
              </select>
            </div>

            {/* Burn captions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--txt2)]">Burn captions into video</span>
              <button
                type="button"
                aria-label="Toggle burn captions"
                onClick={() => setBurnCaptions((v) => !v)}
                disabled={project.captions.length === 0}
                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 ${
                  burnCaptions ? "bg-[var(--accent)]" : "bg-black/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-4 bg-white rounded-full shadow transition-transform ${
                    burnCaptions ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Encoding speed */}
            <div>
              <p className="block text-xs text-[var(--txt2)] mb-1">Encoding speed</p>
              <div className="flex rounded overflow-hidden border border-[var(--border-strong)]">
                {(["Fast", "Balanced", "Small"] as SpeedLabel[]).map((label) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => setSpeed(label)}
                    className={`flex-1 text-xs py-1 cursor-pointer transition-colors ${
                      speed === label
                        ? "bg-[var(--accent)] text-white font-semibold"
                        : "bg-[var(--label-bg)] text-[var(--txt2)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--txt2)] mt-1">
                {speed === "Fast" && "Fastest encode, larger file"}
                {speed === "Balanced" && "Good balance of speed and size"}
                {speed === "Small" && "Smallest file, slowest encode"}
              </p>
            </div>

            {/* Filename */}
            <div>
              <label htmlFor="export-filename" className="block text-xs text-[var(--txt2)] mb-1">Filename</label>
              <div className="flex items-center border border-[var(--border-strong)] rounded overflow-hidden">
                <input
                  id="export-filename"
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 outline-none bg-[var(--label-bg)] text-[var(--txt1)]"
                />
                <span className="text-xs text-[var(--txt2)] px-2 bg-[var(--panel)] border-l border-[var(--border-strong)] py-1.5">.mp4</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="w-full py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-semibold cursor-pointer transition-colors mt-2"
            >
              Export
            </button>
          </div>
        )}

        {dialogState === "submitting" && (
          <div className="py-4 text-center space-y-3">
            <div className="size-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-[var(--txt2)]">Starting export…</p>
          </div>
        )}

        {dialogState === "exporting" && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--txt2)]">Exporting your video…</p>
            <div className="w-full bg-[var(--label-bg)] rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-[var(--accent)] rounded-full transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--txt2)] text-center">{Math.round(progress * 100)}%</p>
            <button
              type="button"
              onClick={handleAbandon}
              className="w-full py-1.5 text-xs text-[var(--txt2)] border border-[var(--border-strong)] rounded-lg hover:bg-[var(--hover)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {dialogState === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-2xl">✓</p>
            <p className="text-xs text-[var(--txt1)] font-medium">Export complete!</p>
            <p className="text-xs text-[var(--txt2)]">Your file downloaded automatically.</p>
            <button
              type="button"
              onClick={() => jobId && downloadExport(jobId, exportedFilename)}
              className="w-full py-1.5 text-xs text-[var(--txt2)] border border-[var(--border-strong)] rounded-lg hover:bg-[var(--hover)] cursor-pointer"
            >
              Download again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg cursor-pointer font-semibold"
            >
              Close
            </button>
          </div>
        )}

        {dialogState === "error" && (
          <div className="space-y-4">
            <p className="text-xs text-red-600 font-medium">Export failed</p>
            <p className="text-xs text-[var(--txt2)] break-words">{error}</p>
            <button
              type="button"
              onClick={() => { setDialogState("idle"); setError(null); }}
              className="w-full py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg cursor-pointer font-semibold"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
