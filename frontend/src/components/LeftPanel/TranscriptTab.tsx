import React, { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { transcribeFile } from "../../lib/api";
import { v4 as uuid } from "uuid";
import type { Caption, CaptionWord } from "../../types/project";

interface Props { seek: (t: number) => void }

interface CursorPosition { captionId: string; wordIdx: number }

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function TranscriptTab({ seek }: Props) {
  const {
    files, project, setCaption, playheadTime,
    transcriptSelection, setTranscriptSelection,
    cutWord, deleteTimeRange,
  } = useProjectStore();

  const [loading, setLoading] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);

  const selectionAnchor = useRef<{ captionId: string; wordIdx: number } | null>(null);
  const dragAnchorTime = useRef<number | null>(null);
  const isDragging = useRef(false);
  const didDrag = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseUp() {
      dragAnchorTime.current = null;
      isDragging.current = false;
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  async function handleTranscribe() {
    const videoFile = files.find((f) => f.width > 0);
    if (!videoFile) { alert("Add a video file first"); return; }
    setLoading(true);
    try {
      const segs = await transcribeFile(videoFile.id);
      setCaption(segs.map((s) => ({
        id: uuid(),
        text: s.text,
        startTime: s.start,
        endTime: s.end,
        words: s.words?.map((w) => ({ text: w.text, start: w.start, end: w.end })) ?? [],
      })), videoFile.id);
    } catch (e) {
      alert("Transcription failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyWords(cap: Caption, newWords: CaptionWord[]) {
    const updated = project.captions.map((c) =>
      c.id !== cap.id ? c : {
        ...c,
        words: newWords,
        text: newWords.map((w) => w.text).join(" "),
        endTime: newWords.length ? newWords[newWords.length - 1].end : c.startTime,
      }
    ).filter((c) => (c.words?.length ?? 1) > 0);
    setCaption(updated);
  }

  function commitEdit(cap: Caption, wordIdx: number) {
    const trimmed = editText.trim();
    setEditKey(null);
    if (!trimmed) return;

    const parts = trimmed.split(/\s+/).filter(Boolean);
    const words = cap.words ?? [];
    const orig = words[wordIdx];

    if (parts.length <= 1) {
      applyWords(cap, words.map((w, i) => i === wordIdx ? { ...w, text: parts[0] ?? w.text } : w));
      return;
    }

    const segDur = (orig.end - orig.start) / parts.length;
    const newWordsList = parts.map((text, i) => ({
      text,
      start: orig.start + i * segDur,
      end: orig.start + (i + 1) * segDur,
    }));

    applyWords(cap, [
      ...words.slice(0, wordIdx),
      ...newWordsList,
      ...words.slice(wordIdx + 1),
    ]);
  }

  function getFlatWords() {
    return project.captions.flatMap((cap) =>
      (cap.words ?? []).map((word, i) => ({ captionId: cap.id, wordIdx: i, word }))
    );
  }

  function moveCursor(dir: 1 | -1, extendSelection: boolean) {
    const flat = getFlatWords();
    if (flat.length === 0) return;

    let currentFlatIdx = -1;
    if (cursorPosition) {
      currentFlatIdx = flat.findIndex(
        (w) => w.captionId === cursorPosition.captionId && w.wordIdx === cursorPosition.wordIdx
      );
    }

    const newFlatIdx = Math.max(0, Math.min(flat.length - 1, currentFlatIdx + dir));
    const newPos = { captionId: flat[newFlatIdx].captionId, wordIdx: flat[newFlatIdx].wordIdx };

    if (extendSelection) {
      const anchor = selectionAnchor.current ?? cursorPosition;
      if (anchor) {
        const anchorFlatIdx = flat.findIndex(
          (w) => w.captionId === anchor.captionId && w.wordIdx === anchor.wordIdx
        );
        const lo = Math.min(anchorFlatIdx, newFlatIdx);
        const hi = Math.max(anchorFlatIdx, newFlatIdx);
        setTranscriptSelection({
          startTime: flat[lo].word.start,
          endTime: flat[hi].word.end,
        });
        if (!selectionAnchor.current) selectionAnchor.current = cursorPosition;
      }
    } else {
      selectionAnchor.current = null;
      setTranscriptSelection(null);
    }

    setCursorPosition(newPos);
    seek(flat[newFlatIdx].word.start);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Let inline edits handle their own keys
    if (editKey) return;

    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      moveCursor(e.key === "ArrowRight" ? 1 : -1, e.shiftKey);
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();

      if (transcriptSelection) {
        deleteTimeRange(transcriptSelection.startTime, transcriptSelection.endTime);
        setTranscriptSelection(null);
        setCursorPosition(null);
        return;
      }

      if (cursorPosition) {
        const cap = project.captions.find((c) => c.id === cursorPosition.captionId);
        if (!cap) return;
        const words = cap.words ?? [];
        const targetIdx = e.key === "Backspace"
          ? cursorPosition.wordIdx
          : cursorPosition.wordIdx + 1;

        if (targetIdx >= 0 && targetIdx < words.length) {
          cutWord(cap.id, targetIdx);
          if (e.key === "Backspace" && cursorPosition.wordIdx > 0) {
            setCursorPosition({ ...cursorPosition, wordIdx: cursorPosition.wordIdx - 1 });
          }
        }
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setTranscriptSelection(null);
      setCursorPosition(null);
      selectionAnchor.current = null;
      return;
    }
  }

  function onWordMouseDown(e: React.MouseEvent, w: CaptionWord) {
    if (e.button !== 0) return;
    e.preventDefault();
    containerRef.current?.focus();
    dragAnchorTime.current = w.start;
    isDragging.current = false;
    didDrag.current = false;
    setTranscriptSelection(null);
  }

  function onWordMouseEnter(w: CaptionWord) {
    if (dragAnchorTime.current === null) return;
    isDragging.current = true;
    didDrag.current = true;
    const s = Math.min(dragAnchorTime.current, w.start);
    const e = Math.max(dragAnchorTime.current, w.end);
    setTranscriptSelection({ startTime: s, endTime: e });
  }

  function onWordClick(cap: Caption, w: CaptionWord, i: number) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    if (transcriptSelection) {
      setTranscriptSelection(null);
    }

    setCursorPosition({ captionId: cap.id, wordIdx: i });
    seek(w.start);
  }

  const sel = transcriptSelection;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 flex gap-2">
        <button
          onClick={handleTranscribe}
          disabled={loading}
          className="flex-1 py-1.5 text-xs text-slate-500 border border-slate-200 rounded hover:border-slate-400 hover:text-slate-700 disabled:opacity-50 transition-colors bg-white"
        >
          {loading ? "Transcribing…" : project.captions.length > 0 ? "Re-transcribe" : "Auto-Transcribe"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {project.captions.length === 0 && (
          <div className="px-6 pt-10 text-center">
            <p className="text-sm text-slate-400">No transcript yet.</p>
            <p className="text-xs text-slate-300 mt-1">Click Auto-Transcribe to generate one.</p>
          </div>
        )}

        <div
          ref={containerRef}
          className="px-4 pt-10 pb-5 text-[16px] leading-relaxed text-slate-700 outline-none"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {project.captions.map((cap, capIdx) => {
            const words = cap.words ?? [];
            const prevCap = capIdx > 0 ? project.captions[capIdx - 1] : null;
            const pauseGap = prevCap ? cap.startTime - prevCap.endTime : 0;

            let activeWordIdx = -1;
            if (playheadTime >= cap.startTime && playheadTime < cap.endTime) {
              for (let i = 0; i < words.length; i++) {
                if (playheadTime >= words[i].start) activeWordIdx = i;
                else break;
              }
            }

            const wordNodes = words.length > 0 ? words.map((w, i) => {
              const key = `${cap.id}:${i}`;
              const isActive = i === activeWordIdx;
              const isPast = i < activeWordIdx;
              const isSelected = sel ? (w.end > sel.startTime && w.start < sel.endTime) : false;
              const isCursor = cursorPosition?.captionId === cap.id && cursorPosition.wordIdx === i;
              const showCursorBefore = i === 0 &&
                cursorPosition?.captionId === cap.id && cursorPosition.wordIdx === -1;

              if (editKey === key) {
                return (
                  <React.Fragment key={key}>
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => commitEdit(cap, i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitEdit(cap, i); }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          commitEdit(cap, i);
                          const nextI = i + 1;
                          const capWords = cap.words ?? [];
                          if (nextI < capWords.length) {
                            setEditKey(`${cap.id}:${nextI}`);
                            setEditText(capWords[nextI].text);
                          } else {
                            setEditKey(null);
                          }
                        }
                        if (e.key === "Escape") {
                          setEditKey(null);
                          setCursorPosition(null);
                        }
                      }}
                      className="inline-block text-[16px] outline-none bg-teal-50 rounded px-0.5 w-28 align-baseline"
                    />
                    {" "}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={key}>
                  {showCursorBefore && (
                    <span className="inline-block w-[1.5px] h-[1.1em] bg-slate-700 cursor-blink align-text-bottom mx-px" />
                  )}
                  <span
                    className={`relative inline-block cursor-pointer rounded-sm transition-colors
                      ${isSelected
                        ? "bg-blue-200 text-blue-900"
                        : isActive
                        ? "bg-teal-50 text-teal-700"
                        : isPast
                        ? "text-slate-400"
                        : "text-slate-700"}
                      hover:bg-slate-100`}
                    onMouseDown={(e) => onWordMouseDown(e, w)}
                    onMouseEnter={() => onWordMouseEnter(w)}
                    onClick={() => onWordClick(cap, w, i)}
                    title="Click: place cursor · Drag: select range · Delete: cut from video"
                  >
                    {w.text}
                    {/* Floating tooltip above the clicked word */}
                    {isCursor && !editKey && (
                      <span
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-auto"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          className="flex items-center gap-1 bg-white border border-slate-200 rounded-md shadow-lg px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap select-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditKey(key);
                            setEditText(w.text);
                          }}
                        >
                          ✎ Correct
                        </button>
                      </span>
                    )}
                  </span>
                  {isCursor && !editKey && (
                    <span className="inline-block w-[1.5px] h-[1.1em] bg-slate-700 cursor-blink align-text-bottom mx-px" />
                  )}
                  {" "}
                </React.Fragment>
              );
            }) : (
              <span
                className="cursor-pointer hover:bg-slate-100 rounded-sm px-[1px]"
                onClick={() => seek(cap.startTime)}
              >
                {cap.text}
              </span>
            );

            return (
              <>
                {capIdx > 0 && (
                  pauseGap > 1.5
                    ? <div key={`br-${cap.id}`} className="h-[0.7em] w-full" />
                    : " "
                )}
                {(capIdx === 0 || pauseGap > 1.5) && (
                  <button
                    key={`ts-${cap.id}`}
                    className="text-[9px] font-mono text-slate-300 hover:text-teal-500 transition-colors mr-1 align-baseline select-none"
                    onClick={() => seek(cap.startTime)}
                    tabIndex={-1}
                  >
                    {formatTime(cap.startTime)}
                  </button>
                )}
                {wordNodes}
              </>
            );
          })}
        </div>
      </div>
    </div>
  );
}
