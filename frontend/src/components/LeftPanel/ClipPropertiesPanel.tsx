import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProjectStore } from "../../store/useProjectStore";
import * as api from "../../lib/api";
import type { Clip } from "../../types/project";
import CaptionStyleEditor from "./CaptionStyleEditor";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-4 space-y-3">
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-teal-600 h-1"
      />
    </div>
  );
}

// Module-level map so in-flight job IDs survive component unmount/remount
const _pendingJobs = new Map<string, string>(); // clipId → jobId
const _pendingReframeJobs = new Map<string, string>(); // clipId → jobId
const _reframeProcessingStatus = new Map<string, "processing" | "done" | "error">(); // clipId → status

function EyeContactToggle({ clip }: { clip: Clip }) {
  const { setClipEyeContact, setClipEyeContactFileId, setEyeContactStatus, eyeContactStatus } =
    useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.eyeContact && clip.eyeContactFileId && !eyeContactStatus[clip.id]) {
      setEyeContactStatus(clip.id, "done");
    }
    // Re-attach to an in-flight job if user navigated away and back
    const pendingJobId = _pendingJobs.get(clip.id);
    if (pendingJobId && eyeContactStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => { mountedRef.current = false; };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = eyeContactStatus[clip.id];
  const isProcessing = status === "processing";
  const isOn = !!clip.eyeContact && (status === "done" || (!!clip.eyeContactFileId && status !== "error"));

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    const maxPolls = 900; // 30 minutes at 2s intervals
    try {
      while (mountedRef.current && polls < maxPolls) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getEyeContactStatus(jobId);
        console.log("[eye-contact] poll", polls, s);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.correctedFileId) {
          _pendingJobs.delete(clipId);
          setClipEyeContactFileId(clipId, s.correctedFileId);
          setEyeContactStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Eye contact correction done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      if (polls >= maxPolls) throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        console.error("[eye-contact] error", msg);
        _pendingJobs.delete(clipId);
        setClipEyeContact(clipId, false);
        setEyeContactStatus(clipId, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.eyeContact;
    setClipEyeContact(clip.id, enabling);
    if (!enabling) {
      setEyeContactStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      return;
    }
    if (clip.eyeContactFileId) {
      setEyeContactStatus(clip.id, "done");
      return;
    }
    setEyeContactStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const { jobId } = await api.startEyeContactJob(clip.fileId).catch((e) => {
      setClipEyeContact(clip.id, false);
      setEyeContactStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    console.log("[eye-contact] job started", jobId);
    _pendingJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Eye Contact</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle eye contact correction"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              isOn ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">
            {pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}
          </p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <p className="text-[11px] text-slate-400">AI gaze correction</p>
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
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
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

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.reframe;
    if (!enabling) {
      const pendingJobId = _pendingReframeJobs.get(clip.id);
      if (processingStatus === "processing" && pendingJobId) {
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
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Smart Reframe</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle smart reframe"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              isOn ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">
            {pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}
          </p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <p className="text-[11px] text-slate-400">Switches project to 9:16</p>
      )}

      {processingStatus === "done" && (
        <button
          onClick={handleToggle}
          className="text-[10px] text-slate-400 underline hover:text-slate-600 transition-colors"
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
          <label className="text-xs text-slate-400 block mb-1">Text</label>
          <textarea
            value={overlay.text}
            onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded p-2 resize-none outline-none focus:ring-1 focus:ring-teal-500"
            rows={3}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Font Size — {overlay.fontSize}px
          </label>
          <input type="range" min={12} max={120} step={2} value={overlay.fontSize}
            onChange={(e) => updateTextOverlay(overlay.id, { fontSize: parseInt(e.target.value) })}
            className="w-full accent-teal-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Color</label>
          <input type="color" value={overlay.color}
            onChange={(e) => updateTextOverlay(overlay.id, { color: e.target.value })}
            className="w-full h-8 rounded border border-slate-200 cursor-pointer" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Weight</label>
          <div className="flex gap-2">
            {(["normal", "bold"] as const).map((w) => (
              <button key={w} onClick={() => updateTextOverlay(overlay.id, { fontWeight: w })}
                className={`flex-1 py-1 rounded text-xs border transition-colors
                  ${overlay.fontWeight === w ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Position X — {overlay.x.toFixed(0)}%</label>
          <input type="range" min={0} max={100} value={overlay.x}
            onChange={(e) => updateTextOverlay(overlay.id, { x: parseInt(e.target.value) })}
            className="w-full accent-teal-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Position Y — {overlay.y.toFixed(0)}%</label>
          <input type="range" min={0} max={100} value={overlay.y}
            onChange={(e) => updateTextOverlay(overlay.id, { y: parseInt(e.target.value) })}
            className="w-full accent-teal-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Duration — {(overlay.endTime - overlay.startTime).toFixed(1)}s
          </label>
          <input type="range" min={0.5} max={30} step={0.5} value={overlay.endTime - overlay.startTime}
            onChange={(e) => updateTextOverlay(overlay.id, { endTime: overlay.startTime + parseFloat(e.target.value) })}
            className="w-full accent-teal-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Background</label>
          <div className="flex gap-2">
            <button onClick={() => updateTextOverlay(overlay.id, { background: "transparent" })}
              className={`flex-1 py-1 rounded text-xs border transition-colors
                ${overlay.background === "transparent" ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              None
            </button>
            <input type="color" value={overlay.background === "transparent" ? "#000000" : overlay.background}
              onChange={(e) => updateTextOverlay(overlay.id, { background: e.target.value })}
              className="flex-1 h-8 rounded border border-slate-200 cursor-pointer" title="Background color" />
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
        <p className="text-xs text-slate-400 text-center">Select a clip, caption, or text overlay to edit its properties</p>
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
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-700 truncate">{clipFile?.originalName ?? "Clip"}</p>
        <p className="text-[11px] text-slate-400">{clip.duration.toFixed(2)}s</p>
      </div>

      {/* Playback */}
      <Section title="Playback">
        <div>
          <span className="text-xs text-slate-600 block mb-1.5">Speed</span>
          <div className="flex flex-wrap gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setClipSpeed(clip.id, s)}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors
                  ${speed === s
                    ? "bg-teal-600 text-white border-teal-600"
                    : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"}`}
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
        />
        <SliderRow
          label="Fade out"
          value={fadeOut}
          min={0} max={Math.min(3, clip.duration / 2)} step={0.1}
          onChange={(v) => setClipFade(clip.id, fadeIn, v)}
          format={(v) => v === 0 ? "Off" : `${v.toFixed(1)}s`}
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
        />
        <SliderRow
          label="Contrast"
          value={contrast}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipAdjustment(clip.id, "contrast", v)}
          format={(v) => v === 1 ? "Default" : v < 1 ? `-${Math.round((1 - v) * 100)}%` : `+${Math.round((v - 1) * 100)}%`}
        />
        <SliderRow
          label="Saturation"
          value={saturation}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipAdjustment(clip.id, "saturation", v)}
          format={(v) => v === 1 ? "Default" : v === 0 ? "B&W" : v < 1 ? `-${Math.round((1 - v) * 100)}%` : `+${Math.round((v - 1) * 100)}%`}
        />
        {(brightness !== 1 || contrast !== 1 || saturation !== 1) && (
          <button
            onClick={() => {
              setClipAdjustment(clip.id, "brightness", 1);
              setClipAdjustment(clip.id, "contrast", 1);
              setClipAdjustment(clip.id, "saturation", 1);
            }}
            className="text-[11px] text-slate-400 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            Reset adjustments
          </button>
        )}
      </Section>

      {/* Transform */}
      <Section title="Transform">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">X offset</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{tx.toFixed(1)}%</span>
          </div>
          <input
            type="range" min={-200} max={200} step={1} value={tx}
            onChange={(e) => setClipTransform(clip.id, { x: parseFloat(e.target.value) })}
            className="w-full accent-teal-600 h-1"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Y offset</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{ty.toFixed(1)}%</span>
          </div>
          <input
            type="range" min={-200} max={200} step={1} value={ty}
            onChange={(e) => setClipTransform(clip.id, { y: parseFloat(e.target.value) })}
            className="w-full accent-teal-600 h-1"
          />
        </div>
        {tScale === 1 && (tx !== 0 || ty !== 0) && (
          <p className="text-[10px] text-amber-500">Increase scale to pan — translation has no effect at 100%</p>
        )}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Scale</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(tScale * 100)}%</span>
          </div>
          <input
            type="range" min={100} max={500} step={1} value={Math.round(tScale * 100)}
            onChange={(e) => setClipTransform(clip.id, { scale: parseInt(e.target.value) / 100 })}
            className="w-full accent-teal-600 h-1"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Rotation</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{tRotation.toFixed(1)}°</span>
          </div>
          <input
            type="range" min={-180} max={180} step={1} value={tRotation}
            onChange={(e) => setClipTransform(clip.id, { rotation: parseFloat(e.target.value) })}
            className="w-full accent-teal-600 h-1"
          />
        </div>
        {hasTransform && (
          <button
            onClick={() => setClipTransform(clip.id, { x: 0, y: 0, scale: 1, rotation: 0 })}
            className="text-[11px] text-slate-400 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            Reset transform
          </button>
        )}
      </Section>

      {/* Effects */}
      <div className="px-3 py-3 space-y-2">
        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Effects</p>
        <EyeContactToggle clip={clip} />
        <SmartReframeToggle clip={clip} />
      </div>
    </div>
  );
}
