import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { transcribeFile } from "../../lib/api";
import { v4 as uuid } from "uuid";
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

  function deleteWord(cap: Caption, wordIdx: number) {
    applyWords(cap, (cap.words ?? []).filter((_, i) => i !== wordIdx));
  }

  function commitEdit(cap: Caption, wordIdx: number) {
    const newWords = (cap.words ?? []).map((w, i) =>
      i === wordIdx ? { ...w, text: editText.trim() || w.text } : w
    );
    applyWords(cap, newWords);
    setEditKey(null);
  }

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
            Re-transcribe for word-level editing
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2 min-h-0">
        {project.captions.length === 0 && (
          <p className="text-xs text-gray-400 text-center pt-4">No transcript yet</p>
        )}

        <div className="text-sm leading-loose text-gray-800">
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
              <span key={cap.id}>
                {/* Segment timestamp */}
                <button
                  className="inline-block align-middle text-[10px] font-mono text-gray-300 hover:text-blue-400 mr-1 transition-colors leading-none"
                  onClick={() => seek(cap.startTime)}
                  title={`Seek to ${cap.startTime.toFixed(1)}s`}
                >
                  {cap.startTime.toFixed(1)}s
                </button>

                {words.length > 0 ? words.map((w, i) => {
                  const key = `${cap.id}:${i}`;
                  const insKey = `${cap.id}:${i}`;
                  const isActive = i === activeWordIdx;
                  const isPast = i < activeWordIdx;

                  return (
                    <span key={key} className="contents">
                      {/* Insert-before input */}
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
                          className="inline-block text-sm border border-blue-400 rounded px-1 outline-none w-20 align-baseline"
                          placeholder="word…"
                        />
                      )}{" "}

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
                          className="inline-block text-sm border border-blue-400 rounded px-1 outline-none w-24 align-baseline"
                        />
                      ) : (
                        <span
                          className={`group relative inline-block px-0.5 rounded cursor-pointer select-none
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
                            className="absolute -top-3 -left-1.5 hidden group-hover:flex w-4 h-4 bg-blue-400 text-white rounded-full text-[10px] items-center justify-center z-10"
                            onClick={(e) => { e.stopPropagation(); setInsertKey(insKey); setInsertText(""); }}
                            title="Insert word before"
                          >+</button>
                          {/* Delete */}
                          <button
                            className="absolute -top-3 -right-1.5 hidden group-hover:flex w-4 h-4 bg-red-400 text-white rounded-full text-[10px] items-center justify-center z-10"
                            onClick={(e) => { e.stopPropagation(); deleteWord(cap, i); }}
                            title="Delete word"
                          >×</button>
                        </span>
                      )}{" "}
                    </span>
                  );
                }) : (
                  <span
                    className="cursor-pointer hover:bg-gray-100 rounded px-0.5"
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
                      className="inline-block text-sm border border-blue-400 rounded px-1 outline-none w-20 align-baseline"
                      placeholder="word…"
                    />
                  ) : (
                    <button
                      className="text-xs text-blue-400 hover:text-blue-600 px-1 rounded hover:bg-blue-50 font-bold leading-none"
                      onClick={() => { setInsertKey(`${cap.id}:end`); setInsertText(""); }}
                      title="Append word"
                    >+</button>
                  )
                )}

                <br /><br />
              </span>
            );
          })}
        </div>
      </div>

    </div>
  );
}
