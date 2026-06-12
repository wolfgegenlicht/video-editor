import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProjectStore } from "../../store/useProjectStore";
import * as api from "../../lib/api";
import type { Clip } from "../../types/project";
import CaptionStyleEditor from "./CaptionStyleEditor";
import { SPEEDS, Section, SliderRow } from "../properties-helpers";

const _pendingBlurBgJobs = new Map<string, string>(); // clipId → jobId
const _pendingReframeJobs = new Map<string, string>(); // clipId → jobId
const _reframeProcessingStatus = new Map<string, "processing" | "done" | "error">(); // clipId → status

function BlurBackgroundToggle({ clip }: { clip: Clip }) {
  const {
    setClipBlurBackground, setClipAdjustment,
    setClipBlurBackgroundFileId, setBlurBgStatus, blurBgStatus,
    previewOriginalClipId, setPreviewOriginalClipId,
  } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.blurBackground && clip.blurBackgroundFileId && !blurBgStatus[clip.id]) {
      setBlurBgStatus(clip.id, "done");
    }
    const pendingJobId = _pendingBlurBgJobs.get(clip.id);
    if (pendingJobId && blurBgStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = blurBgStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.blurBackground && (status === "done" || (!!clip.blurBackgroundFileId && status !== "error"));

  async function pollJob(clipId: string, jobId: string) {
    cancelledRef.current = false;
    let polls = 0;
    const maxPolls = 900;
    try {
      while (mountedRef.current && !cancelledRef.current && polls < maxPolls) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current || cancelledRef.current) break;
        polls++;
        const s = await api.getBlurBgStatus(jobId);
        console.log("[blur-bg] poll", polls, s);
        if (s.status === "cancelled") { _pendingBlurBgJobs.delete(clipId); return; }
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.blurredFileId) {
          _pendingBlurBgJobs.delete(clipId);
          setClipBlurBackgroundFileId(clipId, s.blurredFileId);
          setBlurBgStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Background blur done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      if (polls >= maxPolls) throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current && !cancelledRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        console.error("[blur-bg] error", msg);
        _pendingBlurBgJobs.delete(clipId);
        setClipBlurBackground(clipId, false);
        setBlurBgStatus(clipId, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function handleCancel() {
    const jobId = _pendingBlurBgJobs.get(clip.id);
    cancelledRef.current = true;
    _pendingBlurBgJobs.delete(clip.id);
    setClipBlurBackground(clip.id, false);
    setBlurBgStatus(clip.id, undefined);
    setProgress(0);
    setEta(null);
    if (jobId) api.cancelBlurBgJob(jobId).catch(() => {});
  }

  async function startJob() {
    setBlurBgStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.fileId;
    const intensity = clip.blurBackgroundIntensity ?? 25;
    const { jobId } = await api.startBlurBgJob(inputFileId, intensity).catch((e) => {
      setClipBlurBackground(clip.id, false);
      setBlurBgStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    console.log("[blur-bg] job started", jobId);
    _pendingBlurBgJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.blurBackground;
    setClipBlurBackground(clip.id, enabling);
    if (!enabling) {
      setBlurBgStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      if (clip.blurBackgroundFileId) {
        api.deleteBlurBgFile(clip.blurBackgroundFileId).catch(console.error);
        setClipBlurBackgroundFileId(clip.id, null);
      }
      return;
    }
    if (clip.blurBackgroundFileId) {
      setBlurBgStatus(clip.id, "done");
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    if (clip.blurBackgroundFileId) {
      api.deleteBlurBgFile(clip.blurBackgroundFileId).catch(console.error);
      setClipBlurBackgroundFileId(clip.id, null);
    }
    await startJob();
  }

  const intensity = clip.blurBackgroundIntensity ?? 25;
  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  return (
    <div className="py-2 px-3 rounded-lg bg-[var(--label-bg)] border border-[var(--border)] space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--txt1)]">Blur Background</p>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle background blur"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-[var(--accent)]" : "bg-[var(--border-soft)]",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--panel)] shadow transition-transform",
              isOn ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>

      {isOn && (
        <SliderRow
          label="Intensity"
          value={intensity}
          min={1}
          max={100}
          step={1}
          onChange={(v) => setClipAdjustment(clip.id, "blurBackgroundIntensity", v)}
          format={(v) => `${v}`}
        />
      )}

      {isProcessing ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-[var(--border-soft)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <button type="button" onClick={handleCancel} title="Cancel" className="flex-shrink-0 text-[11px] text-[var(--txt2)] hover:text-red-500 transition-colors leading-none cursor-pointer">✕</button>
          </div>
          <p className="text-[11px] text-[var(--txt2)] tabular-nums">
            {pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}
          </p>
        </div>
      ) : errorMsg ? (
        <p className="text-[11px] text-amber-500 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[var(--txt2)]">AI background blur · preview applies to playback</p>
          {isOn && clip.blurBackgroundFileId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show processed" : "Preview original"}
                className={[
                  "text-[11px] transition-colors flex items-center gap-0.5",
                  isComparing ? "text-[var(--accent)] font-medium" : "text-[var(--txt2)] hover:text-[var(--txt1)]",
                ].join(" ")}
              >
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Processed" : "Original"}
              </button>
              <button
                type="button"
                onClick={handleReprocess}
                title="Re-process"
                className="text-[11px] text-[var(--txt2)] hover:text-[var(--txt1)] transition-colors flex items-center gap-0.5"
              >
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
                  <path d="M11 5h2.5V2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Re-process
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SmartReframeToggle({ clip }: { clip: Clip }) {
  const { setClipReframeData, setAspectRatio } = useProjectStore();
  const [processingStatus, setProcessingStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.reframe && clip.reframeData) {
      setProcessingStatus("done");
    }
    // Re-attach to an in-flight job if user navigated away and back
    const pendingJobId = _pendingReframeJobs.get(clip.id);
    if (pendingJobId && _reframeProcessingStatus.get(clip.id) === "processing") {
      setProcessingStatus("processing");
      startedAtRef.current = Date.now();
      pollReframeJob(clip.id, pendingJobId);
    }
    return () => { mountedRef.current = false; };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isProcessing = processingStatus === "processing";
  const isOn = processingStatus === "processing" || processingStatus === "done" || (!!clip.reframe && !!clip.reframeData);

  async function pollReframeJob(clipId: string, jobId: string) {
    let polls = 0;
    const maxPolls = 900; // 30 minutes at 2s intervals
    try {
      while (mountedRef.current && polls < maxPolls) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getReframeStatus(jobId);
        console.log("[smart-reframe] poll", polls, s);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.trackPoints) {
          _pendingReframeJobs.delete(clipId);
          _reframeProcessingStatus.set(clipId, "done");
          setClipReframeData(clipId, { trackPoints: s.trackPoints });
          setProcessingStatus("done");
          setProgress(1);
          setEta(null);
          toast.success("Smart Reframe analysis done");
          return;
        }
        if (s.status === "error") {
          if (s.error === "cancelled") {
            _pendingReframeJobs.delete(clipId);
            _reframeProcessingStatus.delete(clipId);
            if (mountedRef.current) { setProcessingStatus("idle"); setProgress(0); setEta(null); }
            return;
          }
          throw new Error(s.error ?? "Processing failed");
        }
      }
      if (polls >= maxPolls) throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        console.error("[smart-reframe] error", msg);
        _pendingReframeJobs.delete(clipId);
        _reframeProcessingStatus.set(clipId, "error");
        setClipReframeData(clipId, null);
        setProcessingStatus("error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function handleReanalyze() {
    setErrorMsg(null);
    setClipReframeData(clip.id, null);
    setProcessingStatus("processing");
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const { jobId } = await api.startReframeJob(clip.fileId).catch((e) => {
      setProcessingStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    _pendingReframeJobs.set(clip.id, jobId);
    _reframeProcessingStatus.set(clip.id, "processing");
    pollReframeJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.reframe;
    if (!enabling) {
      const pendingJobId = _pendingReframeJobs.get(clip.id);
      if (pendingJobId) {
        api.cancelReframeJob(pendingJobId).catch(() => {}); // fire-and-forget
        _pendingReframeJobs.delete(clip.id);
      }
      _reframeProcessingStatus.delete(clip.id);
      setClipReframeData(clip.id, null);
      setProcessingStatus("idle");
      setProgress(0);
      setEta(null);
      return;
    }
    // Re-analyze if already has data
    if (clip.reframeData) {
      setClipReframeData(clip.id, null);
    }
    setAspectRatio("9:16");
    setProcessingStatus("processing");
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const { jobId } = await api.startReframeJob(clip.fileId).catch((e) => {
      setClipReframeData(clip.id, null);
      setProcessingStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    console.log("[smart-reframe] job started", jobId);
    _pendingReframeJobs.set(clip.id, jobId);
    _reframeProcessingStatus.set(clip.id, "processing");
    pollReframeJob(clip.id, jobId);
  }

  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  return (
    <div className="py-2 px-3 rounded-lg bg-[var(--label-bg)] border border-[var(--border)] space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--txt1)]">Smart Reframe</p>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle smart reframe"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-[var(--accent)]" : "bg-[var(--border-soft)]",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--panel)] shadow transition-transform",
              isOn ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-[var(--border-soft)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-[11px] text-[var(--txt2)] tabular-nums">
            {pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}
          </p>
        </div>
      ) : errorMsg ? (
        <p className="text-[11px] text-amber-500 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <p className="text-[11px] text-[var(--txt2)]">Switches project to 9:16</p>
      )}

      {processingStatus === "done" && (
        <button
          type="button"
          onClick={handleReanalyze}
          className="text-[11px] text-[var(--txt2)] underline hover:text-[var(--txt1)] transition-colors"
        >
          Re-analyze
        </button>
      )}
    </div>
  );
}

export default function ClipPropertiesPanel() {
  const {
    project, files, selectedClipId, selectedOverlayId, selectedCaptionId,
    setClipSpeed, setClipVolume, setClipFade, setClipAdjustment, setClipTransform,
    updateTextOverlay,
  } = useProjectStore();

  if (selectedCaptionId) {
    return <CaptionStyleEditor />;
  }

  const overlay = selectedOverlayId
    ? project.textOverlays.find((o) => o.id === selectedOverlayId)
    : null;

  if (overlay) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <label htmlFor="overlay-text" className="text-xs text-[var(--txt2)] block mb-1">Text</label>
          <textarea
            id="overlay-text"
            value={overlay.text}
            onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
            className="w-full text-sm bg-[var(--label-bg)] border border-[var(--border-strong)] text-[var(--txt1)] rounded p-2 resize-none outline-none focus:ring-1 focus:ring-[var(--accent)]"
            rows={3}
          />
        </div>
        <div>
          <label htmlFor="overlay-font-size" className="text-xs text-[var(--txt2)] block mb-1">
            Font Size: {overlay.fontSize}px
          </label>
          <input id="overlay-font-size" type="range" min={12} max={120} step={2} value={overlay.fontSize}
            aria-label="Font size"
            onChange={(e) => updateTextOverlay(overlay.id, { fontSize: parseInt(e.target.value) })}
            onDoubleClick={() => updateTextOverlay(overlay.id, { fontSize: 32 })}
            className="w-full accent-[var(--accent)]" />
        </div>
        <div>
          <label htmlFor="overlay-color" className="text-xs text-[var(--txt2)] block mb-1">Color</label>
          <input id="overlay-color" type="color" value={overlay.color}
            onChange={(e) => updateTextOverlay(overlay.id, { color: e.target.value })}
            className="w-full h-8 rounded border border-[var(--border-strong)] cursor-pointer" />
        </div>
        <div>
          <p className="text-xs text-[var(--txt2)] mb-1">Weight</p>
          <div className="flex gap-2">
            {(["normal", "bold"] as const).map((w) => (
              <button type="button" key={w} onClick={() => updateTextOverlay(overlay.id, { fontWeight: w })}
                className={`flex-1 py-1 rounded text-xs border transition-colors
                  ${overlay.fontWeight === w ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border-strong)] text-[var(--txt2)] hover:bg-[var(--hover)]"}`}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="overlay-x" className="text-xs text-[var(--txt2)] block mb-1">Position X: {overlay.x.toFixed(0)}%</label>
          <input id="overlay-x" type="range" min={0} max={100} value={overlay.x}
            aria-label="Position X"
            onChange={(e) => updateTextOverlay(overlay.id, { x: parseInt(e.target.value) })}
            onDoubleClick={() => updateTextOverlay(overlay.id, { x: 50 })}
            className="w-full accent-[var(--accent)]" />
        </div>
        <div>
          <label htmlFor="overlay-y" className="text-xs text-[var(--txt2)] block mb-1">Position Y: {overlay.y.toFixed(0)}%</label>
          <input id="overlay-y" type="range" min={0} max={100} value={overlay.y}
            aria-label="Position Y"
            onChange={(e) => updateTextOverlay(overlay.id, { y: parseInt(e.target.value) })}
            onDoubleClick={() => updateTextOverlay(overlay.id, { y: 50 })}
            className="w-full accent-[var(--accent)]" />
        </div>
        <div>
          <label htmlFor="overlay-duration" className="text-xs text-[var(--txt2)] block mb-1">
            Duration: {(overlay.endTime - overlay.startTime).toFixed(1)}s
          </label>
          <input id="overlay-duration" type="range" min={0.5} max={30} step={0.5} value={overlay.endTime - overlay.startTime}
            aria-label="Duration"
            onChange={(e) => updateTextOverlay(overlay.id, { endTime: overlay.startTime + parseFloat(e.target.value) })}
            className="w-full accent-[var(--accent)]" />
        </div>
        <div>
          <p className="text-xs text-[var(--txt2)] mb-1">Background</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => updateTextOverlay(overlay.id, { background: "transparent" })}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${overlay.background === "transparent" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border-strong)] text-[var(--txt2)] hover:bg-[var(--hover)]"}`}>
              None
            </button>
            <input type="color" aria-label="Background color" value={overlay.background === "transparent" ? "#000000" : overlay.background}
              onChange={(e) => updateTextOverlay(overlay.id, { background: e.target.value })}
              className="flex-1 h-8 rounded border border-[var(--border-strong)] cursor-pointer" title="Background color" />
          </div>
        </div>
      </div>
    );
  }

  const clip = selectedClipId
    ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : null;

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-[var(--txt2)] text-center">Select a clip, caption, or text overlay to edit its properties</p>
      </div>
    );
  }

  const speed = clip.speed ?? 1;
  const volume = clip.volume ?? 1;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;
  const brightness = clip.brightness ?? 1;
  const contrast = clip.contrast ?? 1;
  const saturation = clip.saturation ?? 1;

  const tx = clip.transform?.x ?? 0;
  const ty = clip.transform?.y ?? 0;
  const tScale = clip.transform?.scale ?? 1;
  const tRotation = clip.transform?.rotation ?? 0;
  const hasTransform = tx !== 0 || ty !== 0 || tScale !== 1 || tRotation !== 0;

  const clipFile = files.find((f) => f.id === clip.fileId);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Clip info */}
      <div className="px-3 py-2.5 border-b border-[var(--border)]">
        <p className="text-xs font-medium text-[var(--txt1)] truncate">{clipFile?.originalName ?? "Clip"}</p>
        <p className="text-[11px] text-[var(--txt2)]">{clip.duration.toFixed(2)}s</p>
      </div>

      {/* Playback */}
      <Section title="Playback">
        <div>
          <span className="text-xs text-[var(--txt2)] block mb-1.5">Speed</span>
          <div className="flex flex-wrap gap-1">
            {SPEEDS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setClipSpeed(clip.id, s)}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors
                  ${speed === s
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--border-strong)] text-[var(--txt2)] hover:border-black/[0.18] hover:bg-[var(--hover)]"}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <SliderRow
          label="Volume"
          value={volume}
          min={0} max={1} step={0.05}
          onChange={(v) => setClipVolume(clip.id, v)}
          format={(v) => `${Math.round(v * 100)}%`}
          defaultValue={1}
        />
      </Section>

      {/* Transitions */}
      <Section title="Transitions">
        <SliderRow
          label="Fade in"
          value={fadeIn}
          min={0} max={Math.min(3, clip.duration / 2)} step={0.1}
          onChange={(v) => setClipFade(clip.id, v, fadeOut)}
          format={(v) => v === 0 ? "Off" : `${v.toFixed(1)}s`}
          defaultValue={0}
        />
        <SliderRow
          label="Fade out"
          value={fadeOut}
          min={0} max={Math.min(3, clip.duration / 2)} step={0.1}
          onChange={(v) => setClipFade(clip.id, fadeIn, v)}
          format={(v) => v === 0 ? "Off" : `${v.toFixed(1)}s`}
          defaultValue={0}
        />
      </Section>

      {/* Adjustments */}
      <Section title="Adjustments">
        <SliderRow
          label="Brightness"
          value={brightness}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipAdjustment(clip.id, "brightness", v)}
          format={(v) => v === 1 ? "Default" : v < 1 ? `-${Math.round((1 - v) * 100)}%` : `+${Math.round((v - 1) * 100)}%`}
          defaultValue={1}
        />
        <SliderRow
          label="Contrast"
          value={contrast}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipAdjustment(clip.id, "contrast", v)}
          format={(v) => v === 1 ? "Default" : v < 1 ? `-${Math.round((1 - v) * 100)}%` : `+${Math.round((v - 1) * 100)}%`}
          defaultValue={1}
        />
        <SliderRow
          label="Saturation"
          value={saturation}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipAdjustment(clip.id, "saturation", v)}
          format={(v) => v === 1 ? "Default" : v === 0 ? "B&W" : v < 1 ? `-${Math.round((1 - v) * 100)}%` : `+${Math.round((v - 1) * 100)}%`}
          defaultValue={1}
        />
        {(brightness !== 1 || contrast !== 1 || saturation !== 1) && (
          <button
            type="button"
            onClick={() => {
              setClipAdjustment(clip.id, "brightness", 1);
              setClipAdjustment(clip.id, "contrast", 1);
              setClipAdjustment(clip.id, "saturation", 1);
            }}
            className="text-[11px] text-[var(--txt2)] border border-[var(--border-strong)] rounded px-2 py-0.5 hover:bg-[var(--hover)] hover:text-[var(--txt1)] transition-colors"
          >
            Reset adjustments
          </button>
        )}
      </Section>

      {/* Transform */}
      <Section title="Transform">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-[var(--txt2)]">X offset</span>
            <span className="text-[11px] text-[var(--txt2)] tabular-nums">{tx.toFixed(1)}%</span>
          </div>
          <input
            aria-label="X offset"
            type="range" min={-200} max={200} step={1} value={tx}
            onChange={(e) => setClipTransform(clip.id, { x: parseFloat(e.target.value) })}
            onDoubleClick={() => setClipTransform(clip.id, { x: 0 })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-[var(--txt2)]">Y offset</span>
            <span className="text-[11px] text-[var(--txt2)] tabular-nums">{ty.toFixed(1)}%</span>
          </div>
          <input
            aria-label="Y offset"
            type="range" min={-200} max={200} step={1} value={ty}
            onChange={(e) => setClipTransform(clip.id, { y: parseFloat(e.target.value) })}
            onDoubleClick={() => setClipTransform(clip.id, { y: 0 })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
        {tScale === 1 && (tx !== 0 || ty !== 0) && (
          <p className="text-[11px] text-amber-600">Increase scale to pan: translation has no effect at 100%</p>
        )}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-[var(--txt2)]">Scale</span>
            <span className="text-[11px] text-[var(--txt2)] tabular-nums">{Math.round(tScale * 100)}%</span>
          </div>
          <input
            aria-label="Scale"
            type="range" min={100} max={500} step={1} value={Math.round(tScale * 100)}
            onChange={(e) => setClipTransform(clip.id, { scale: parseInt(e.target.value) / 100 })}
            onDoubleClick={() => setClipTransform(clip.id, { scale: 1 })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-[var(--txt2)]">Rotation</span>
            <span className="text-[11px] text-[var(--txt2)] tabular-nums">{tRotation.toFixed(1)}°</span>
          </div>
          <input
            aria-label="Rotation"
            type="range" min={-180} max={180} step={1} value={tRotation}
            onChange={(e) => setClipTransform(clip.id, { rotation: parseFloat(e.target.value) })}
            onDoubleClick={() => setClipTransform(clip.id, { rotation: 0 })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
        {hasTransform && (
          <button
            type="button"
            onClick={() => setClipTransform(clip.id, { x: 0, y: 0, scale: 1, rotation: 0 })}
            className="text-[11px] text-[var(--txt2)] border border-[var(--border-strong)] rounded px-2 py-0.5 hover:bg-[var(--hover)] hover:text-[var(--txt1)] transition-colors"
          >
            Reset transform
          </button>
        )}
      </Section>

      {/* Effects */}
      <div className="px-3 py-3 space-y-2">
        <p className="text-[11px] font-bold text-[var(--txt2)]">Effects</p>
        <BlurBackgroundToggle clip={clip} />
        <SmartReframeToggle clip={clip} />
      </div>
    </div>
  );
}
