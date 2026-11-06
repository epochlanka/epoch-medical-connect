import { loadFont } from "@remotion/google-fonts/Caveat";
import { noise2D } from "@remotion/noise";
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { ramp, rand, shake, useT, win } from "../lib/anim";
import { SCENES, W } from "../timeline";
import { clamp, display, EASE_IN, body } from "../theme";
import { Slam } from "../components/Type";

const hand = loadFont("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;
const START = SCENES.chaos[0];

const PAPERS = new Array(16).fill(0).map((_, i) => ({
  x: rand(i + 1) * 1920,
  y: rand(i + 40) * 1080,
  rot: rand(i + 7) * 60 - 30,
  w: 230 + rand(i + 3) * 120,
  delay: rand(i + 11) * 2.2,
  depth: 0.6 + rand(i + 19) * 0.8,
}));

const NOTES = ["Amox 500 tds ??", "Pt: N. Perera - BP?", "Paracet 1g ... 5/7", "Stock: 47? 52?", "f/u 2 wks??", "Rx: cetiriz.. 10"];

/** A paper sheet with scribbled lines. */
const Paper: React.FC<{ w: number; note: string; seed: number }> = ({ w, note, seed }) => (
  <div
    style={{
      width: w,
      height: w * 1.3,
      background: "linear-gradient(170deg, #fdfaf2, #e9e2d0)",
      borderRadius: 6,
      boxShadow: "0 20px 50px rgba(0,0,0,.55)",
      padding: w * 0.09,
      display: "flex",
      flexDirection: "column",
      gap: w * 0.06,
    }}
  >
    <div style={{ fontFamily: hand, fontSize: w * 0.12, color: "#1e3a8a", rotate: `${rand(seed) * 6 - 3}deg` }}>{note}</div>
    {new Array(6).fill(0).map((_, k) => (
      <div
        key={k}
        style={{
          height: 3,
          width: `${55 + rand(seed * 10 + k) * 40}%`,
          background: k === 3 ? "#dc2626" : "#94a3b8",
          opacity: 0.7,
          borderRadius: 2,
        }}
      />
    ))}
  </div>
);

/** Tally marks drawn in groups of five. */
const Tally: React.FC<{ p: number }> = ({ p }) => {
  const marks = 17;
  const shown = Math.floor(p * marks);
  return (
    <svg width={760} height={150} viewBox="0 0 760 150">
      {new Array(marks).fill(0).map((_, i) => {
        const g = Math.floor(i / 5);
        const k = i % 5;
        const x0 = g * 200 + k * 34;
        const vis = i < shown ? 1 : 0;
        if (k === 4)
          return <line key={i} x1={g * 200 - 14} y1={110} x2={g * 200 + 150} y2={30} stroke="#fca5a5" strokeWidth={9} strokeLinecap="round" opacity={vis} />;
        return <line key={i} x1={x0 + 6} y1={20 + (i % 2) * 4} x2={x0 + (i % 3)} y2={125} stroke="#f8fafc" strokeWidth={9} strokeLinecap="round" opacity={vis} />;
      })}
    </svg>
  );
};

export const Chaos: React.FC = () => {
  const t = useT(START);
  const sh = shake(t, W.chaos, 26, 3.5);
  // everything gets sucked into the centre as "So, we built something better" begins
  const suck = ramp(t, W.soWeBuilt - 0.15, 0.75, EASE_IN);
  const chaosEnergy = interpolate(t, [0, W.chaos, W.chaos + 0.4], [0.4, 1, 1.4], clamp);

  const line = (txt: string, a: number, b: number, color = "#fff", size = 132) => {
    const o = win(t, a, b, 0.15, 0.2);
    const jit = noise2D("j" + txt, t * 9, 0) * 6 * chaosEnergy;
    return (
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 400,
          opacity: o,
          translate: `${jit}px ${(1 - ramp(t, a, 0.4)) * 40}px`,
          fontFamily: display,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: -4,
          color,
          lineHeight: 1,
          textShadow: "0 0 30px rgba(0,0,0,.95), 0 0 70px rgba(0,0,0,.8), 0 6px 0 rgba(0,0,0,.35)",
        }}
      >
        {txt}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ translate: `${sh.x}px ${sh.y}px` }}>
      {/* tumbling paperwork */}
      <AbsoluteFill style={{ perspective: 1400 }}>
        {PAPERS.map((p, i) => {
          const tt = t - p.delay;
          if (tt < -0.3) return null;
          const appear = ramp(t, p.delay, 0.5);
          const dx = noise2D("px" + i, tt * 0.25 * chaosEnergy, i) * 260 * chaosEnergy;
          const dy = noise2D("py" + i, i, tt * 0.25 * chaosEnergy) * 180 * chaosEnergy;
          const x = interpolate(suck, [0, 1], [p.x + dx, 960]);
          const y = interpolate(suck, [0, 1], [p.y + dy, 540]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x - p.w / 2,
                top: y - p.w * 0.65,
                opacity: appear * (1 - suck) * 0.92,
                scale: String(p.depth * (1 - suck * 0.9) * (0.6 + appear * 0.4)),
                rotate: `${p.rot + tt * 18 * (i % 2 ? 1 : -1) * chaosEnergy + suck * 540}deg`,
                transform: `rotateX(${noise2D("rx" + i, tt * 0.3, 0) * 50}deg) rotateY(${noise2D("ry" + i, 0, tt * 0.3) * 60}deg)`,
                filter: `brightness(${0.62 + p.depth * 0.18})${p.depth < 0.9 ? ` blur(${(0.9 - p.depth) * 8}px)` : ""}`,
              }}
            >
              <Paper w={p.w} note={NOTES[i % NOTES.length]} seed={i} />
            </div>
          );
        })}
      </AbsoluteFill>

      {/* red alarm wash that builds towards "chaos" */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, rgba(239,68,68,.0) 30%, rgba(220,38,38,.35) 100%)",
          opacity: interpolate(t, [6, W.chaos, W.chaos + 0.1, W.soWeBuilt], [0, 0.8, 1, 0], clamp) * (0.8 + 0.2 * Math.sin(t * 20)),
        }}
      />

      <AbsoluteFill
        style={{
          opacity: (1 - suck) * 0.85,
          background: "linear-gradient(180deg, transparent 25%, rgba(5,2,4,.75) 38%, rgba(5,2,4,.75) 78%, transparent 92%)",
        }}
      />
      <AbsoluteFill style={{ opacity: 1 - suck }}>
        {line("Paper files.", W.paperFiles, W.handwritten - 0.05)}
        {line("Handwritten doses.", W.handwritten, W.stock - 0.05)}
        {/* the scribbled dose, written on as it is said */}
        <div
          style={{
            position: "absolute",
            left: 150,
            top: 580,
            fontFamily: hand,
            fontSize: 110,
            color: "#93c5fd",
            rotate: "-4deg",
            opacity: win(t, W.handwritten + 0.2, W.stock - 0.05, 0.1, 0.2),
            clipPath: `inset(0 ${(1 - ramp(t, W.handwritten + 0.25, 1.5, (x) => x)) * 100}% 0 0)`,
          }}
        >
          Amox 500mg tds x5<span style={{ color: "#f87171" }}> ??</span>
        </div>
        {line("Stock counted by hand.", W.stock, W.everyClinic - 0.05)}
        <div style={{ position: "absolute", left: 160, top: 580, opacity: win(t, W.stock + 0.2, W.everyClinic - 0.05, 0.1, 0.2) }}>
          <Tally p={ramp(t, W.stock + 0.3, 2.3, (x) => x)} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 1000,
            top: 590,
            fontFamily: display,
            fontWeight: 700,
            fontSize: 110,
            color: "#fca5a5",
            opacity: win(t, W.stock + 1.2, W.everyClinic - 0.05, 0.1, 0.2),
          }}
        >
          {["47?", "52?", "49?", "51?"][Math.floor(t * 5) % 4]}
        </div>
        <div
          style={{
            position: "absolute",
            left: 130,
            top: 330,
            fontFamily: body,
            fontWeight: 600,
            fontSize: 64,
            color: "#e2e8f0",
            opacity: win(t, W.everyClinic, W.soWeBuilt - 0.2, 0.25, 0.3),
            translate: `0px ${(1 - ramp(t, W.everyClinic, 0.5)) * 30}px`,
          }}
        >
          Every clinic knows the…
        </div>
        <div style={{ position: "absolute", left: 120, top: 420 }}>
          <Slam t={t} at={W.chaos} text="CHAOS." size={300} color="#fff" glow="#ef4444" out={W.soWeBuilt - 0.25} />
        </div>
      </AbsoluteFill>

      {/* glitch slices on the hit */}
      {t > W.chaos && t < W.chaos + 0.5
        ? new Array(6).fill(0).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: rand(i + Math.floor(t * 30)) * 1080,
                height: 6 + rand(i * 3 + Math.floor(t * 30)) * 40,
                background: i % 2 ? "rgba(0,229,255,.25)" : "rgba(255,45,85,.3)",
                mixBlendMode: "screen",
                translate: `${(rand(i * 7 + Math.floor(t * 30)) - 0.5) * 200}px 0px`,
              }}
            />
          ))
        : null}
    </AbsoluteFill>
  );
};
