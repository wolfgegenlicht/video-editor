# Talking Head Video Editor — Time-Saver Sprint

## Goal
Position the tool as the go-to talking head video editor by adding the three features creators care most about.

---

## Feature 1: Filler Word Detection (✅ implemented)

**What**: Detect filler words in the transcript (um, uh, äh, ähm, etc.) and highlight them for review before cutting.

**Files changed**:
- `frontend/src/components/LeftPanel/TranscriptTab.tsx` — new state, detection logic, filler word highlights, action bar

**How it works**:
1. Click "✂ Fillers" in the transcript toolbar
2. All filler words highlight in orange
3. Dismiss individual false positives with × on each word
4. "Cut All" removes all confirmed fillers from the video (last-to-first to preserve indices)

**Filler words (EN + DE)**:
- English: um, uh, like, basically, literally, actually, right, kind, sort, hmm
- German: äh, ähm, halt, eigentlich, quasi, sozusagen, irgendwie, naja, also, ne, genau, ja, okay, genau

---

## Feature 2: Silence Detection (✅ implemented)

**What**: Detect silent sections in the audio and highlight them for review before cutting.

**Files changed**:
- `backend/routes/silence_detect.py` — new backend route using FFmpeg silencedetect
- `backend/main.py` — register new route
- `frontend/src/lib/api.ts` — add detectSilences() function
- `frontend/vite.config.ts` — add /silence-detect to proxy paths
- `frontend/src/components/LeftPanel/TranscriptTab.tsx` — silence badges + action bar

**How it works**:
1. Click "⏱ Silences" in the transcript toolbar
2. FFmpeg runs `silencedetect=n=-40dB:d=0.5` on the source file
3. Silent sections appear as inline badges `[0.8s ×]` between words
4. Dismiss individual silences with ×
5. "Cut All" removes all silence ranges from the timeline

---

## Feature 3: Caption Style Presets (✅ implemented)

**What**: 7 one-click caption style presets that creators can pick from, displayed as visual swatches above the style controls.

**Files changed**:
- `frontend/src/lib/captionPresets.ts` — 7 preset definitions
- `frontend/src/components/LeftPanel/CaptionPresetPicker.tsx` — swatch picker UI
- `frontend/src/components/LeftPanel/CaptionStyleEditor.tsx` — add picker at top

**Presets**:
| Name | Description |
|---|---|
| Default | White bold, yellow karaoke highlight |
| Impact | Black outline, large Impact font, red highlight |
| Minimal | Light weight, blue highlight, no shadow |
| Dark Box | White on dark semi-transparent background |
| Word Pop | Bold, orange highlight, text shadow |
| Subtitles | Small, dark box, bottom position |
| Viral | Bold, yellow highlight, letter spacing |

---

## Next Steps (v2)

- Auto-chapter generation from transcript (Claude API → YouTube timestamps)
- Long-to-short clip extraction (Claude analyzes transcript for hooks → Reels/Shorts)
- Auto-reframe to 9:16 with face-tracking crop
- Speaker diarization for multi-person podcasts
