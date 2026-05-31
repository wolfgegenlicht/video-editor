// Shape model for belly-band text overlays. Kept in sync with the Python
// duplicate in backend/services/overlay_render.py (separate process/language).

export type OverlayShape = "pill" | "rounded" | "rectangle" | "tab" | "accent";

// Default corner radius as a percent of the box height. For "tab" this is the
// chamfer depth of the single cut corner; for box-family shapes it is the
// corner radius (50% => fully rounded pill, capped at height/2 by the renderer).
export const DEFAULT_RADIUS_PCT: Record<OverlayShape, number> = {
  pill: 50,
  rounded: 22,
  rectangle: 0,
  tab: 30,
  accent: 8,
};

// Width of the left accent stripe, in px at REFERENCE_WIDTH (1280). Callers
// scale by previewWidth/1280 (preview) or outputWidth/1280 (export).
export const ACCENT_STRIPE_REF_WIDTH = 8;

// Effective radius percent: an explicit cornerRadius overrides the shape default.
export function effectiveRadiusPct(shape: OverlayShape, cornerRadius?: number): number {
  return cornerRadius ?? DEFAULT_RADIUS_PCT[shape];
}
