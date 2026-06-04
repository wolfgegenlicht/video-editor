import JASSUB from "jassub";
// Vite copies these assets and gives us their served URLs. jassub-worker.js is the
// self-contained worker; it fetches the wasm from the URL we hand it below.
import workerUrl from "jassub/dist/jassub-worker.js?url";
import wasmUrl from "jassub/dist/jassub-worker.wasm?url";
import modernWasmUrl from "jassub/dist/jassub-worker-modern.wasm?url";

// The same TTFs the backend export burns (served at /fonts/ via the dev proxy),
// so libass picks identical faces in preview and export. Anton is the free Impact
// substitute (single heavy weight).
const FONTS = [
  "/fonts/Inter-Regular.ttf",
  "/fonts/Inter-Bold.ttf",
  "/fonts/Merriweather-Regular.ttf",
  "/fonts/Merriweather-Bold.ttf",
  "/fonts/JetBrainsMono-Regular.ttf",
  "/fonts/JetBrainsMono-Bold.ttf",
  "/fonts/Anton-Regular.ttf",
];

const AVAILABLE_FONTS: Record<string, string> = {
  inter: "/fonts/Inter-Regular.ttf",
  merriweather: "/fonts/Merriweather-Regular.ttf",
  "jetbrains mono": "/fonts/JetBrainsMono-Regular.ttf",
  anton: "/fonts/Anton-Regular.ttf",
};

export function createJassub(canvas: HTMLCanvasElement, subContent: string): JASSUB {
  return new JASSUB({
    canvas,
    subContent,
    workerUrl,
    wasmUrl,
    modernWasmUrl,
    fonts: FONTS,
    availableFonts: AVAILABLE_FONTS,
    fallbackFont: "inter",
  });
}
