import type { Clip, EffectOverlay, SpeedRampParams } from "../types/project";

// ─── Speed-ramp time-warp math ──────────────────────────────────────────────
//
// EDIT space (E): where the user places clips/captions/ramps. clip.startTime,
// caption.startTime, ramp.startTime are all EDIT times — unchanged by ramps.
// Within a clip, source position is linear in E:
//   source(E) = clip.sourceStart + (E - clip.startTime) * base_speed
//
// OUTPUT space (O): the final rendered video clock. A ramp speeds up the source
// inside its window, so that window takes LESS output time and everything after
// ripples left. `playheadTime` and the timeline are rendered in O.
//
// The ramp changes only the E→O timing, not which source plays at a given E.
// `instantaneousSpeed(E)` is the playback rate; `editToOutput(E)` is the integral
// of 1/speed (so the ramp window compresses); `outputToEdit` is its inverse.
//
// A ramp's startSpeed/endSpeed are multipliers ON TOP OF the clip's base speed.
// The functions here return the ramp factor (relative to 1×); callers that drive
// a real <video>/<audio> element multiply by `clip.speed`.
//
// Every layer (preview, timeline render, export, captions) must use the SAME
// easing + integration sample count so they agree. The backend mirrors this in
// `backend/services/ffmpeg.py` (_easeInOut / _integrate_inverse_speed, N=100).

const N_SAMPLES = 100;

export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 2 * c * c : -1 + (4 - 2 * c) * c;
}

function rampEffects(ramps: EffectOverlay[]): EffectOverlay[] {
  return ramps
    .filter((e) => e.type === "speedramp")
    .slice()
    .sort((a, b) => a.startTime - b.startTime);
}

/** Instantaneous ramp factor at normalized position u∈[0,1] within a ramp. */
function speedAt(p: SpeedRampParams, u: number): number {
  const eased = p.easing === "ease" ? easeInOut(u) : Math.min(1, Math.max(0, u));
  return p.startSpeed + (p.endSpeed - p.startSpeed) * eased;
}

/** Average ramp factor over the normalized sub-interval [u0,u1] (midpoint rule). */
export function avgSpeed(p: SpeedRampParams, u0: number, u1: number): number {
  if (Math.abs(u1 - u0) < 1e-9) return speedAt(p, u0);
  let total = 0;
  for (let k = 0; k < N_SAMPLES; k++) {
    total += speedAt(p, u0 + (u1 - u0) * ((k + 0.5) / N_SAMPLES));
  }
  return total / N_SAMPLES;
}

/**
 * ∫₀^frac (1 / speed(u)) du  — the normalized OUTPUT duration of the first
 * `frac` of a ramp (multiply by ramp_dur to get seconds). Linear easing has a
 * closed form; ease uses midpoint integration matching the backend.
 */
export function integrateInverseSpeed(p: SpeedRampParams, frac: number): number {
  const f = Math.min(1, Math.max(0, frac));
  if (f < 1e-9) return 0;
  const { startSpeed: s0, endSpeed: s1 } = p;
  if (p.easing !== "ease") {
    if (Math.abs(s1 - s0) < 1e-9) return f / Math.max(1e-6, s0);
    // ∫₀^f 1/(s0+(s1-s0)u) du = (ln(s0+(s1-s0)f) - ln s0) / (s1-s0)
    return (Math.log(s0 + (s1 - s0) * f) - Math.log(s0)) / (s1 - s0);
  }
  let total = 0;
  for (let k = 0; k < N_SAMPLES; k++) {
    const u = ((k + 0.5) / N_SAMPLES) * f; // sample point in [0, f]
    total += 1 / Math.max(1e-6, speedAt(p, u));
  }
  return (total * f) / N_SAMPLES;
}

/** Output duration (seconds) of a whole ramp window. */
function rampOutputDur(r: EffectOverlay): number {
  const dur = Math.max(1e-6, r.endTime - r.startTime);
  return dur * integrateInverseSpeed(r.params as SpeedRampParams, 1);
}

/** Map an EDIT time to OUTPUT time (1:1 outside ramps; compressed inside). */
export function editToOutput(editTime: number, ramps: EffectOverlay[]): number {
  let o = 0;
  let lastE = 0;
  for (const r of rampEffects(ramps)) {
    const rs = r.startTime;
    const re = r.endTime;
    const dur = Math.max(1e-6, re - rs);
    if (editTime <= rs) return o + (editTime - lastE);
    o += rs - lastE; // pre-ramp 1:1
    if (editTime < re) {
      const frac = (editTime - rs) / dur;
      return o + integrateInverseSpeed(r.params as SpeedRampParams, frac) * dur;
    }
    o += rampOutputDur(r);
    lastE = re;
  }
  return o + (editTime - lastE);
}

/** Inverse of editToOutput (binary search; editToOutput is monotonic). */
export function outputToEdit(outputTime: number, ramps: EffectOverlay[]): number {
  const rs = rampEffects(ramps);
  if (rs.length === 0) return outputTime;
  let o = 0;
  let lastE = 0;
  for (const r of rs) {
    const pre = r.startTime - lastE; // pre-ramp segment (1:1)
    if (outputTime <= o + pre) return lastE + (outputTime - o);
    o += pre;
    lastE = r.startTime;
    const outDur = rampOutputDur(r);
    if (outputTime <= o + outDur) {
      // Inside the ramp output window — binary search the EDIT fraction.
      const dur = Math.max(1e-6, r.endTime - r.startTime);
      const targetNorm = (outputTime - o) / dur; // = integrateInverseSpeed(frac)
      const p = r.params as SpeedRampParams;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (integrateInverseSpeed(p, mid) < targetNorm) lo = mid;
        else hi = mid;
      }
      return r.startTime + ((lo + hi) / 2) * dur;
    }
    o += outDur;
    lastE = r.endTime;
  }
  return lastE + (outputTime - o);
}

/** The ramp factor at an EDIT time (1 outside any ramp). Multiply by base speed. */
export function instantaneousSpeed(editTime: number, ramps: EffectOverlay[]): number {
  for (const r of rampEffects(ramps)) {
    if (editTime >= r.startTime && editTime < r.endTime) {
      const u = (editTime - r.startTime) / Math.max(1e-6, r.endTime - r.startTime);
      return speedAt(r.params as SpeedRampParams, u);
    }
  }
  return 1;
}

/** The speed ramp active at an EDIT time, or null. */
export function activeSpeedRampAtEdit(
  editTime: number,
  ramps: EffectOverlay[]
): EffectOverlay | null {
  for (const r of rampEffects(ramps)) {
    if (editTime >= r.startTime && editTime < r.endTime) return r;
  }
  return null;
}

/** Total OUTPUT duration of the project (latest clip end mapped through ramps). */
export function compiledDuration(clips: Clip[], ramps: EffectOverlay[]): number {
  let maxEnd = 0;
  for (const c of clips) maxEnd = Math.max(maxEnd, c.startTime + c.duration);
  return editToOutput(maxEnd, ramps);
}
