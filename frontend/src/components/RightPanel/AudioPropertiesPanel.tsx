import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProjectStore } from "../../store/useProjectStore";
import * as api from "../../lib/api";
import type { AudioEnhanceType, Clip } from "../../types/project";
import { SPEEDS, Section, SliderRow } from "../properties-helpers";

const ENHANCE_LABELS: Record<AudioEnhanceType, string> = {
  normalize: "Normalize",
  denoise: "Remove Noise",
  clarity: "Voice Clarity",
};

const ENHANCE_DESCRIPTIONS: Record<AudioEnhanceType, string> = {
  normalize: "Levels out volume peaks and valleys",
  denoise: "Reduces background noise and hiss",
  clarity: "Enhances speech intelligibility",
};

function EnhanceIcon({ type }: { type: AudioEnhanceType }) {
  if (type === "normalize") return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,9 4,5 7,7 10,2 12,4" /><line x1="1" y1="12" x2="12" y2="12" />
    </svg>
  );
  if (type === "denoise") return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 1v11M4 3.5v6M9 3.5v6M1.5 5.5v2M11.5 5.5v2M2.5 4.5v4M10.5 4.5v4" />
    </svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="2.5" />
      <line x1="6.5" y1="1" x2="6.5" y2="2.5" /><line x1="6.5" y1="10.5" x2="6.5" y2="12" />
      <line x1="1" y1="6.5" x2="2.5" y2="6.5" /><line x1="10.5" y1="6.5" x2="12" y2="6.5" />
      <line x1="2.7" y1="2.7" x2="3.8" y2="3.8" /><line x1="9.2" y1="9.2" x2="10.3" y2="10.3" />
      <line x1="10.3" y1="2.7" x2="9.2" y2="3.8" /><line x1="3.8" y1="9.2" x2="2.7" y2="10.3" />
    </svg>
  );
}

// Module-level map so in-flight job IDs survive component unmount/remount
const _pendingJobs = new Map<string, string>(); // clipId → jobId

function AudioEnhanceSection({ clip }: { clip: Clip }) {
  const { setClipAudioEnhance, setAudioEnhanceStatus, audioEnhanceStatus } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);

  const activeType = clip.audioEnhanceType as AudioEnhanceType | undefined;
  const status = audioEnhanceStatus[clip.id];
  const isProcessing = status === "processing";

  useEffect(() => {
    mountedRef.current = true;
    if (activeType && clip.audioEnhanceEnabled && clip.audioEnhanceFileId && !audioEnhanceStatus[clip.id]) {
      setAudioEnhanceStatus(clip.id, "done");
    }
    // Re-attach to an in-flight job if user navigated away and back
    const pendingJobId = _pendingJobs.get(clip.id);
    if (pendingJobId && audioEnhanceStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId, activeType!);
    }
    return () => { mountedRef.current = false; };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pollJob(clipId: string, jobId: string, type: AudioEnhanceType) {
    let polls = 0;
    const maxPolls = 900; // 30 minutes at 2s intervals
    try {
      while (mountedRef.current && polls < maxPolls) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getAudioEnhanceStatus(jobId);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.enhancedFileId) {
          _pendingJobs.delete(clipId);
          setClipAudioEnhance(clipId, type, true, s.enhancedFileId);
          setAudioEnhanceStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success(`${ENHANCE_LABELS[type]} complete`);
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      if (polls >= maxPolls) throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        _pendingJobs.delete(clipId);
        setAudioEnhanceStatus(clipId, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function startJob(type: AudioEnhanceType) {
    setErrorMsg(null);
    setAudioEnhanceStatus(clip.id, "processing");
    setClipAudioEnhance(clip.id, type, true);
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const result = await api.startAudioEnhanceJob(clip.fileId, type).catch((e) => {
      setAudioEnhanceStatus(clip.id, "error");
      setClipAudioEnhance(clip.id, type, false);
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!result.jobId) return;
    _pendingJobs.set(clip.id, result.jobId);
    pollJob(clip.id, result.jobId, type);
  }

  async function handleCancel() {
    const jobId = _pendingJobs.get(clip.id);
    if (jobId) {
      await api.cancelAudioEnhanceJob(jobId).catch(() => {});
      _pendingJobs.delete(clip.id);
    }
    setAudioEnhanceStatus(clip.id, undefined);
    if (activeType) setClipAudioEnhance(clip.id, activeType, false);
    setProgress(0);
    setEta(null);
    setErrorMsg(null);
  }

  async function handleReprocess() {
    if (isProcessing || !activeType) return;
    setErrorMsg(null);
    setClipAudioEnhance(clip.id, activeType, false, null);
    await startJob(activeType);
  }

  function handleToggleOff() {
    if (!activeType) return;
    setClipAudioEnhance(clip.id, activeType, false);
    setAudioEnhanceStatus(clip.id, undefined);
  }

  function handleToggleOn() {
    if (!activeType) return;
    if (clip.audioEnhanceFileId) {
      setClipAudioEnhance(clip.id, activeType, true);
      setAudioEnhanceStatus(clip.id, "done");
    } else {
      startJob(activeType);
    }
  }

  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  // Idle state — no active enhance type
  if (!activeType || status === undefined) {
    return (
      <div className="space-y-2">
        {(["normalize", "denoise", "clarity"] as AudioEnhanceType[]).map((type) => (
          <button
            key={type}
            onClick={() => startJob(type)}
            className="flex items-start gap-2 w-full px-3 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
          >
            <span className="mt-0.5 flex-shrink-0"><EnhanceIcon type={type} /></span>
            <span>
              <span className="block font-medium">{ENHANCE_LABELS[type]}</span>
              <span className="block text-[10px] text-slate-400 leading-snug mt-0.5">{ENHANCE_DESCRIPTIONS[type]}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Processing state — show progress card + other two type buttons to allow switching
  if (isProcessing) {
    const otherProcessingTypes = (["normalize", "denoise", "clarity"] as AudioEnhanceType[]).filter(
      (t) => t !== activeType
    );
    return (
      <div className="space-y-2">
        <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">{ENHANCE_LABELS[activeType]}</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Processing…</span>
            <button
              onClick={handleCancel}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        {otherProcessingTypes.map((type) => (
          <button
            key={type}
            onClick={async () => { await handleCancel(); startJob(type); }}
            className="flex items-start gap-2 w-full px-3 py-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
          >
            <span className="mt-0.5 flex-shrink-0"><EnhanceIcon type={type} /></span>
            <span>
              <span className="block font-medium">{ENHANCE_LABELS[type]}</span>
              <span className="block text-[10px] text-slate-400 leading-snug mt-0.5">{ENHANCE_DESCRIPTIONS[type]}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">{ENHANCE_LABELS[activeType]}</span>
        </div>
        {errorMsg && (
          <p className="text-[10px] text-amber-600 leading-snug">{errorMsg}</p>
        )}
        <button
          onClick={() => {
            setAudioEnhanceStatus(clip.id, undefined);
            setClipAudioEnhance(clip.id, activeType, false);
            setErrorMsg(null);
          }}
          className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Done state — show current card + buttons for the other two types
  const isEnabled = !!clip.audioEnhanceEnabled;
  const otherTypes = (["normalize", "denoise", "clarity"] as AudioEnhanceType[]).filter(
    (t) => t !== activeType
  );
  return (
    <div className="space-y-2">
      <div className="py-2 px-3 rounded-lg bg-teal-50 border border-teal-100 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">{ENHANCE_LABELS[activeType]}</span>
          <button
            onClick={isEnabled ? handleToggleOff : handleToggleOn}
            aria-label={`Toggle ${ENHANCE_LABELS[activeType]}`}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer",
              isEnabled ? "bg-teal-500" : "bg-slate-200",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                isEnabled ? "translate-x-4" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{ENHANCE_DESCRIPTIONS[activeType]}</span>
          <button
            onClick={handleReprocess}
            title="Re-process"
            className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
              <path d="M11 5h2.5V2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Re-process
          </button>
        </div>
      </div>
      {otherTypes.map((type) => (
        <button
          key={type}
          onClick={() => startJob(type)}
          className="flex items-start gap-2 w-full px-3 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
        >
          <span className="mt-0.5 flex-shrink-0"><EnhanceIcon type={type} /></span>
          <span>
            <span className="block font-medium">{ENHANCE_LABELS[type]}</span>
            <span className="block text-[10px] text-slate-400 leading-snug mt-0.5">{ENHANCE_DESCRIPTIONS[type]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function AudioPropertiesPanel() {
  const {
    project,
    files,
    selectedClipId,
    setClipSpeed,
    setClipVolume,
    setClipPan,
    setClipFade,
  } = useProjectStore();

  const clip = selectedClipId
    ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : null;

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-slate-400 text-center">Select an audio clip to edit its properties</p>
      </div>
    );
  }

  const speed = clip.speed ?? 1;
  const volume = clip.volume ?? 1;
  const pan = clip.pan ?? 0;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;

  const clipFile = files.find((f) => f.id === clip.fileId);

  const formatPan = (v: number) =>
    v < -0.05 ? `L ${Math.round(-v * 100)}%` : v > 0.05 ? `R ${Math.round(v * 100)}%` : "Center";

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Clip info */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-700 truncate">{clipFile?.originalName ?? "Audio Clip"}</p>
        <p className="text-[11px] text-slate-400">{clip.duration.toFixed(2)}s</p>
      </div>

      {/* Playback */}
      <Section title="Playback">
        <SliderRow
          label="Volume"
          value={volume}
          min={0} max={2} step={0.05}
          onChange={(v) => setClipVolume(clip.id, v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderRow
          label="Pan"
          value={pan}
          min={-1} max={1} step={0.01}
          onChange={(v) => setClipPan(clip.id, v)}
          format={formatPan}
        />
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

      {/* Enhance */}
      <Section title="Enhance">
        <AudioEnhanceSection clip={clip} />
      </Section>
    </div>
  );
}
