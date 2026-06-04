/// <reference types="vite/client" />

// jassub ships as plain JS without type declarations. We only use a small slice.
declare module "jassub" {
  export interface JASSUBOptions {
    canvas?: HTMLCanvasElement;
    video?: HTMLVideoElement;
    subContent?: string;
    subUrl?: string;
    workerUrl?: string;
    wasmUrl?: string;
    modernWasmUrl?: string;
    legacyWasmUrl?: string;
    fonts?: Array<string | Uint8Array>;
    availableFonts?: Record<string, string | Uint8Array>;
    fallbackFont?: string;
    [key: string]: unknown;
  }
  export default class JASSUB {
    constructor(options: JASSUBOptions);
    setTrack(content: string): void;
    setTrackByUrl(url: string): void;
    setCurrentTime(isPaused: boolean, currentTime: number, rate?: number): void;
    resize(width?: number, height?: number, top?: number, left?: number, force?: boolean): void;
    destroy(err?: string | Error): void;
  }
}
