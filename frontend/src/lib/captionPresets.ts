import type { CaptionTrackStyle } from "../types/project";

export interface CaptionPreset {
  name: string;
  style: Partial<CaptionTrackStyle>;
  preview: { bg: string; text: string; highlight: string };
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    name: "Default",
    style: {
      fontFamily: "sans-serif", fontSize: 32, fontWeight: "bold",
      color: "#ffffff", letterSpacing: 0, textAlign: "center",
      textShadow: true, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "transparent", highlightColor: "#fde047",
    },
    preview: { bg: "transparent", text: "#ffffff", highlight: "#fde047" },
  },
  {
    name: "Impact",
    style: {
      fontFamily: "Impact, sans-serif", fontSize: 42, fontWeight: "bold",
      color: "#ffffff", letterSpacing: 1, textAlign: "center",
      textShadow: false, outlineWidth: 3, outlineColor: "#000000",
      backgroundColor: "transparent", highlightColor: "#ef4444",
    },
    preview: { bg: "transparent", text: "#ffffff", highlight: "#ef4444" },
  },
  {
    name: "Minimal",
    style: {
      fontFamily: "sans-serif", fontSize: 24, fontWeight: "normal",
      color: "#ffffff", letterSpacing: 0, textAlign: "center",
      textShadow: false, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "transparent", highlightColor: "#60a5fa",
    },
    preview: { bg: "transparent", text: "#ffffff", highlight: "#60a5fa" },
  },
  {
    name: "Dark Box",
    style: {
      fontFamily: "sans-serif", fontSize: 30, fontWeight: "bold",
      color: "#ffffff", letterSpacing: 0, textAlign: "center",
      textShadow: false, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "#000000", highlightColor: "#fde047",
    },
    preview: { bg: "#000000", text: "#ffffff", highlight: "#fde047" },
  },
  {
    name: "Word Pop",
    style: {
      fontFamily: "sans-serif", fontSize: 36, fontWeight: "bold",
      color: "#ffffff", letterSpacing: 0, textAlign: "center",
      textShadow: true, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "transparent", highlightColor: "#f97316",
    },
    preview: { bg: "transparent", text: "#ffffff", highlight: "#f97316" },
  },
  {
    name: "Subtitles",
    style: {
      fontFamily: "sans-serif", fontSize: 22, fontWeight: "normal",
      color: "#f5f5f5", letterSpacing: 0, textAlign: "center",
      textShadow: false, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "#1a1a1a", highlightColor: "#f5f5f5",
      y: 85,
    },
    preview: { bg: "#1a1a1a", text: "#f5f5f5", highlight: "#f5f5f5" },
  },
  {
    name: "Viral",
    style: {
      fontFamily: "sans-serif", fontSize: 38, fontWeight: "bold",
      color: "#ffffff", letterSpacing: 1, textAlign: "center",
      textShadow: true, outlineWidth: 0, outlineColor: "#000000",
      backgroundColor: "transparent", highlightColor: "#facc15",
    },
    preview: { bg: "transparent", text: "#ffffff", highlight: "#facc15" },
  },
];
