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
  boxH: number;                  // % of video height (karaoke only)
  highlightMode: "none" | "karaoke";
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
  reframe?: boolean;
  reframeData?: ReframeData;
  transform?: ClipTransform;
}

export interface Track {
  id: string;
  type: TrackType;
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
}

export type EffectType = "zoom";

export interface ZoomParams {
  scale: number;   // 1.0–3.0
  rampIn: number;  // seconds to ramp from 1× to scale
  rampOut: number; // seconds to ramp from scale back to 1×
}

export interface EffectOverlay {
  id: string;
  type: EffectType;
  startTime: number;
  endTime: number;
  params: ZoomParams;
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
  captionSourceFileId?: string;
}
