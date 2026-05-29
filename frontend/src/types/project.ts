export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type TrackType = "video" | "audio" | "captions";

export interface CaptionTrackStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  color: string;
  letterSpacing: number;         // px
  textAlign: "left" | "center" | "right";
  textShadow: boolean;
  outlineWidth: number;          // px (0 = off)
  outlineColor: string;
  backgroundColor: string;      // hex or "transparent"
  x: number;                    // % of video width (top-left)
  y: number;                    // % of video height (top-left)
  boxW: number;                  // % of video width
  boxH: number;                  // % of video height
  highlightColor: string;
}

export interface UploadedFile {
  id: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
}

export interface ReframeTrackPoint {
  t: number; // seconds from source start
  x: number; // normalized face center x (0–1)
}

export interface ReframeData {
  trackPoints: ReframeTrackPoint[];
}

export interface ClipTransform {
  x: number;        // % offset from center (positive = right), relative to canvas width
  y: number;        // % offset from center (positive = down), relative to canvas height
  scale: number;    // multiplier; min 1.0 = fills canvas; max 5.0
  rotation: number; // degrees; free range
}

export interface Clip {
  id: string;
  fileId: string;
  startTime: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
  muted?: boolean;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  eyeContact?: boolean;
  eyeContactFileId?: string;
  blurBackground?: boolean;
  blurBackgroundFileId?: string;
  blurBackgroundIntensity?: number;
  pan?: number;                // -1 (full left) … 0 (center) … 1 (full right)
  audioEnhanceType?: AudioEnhanceType;
  audioEnhanceEnabled?: boolean;
  audioEnhanceFileId?: string;
  reframe?: boolean;
  reframeData?: ReframeData;
  transform?: ClipTransform;
}

export interface Track {
  id: string;
  type: TrackType;
  label?: string;
  clips: Clip[];
  muted?: boolean;
  hidden?: boolean;
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: CaptionWord[];
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  background: string;
  shape?: "pill";
  animateIn?: "slide-up";
  animateOut?: "slide-down";
  animateDuration?: number;
  paddingH?: number;
  paddingV?: number;
}

export type AudioEnhanceType = "normalize" | "denoise" | "clarity";

export type EffectType = "zoom" | "fade" | "blur" | "colorgrade" | "speedramp";

export interface ZoomParams {
  scale: number;   // 1.0–3.0
  rampIn: number;  // seconds to ramp from 1× to scale
  rampOut: number; // seconds to ramp from scale back to 1×
  anchorX?: number; // 0–1 horizontal focus point, default 0.5 (center)
  anchorY?: number; // 0–1 vertical focus point, default 0.5 (center)
}

export interface FadeParams {
  direction: "in" | "out";
}

export interface BlurRegion {
  x: number;      // 0–1 fraction of video width
  y: number;      // 0–1 fraction of video height
  width: number;  // 0–1 fraction of video width
  height: number; // 0–1 fraction of video height
  feather?: number; // 0–0.5, fraction of each edge to feather (0 = hard cut, 0.5 = very soft)
}

export interface BlurKeyframe {
  time: number;        // seconds relative to effect.startTime; array always sorted ascending
  intensity: number;   // blur radius in px
  region?: BlurRegion; // absent only for full-frame blurs
}

export interface BlurParams {
  intensity: number;    // 0–20 (gaussian blur radius in px)
  region?: BlurRegion;  // absent = full-frame blur
  keyframes?: BlurKeyframe[]; // present & non-empty → keyframe mode
}

export interface ColorGradeParams {
  preset: "warm" | "cool" | "bw" | "vintage";
  intensity: number; // 0–1 blend strength
}

export interface SpeedRampParams {
  startSpeed: number; // 0.25–4.0
  endSpeed: number;   // 0.25–4.0
  easing: "linear" | "ease";
}

export interface EffectOverlay {
  id: string;
  type: EffectType;
  startTime: number;
  endTime: number;
  params: ZoomParams | FadeParams | BlurParams | ColorGradeParams | SpeedRampParams;
}

export interface ClipTransition {
  id: string;
  trackId: string;
  atTime: number;   // cut point (clip A end / clip B start)
  type: "dissolve";
  duration: number; // total duration (half on each side of atTime)
}

export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  captionTrackStyle: CaptionTrackStyle;
  tracks: Track[];
  captions: Caption[];
  textOverlays: TextOverlay[];
  effectOverlays: EffectOverlay[];
  clipTransitions: ClipTransition[];
  hiddenEffectLanes?: Partial<Record<EffectType, boolean>>;
  rowLabels?: Record<string, string>;
  captionSourceFileId?: string;
}
