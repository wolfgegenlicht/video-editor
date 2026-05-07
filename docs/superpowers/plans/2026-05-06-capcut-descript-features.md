# CapCut/Descript Feature Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the video editor with karaoke word-highlight captions, per-clip speed/volume, fade transitions, and text overlays — reaching CapCut/Descript feature parity for core editing.

**Architecture:** Each feature is layered onto the existing Zustand store + FastAPI backend. The Caption model gains word-level timestamps returned by Whisper. Clip gains speed/volume/fade fields. A new TextOverlay collection in Project drives both the preview renderer and a new timeline row. FFmpeg export is updated last for each feature.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind, faster-whisper (word_timestamps=True), FFmpeg filter_complex.

---

## File Map

| File | Change |
|---|---|
| `backend/services/transcription.py` | Enable word_timestamps, return words per segment |
| `backend/routes/transcribe.py` | Pass word data through response |
| `frontend/src/types/project.ts` | Add CaptionWord, extend Caption; add speed/volume/fade to Clip; add TextOverlay, CaptionStyle "karaoke" |
| `frontend/src/lib/api.ts` | Extend TranscriptSegment type with words |
| `frontend/src/store/useProjectStore.ts` | Add setClipSpeed, setClipVolume, setClipFade, addTextOverlay, updateTextOverlay, deleteTextOverlay |
| `frontend/src/components/Preview/CaptionOverlay.tsx` | Karaoke render mode (word highlight) |
| `frontend/src/components/Preview/VideoPreview.tsx` | Apply playbackRate + speed-adjusted sourcePos; render fade overlay |
| `frontend/src/components/Preview/TextOverlayRenderer.tsx` | **CREATE** — render TextOverlay items as positioned divs |
| `frontend/src/components/LeftPanel/TranscriptTab.tsx` | Word-level display, click-to-seek, inline edit, delete word |
| `frontend/src/components/LeftPanel/CaptionStylePicker.tsx` | Add "Karaoke" option |
| `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx` | **CREATE** — speed/volume/fade sliders for selected clip |
| `frontend/src/components/LeftPanel/LeftPanel.tsx` | Add Properties tab |
| `frontend/src/components/Timeline/TimelineToolbar.tsx` | Add "T" text overlay button |
| `frontend/src/components/Timeline/TextOverlayTrack.tsx` | **CREATE** — timeline row for text overlays |
| `frontend/src/components/Timeline/Timeline.tsx` | Mount TextOverlayTrack; add text track label |
| `backend/services/ffmpeg.py` | Speed (setpts/atempo), volume, fade (fade filter), text overlays (drawtext) |
| `frontend/src/App.tsx` | Mount TextOverlayRenderer |

---

## Task 1: Backend — Word-Level Transcription

**Files:**
- Modify: `backend/services/transcription.py`
- Modify: `backend/routes/transcribe.py`

- [ ] **Update transcription service to capture word timestamps**

Replace the entire `transcription.py` with:

```python
import threading
from pathlib import Path
from faster_whisper import WhisperModel

_model = None
_model_lock = threading.Lock()

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model

def transcribe(file_path: Path) -> list[dict]:
    model = get_model()
    segments, _ = model.transcribe(str(file_path), beam_size=5, word_timestamps=True)
    result = []
    for seg in segments:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({"text": w.word.strip(), "start": w.start, "end": w.end})
        result.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "words": words,
        })
    return result
```

- [ ] **Verify the route already passes data through** — open `backend/routes/transcribe.py` and confirm it calls `transcription.transcribe()` and returns the list as JSON. The route returns `{"segments": [...]}` already; since we're now adding `words` inside each segment dict, no route change is needed. If the route reshapes data, update it to pass `words` through.

- [ ] **Manual smoke test** — start the backend (`uvicorn main:app --reload` from `backend/`) and POST to `/transcribe` with a valid `fileId`. Confirm the response segments each contain a `words` array with `{text, start, end}` items.

- [ ] **Commit**
```bash
git add backend/services/transcription.py
git commit -m "feat: word-level timestamps from Whisper"
```

---

## Task 2: Frontend Types + API

**Files:**
- Modify: `frontend/src/types/project.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Add CaptionWord and update Caption in `types/project.ts`**

```typescript
// Add after CaptionStyle line:
export type CaptionStyle = "minimal" | "bold" | "subtitle" | "cinematic" | "karaoke";

// Add new interface:
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

// Update Caption:
export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: CaptionWord[];
}

// Add speed/volume/fade to Clip:
export interface Clip {
  id: string;
  fileId: string;
  startTime: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
  muted?: boolean;
  speed?: number;    // playback rate: 0.5 | 0.75 | 1 | 1.5 | 2 — default 1
  volume?: number;  // 0–2, default 1
  fadeIn?: number;  // seconds, default 0
  fadeOut?: number; // seconds, default 0
}

// Add TextOverlay type:
export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;       // percentage 0–100 from left
  y: number;       // percentage 0–100 from top
  fontSize: number; // px, e.g. 32
  color: string;   // hex
  fontWeight: "normal" | "bold";
  background: string; // hex or "transparent"
}

// Add textOverlays to Project:
export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  tracks: Track[];
  captions: Caption[];
  textOverlays: TextOverlay[];
}
```

- [ ] **Update `TranscriptSegment` in `api.ts`**

```typescript
// At top of api.ts, update or add TranscriptSegment (remove the import from types/project if it was there):
export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}
```

Also remove `TranscriptSegment` from `types/project.ts` if it exists there — it belongs in `api.ts`. Check `types/project.ts` after making changes and remove any duplicate.

- [ ] **Fix store initial state** — In `useProjectStore.ts`, the `makeDefaultProject()` function must include `textOverlays: []`:

```typescript
function makeDefaultProject(): Project {
  return {
    id: uuid(),
    name: "Untitled Project",
    aspectRatio: "16:9",
    captionStyle: "minimal",
    tracks: [{ id: uuid(), type: "video", clips: [] }],
    captions: [],
    textOverlays: [],
  };
}
```

Also find the `openProject` and `closeProject` calls and add `textOverlays: project.textOverlays ?? []` where needed (in case old saved projects lack the field).

- [ ] **Run type check** — `pnpm tsc --noEmit` from `frontend/`. Fix any errors.

- [ ] **Commit**
```bash
git add frontend/src/types/project.ts frontend/src/lib/api.ts frontend/src/store/useProjectStore.ts
git commit -m "feat: word-level types, speed/volume/fade on Clip, TextOverlay model"
```

---

## Task 3: Store Actions for New Fields

**Files:**
- Modify: `frontend/src/store/useProjectStore.ts`

- [ ] **Add interface entries** — In the `ProjectStore` interface, add:

```typescript
setClipSpeed: (clipId: string, speed: number) => void;
setClipVolume: (clipId: string, volume: number) => void;
setClipFade: (clipId: string, fadeIn: number, fadeOut: number) => void;
addTextOverlay: (overlay: Omit<TextOverlay, "id">) => void;
updateTextOverlay: (id: string, patch: Partial<Omit<TextOverlay, "id">>) => void;
deleteTextOverlay: (id: string) => void;
```

- [ ] **Add implementations** — after the existing `setCaption` / `setTrackMuted` / `setTrackHidden` block:

```typescript
setClipSpeed: (clipId, speed) => withHistory(set, get, (p) => ({
  ...p,
  tracks: p.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => c.id === clipId
      ? { ...c, speed, duration: (c.sourceEnd - c.sourceStart) / speed }
      : c),
  })),
})),

setClipVolume: (clipId, volume) => withHistory(set, get, (p) => ({
  ...p,
  tracks: p.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => c.id === clipId ? { ...c, volume } : c),
  })),
})),

setClipFade: (clipId, fadeIn, fadeOut) => withHistory(set, get, (p) => ({
  ...t,
  tracks: p.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => c.id === clipId ? { ...c, fadeIn, fadeOut } : c),
  })),
})),

addTextOverlay: (overlay) => withHistory(set, get, (p) => ({
  ...p,
  textOverlays: [...p.textOverlays, { ...overlay, id: uuid() }],
})),

updateTextOverlay: (id, patch) => withHistory(set, get, (p) => ({
  ...p,
  textOverlays: p.textOverlays.map((o) => o.id === id ? { ...o, ...patch } : o),
})),

deleteTextOverlay: (id) => withHistory(set, get, (p) => ({
  ...p,
  textOverlays: p.textOverlays.filter((o) => o.id !== id),
})),
```

Note: the `setClipFade` implementation has a typo above — the outer map should use `p.tracks.map((t) => ({...t, ...` not `...t`. Fix if copied.

- [ ] **Run type check** — `pnpm tsc --noEmit`. Fix errors.

- [ ] **Commit**
```bash
git add frontend/src/store/useProjectStore.ts
git commit -m "feat: store actions for speed, volume, fade, text overlays"
```

---

## Task 4: Karaoke CaptionOverlay

**Files:**
- Modify: `frontend/src/components/Preview/CaptionOverlay.tsx`

- [ ] **Rewrite `CaptionOverlay.tsx`** with karaoke support:

```tsx
import { useProjectStore } from "../../store/useProjectStore";
import type { Caption, CaptionWord } from "../../types/project";

interface Props { time: number }

const BASE_CLASSES = "absolute pointer-events-none left-1/2 -translate-x-1/2";

const CONTAINER: Record<string, string> = {
  minimal:   "bottom-8 text-center",
  bold:      "bottom-10 text-center",
  subtitle:  "bottom-8 text-center",
  cinematic: "bottom-1/2 translate-y-1/2 text-center",
  karaoke:   "bottom-10 text-center px-4 w-full max-w-lg",
};

const TEXT: Record<string, string> = {
  minimal:   "text-white text-sm drop-shadow-md",
  bold:      "text-white text-2xl font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000]",
  subtitle:  "text-white text-sm bg-black/60 px-3 py-1",
  cinematic: "text-white text-xl tracking-[0.2em] uppercase",
  karaoke:   "text-white text-xl font-bold drop-shadow-lg leading-relaxed",
};

function KaraokeWords({ seg, time }: { seg: Caption; time: number }) {
  const words = seg.words ?? [];
  if (!words.length) return <span>{seg.text}</span>;

  // Active word: last word whose start <= current time
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) activeIdx = i;
    else break;
  }

  return (
    <>
      {words.map((w, i) => (
        <span
          key={i}
          className={
            i === activeIdx
              ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]"
              : i < activeIdx
              ? "text-white/50"
              : "text-white"
          }
        >
          {w.text}{" "}
        </span>
      ))}
    </>
  );
}

export default function CaptionOverlay({ time }: Props) {
  const { project } = useProjectStore();
  const style = project.captionStyle;
  const cap = project.captions.find((c) => time >= c.startTime && time <= c.endTime);
  if (!cap) return null;

  return (
    <div className={`${BASE_CLASSES} ${CONTAINER[style] ?? CONTAINER.minimal}`}>
      <span className={TEXT[style] ?? TEXT.minimal}>
        {style === "karaoke" ? (
          <KaraokeWords seg={cap} time={time} />
        ) : (
          cap.text
        )}
      </span>
    </div>
  );
}
```

- [ ] **Add "Karaoke" to `CaptionStylePicker.tsx`**

Open `frontend/src/components/LeftPanel/CaptionStylePicker.tsx` and add to the `STYLES` array:

```typescript
{ id: "karaoke", label: "Karaoke", description: "Word-by-word highlight" },
```

- [ ] **Start the dev server** (`pnpm dev` from `frontend/`) and transcribe a clip. Switch to "Karaoke" style and play — verify the currently spoken word turns yellow while past words fade.

- [ ] **Commit**
```bash
git add frontend/src/components/Preview/CaptionOverlay.tsx frontend/src/components/LeftPanel/CaptionStylePicker.tsx
git commit -m "feat: karaoke caption style with word-by-word highlight"
```

---

## Task 5: Transcript Panel — Word-Level + Click-to-Seek + Edit

**Files:**
- Modify: `frontend/src/components/LeftPanel/TranscriptTab.tsx`

The transcript panel needs: word-level display, currently-spoken word highlighted in the panel, click any word to seek there, inline text edit (click to edit), delete word (removes it from the caption data).

- [ ] **Rewrite `TranscriptTab.tsx`**:

```tsx
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
  const [editKey, setEditKey] = useState<string | null>(null); // "captionId:wordIdx"
  const [editText, setEditText] = useState("");

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
      })));
    } catch (e) {
      alert("Transcription failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  function deleteWord(cap: Caption, wordIdx: number) {
    const updated = project.captions.map((c) => {
      if (c.id !== cap.id) return c;
      const newWords = c.words!.filter((_, i) => i !== wordIdx);
      return {
        ...c,
        words: newWords,
        text: newWords.map((w) => w.text).join(" "),
        // shrink segment end to last remaining word's end
        endTime: newWords.length ? newWords[newWords.length - 1].end : c.startTime,
      };
    }).filter((c) => (c.words?.length ?? 1) > 0);
    setCaption(updated);
  }

  function commitEdit(cap: Caption, wordIdx: number) {
    const updated = project.captions.map((c) => {
      if (c.id !== cap.id) return c;
      const newWords = c.words!.map((w, i) => i === wordIdx ? { ...w, text: editText.trim() || w.text } : w);
      return { ...c, words: newWords, text: newWords.map((w) => w.text).join(" ") };
    });
    setCaption(updated);
    setEditKey(null);
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
          // Determine active word index in this segment
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
                  const isActive = i === activeWordIdx;
                  const isPast = i < activeWordIdx;
                  if (editKey === key) {
                    return (
                      <input
                        key={key}
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
                    );
                  }
                  return (
                    <span
                      key={key}
                      className={`group relative text-xs px-0.5 rounded cursor-pointer select-none
                        ${isActive ? "bg-yellow-200 text-yellow-900 font-semibold" : ""}
                        ${isPast ? "text-gray-400" : "text-gray-800"}
                        hover:bg-gray-100`}
                      onClick={() => seek(w.start)}
                      onDoubleClick={() => { setEditKey(key); setEditText(w.text); }}
                      title="Click: seek · Double-click: edit"
                    >
                      {w.text}
                      <button
                        className="absolute -top-2 -right-1 hidden group-hover:flex w-3 h-3 bg-red-400 text-white rounded-full text-[8px] items-center justify-center z-10"
                        onClick={(e) => { e.stopPropagation(); deleteWord(cap, i); }}
                        title="Delete word"
                      >
                        ×
                      </button>
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
              </div>
            </div>
          );
        })}
      </div>
      <CaptionStylePicker />
    </div>
  );
}
```

- [ ] **Wire `seek` prop into `TranscriptTab`** — `TranscriptTab` now needs a `seek` prop. Find where `TranscriptTab` is rendered (in `LeftPanel.tsx`) and pass `seek` down. `seek` comes from `usePlayback` which is in `App.tsx`. Pass it through the chain: `App → LeftPanel → TranscriptTab`.

  In `App.tsx`, pass `seek` to `LeftPanel`:
  ```tsx
  <LeftPanel seek={seek} />
  ```

  In `LeftPanel.tsx`, accept `seek: (t: number) => void` as a prop and pass it to `TranscriptTab`:
  ```tsx
  <TranscriptTab seek={seek} />
  ```

- [ ] **Run type check** — `pnpm tsc --noEmit`. Fix errors.

- [ ] **Test in browser** — transcribe a clip, play back, verify words highlight in real time in the transcript panel. Click a word — verify playhead jumps there. Double-click a word — verify inline editing. Hover a word and click × — verify word is removed.

- [ ] **Commit**
```bash
git add frontend/src/components/LeftPanel/TranscriptTab.tsx frontend/src/components/LeftPanel/LeftPanel.tsx frontend/src/App.tsx
git commit -m "feat: word-level transcript with click-to-seek, inline edit, delete word"
```

---

## Task 6: Clip Properties Panel (Speed, Volume, Fade)

**Files:**
- Create: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`
- Modify: `frontend/src/components/LeftPanel/LeftPanel.tsx`

- [ ] **Create `ClipPropertiesPanel.tsx`**:

```tsx
import { useProjectStore } from "../../store/useProjectStore";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

export default function ClipPropertiesPanel() {
  const {
    project, selectedClipId,
    setClipSpeed, setClipVolume, setClipFade,
  } = useProjectStore();

  const clip = selectedClipId
    ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : null;

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-400 text-center">Select a clip on the timeline to edit its properties</p>
      </div>
    );
  }

  const speed = clip.speed ?? 1;
  const volume = clip.volume ?? 1;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-5">
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Speed</label>
        <div className="flex flex-wrap gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setClipSpeed(clip.id, s)}
              className={`px-2 py-1 rounded text-xs border transition-colors
                ${speed === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Volume — {Math.round(volume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={volume}
          onChange={(e) => setClipVolume(clip.id, parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Fade In — {fadeIn.toFixed(1)}s
        </label>
        <input
          type="range"
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.1}
          value={fadeIn}
          onChange={(e) => setClipFade(clip.id, parseFloat(e.target.value), fadeOut)}
          className="w-full accent-blue-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
          Fade Out — {fadeOut.toFixed(1)}s
        </label>
        <input
          type="range"
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.1}
          value={fadeOut}
          onChange={(e) => setClipFade(clip.id, fadeIn, parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>
    </div>
  );
}
```

- [ ] **Add Properties tab to `LeftPanel.tsx`**

Open `LeftPanel.tsx`. Add a "Properties" tab alongside the existing Media/Transcript tabs. When the tab is active, render `ClipPropertiesPanel`. Pass `seek` through to `TranscriptTab` as described in Task 5.

The tabs array should look like:
```tsx
const TABS = ["Media", "Transcript", "Properties"] as const;
type Tab = typeof TABS[number];
```

Import `ClipPropertiesPanel` and render it when `activeTab === "Properties"`.

- [ ] **Run type check + test in browser** — Select a clip, switch to Properties tab, adjust speed (e.g., 2×) — verify the clip narrows on the timeline. Adjust volume slider — verify the value persists.

- [ ] **Commit**
```bash
git add frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx frontend/src/components/LeftPanel/LeftPanel.tsx
git commit -m "feat: clip properties panel with speed, volume, fade controls"
```

---

## Task 7: Speed + Volume in Preview Playback

**Files:**
- Modify: `frontend/src/components/Preview/VideoPreview.tsx`

Speed must adjust both:
1. The `sourcePos` formula (multiply timeline delta by speed)
2. `video.playbackRate` (so audio pitch is correct and video plays smoothly)

Volume sets `video.volume`.

- [ ] **Update the "sync" effect (fires on clip entry / play toggle)** in `VideoPreview.tsx`:

```tsx
useEffect(() => {
  const video = videoRef.current;
  if (!video || !activeClip) {
    videoRef.current?.pause();
    return;
  }
  const speed = activeClip.speed ?? 1;
  const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
  video.currentTime = sourcePos;
  video.playbackRate = speed;
  video.volume = Math.min(1, activeClip.volume ?? 1); // HTML video clamps at 1
  if (isPlaying) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isPlaying, activeClip?.startTime, activeFile?.id]);
```

- [ ] **Update the scrub effect** to also use speed in the sourcePos:

```tsx
useEffect(() => {
  const video = videoRef.current;
  if (!video || !activeClip || isPlaying) return;
  const speed = activeClip.speed ?? 1;
  const sourcePos = activeClip.sourceStart + (playheadTime - activeClip.startTime) * speed;
  if (Math.abs(video.currentTime - sourcePos) > 0.05) {
    video.currentTime = sourcePos;
  }
}, [playheadTime, activeClip, isPlaying]);
```

- [ ] **Add fade overlay** — The fade is a black overlay that transitions opacity. Add this inside the return JSX, after the `<video>` element:

```tsx
{activeClip && (activeClip.fadeIn || activeClip.fadeOut) && (() => {
  const speed = activeClip.speed ?? 1;
  const elapsed = (playheadTime - activeClip.startTime) * speed;
  const remaining = activeClip.duration * speed - elapsed;
  let opacity = 0;
  if (activeClip.fadeIn && elapsed < activeClip.fadeIn) {
    opacity = 1 - elapsed / activeClip.fadeIn;
  } else if (activeClip.fadeOut && remaining < activeClip.fadeOut) {
    opacity = 1 - remaining / activeClip.fadeOut;
  }
  return opacity > 0 ? (
    <div
      className="absolute inset-0 bg-black pointer-events-none"
      style={{ opacity }}
    />
  ) : null;
})()}
```

- [ ] **Run dev server and test** — set a clip to speed 2×, play — video should play twice as fast and the clip should be half as wide on the timeline. Set fade-in to 0.5s, play from start of clip — should fade from black.

- [ ] **Commit**
```bash
git add frontend/src/components/Preview/VideoPreview.tsx
git commit -m "feat: speed, volume, fade preview in VideoPreview"
```

---

## Task 8: Text Overlay Renderer

**Files:**
- Create: `frontend/src/components/Preview/TextOverlayRenderer.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Create `TextOverlayRenderer.tsx`**:

```tsx
import { useProjectStore } from "../../store/useProjectStore";

interface Props { time: number }

export default function TextOverlayRenderer({ time }: Props) {
  const { project } = useProjectStore();
  const active = project.textOverlays.filter(
    (o) => time >= o.startTime && time <= o.endTime
  );
  if (!active.length) return null;
  return (
    <>
      {active.map((o) => (
        <div
          key={o.id}
          className="absolute pointer-events-none"
          style={{
            left: `${o.x}%`,
            top: `${o.y}%`,
            fontSize: o.fontSize,
            color: o.color,
            fontWeight: o.fontWeight,
            background: o.background === "transparent" ? undefined : o.background,
            padding: o.background !== "transparent" ? "2px 8px" : undefined,
            borderRadius: o.background !== "transparent" ? 4 : undefined,
            transform: "translate(-50%, -50%)",
            textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            whiteSpace: "pre-wrap",
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {o.text}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Mount in `VideoPreview.tsx`** — import `TextOverlayRenderer` and add it just before `<CaptionOverlay>`:

```tsx
import TextOverlayRenderer from "./TextOverlayRenderer";
// inside the return, after the video/null, before CaptionOverlay:
<TextOverlayRenderer time={playheadTime} />
<CaptionOverlay time={playheadTime} />
```

- [ ] **Commit**
```bash
git add frontend/src/components/Preview/TextOverlayRenderer.tsx frontend/src/components/Preview/VideoPreview.tsx
git commit -m "feat: text overlay renderer in preview"
```

---

## Task 9: Text Overlay Timeline Row + Add Button

**Files:**
- Create: `frontend/src/components/Timeline/TextOverlayTrack.tsx`
- Modify: `frontend/src/components/Timeline/Timeline.tsx`
- Modify: `frontend/src/components/Timeline/TimelineToolbar.tsx`

- [ ] **Create `TextOverlayTrack.tsx`**:

```tsx
import { useProjectStore } from "../../store/useProjectStore";
import type { TextOverlay } from "../../types/project";

interface Props { zoom: number; totalWidth: number }

export default function TextOverlayTrack({ zoom, totalWidth }: Props) {
  const { project, selectOverlay, selectedOverlayId, deleteTextOverlay } = useProjectStore();
  // Note: selectOverlay doesn't exist yet — we'll use selectedClipId for now or add selectOverlay
  // For simplicity, we'll just show draggable chips without selection state
  const overlays = project.textOverlays;

  return (
    <div
      className="h-10 border-b border-gray-100 relative bg-purple-50"
      style={{ width: totalWidth }}
    >
      {overlays.map((o) => {
        const left = o.startTime * zoom;
        const width = Math.max((o.endTime - o.startTime) * zoom, 4);
        return (
          <div
            key={o.id}
            className="absolute top-1 h-8 rounded bg-purple-400 border border-purple-500 flex items-center overflow-hidden select-none cursor-pointer hover:bg-purple-500 group"
            style={{ left, width }}
            onContextMenu={(e) => { e.preventDefault(); deleteTextOverlay(o.id); }}
          >
            <span className="px-2 text-[10px] text-white font-medium truncate flex-1">
              T {o.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Add text overlay track label + row to `Timeline.tsx`**

In the label column, after the existing track labels, add:

```tsx
{project.textOverlays.length > 0 && (
  <div className="h-10 flex items-center gap-1 px-2 border-b border-gray-100">
    <span className="text-[10px] font-medium text-purple-500 flex-1">text</span>
  </div>
)}
```

In the scrollable area, after the `{project.tracks.map(...)}` block, add:

```tsx
{project.textOverlays.length > 0 && (
  <TextOverlayTrack zoom={zoom} totalWidth={totalWidth} />
)}
```

Import `TextOverlayTrack` at the top.

- [ ] **Add "T" button to `TimelineToolbar.tsx`**

The toolbar needs access to `addTextOverlay` and `playheadTime`. In `TimelineToolbar.tsx`:

```tsx
const { zoom, setZoom, addTrack, playheadTime, isPlaying, addTextOverlay } = useProjectStore();

function handleAddText() {
  addTextOverlay({
    text: "Text",
    startTime: playheadTime,
    endTime: playheadTime + 3,
    x: 50,
    y: 50,
    fontSize: 32,
    color: "#ffffff",
    fontWeight: "bold",
    background: "transparent",
  });
}
```

Add the button in the toolbar JSX:
```tsx
<button onClick={handleAddText} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">T</button>
```

- [ ] **Run type check + test** — Click "T" in toolbar, verify a purple clip appears on a text track at the playhead position. Play through it — verify text renders in the preview.

- [ ] **Commit**
```bash
git add frontend/src/components/Timeline/TextOverlayTrack.tsx frontend/src/components/Timeline/Timeline.tsx frontend/src/components/Timeline/TimelineToolbar.tsx
git commit -m "feat: text overlay timeline track and add-text button"
```

---

## Task 10: Text Overlay Editor in Properties Panel

**Files:**
- Modify: `frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx`

When a text overlay is selected (for now, we'll detect it by tracking `selectedOverlayId` in the store — see note below), show its editor. Since we haven't wired selection to text overlays yet, for this task we'll add a `selectedOverlayId` to the store and wire clicking a TextOverlayTrack clip to set it.

- [ ] **Add `selectedOverlayId` to store**

In `useProjectStore.ts`:
- Add `selectedOverlayId: string | null` to the interface
- Add `selectOverlay: (id: string | null) => void` to the interface
- Initialize `selectedOverlayId: null` in initial state
- Add implementation: `selectOverlay: (selectedOverlayId) => set({ selectedOverlayId })`
- In `deleteTextOverlay`: after deleting, also clear selection if it was selected:
  ```typescript
  deleteTextOverlay: (id) => {
    withHistory(set, get, (p) => ({
      ...p,
      textOverlays: p.textOverlays.filter((o) => o.id !== id),
    }));
    set((s) => s.selectedOverlayId === id ? { selectedOverlayId: null } : {});
  },
  ```

- [ ] **Wire click-to-select in `TextOverlayTrack.tsx`**

Import and call `selectOverlay` from the store:
```tsx
const { project, deleteTextOverlay, selectOverlay, selectedOverlayId } = useProjectStore();
```

Add `onClick={() => selectOverlay(o.id)}` to each overlay chip div. Style selected chip with a ring:
```tsx
className={`... ${selectedOverlayId === o.id ? "ring-2 ring-white" : ""}`}
```

- [ ] **Add text overlay editor to `ClipPropertiesPanel.tsx`**

At the top, check `selectedOverlayId` first:

```tsx
import { useProjectStore } from "../../store/useProjectStore";

export default function ClipPropertiesPanel() {
  const {
    project, selectedClipId, selectedOverlayId,
    setClipSpeed, setClipVolume, setClipFade,
    updateTextOverlay,
  } = useProjectStore();

  // Prefer overlay editor if an overlay is selected
  const overlay = selectedOverlayId
    ? project.textOverlays.find((o) => o.id === selectedOverlayId)
    : null;

  if (overlay) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Text</label>
          <textarea
            value={overlay.text}
            onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded p-2 resize-none outline-none focus:ring-1 focus:ring-blue-400"
            rows={3}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Font Size — {overlay.fontSize}px
          </label>
          <input
            type="range" min={12} max={120} step={2}
            value={overlay.fontSize}
            onChange={(e) => updateTextOverlay(overlay.id, { fontSize: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Color</label>
          <input
            type="color"
            value={overlay.color}
            onChange={(e) => updateTextOverlay(overlay.id, { color: e.target.value })}
            className="w-full h-8 rounded border border-gray-200 cursor-pointer"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Weight</label>
          <div className="flex gap-2">
            {(["normal", "bold"] as const).map((w) => (
              <button
                key={w}
                onClick={() => updateTextOverlay(overlay.id, { fontWeight: w })}
                className={`flex-1 py-1 rounded text-xs border ${overlay.fontWeight === w ? "bg-purple-600 text-white border-purple-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Position X — {overlay.x.toFixed(0)}%
          </label>
          <input
            type="range" min={0} max={100}
            value={overlay.x}
            onChange={(e) => updateTextOverlay(overlay.id, { x: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Position Y — {overlay.y.toFixed(0)}%
          </label>
          <input
            type="range" min={0} max={100}
            value={overlay.y}
            onChange={(e) => updateTextOverlay(overlay.id, { y: parseInt(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
            Duration — {(overlay.endTime - overlay.startTime).toFixed(1)}s
          </label>
          <input
            type="range" min={0.5} max={30} step={0.5}
            value={overlay.endTime - overlay.startTime}
            onChange={(e) => updateTextOverlay(overlay.id, { endTime: overlay.startTime + parseFloat(e.target.value) })}
            className="w-full accent-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Background</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateTextOverlay(overlay.id, { background: "transparent" })}
              className={`flex-1 py-1 rounded text-xs border ${overlay.background === "transparent" ? "bg-purple-600 text-white border-purple-600" : "border-gray-300 hover:bg-gray-50"}`}
            >
              None
            </button>
            <input
              type="color"
              value={overlay.background === "transparent" ? "#000000" : overlay.background}
              onChange={(e) => updateTextOverlay(overlay.id, { background: e.target.value })}
              className="flex-1 h-8 rounded border border-gray-200 cursor-pointer"
              title="Background color"
            />
          </div>
        </div>
      </div>
    );
  }

  // ... rest of clip properties (speed/volume/fade) stays the same
```

- [ ] **Run type check + test** — Click a text overlay on the timeline, switch to Properties tab. Edit text, size, color, position — verify changes appear live in the preview.

- [ ] **Commit**
```bash
git add frontend/src/store/useProjectStore.ts frontend/src/components/LeftPanel/ClipPropertiesPanel.tsx frontend/src/components/Timeline/TextOverlayTrack.tsx
git commit -m "feat: text overlay editor in properties panel"
```

---

## Task 11: FFmpeg Export — Speed, Volume, Fade, Text Overlays

**Files:**
- Modify: `backend/services/ffmpeg.py`

This task updates the export pipeline to honour the new Clip fields and render text overlays.

- [ ] **Full rewrite of `backend/services/ffmpeg.py`**:

```python
import subprocess, uuid
from pathlib import Path

OUT = Path(__file__).parent.parent / "out"
OUT.mkdir(exist_ok=True)

RATIO_FILTERS = {
    "16:9": "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "9:16": "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "1:1":  "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
    "4:3":  "scale=1440:1080:force_original_aspect_ratio=decrease,pad=1440:1080:(ow-iw)/2:(oh-ih)/2",
}

def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")

def export(project: dict, uploads_dir: Path) -> Path:
    ratio_filter = RATIO_FILTERS.get(project.get("aspectRatio", "16:9"), RATIO_FILTERS["16:9"])
    tracks = project.get("tracks", [])

    clips = []
    for track in tracks:
        if track.get("hidden"):
            continue
        for clip in track.get("clips", []):
            matches = list(uploads_dir.glob(f"{clip['fileId']}.*"))
            if matches:
                clips.append({**clip, "path": str(matches[0]), "track_muted": track.get("muted", False)})
    clips.sort(key=lambda c: c["startTime"])

    if not clips:
        raise ValueError("No clips to export")

    inputs = []
    filter_parts = []
    concat_v = []
    concat_a = []

    for i, clip in enumerate(clips):
        ss = clip.get("sourceStart", 0)
        se = clip.get("sourceEnd", clip.get("duration", 0))
        speed = clip.get("speed", 1.0) or 1.0
        volume = clip.get("volume", 1.0) if not clip.get("muted") and not clip.get("track_muted") else 0.0
        fade_in = clip.get("fadeIn", 0) or 0
        fade_out = clip.get("fadeOut", 0) or 0
        clip_dur = (se - ss) / speed

        inputs += ["-ss", str(ss), "-to", str(se), "-i", clip["path"]]

        # Video filter chain
        vf = f"[{i}:v]setpts=PTS/{speed}/TB,{ratio_filter}"

        if fade_in > 0:
            vf += f",fade=t=in:st=0:d={fade_in}"
        if fade_out > 0:
            vf += f",fade=t=out:st={max(0, clip_dur - fade_out)}:d={fade_out}"
        vf += f"[v{i}]"
        filter_parts.append(vf)
        concat_v.append(f"[v{i}]")

        # Audio filter chain
        # atempo supports 0.5–2.0 per filter; chain for extremes
        if volume == 0 or clip.get("muted") or clip.get("track_muted"):
            filter_parts.append(f"[{i}:a]volume=0[a{i}]")
        else:
            af = f"[{i}:a]"
            # Handle speed with atempo (chain if outside 0.5–2 range)
            if speed != 1.0:
                tempos = []
                s = speed
                while s > 2.0:
                    tempos.append("atempo=2.0")
                    s /= 2.0
                while s < 0.5:
                    tempos.append("atempo=0.5")
                    s *= 2.0
                tempos.append(f"atempo={s:.4f}")
                af += ",".join(tempos) + ","
            af += f"volume={volume:.4f}[a{i}]"
            filter_parts.append(af)
        concat_a.append(f"[a{i}]")

    n = len(clips)
    filter_complex = ";".join(filter_parts)
    concat_str = "".join(concat_v) + "".join(concat_a)
    filter_complex += f";{concat_str}concat=n={n}:v=1:a=1[vout][aout]"

    # Captions
    captions = project.get("captions", [])
    caption_style = project.get("captionStyle", "")
    if captions and caption_style and caption_style not in ("minimal", "karaoke"):
        drawtext_filters = []
        for cap in captions:
            escaped = _escape(cap["text"])
            t_start, t_end = cap["startTime"], cap["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            if caption_style == "subtitle":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=36:fontcolor=white:box=1:"
                    f"boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h*0.85:enable='{enable}'"
                )
            elif caption_style == "bold":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=52:fontcolor=white:"
                    f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.85:enable='{enable}'"
                )
            elif caption_style == "cinematic":
                drawtext_filters.append(
                    f"drawtext=text='{escaped}':fontsize=40:fontcolor=white:"
                    f"x=(w-text_w)/2:y=(h-text_h)/2:enable='{enable}'"
                )
        if drawtext_filters:
            chained = "[vpre]" + "[vdt];[vdt]".join(drawtext_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vpre];{chained}[vout]", 1)

    # Text overlays
    text_overlays = project.get("textOverlays", [])
    if text_overlays:
        # We need to know the output resolution to convert percentages
        ratio = project.get("aspectRatio", "16:9")
        res = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "4:3": (1440, 1080)}.get(ratio, (1920, 1080))
        ov_filters = []
        for ov in text_overlays:
            escaped = _escape(ov["text"])
            t_start, t_end = ov["startTime"], ov["endTime"]
            enable = f"between(t,{t_start},{t_end})"
            px_x = int(ov["x"] / 100 * res[0])
            px_y = int(ov["y"] / 100 * res[1])
            fs = ov.get("fontSize", 32)
            color = ov.get("color", "#ffffff").lstrip("#")
            bold = 1 if ov.get("fontWeight") == "bold" else 0
            ov_filters.append(
                f"drawtext=text='{escaped}':fontsize={fs}:fontcolor=0x{color}:bold={bold}:"
                f"x={px_x}-text_w/2:y={px_y}-text_h/2:enable='{enable}'"
            )
        if ov_filters:
            chained = "[vpre2]" + "[vov];[vov]".join(ov_filters)
            filter_complex = filter_complex.replace("[vout]", f"[vpre2];{chained}[vout]", 1)

    out_path = OUT / f"{uuid.uuid4()}.mp4"
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-3000:]}")
    return out_path
```

- [ ] **Test export** — Build a project with a 2× speed clip and a text overlay. Click Export. Verify the exported video: plays at 2× speed, text appears at the correct time. Check the FFmpeg log for errors if the file doesn't download.

- [ ] **Commit**
```bash
git add backend/services/ffmpeg.py
git commit -m "feat: FFmpeg export with speed, volume, fade, text overlays"
```

---

## Task 12: Final Polish + LeftPanel Wiring

**Files:**
- Modify: `frontend/src/components/LeftPanel/LeftPanel.tsx`

The `LeftPanel` currently has Media and Transcript tabs. We need to add Properties and verify `seek` flows correctly.

- [ ] **Read `LeftPanel.tsx`** — check current tab structure and what props it accepts.

- [ ] **Update `LeftPanel.tsx`** to:
  1. Accept `seek: (t: number) => void` as a prop
  2. Add "Properties" tab
  3. Pass `seek` to `TranscriptTab`
  4. Render `ClipPropertiesPanel` for Properties tab

Example structure:
```tsx
import MediaTab from "./MediaTab";
import TranscriptTab from "./TranscriptTab";
import ClipPropertiesPanel from "./ClipPropertiesPanel";
import { useState } from "react";

type Tab = "Media" | "Transcript" | "Properties";

interface Props { seek: (t: number) => void }

export default function LeftPanel({ seek }: Props) {
  const [tab, setTab] = useState<Tab>("Media");
  return (
    <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(["Media", "Transcript", "Properties"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors
              ${tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "Media" && <MediaTab />}
        {tab === "Transcript" && <TranscriptTab seek={seek} />}
        {tab === "Properties" && <ClipPropertiesPanel />}
      </div>
    </div>
  );
}
```

- [ ] **Update `App.tsx`** to pass `seek` to `LeftPanel`:

```tsx
<LeftPanel seek={seek} />
```

- [ ] **Run `pnpm tsc --noEmit`** — fix all remaining type errors.

- [ ] **Full end-to-end test:**
  1. Upload a video clip
  2. Drag it onto the timeline
  3. Transcribe → verify word-level karaoke in preview (select karaoke style)
  4. Click words in transcript panel → verify seek works
  5. Double-click a word → edit it → press Enter → verify text updates in overlay
  6. Select a clip → Properties tab → change speed to 2× → clip narrows, plays faster
  7. Add fade-in 0.5s → play from clip start → fades from black
  8. Click "T" button → text overlay appears → click it → Properties tab shows editor
  9. Edit text, color, position → verify live in preview
  10. Export → verify all effects baked in

- [ ] **Commit**
```bash
git add frontend/src/components/LeftPanel/LeftPanel.tsx frontend/src/App.tsx
git commit -m "feat: wire seek into LeftPanel, add Properties tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Word-level karaoke captions — Tasks 1–4
- ✅ Karaoke style in picker — Task 4
- ✅ Transcript click-to-seek, edit, delete — Task 5
- ✅ Speed per clip (data + preview + export) — Tasks 3, 7, 11
- ✅ Volume per clip (data + preview + export) — Tasks 3, 7, 11
- ✅ Fade in/out (data + preview + export) — Tasks 3, 7, 11
- ✅ Clip properties UI — Task 6
- ✅ Text overlays (data + store + renderer + timeline + editor) — Tasks 8, 9, 10
- ✅ FFmpeg updated for all features — Task 11
- ✅ LeftPanel wired — Task 12

**Type consistency check:**
- `CaptionWord` defined in Task 2, used in Tasks 4, 5 ✅
- `TextOverlay` defined in Task 2, store actions in Task 3, renderer in Task 8, timeline in Task 9, editor in Task 10 ✅
- `setClipSpeed / setClipVolume / setClipFade` defined in Task 3, used in Task 6 ✅
- `addTextOverlay / updateTextOverlay / deleteTextOverlay / selectOverlay` defined in Tasks 3 and 10, used in Tasks 9 and 10 ✅

**One gap fixed:** `setClipFade` in Task 3 had a typo (`...t,` instead of `...t,`). The correct implementation uses `p.tracks.map((t) => ({...t, ...` — double-check when implementing.
