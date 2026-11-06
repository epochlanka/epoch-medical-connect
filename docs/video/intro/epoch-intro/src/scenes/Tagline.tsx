import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { EcgSweep, LogoMark } from "../components/Logo";
import { Slam } from "../components/Type";
import { Still } from "../components/Window";
import { pop, ramp, rand, shake, useT } from "../lib/anim";
import { SCENES, W } from "../timeline";
import { body, clamp, display, EASE_IN_OUT, ROLE } from "../theme";

const START = SCENES.tagline[0];

const WALL = [
  "doctor-dashboard",
  "reception-queue",
  "batches",
  "admin-dashboard",
  "consult",
  "payments",
  "clinical-stats",
  "pharmacy-overview",
  "reception-checkin",
  "expiry",
  "admin-reports",
  "register",
];

const BURST = new Array(60).fill(0).map((_, i) => ({ a: rand(i) * Math.PI * 2, d: 400 + rand(i + 2) * 800, c: ["#60a5fa", "#22d3ee", "#a78bfa", "#fff"][i % 4] }));

export const Tagline: React.FC = () => {
  const t = useT(START);
  const final = W.epochFinal;
  const wallOut = ramp(t, final - 0.25, 0.35);
  const end = ramp(t, W.end - 1.0, 1.0);
  const sh1 = shake(t, W.oneVisit, 10, 8);
  const sh2 = shake(t, W.oneRecord, 10, 8);
  const sh3 = shake(t, W.zeroChaos, 14, 7);
  const sh = { x: sh1.x + sh2.x + sh3.x, y: sh1.y + sh2.y + sh3.y };
  const flash = Math.max(
    ...[W.oneVisit, W.oneRecord, W.zeroChaos].map((a) => interpolate(t, [a - 0.02, a + 0.03, a + 0.3], [0, 0.35, 0], clamp)),
    interpolate(t, [final - 0.02, final + 0.05, final + 0.7], [0, 0.9, 0], clamp),
  );
  // the wall pushes in on every beat
  const push = 1 + 0.06 * [W.oneVisit, W.oneRecord, W.zeroChaos].filter((a) => t > a).length;

  const logoScale = interpolate(t, [final, final + 0.6, final + 6], [0.2, 1.05, 0.98], { ...clamp, easing: EASE_IN_OUT });

  return (
    <AbsoluteFill>
      {/* 3D wall of the real screens */}
      <AbsoluteFill style={{ perspective: 1600, opacity: ramp(t, START, 0.5) * (1 - wallOut) * 0.55 }}>
        <div
          style={{
            position: "absolute",
            left: 960,
            top: 540,
            width: 4 * 640,
            display: "flex",
            flexWrap: "wrap",
            gap: 30,
            translate: "-50% -50%",
            transform: `rotateX(18deg) rotateY(${-16 + (t - START) * 3}deg) scale(${push})`,
          }}
        >
          {WALL.map((s, i) => (
            <div key={s} style={{ width: 610, height: 343, borderRadius: 16, overflow: "hidden", opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i)), boxShadow: "0 0 40px rgba(59,130,246,.35)" }}>
              <div style={{ scale: String(610 / 1920), transformOrigin: "top left" }}>
                <Still name={s} />
              </div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(3,7,22,.2) 20%, rgba(3,7,22,.85) 75%)", opacity: 1 - wallOut }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", translate: `${sh.x}px ${sh.y}px`, opacity: 1 - wallOut }}>
        <div style={{ position: "absolute" }}>
          <Slam t={t} at={W.oneVisit} text="One visit." size={190} out={W.oneRecord - 0.08} glow="#3b82f6" />
        </div>
        <div style={{ position: "absolute" }}>
          <Slam t={t} at={W.oneRecord} text="One record." size={190} out={W.zeroChaos - 0.08} glow="#8b5cf6" />
        </div>
        <div style={{ position: "absolute" }}>
          <Slam t={t} at={W.zeroChaos} text="Zero chaos." size={210} glow="#22d3ee" />
        </div>
      </AbsoluteFill>

      {/* final lock-up */}
      <EcgSweep t={t} at={final - 0.1} dur={1.4} y={540} width={1920} color="#60a5fa" opacity={1 - ramp(t, final + 1.2, 0.4)} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {t > final
          ? BURST.map((b, i) => {
              const p = ramp(t, final, 2.5);
              return <circle key={i} cx={960 + Math.cos(b.a) * b.d * p} cy={500 + Math.sin(b.a) * b.d * p * 0.7} r={3 * (1 - p) + 1} fill={b.c} opacity={1 - p} />;
            })
          : null}
      </svg>

      {/* the four workspaces orbit and connect to the mark */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: ramp(t, W.connected - 0.2, 0.6) }}>
        {Object.values(ROLE).map((r, i) => {
          const a = (i / 4) * Math.PI * 2 + t * 0.35;
          const x = 960 + Math.cos(a) * 520;
          const y = 470 + Math.sin(a) * 250;
          return (
            <g key={r.label}>
              <line x1={960} y1={470} x2={x} y2={y} stroke={r.color} strokeWidth={2.5} strokeOpacity={0.5} strokeDasharray="6 12" strokeDashoffset={-t * 50} />
              <circle cx={x} cy={y} r={16} fill={r.color} style={{ filter: `drop-shadow(0 0 12px ${r.color})` }} />
            </g>
          );
        })}
      </svg>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: ramp(t, final - 0.05, 0.15) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", translate: "0px -40px" }}>
          <div style={{ scale: String(logoScale) }}>
            <LogoMark size={230} draw={ramp(t, final, 1.2)} glow={1.3} />
          </div>
          <div
            style={{
              marginTop: 40,
              fontFamily: display,
              fontWeight: 800,
              fontSize: 150,
              letterSpacing: -5,
              color: "#f8fafc",
              lineHeight: 1,
              opacity: ramp(t, final + 0.15, 0.5),
              filter: `blur(${(1 - ramp(t, final + 0.15, 0.6)) * 16}px)`,
              textShadow: "0 0 60px rgba(96,165,250,.6)",
            }}
          >
            E-<span style={{ color: "#60a5fa" }}>Poch</span>
          </div>
          <div style={{ marginTop: 30, display: "flex", gap: 22, fontFamily: display, fontWeight: 600, fontSize: 54, color: "#e2e8f0" }}>
            {[
              ["Your", W.yourClinic],
              ["clinic,", 83.52],
              ["connected.", W.connected],
            ].map(([w, at]) => {
              const p = ramp(t, (at as number) - 0.05, 0.5);
              return (
                <span key={w as string} style={{ opacity: p, translate: `0px ${(1 - p) * 30}px`, color: w === "connected." ? "#60a5fa" : undefined, scale: w === "connected." ? String(pop(t, at as number)) : undefined }}>
                  {w}
                </span>
              );
            })}
          </div>
          <div style={{ marginTop: 26, fontFamily: body, fontSize: 26, letterSpacing: 6, color: "#94a3b8", textTransform: "uppercase", opacity: ramp(t, 85.0, 0.8) }}>
            Clinic · Pharmacy · Front desk · Office
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: "#dbeafe", opacity: flash, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: end }} />
    </AbsoluteFill>
  );
};
