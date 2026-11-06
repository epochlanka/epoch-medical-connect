import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, EASE_OUT } from "../theme";

/** Absolute time in seconds for a component mounted in a scene that starts at `sceneStart`. */
export const useT = (sceneStart: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return sceneStart + frame / fps;
};

/** 0 -> 1 between t0 and t0 + dur. */
export const ramp = (
  t: number,
  t0: number,
  dur: number,
  easing: (x: number) => number = EASE_OUT,
) => interpolate(t, [t0, t0 + dur], [0, 1], { ...clamp, easing });

/** Overshooting pop, 0 -> 1 with a little bounce past 1. */
export const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);
export const pop = (t: number, t0: number, dur = 0.5) => ramp(t, t0, dur, BACK);

/** Fade window: in over `fin`, out over `fout`, visible between a and b. */
export const win = (t: number, a: number, b: number, fin = 0.35, fout = 0.35) =>
  Math.min(ramp(t, a, fin), 1 - ramp(t, b - fout, fout, Easing.in(Easing.cubic)));

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Piecewise keyframes over time: [[t, value], ...], eased between keys. */
export const keys = (
  t: number,
  frames: [number, number][],
  easing: (x: number) => number = Easing.bezier(0.65, 0, 0.35, 1),
) =>
  interpolate(
    t,
    frames.map((f) => f[0]),
    frames.map((f) => f[1]),
    { ...clamp, easing },
  );

/** Deterministic pseudo-random in [0, 1). */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Camera shake offset in px that decays after t0. */
export const shake = (t: number, t0: number, amp = 18, decay = 6) => {
  if (t < t0) return { x: 0, y: 0 };
  const k = Math.exp(-(t - t0) * decay) * amp;
  return {
    x: Math.sin(t * 91.7) * k,
    y: Math.cos(t * 77.3) * k,
  };
};
