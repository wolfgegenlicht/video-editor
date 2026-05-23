import { useRef, useState, useEffect } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { startExportJob, getExportStatus, downloadExport, type ExportOptions } from "../../lib/api";
import type { Caption, CaptionTrackStyle } from "../../types/project";
import { FONT_FAMILY_CSS } from "../../lib/fonts";

type DialogState = "idle" | "submitting" | "exporting" | "done" | "error";
type SpeedLabel = "Fast" | "Balanced" | "Small";

const SPEED_PRESETS: Record<SpeedLabel, string> = {
  Fast: "ultrafast",
  Balanced: "medium",
  Small: "slow",
};

function computeLineBreaks(
  captions: Caption[],
  style: CaptionTrackStyle,
  previewWidth: number,
): Record<string, number[][]> {
  const result: Record<string, number[][]> = {};
  const fontFamily = FONT_FAMILY_CSS[style.fontFamily] ?? style.fontFamily;
  const ls = style.letterSpacing > 0 ? `${style.letterSpacing}px` : "normal";
  const boxW = (style.boxW / 100) * previewWidth;

  for (const cap of captions) {
    if (!cap.words || cap.words.length === 0) continue;

    const container = document.createElement("div");
    container.style.cssText = [
      "position:fixed", "left:-9999px", "top:0",
      `width:${boxW}px`,
      "padding:0 8px",
      "box-sizing:border-box",
      `font-family:${fontFamily}`,
      `font-size:${style.fontSize}px`,
      `font-weight:${style.fontWeight}`,
      "line-height:1.35",
      `letter-spacing:${ls}`,
      "white-space:normal",
      "word-break:break-word",
      "visibility:hidden",
    ].join(";");

    cap.words.forEach((w, i) => {
      const span = document.createElement("span");
      span.dataset.wi = String(i);
      span.textContent = w.text + (i < cap.words!.length - 1 ? " " : "");
      container.appendChild(span);
    });

    document.body.appendChild(container);

    const lineMap = new Map<number, number[]>();
    container.querySelectorAll("span").forEach((el) => {
      const top = Math.round(el.getBoundingClientRect().top);
      const idx = parseInt((el as HTMLElement).dataset.wi!);
      if (!lineMap.has(top)) lineMap.set(top, []);
      lineMap.get(top)!.push(idx);
    });

    document.body.removeChild(container);

    if (lineMap.size > 0) {
      result[cap.id] = Array.from(lineMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, words]) => words);
    }
  }
  return result;
}

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const { project } = useProjectStore();
  const previewWidth = useProjectStore((s) => s.previewWidth);

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
    const captionLineBreaks = burnCaptions
      ? computeLineBreaks(project.captions, project.captionTrackStyle, previewWidth)
      : {};
    const options: ExportOptions = {
      resolution,
      burn_captions: burnCaptions,
      preset: SPEED_PRESETS[speed],
      preview_width: previewWidth,
      caption_line_breaks: captionLineBreaks,
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
      <div className="bg-white rounded-xl shadow-xl p-6 w-96 relative border border-black/10">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6b6b78] hover:text-[#141416] text-lg leading-none cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-sm font-semibold text-[#141416] mb-4">Export Video</h2>

        {dialogState === "idle" && (
          <div className="space-y-4">
            {/* Resolution */}
            <div>
              <label className="block text-xs text-[#6b6b78] mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value) as 1080 | 720 | 480)}
                className="w-full text-xs border border-black/10 rounded px-2 py-1.5 bg-[#f2f2f6] text-[#141416]"
              >
                <option value={1080}>1080p (Full HD)</option>
                <option value={720}>720p (HD)</option>
                <option value={480}>480p (SD)</option>
              </select>
            </div>

            {/* Burn captions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#6b6b78]">Burn captions into video</span>
              <button
                onClick={() => setBurnCaptions((v) => !v)}
                disabled={project.captions.length === 0}
                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 ${
                  burnCaptions ? "bg-[#0ea5a0]" : "bg-black/20"
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
              <label className="block text-xs text-[#6b6b78] mb-1">Encoding speed</label>
              <div className="flex rounded overflow-hidden border border-black/10">
                {(["Fast", "Balanced", "Small"] as SpeedLabel[]).map((label) => (
                  <button
                    key={label}
                    onClick={() => setSpeed(label)}
                    className={`flex-1 text-xs py-1 cursor-pointer transition-colors ${
                      speed === label
                        ? "bg-[#0ea5a0] text-white font-semibold"
                        : "bg-[#f2f2f6] text-[#6b6b78] hover:bg-[#ebebef]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#6b6b78] mt-1">
                {speed === "Fast" && "Fastest encode, larger file"}
                {speed === "Balanced" && "Good balance of speed and size"}
                {speed === "Small" && "Smallest file, slowest encode"}
              </p>
            </div>

            {/* Filename */}
            <div>
              <label className="block text-xs text-[#6b6b78] mb-1">Filename</label>
              <div className="flex items-center border border-black/10 rounded overflow-hidden">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 outline-none bg-[#f2f2f6] text-[#141416]"
                />
                <span className="text-xs text-[#6b6b78] px-2 bg-white border-l border-black/10 py-1.5">.mp4</span>
              </div>
            </div>

            <button
              onClick={handleExport}
              className="w-full py-2 text-xs bg-[#0ea5a0] hover:bg-[#0c9490] text-white rounded-lg font-semibold cursor-pointer transition-colors mt-2"
            >
              Export
            </button>
          </div>
        )}

        {dialogState === "submitting" && (
          <div className="py-4 text-center space-y-3">
            <div className="w-5 h-5 border-2 border-[#0ea5a0] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-[#6b6b78]">Starting export…</p>
          </div>
        )}

        {dialogState === "exporting" && (
          <div className="space-y-4">
            <p className="text-xs text-[#6b6b78]">Exporting your video…</p>
            <div className="w-full bg-[#f2f2f6] rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-[#0ea5a0] rounded-full transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[#6b6b78] text-center">{Math.round(progress * 100)}%</p>
            <button
              onClick={handleAbandon}
              className="w-full py-1.5 text-xs text-[#6b6b78] border border-black/10 rounded-lg hover:bg-[#ebebef] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {dialogState === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-2xl">✓</p>
            <p className="text-xs text-[#141416] font-medium">Export complete!</p>
            <p className="text-xs text-[#6b6b78]">Your file downloaded automatically.</p>
            <button
              onClick={() => jobId && downloadExport(jobId, exportedFilename)}
              className="w-full py-1.5 text-xs text-[#6b6b78] border border-black/10 rounded-lg hover:bg-[#ebebef] cursor-pointer"
            >
              Download again
            </button>
            <button
              onClick={onClose}
              className="w-full py-1.5 text-xs bg-[#0ea5a0] hover:bg-[#0c9490] text-white rounded-lg cursor-pointer font-semibold"
            >
              Close
            </button>
          </div>
        )}

        {dialogState === "error" && (
          <div className="space-y-4">
            <p className="text-xs text-red-600 font-medium">Export failed</p>
            <p className="text-xs text-[#6b6b78] break-words">{error}</p>
            <button
              onClick={() => { setDialogState("idle"); setError(null); }}
              className="w-full py-1.5 text-xs bg-[#0ea5a0] hover:bg-[#0c9490] text-white rounded-lg cursor-pointer font-semibold"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
