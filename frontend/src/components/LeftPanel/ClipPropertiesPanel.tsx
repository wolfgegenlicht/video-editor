import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProjectStore } from "../../store/useProjectStore";
import * as api from "../../lib/api";
import type { Clip } from "../../types/project";
import CaptionStyleEditor from "./CaptionStyleEditor";
import { SPEEDS, Section, SliderRow } from "../properties-helpers";

// Module-level map so in-flight job IDs survive component unmount/remount
const _pendingJobs = new Map<string, string>(); // clipId → jobId
const _pendingBlurBgJobs = new Map<string, string>(); // clipId → jobId
const _pendingFaceRestoreJobs = new Map<string, string>();
const _pendingPortraitRelightJobs = new Map<string, string>();

function EyeContactToggle({ clip }: { clip: Clip }) {
  const { setClipEyeContact, setClipEyeContactFileId, setEyeContactStatus, eyeContactStatus, previewOriginalClipId, setPreviewOriginalClipId } =
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
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = eyeContactStatus[clip.id];
  const isComparing = previewOriginalClipId === clip.id;
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

  async function startJob() {
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
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    setClipEyeContactFileId(clip.id, null);
    await startJob();
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
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI gaze correction</p>
          <div className="flex items-center gap-2">
            {isOn && clip.eyeContactFileId && (
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show corrected" : "Compare with original"}
                className={[
                  "text-[10px] transition-colors flex items-center gap-0.5",
                  isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600",
                ].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Original" : "Compare"}
              </button>
            )}
            {isOn && clip.eyeContactFileId && (
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
                  <path d="M11 5h2.5V2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Re-process
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const startedAtRef = useRef(0);

  const prevEyeContactFileIdRef = useRef(clip.eyeContactFileId);

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

  useEffect(() => {
    const prev = prevEyeContactFileIdRef.current;
    prevEyeContactFileIdRef.current = clip.eyeContactFileId;
    if (prev === clip.eyeContactFileId) return;
    if (!clip.blurBackground || !clip.blurBackgroundFileId) return;
    if (blurBgStatus[clip.id] === "processing") return;
    // Eye contact source changed — stale blur preview, re-process on new source
    api.deleteBlurBgFile(clip.blurBackgroundFileId).catch(console.error);
    setClipBlurBackgroundFileId(clip.id, null);
    startJob();
  }, [clip.eyeContactFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = blurBgStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.blurBackground && (status === "done" || (!!clip.blurBackgroundFileId && status !== "error"));

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    const maxPolls = 900;
    try {
      while (mountedRef.current && polls < maxPolls) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getBlurBgStatus(jobId);
        console.log("[blur-bg] poll", polls, s);
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
      if (mountedRef.current) {
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

  async function startJob() {
    setBlurBgStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.eyeContactFileId ?? clip.fileId;
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
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Blur Background</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle background blur"
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
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI background blur · preview applies to playback</p>
          {isOn && clip.blurBackgroundFileId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show blurred" : "Compare with original"}
                className={[
                  "text-[10px] transition-colors flex items-center gap-0.5",
                  isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600",
                ].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Original" : "Compare"}
              </button>
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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

function FaceRestoreToggle({ clip }: { clip: Clip }) {
  const {
    setClipFaceRestore, setClipFaceRestoreFileId, setClipFaceRestoreStrength,
    setFaceRestoreStatus, faceRestoreStatus,
    previewOriginalClipId, setPreviewOriginalClipId,
  } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevBlurFileIdRef = useRef(clip.blurBackgroundFileId);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.faceRestore && clip.faceRestoreFileId && !faceRestoreStatus[clip.id]) {
      setFaceRestoreStatus(clip.id, "done");
    }
    const pendingJobId = _pendingFaceRestoreJobs.get(clip.id);
    if (pendingJobId && faceRestoreStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevBlurFileIdRef.current;
    prevBlurFileIdRef.current = clip.blurBackgroundFileId;
    if (prev === clip.blurBackgroundFileId) return;
    if (!clip.faceRestore || !clip.faceRestoreFileId) return;
    if (faceRestoreStatus[clip.id] === "processing") return;
    api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
    setClipFaceRestoreFileId(clip.id, null);
    startJob();
  }, [clip.blurBackgroundFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = faceRestoreStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.faceRestore && (status === "done" || (!!clip.faceRestoreFileId && status !== "error"));
  const strength = clip.faceRestoreStrength ?? 0.7;
  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    try {
      while (mountedRef.current && polls < 900) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getFaceRestoreStatus(jobId);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.restoredFileId) {
          _pendingFaceRestoreJobs.delete(clipId);
          setClipFaceRestoreFileId(clipId, s.restoredFileId);
          setFaceRestoreStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Face restore done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        _pendingFaceRestoreJobs.delete(clip.id);
        setClipFaceRestore(clip.id, false);
        setFaceRestoreStatus(clip.id, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function startJob(fidelityWeight = strength) {
    setFaceRestoreStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    setErrorMsg(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId;
    const { jobId } = await api.startFaceRestoreJob(inputFileId, fidelityWeight).catch((e) => {
      setClipFaceRestore(clip.id, false);
      setFaceRestoreStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    _pendingFaceRestoreJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.faceRestore;
    setClipFaceRestore(clip.id, enabling);
    if (!enabling) {
      setFaceRestoreStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      if (clip.faceRestoreFileId) {
        api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
        setClipFaceRestoreFileId(clip.id, null);
      }
      return;
    }
    if (clip.faceRestoreFileId) {
      setFaceRestoreStatus(clip.id, "done");
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    if (clip.faceRestoreFileId) {
      api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
      setClipFaceRestoreFileId(clip.id, null);
    }
    await startJob();
  }

  function handleStrengthChange(value: number) {
    setClipFaceRestoreStrength(clip.id, value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!clip.faceRestore) return;
      if (clip.faceRestoreFileId) {
        api.deleteFaceRestoreFile(clip.faceRestoreFileId).catch(console.error);
        setClipFaceRestoreFileId(clip.id, null);
      }
      await startJob(value);
    }, 800);
  }

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Face Restore</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle face restore"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span className={[
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            isOn ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")} />
        </button>
      </div>

      {isOn && (
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-slate-600">Strength</span>
            <span className="text-[11px] text-slate-400 tabular-nums">{strength.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05} value={strength}
            onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
            disabled={isProcessing}
            className={["w-full accent-teal-500 h-1", isProcessing ? "opacity-40 pointer-events-none" : ""].join(" ")}
          />
        </div>
      )}

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">{pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}</p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI face restoration · removes compression artifacts</p>
          {isOn && clip.faceRestoreFileId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show processed" : "Preview original"}
                className={["text-[10px] transition-colors flex items-center gap-0.5", isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600"].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Processed" : "Original"}
              </button>
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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

const RELIGHT_PRESETS: { key: "front" | "ring" | "window" | "side_key"; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "ring", label: "Ring" },
  { key: "window", label: "Window" },
  { key: "side_key", label: "Side Key" },
];

function PortraitRelightToggle({ clip }: { clip: Clip }) {
  const {
    setClipPortraitRelight, setClipPortraitRelightFileId,
    setClipPortraitRelightPreset, setClipPortraitRelightIntensity,
    setPortraitRelightStatus, portraitRelightStatus,
    previewOriginalClipId, setPreviewOriginalClipId,
  } = useProjectStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevFaceRestoreFileIdRef = useRef(clip.faceRestoreFileId);

  useEffect(() => {
    mountedRef.current = true;
    if (clip.portraitRelight && clip.portraitRelightFileId && !portraitRelightStatus[clip.id]) {
      setPortraitRelightStatus(clip.id, "done");
    }
    const pendingJobId = _pendingPortraitRelightJobs.get(clip.id);
    if (pendingJobId && portraitRelightStatus[clip.id] === "processing") {
      startedAtRef.current = Date.now();
      pollJob(clip.id, pendingJobId);
    }
    return () => {
      mountedRef.current = false;
      setPreviewOriginalClipId(null);
    };
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevFaceRestoreFileIdRef.current;
    prevFaceRestoreFileIdRef.current = clip.faceRestoreFileId;
    if (prev === clip.faceRestoreFileId) return;
    if (!clip.portraitRelight || !clip.portraitRelightFileId) return;
    if (portraitRelightStatus[clip.id] === "processing") return;
    api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
    setClipPortraitRelightFileId(clip.id, null);
    startJob();
  }, [clip.faceRestoreFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = portraitRelightStatus[clip.id];
  const isProcessing = status === "processing";
  const isComparing = previewOriginalClipId === clip.id;
  const isOn = !!clip.portraitRelight && (status === "done" || (!!clip.portraitRelightFileId && status !== "error"));
  const preset = clip.portraitRelightPreset ?? "ring";
  const intensity = clip.portraitRelightIntensity ?? 0.5;
  const pct = Math.round(progress * 100);
  const etaLabel = eta != null && eta > 0 ? ` · ~${eta}s left` : "";

  async function pollJob(clipId: string, jobId: string) {
    let polls = 0;
    try {
      while (mountedRef.current && polls < 900) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (!mountedRef.current) break;
        polls++;
        const s = await api.getPortraitRelightStatus(jobId);
        if (s.progress != null) {
          setProgress(s.progress);
          if (s.progress > 0.05) {
            const elapsed = (Date.now() - startedAtRef.current) / 1000;
            setEta(Math.round(elapsed / s.progress * (1 - s.progress)));
          }
        }
        if (s.status === "done" && s.relitFileId) {
          _pendingPortraitRelightJobs.delete(clipId);
          setClipPortraitRelightFileId(clipId, s.relitFileId);
          setPortraitRelightStatus(clipId, "done");
          setProgress(1);
          setEta(null);
          toast.success("Relight done");
          return;
        }
        if (s.status === "error") throw new Error(s.error ?? "Processing failed");
      }
      throw new Error("Processing timed out after 30 minutes");
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : "Failed";
        _pendingPortraitRelightJobs.delete(clip.id);
        setClipPortraitRelight(clip.id, false);
        setPortraitRelightStatus(clip.id, "error");
        setErrorMsg(msg);
        setProgress(0);
        setEta(null);
      }
    }
  }

  async function startJob(p = preset, i = intensity) {
    setPortraitRelightStatus(clip.id, "processing");
    setProgress(0);
    setEta(null);
    setErrorMsg(null);
    startedAtRef.current = Date.now();
    const inputFileId = clip.faceRestoreFileId ?? clip.blurBackgroundFileId ?? clip.eyeContactFileId ?? clip.fileId;
    const { jobId } = await api.startPortraitRelightJob(inputFileId, p, i).catch((e) => {
      setClipPortraitRelight(clip.id, false);
      setPortraitRelightStatus(clip.id, "error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to start job");
      return { jobId: null as unknown as string };
    });
    if (!jobId) return;
    _pendingPortraitRelightJobs.set(clip.id, jobId);
    pollJob(clip.id, jobId);
  }

  async function handleToggle() {
    if (isProcessing) return;
    setErrorMsg(null);
    const enabling = !clip.portraitRelight;
    setClipPortraitRelight(clip.id, enabling);
    if (!enabling) {
      setPortraitRelightStatus(clip.id, undefined);
      setProgress(0);
      setEta(null);
      if (clip.portraitRelightFileId) {
        api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
        setClipPortraitRelightFileId(clip.id, null);
      }
      return;
    }
    if (clip.portraitRelightFileId) {
      setPortraitRelightStatus(clip.id, "done");
      setProgress(1);
      return;
    }
    await startJob();
  }

  async function handleReprocess() {
    if (isProcessing) return;
    setErrorMsg(null);
    if (clip.portraitRelightFileId) {
      api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
      setClipPortraitRelightFileId(clip.id, null);
    }
    await startJob();
  }

  async function handlePresetChange(p: typeof preset) {
    setClipPortraitRelightPreset(clip.id, p);
    if (!clip.portraitRelight) return;
    if (clip.portraitRelightFileId) {
      api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
      setClipPortraitRelightFileId(clip.id, null);
    }
    await startJob(p, intensity);
  }

  function handleIntensityChange(value: number) {
    setClipPortraitRelightIntensity(clip.id, value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!clip.portraitRelight) return;
      if (clip.portraitRelightFileId) {
        api.deletePortraitRelightFile(clip.portraitRelightFileId).catch(console.error);
        setClipPortraitRelightFileId(clip.id, null);
      }
      await startJob(preset, value);
    }, 800);
  }

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Relight</p>
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          aria-label="Toggle portrait relight"
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-teal-500" : "bg-slate-200",
            isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          <span className={[
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            isOn ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")} />
        </button>
      </div>

      {isOn && (
        <>
          <div className="flex gap-1 flex-wrap">
            {RELIGHT_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => !isProcessing && handlePresetChange(key)}
                disabled={isProcessing}
                className={[
                  "px-2 py-0.5 rounded text-[10px] border transition-colors",
                  preset === key
                    ? "bg-teal-50 text-teal-700 border-teal-200"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
                  isProcessing ? "opacity-40 pointer-events-none" : "",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-600">Intensity</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{intensity.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={intensity}
              onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
              disabled={isProcessing}
              className={["w-full accent-teal-500 h-1", isProcessing ? "opacity-40 pointer-events-none" : ""].join(" ")}
            />
          </div>
        </>
      )}

      {isProcessing ? (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 tabular-nums">{pct > 0 ? `${pct}%${etaLabel}` : "Starting…"}</p>
        </div>
      ) : errorMsg ? (
        <p className="text-[10px] text-amber-600 leading-snug">⚠ {errorMsg}</p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">AI portrait relighting · studio light from any room</p>
          {isOn && clip.portraitRelightFileId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOriginalClipId(isComparing ? null : clip.id)}
                title={isComparing ? "Show processed" : "Preview original"}
                className={["text-[10px] transition-colors flex items-center gap-0.5", isComparing ? "text-teal-600 font-medium" : "text-slate-400 hover:text-slate-600"].join(" ")}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8h14M1 8c2-3 4-5 7-5s5 2 7 5M1 8c2 3 4 5 7 5s5-2 7-5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
                {isComparing ? "Processed" : "Original"}
              </button>
              <button
                onClick={handleReprocess}
                title="Re-process"
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
        <p className="text-[10px] font-bold text-slate-400">Effects</p>
        <EyeContactToggle clip={clip} />
        <BlurBackgroundToggle clip={clip} />
        <FaceRestoreToggle clip={clip} />
        <PortraitRelightToggle clip={clip} />
      </div>
    </div>
  );
}
