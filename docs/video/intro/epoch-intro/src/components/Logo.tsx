import React from "react";
import { interpolate } from "remotion";
import { pop, ramp } from "../lib/anim";
import { clamp, display } from "../theme";

/** The E-Poch app mark: heart outline with an ECG trace, drawn on with `draw` (0..1). */
export const LogoMark: React.FC<{ size: number; draw?: number; glow?: number }> = ({ size, draw = 1, glow = 1 }) => {
  const heart = interpolate(draw, [0, 0.7], [0, 1], clamp);
  const pulse = interpolate(draw, [0.35, 1], [0, 1], clamp);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: "linear-gradient(140deg, #3b82f6 0%, #2563eb 45%, #0891b2 100%)",
        display: "grid",
        placeItems: "center",
        boxShadow: `0 0 ${size * 0.6 * glow}px rgba(59,130,246,.75), inset 0 ${size * 0.03}px 0 rgba(255,255,255,.35)`,
      }}
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 0 0-8-2.5A4.5 4.5 0 0 0 6 8c0 2.5 1.5 4.5 3 6l5 6 5-6Z"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - heart}
        />
        <path d="M3 12h4l1.5-3L11 15l1.5-4L14 12h3" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - pulse} />
      </svg>
    </div>
  );
};

/** Mark + "E-Poch" wordmark, letters assembling from `at`. */
export const Wordmark: React.FC<{ t: number; at: number; size?: number; sub?: string; subAt?: number }> = ({
  t,
  at,
  size = 150,
  sub,
  subAt,
}) => {
  const letters = ["E", "-", "P", "o", "c", "h"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
        <div style={{ scale: String(pop(t, at, 0.7)), rotate: `${(1 - ramp(t, at, 0.8)) * -25}deg` }}>
          <LogoMark size={size * 1.05} draw={ramp(t, at + 0.05, 1.1)} />
        </div>
        <div style={{ display: "flex", fontFamily: display, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.03, lineHeight: 1 }}>
          {letters.map((l, i) => {
            const p = ramp(t, at + 0.12 + i * 0.05, 0.55);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: i >= 2 ? "#60a5fa" : "#f8fafc",
                  opacity: p,
                  translate: `${(1 - p) * 60}px 0px`,
                  filter: `blur(${(1 - p) * 12}px)`,
                  textShadow: i >= 2 ? "0 0 40px rgba(96,165,250,.7)" : "0 0 30px rgba(255,255,255,.35)",
                }}
              >
                {l}
              </span>
            );
          })}
        </div>
      </div>
      {sub && subAt !== undefined ? (
        <div
          style={{
            fontFamily: display,
            fontWeight: 400,
            fontSize: size * 0.3,
            letterSpacing: size * 0.12,
            textTransform: "uppercase",
            color: "#cbd5e1",
            opacity: ramp(t, subAt, 0.6),
            clipPath: `inset(0 ${(1 - ramp(t, subAt, 0.8)) * 50}% 0 ${(1 - ramp(t, subAt, 0.8)) * 50}%)`,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

/** A heart-monitor trace sweeping across the frame. */
export const EcgSweep: React.FC<{ t: number; at: number; dur: number; y: number; width: number; color?: string; opacity?: number }> = ({
  t,
  at,
  dur,
  y,
  width,
  color = "#60a5fa",
  opacity = 1,
}) => {
  const p = ramp(t, at, dur, (x) => x);
  // flat - blip - big spike - flat ...
  const seg = width / 6;
  let d = `M0 ${y}`;
  for (let i = 0; i < 6; i++) {
    const x0 = i * seg;
    d += ` L${x0 + seg * 0.35} ${y} L${x0 + seg * 0.42} ${y - 18} L${x0 + seg * 0.48} ${y} L${x0 + seg * 0.55} ${y + 22} L${x0 + seg * 0.62} ${y - 120} L${x0 + seg * 0.69} ${y + 50} L${x0 + seg * 0.76} ${y} L${x0 + seg} ${y}`;
  }
  const tail = 0.28;
  return (
    <svg width={width} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity }}>
      <defs>
        <linearGradient id="ecgfade" x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={`${tail} 2`}
        strokeDashoffset={-(p * (1 + tail) - tail)}
        style={{ filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 30px ${color})` }}
      />
    </svg>
  );
};
