export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type CaptionStyle = "minimal" | "bold" | "subtitle" | "cinematic";
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
}

export interface Track {
  id: string;
  type: TrackType;
  clips: Clip[];
}

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  tracks: Track[];
  captions: Caption[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
