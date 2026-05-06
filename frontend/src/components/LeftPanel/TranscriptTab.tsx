import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { transcribeFile } from "../../lib/api";
import { v4 as uuid } from "uuid";
import CaptionStylePicker from "./CaptionStylePicker";
import type { Caption, CaptionWord } from "../../types/project";

interface Props { seek: (t: number) => void }

export default function TranscriptTab({ seek }: Props) {
  const { files, project, setCaption, playheadTime } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [insertKey, setInsertKey] = useState<string | null>(null);
  const [insertText, setInsertText] = useState("");

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

  function deleteWord(cap: Caption, wordIdx: number) {
    applyWords(cap, (cap.words ?? []).filter((_, i) => i !== wordIdx));
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
    const newWords = (cap.words ?? []).map((w, i) =>
      i === wordIdx ? { ...w, text: editText.trim() || w.text } : w
    );
    applyWords(cap, newWords);
    setEditKey(null);
  }

  // insertKey format: `${cap.id}:${i}` = insert before word i
  //                   `${cap.id}:end`  = append after last word
  function commitInsert(cap: Caption, position: number | "end") {
    const text = insertText.trim();
    setInsertKey(null);
    setInsertText("");
    if (!text) return;
    const words = cap.words ?? [];
    let newWord: CaptionWord;
    if (position === "end") {
      const last = words[words.length - 1];
      newWord = { text, start: last?.end ?? cap.startTime, end: (last?.end ?? cap.startTime) + 0.3 };
      applyWords(cap, [...words, newWord]);
    } else {
      const prev = words[position - 1];
      const next = words[position];
      const start = prev?.end ?? cap.startTime;
      const end = next?.start ?? start + 0.3;
      newWord = { text, start, end: start + (end - start) / 2 };
      applyWords(cap, [...words.slice(0, position), newWord, ...words.slice(position)]);
    }
  }

  const hasWords = project.captions.some((c) => c.words?.length);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-100">
        <button
          onClick={handleTranscribe}
          disabled={loading}
          className="w-full py-2 text-xs bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Transcribing…" : "Auto-Transcribe"}
        </button>
        {!hasWords && project.captions.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center mt-1">
            Re-transcribe for word-level highlighting
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {project.captions.length === 0 && (
          <p className="text-xs text-gray-400 text-center pt-4">No transcript yet</p>
        )}
        {project.captions.map((cap) => {
          const words = cap.words ?? [];
          let activeWordIdx = -1;
          if (playheadTime >= cap.startTime && playheadTime <= cap.endTime) {
            for (let i = 0; i < words.length; i++) {
              if (playheadTime >= words[i].start) activeWordIdx = i;
              else break;
            }
          }

          return (
            <div key={cap.id} className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1 font-mono">
                {cap.startTime.toFixed(1)}s – {cap.endTime.toFixed(1)}s
              </p>
              <div className="flex flex-wrap gap-0.5 leading-relaxed">
                {words.length > 0 ? words.map((w, i) => {
                  const key = `${cap.id}:${i}`;
                  const insKey = `${cap.id}:${i}`;
                  const isActive = i === activeWordIdx;
                  const isPast = i < activeWordIdx;

                  return (
                    <span key={key} className="contents">
                      {/* Insert-before inline input */}
                      {insertKey === insKey && (
                        <input
                          autoFocus
                          value={insertText}
                          onChange={(e) => setInsertText(e.target.value)}
                          onBlur={() => commitInsert(cap, i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitInsert(cap, i);
                            if (e.key === "Escape") { setInsertKey(null); setInsertText(""); }
                          }}
                          className="text-xs border border-blue-400 rounded px-1 outline-none w-20"
                          placeholder="word…"
                        />
                      )}

                      {editKey === key ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => commitEdit(cap, i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(cap, i);
                            if (e.key === "Escape") setEditKey(null);
                          }}
                          className="text-xs border border-blue-400 rounded px-1 outline-none w-20"
                        />
                      ) : (
                        <span
                          className={`group relative text-xs px-0.5 rounded cursor-pointer select-none
                            ${isActive ? "bg-yellow-200 text-yellow-900 font-semibold" : ""}
                            ${isPast ? "text-gray-400" : "text-gray-800"}
                            hover:bg-gray-100`}
                          onClick={() => seek(w.start)}
                          onDoubleClick={() => { setEditKey(key); setEditText(w.text); }}
                          title="Click: seek · Double-click: edit"
                        >
                          {w.text}
                          {/* Insert before */}
                          <button
                            className="absolute -top-2 -left-1 hidden group-hover:flex w-3 h-3 bg-blue-400 text-white rounded-full text-[8px] items-center justify-center z-10"
                            onClick={(e) => { e.stopPropagation(); setInsertKey(insKey); setInsertText(""); }}
                            title="Insert word before"
                          >+</button>
                          {/* Delete */}
                          <button
                            className="absolute -top-2 -right-1 hidden group-hover:flex w-3 h-3 bg-red-400 text-white rounded-full text-[8px] items-center justify-center z-10"
                            onClick={(e) => { e.stopPropagation(); deleteWord(cap, i); }}
                            title="Delete word"
                          >×</button>
                        </span>
                      )}
                    </span>
                  );
                }) : (
                  <span
                    className="text-xs text-gray-800 cursor-pointer hover:bg-gray-100 rounded px-0.5"
                    onClick={() => seek(cap.startTime)}
                  >
                    {cap.text}
                  </span>
                )}

                {/* Append word at end of segment */}
                {words.length > 0 && (
                  insertKey === `${cap.id}:end` ? (
                    <input
                      autoFocus
                      value={insertText}
                      onChange={(e) => setInsertText(e.target.value)}
                      onBlur={() => commitInsert(cap, "end")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitInsert(cap, "end");
                        if (e.key === "Escape") { setInsertKey(null); setInsertText(""); }
                      }}
                      className="text-xs border border-blue-400 rounded px-1 outline-none w-20"
                      placeholder="word…"
                    />
                  ) : (
                    <button
                      className="text-[10px] text-blue-400 hover:text-blue-600 px-0.5 rounded hover:bg-blue-50 leading-none"
                      onClick={() => { setInsertKey(`${cap.id}:end`); setInsertText(""); }}
                      title="Append word"
                    >+</button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      <CaptionStylePicker />
    </div>
  );
}
