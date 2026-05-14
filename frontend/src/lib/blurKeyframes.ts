// frontend/src/lib/blurKeyframes.ts
import type { BlurKeyframe, BlurParams, BlurRegion } from "../types/project";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute effective BlurParams at relativeTime (seconds from effect.startTime).
 * Returns base unchanged when keyframes is empty.
 * Clamps to first/last keyframe outside their range.
 * Linearly interpolates all numeric fields between adjacent keyframes.
 */
export function interpolateBlurAt(
  keyframes: BlurKeyframe[],
  relativeTime: number,
  base: BlurParams,
): BlurParams {
  if (!keyframes.length) return base;

  if (relativeTime <= keyframes[0].time) {
    const kf = keyframes[0];
    return { ...base, intensity: kf.intensity, region: kf.region ?? base.region };
  }

  const last = keyframes[keyframes.length - 1];
  if (relativeTime >= last.time) {
    return { ...base, intensity: last.intensity, region: last.region ?? base.region };
  }

  let lo = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (relativeTime >= keyframes[i].time && relativeTime < keyframes[i + 1].time) {
      lo = i;
      break;
    }
  }

  const a = keyframes[lo];
  const b = keyframes[lo + 1];
  const t = (relativeTime - a.time) / (b.time - a.time);

  let region: BlurRegion | undefined = base.region;
  if (a.region && b.region) {
    region = {
      x:       lerp(a.region.x,             b.region.x,             t),
      y:       lerp(a.region.y,             b.region.y,             t),
      width:   lerp(a.region.width,         b.region.width,         t),
      height:  lerp(a.region.height,        b.region.height,        t),
      feather: lerp(a.region.feather ?? 0,  b.region.feather ?? 0,  t),
    };
  } else if (a.region) {
    region = a.region;
  } else if (b.region) {
    region = b.region;
  }

  return { ...base, intensity: lerp(a.intensity, b.intensity, t), region };
}
