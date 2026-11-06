import { noise2D } from "@remotion/noise";
import React from "react";
import {
  AbsoluteFill,
  interpolateColors,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { W } from "../timeline";

// Palette per section: [time, base, blob A, blob B, blob C]. The background drifts between them.
const PALETTE: [number, string, string, string, string][] = [
  [0, "#0b0306", "#7f1d1d", "#9a3412", "#3b0a1e"],
  [W.chaos, "#120307", "#b91c1c", "#c2410c", "#4c0519"],
  [W.soWeBuilt + 0.6, "#030714", "#1e3a8a", "#0e7490", "#312e81"],
  [W.thisIs, "#030918", "#2563eb", "#06b6d4", "#7c3aed"],
  [W.oneSystem, "#030918", "#1d4ed8", "#0891b2", "#6d28d9"],
  [W.patientsFound, "#06051a", "#6d28d9", "#2563eb", "#a21caf"],
  [W.consultationRoom, "#02100e", "#047857", "#0e7490", "#1d4ed8"],
  [W.beforePatient, "#120904", "#c2410c", "#b45309", "#7c2d12"],
  [W.billBuilds, "#030c18", "#0369a1", "#0891b2", "#1d4ed8"],
  [W.staysInside, "#020611", "#1e3a8a", "#0f766e", "#1e1b4b"],
  [W.oneVisit, "#030716", "#2563eb", "#7c3aed", "#0891b2"],
  [W.epochFinal, "#030716", "#2563eb", "#06b6d4", "#7c3aed"],
];

const pick = (t: number, i: 1 | 2 | 3 | 4) =>
  interpolateColors(
    t,
    PALETTE.map((p) => p[0]),
    PALETTE.map((p) => p[i]),
  );

const PARTICLES = new Array(110).fill(0).map((_, i) => ({
  x: (Math.sin(i * 91.17) * 0.5 + 0.5) * 1920,
  y: (Math.cos(i * 37.31) * 0.5 + 0.5) * 1080,
  r: 1 + ((i * 7) % 5) * 0.55,
  speed: 6 + ((i * 13) % 17),
  seed: i,
}));

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const base = pick(t, 1);
  const cols = [pick(t, 2), pick(t, 3), pick(t, 4)];
  // energy: calmer in the breakdown, tense in the chaos
  const chaosJitter = t < W.soWeBuilt + 0.3 ? 1 : 0;

  const blobs = [0, 1, 2, 3, 4].map((i) => {
    const nx = noise2D("bx" + i, t * 0.06, i);
    const ny = noise2D("by" + i, i, t * 0.06);
    const size = 900 + 350 * noise2D("bs" + i, t * 0.1, i * 3);
    return {
      x: width * (0.5 + nx * 0.55),
      y: height * (0.5 + ny * 0.6),
      size,
      color: cols[i % 3],
      opacity: 0.55 + 0.25 * noise2D("bo" + i, t * 0.2, i),
    };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: base, overflow: "hidden" }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x - b.size / 2,
            top: b.y - b.size / 2,
            width: b.size,
            height: b.size,
            borderRadius: "50%",
            background: `radial-gradient(circle at center, ${b.color} 0%, transparent 65%)`,
            opacity: b.opacity,
            mixBlendMode: "screen",
          }}
        />
      ))}

      {/* perspective grid floor, always gliding forward */}
      <AbsoluteFill style={{ perspective: 900, opacity: 0.22 }}>
        <div
          style={{
            position: "absolute",
            left: -1000,
            right: -1000,
            top: height * 0.55,
            height: 1400,
            transformOrigin: "top center",
            rotate: "x 72deg",
            backgroundImage:
              "linear-gradient(rgba(148,197,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(148,197,255,.55) 1px, transparent 1px)",
            backgroundSize: "90px 90px",
            backgroundPosition: `0px ${(t * 60) % 90}px`,
            maskImage: "linear-gradient(to bottom, transparent, black 25%, black 60%, transparent)",
          }}
        />
      </AbsoluteFill>

      {/* drifting particles */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {PARTICLES.map((p) => {
          const dx = noise2D("px" + p.seed, t * 0.15, p.seed) * 140 + chaosJitter * Math.sin(t * 40 + p.seed) * 3;
          const y = (((p.y - t * p.speed) % height) + height) % height;
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.8 + (p.seed % 5) * 0.3) + p.seed));
          return <circle key={p.seed} cx={p.x + dx} cy={y} r={p.r} fill="#dbeafe" opacity={tw * 0.55} />;
        })}
      </svg>

      {/* vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.65) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Film grain on top of everything; the texture jumps every frame. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const ox = Math.floor(Math.abs(Math.sin(frame * 12.3)) * 512);
  const oy = Math.floor(Math.abs(Math.cos(frame * 7.7)) * 512);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "overlay", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -ox, top: -oy, width: 1920 + 1024, height: 1080 + 1024, display: "flex", flexWrap: "wrap" }}>
        {new Array(6 * 4).fill(0).map((_, i) => (
          <Img key={i} src={staticFile("fx/grain.png")} style={{ width: 512, height: 512 }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
