export const FONT_FAMILY_CSS: Record<string, string> = {
  "sans-serif": "Inter, sans-serif",
  "serif": "Merriweather, serif",
  "monospace": "'JetBrains Mono', monospace",
};

// Line-box height as a multiple of font size (ascent + descent / em) for each
// bundled font. Mirrors the metrics PIL reads in backend/services/overlay_render.py
// (font.getmetrics()), so the preview's box height — and thus corner radius and
// tab chamfer — matches the baked PNG export. Keep in sync with the bundled fonts.
export const FONT_LINE_HEIGHT: Record<string, number> = {
  "sans-serif": 1.211,
  "serif": 1.257,
  "monospace": 1.32,
};
