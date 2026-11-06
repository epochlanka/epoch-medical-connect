import React from "react";
import { interpolate } from "remotion";
import { pop, ramp } from "../lib/anim";
import { body, clamp, display, EASE_OUT } from "../theme";

/** Words that rise out of a blur one by one, each at its own spoken time. */
export const Words: React.FC<{
  t: number;
  words: [string, number][]; // [word, time]
  size?: number;
  color?: string;
  weight?: number;
  gap?: number;
  style?: React.CSSProperties;
  accent?: Record<string, string>; // word -> colour
  out?: number; // time to exit
}> = ({ t, words, size = 96, color = "#f8fafc", weight = 800, gap, style, accent = {}, out }) => {
  const o = out === undefined ? 1 : 1 - ramp(t, out, 0.35);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: `${size * 0.12}px ${gap ?? size * 0.28}px`,
        fontFamily: display,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: -size * 0.03,
        color,
        opacity: o,
        ...style,
      }}
    >
      {words.map(([w, at], i) => {
        const p = ramp(t, at - 0.06, 0.45);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              translate: `0px ${(1 - p) * size * 0.45}px`,
              filter: `blur(${(1 - p) * 14}px)`,
              color: accent[w] ?? undefined,
              textShadow: accent[w] ? `0 0 ${size * 0.4}px ${accent[w]}88` : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** A single word that slams in big, with an overshoot and an RGB ghost. */
export const Slam: React.FC<{
  t: number;
  at: number;
  text: string;
  size?: number;
  color?: string;
  glow?: string;
  out?: number;
  style?: React.CSSProperties;
}> = ({ t, at, text, size = 180, color = "#fff", glow = "#3b82f6", out, style }) => {
  const p = pop(t, at, 0.42);
  const o = Math.min(ramp(t, at, 0.12), out === undefined ? 1 : 1 - ramp(t, out, 0.25));
  const ghost = interpolate(t, [at, at + 0.35], [1, 0], clamp);
  const scale = interpolate(p, [0, 1], [1.8, 1]);
  return (
    <div
      style={{
        position: "relative",
        fontFamily: display,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: -size * 0.04,
        lineHeight: 1,
        color,
        opacity: o,
        scale: String(scale),
        filter: `blur(${(1 - Math.min(p, 1)) * 10}px)`,
        textShadow: `0 0 ${size * 0.35}px ${glow}aa`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ position: "absolute", left: ghost * 14, top: 0, color: "#ff2d55", opacity: ghost * 0.7, mixBlendMode: "screen" }}>{text}</span>
      <span style={{ position: "absolute", left: -ghost * 14, top: 0, color: "#00e5ff", opacity: ghost * 0.7, mixBlendMode: "screen" }}>{text}</span>
      <span style={{ position: "relative" }}>{text}</span>
    </div>
  );
};

/** Section label: a glowing pill with an icon that wipes in. */
export const Chip: React.FC<{
  t: number;
  at: number;
  label: string;
  color: string;
  icon?: React.ReactNode;
  out?: number;
  style?: React.CSSProperties;
}> = ({ t, at, label, color, icon, out, style }) => {
  const p = ramp(t, at, 0.6);
  const o = out === undefined ? 1 : 1 - ramp(t, out, 0.3);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 26px 12px 16px",
        borderRadius: 99,
        background: `linear-gradient(90deg, ${color}40, ${color}10)`,
        border: `1.5px solid ${color}aa`,
        boxShadow: `0 0 40px ${color}55`,
        color: "#fff",
        fontFamily: body,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: 4,
        textTransform: "uppercase",
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0 round 99px)`,
        opacity: o,
        ...style,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 99,
          background: color,
          display: "grid",
          placeItems: "center",
          boxShadow: `0 0 24px ${color}`,
        }}
      >
        {icon}
      </div>
      {label}
    </div>
  );
};

/** Glass card used for callouts. */
export const Glass: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}> = ({ children, style, accent = "#60a5fa" }) => (
  <div
    style={{
      background: "linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.05))",
      border: "1.5px solid rgba(255,255,255,.22)",
      borderRadius: 26,
      backdropFilter: "blur(18px)",
      boxShadow: `0 30px 80px rgba(0,0,0,.45), 0 0 50px ${accent}33, inset 0 1px 0 rgba(255,255,255,.3)`,
      color: "#f8fafc",
      fontFamily: body,
      ...style,
    }}
  >
    {children}
  </div>
);

export const easeOut = EASE_OUT;
