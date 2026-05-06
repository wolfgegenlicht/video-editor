export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type CaptionStyle = "minimal" | "bold" | "subtitle" | "cinematic" | "karaoke";
export type TrackType = "video" | "audio" | "captions";

export interface UploadedFile {
  id: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
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

export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  tracks: Track[];
  captions: Caption[];
  textOverlays: TextOverlay[];
  captionSourceFileId?: string;
}
