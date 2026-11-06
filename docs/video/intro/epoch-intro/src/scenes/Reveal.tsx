import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { EcgSweep, Wordmark } from "../components/Logo";
import { Words } from "../components/Type";
import { ramp, rand, useT } from "../lib/anim";
import { SCENES, W } from "../timeline";
import { clamp } from "../theme";

const START = SCENES.reveal[0];

const BURST = new Array(70).fill(0).map((_, i) => ({
  a: rand(i + 3) * Math.PI * 2,
  d: 300 + rand(i + 9) * 900,
  r: 2 + rand(i + 5) * 4,
  c: ["#60a5fa", "#22d3ee", "#a78bfa", "#f8fafc"][i % 4],
}));

export const Reveal: React.FC = () => {
  const t = useT(START);
  const out = ramp(t, SCENES.reveal[1] - 0.6, 0.6);
  const hit = W.thisIs;
  const flash = interpolate(t, [hit - 0.02, hit + 0.04, hit + 0.35], [0, 0.75, 0], clamp);
  // the pause before the reveal: a single heartbeat of light at the centre
  const beat = interpolate(t, [W.better + 0.4, hit - 0.05], [0, 1], clamp);
  const beatPulse = beat * (0.6 + 0.4 * Math.abs(Math.sin((t - W.better) * 5)));

  return (
    <AbsoluteFill style={{ opacity: 1 - out, scale: String(1 + out * 0.15) }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Words
          t={t}
          size={92}
          weight={700}
          out={W.better + 0.55}
          style={{ justifyContent: "center", maxWidth: 1500 }}
          accent={{ "better.": "#60a5fa" }}
          words={[
            ["So,", W.soWeBuilt],
            ["we", 11.44],
            ["built", 11.74],
            ["something", 12.02],
            ["better.", W.better],
          ]}
        />
      </AbsoluteFill>

      <EcgSweep t={t} at={W.better + 0.2} dur={hit - W.better - 0.2} y={540} width={1920} color="#38bdf8" opacity={1 - ramp(t, hit, 0.3)} />

      {/* the point of light */}
      <div
        style={{
          position: "absolute",
          left: 960 - 60,
          top: 540 - 60,
          width: 120,
          height: 120,
          borderRadius: 99,
          background: "radial-gradient(circle, #fff 0%, #93c5fd 30%, transparent 70%)",
          opacity: beatPulse * (1 - ramp(t, hit, 0.2)),
          scale: String(0.5 + beatPulse),
        }}
      />

      {/* shockwave rings */}
      {[0, 0.12, 0.26].map((d, i) => {
        const p = ramp(t, hit + d, 1.4);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960,
              top: 540,
              width: 10,
              height: 10,
              borderRadius: 999,
              border: `${6 - i * 1.5}px solid rgba(147,197,253,${(1 - p) * 0.9})`,
              translate: "-50% -50%",
              scale: String(1 + p * 260),
              boxShadow: "0 0 40px rgba(59,130,246,.6)",
              opacity: t >= hit + d ? 1 : 0,
            }}
          />
        );
      })}

      {/* particle burst */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {BURST.map((b, i) => {
          const p = ramp(t, hit, 2.2);
          if (t < hit) return null;
          return (
            <circle
              key={i}
              cx={960 + Math.cos(b.a) * b.d * p}
              cy={540 + Math.sin(b.a) * b.d * p * 0.7}
              r={b.r * (1 - p * 0.5)}
              fill={b.c}
              opacity={(1 - p) * 0.95}
            />
          );
        })}
      </svg>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: t >= hit - 0.05 ? 1 : 0 }}>
        <div style={{ scale: String(interpolate(t, [hit, hit + 3], [1.08, 1], clamp)) }}>
          <Wordmark t={t} at={hit} size={170} sub="Medical System" subAt={W.medicalSystem - 0.1} />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: "#dbeafe", opacity: flash, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
