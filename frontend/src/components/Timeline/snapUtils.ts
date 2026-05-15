export const SNAP_PX = 8;

export function findSnap(
  candidateStart: number,
  duration: number,
  snapPoints: number[],
  thresholdSec: number
): { snappedStart: number; snapTime: number | null } {
  let best: { start: number; snap: number; dist: number } | null = null;
  for (const sp of snapPoints) {
    const d1 = Math.abs(candidateStart - sp);
    if (d1 < thresholdSec && (!best || d1 < best.dist))
      best = { start: sp, snap: sp, dist: d1 };
    const d2 = Math.abs(candidateStart + duration - sp);
    if (d2 < thresholdSec && (!best || d2 < best.dist))
      best = { start: sp - duration, snap: sp, dist: d2 };
  }
  return best
    ? { snappedStart: best.start, snapTime: best.snap }
    : { snappedStart: candidateStart, snapTime: null };
}
