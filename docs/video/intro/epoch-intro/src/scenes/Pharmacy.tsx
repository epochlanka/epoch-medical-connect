import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { Icon } from "../components/Icons";
import { Chip, Glass, Words } from "../components/Type";
import { AppWindow, Clip } from "../components/Window";
import { ramp, useT, win } from "../lib/anim";
import { SCENES, sec, W } from "../timeline";
import { body, clamp, display, EASE_IN_OUT, mono, ROLE } from "../theme";

const START = SCENES.pharmacy[0];
const f = (abs: number) => sec(abs - START);
const COL = ROLE.pharmacy.color;

const LAND = 54.7; // the prescription arrives at the pharmacy
const WIN_IN = 54.75;
const D_AT = 1.2;
const D_RATE = 1.4;

// real batches from the demo stock: the system suggests the one that expires first
const BATCHES = [
  { id: "AMX-2026-02", exp: "Apr 3, 2027", soon: false },
  { id: "AMX-2026-01", exp: "Nov 4, 2026", soon: true },
];

export const Pharmacy: React.FC = () => {
  const t = useT(START);
  const out = ramp(t, SCENES.pharmacy[1] - 0.45, 0.45);

  // --- the race: prescription vs patient ---
  const race = win(t, START, LAND + 0.5, 0.4, 0.5);
  const rxP = ramp(t, 52.2, LAND - 52.2, EASE_IN_OUT);
  const walkP = interpolate(t, [START, LAND + 0.5], [0, 0.32], clamp);
  const trackY = 640;
  const x0 = 260;
  const x1 = 1660;
  const rxX = x0 + (x1 - x0) * rxP;
  const rxY = trackY - 210 - Math.sin(rxP * Math.PI) * 170;

  // --- the real dispensing screen ---
  const winIn = ramp(t, WIN_IN, 0.8, EASE_IN_OUT);
  const toast = win(t, LAND, 57.0, 0.25, 0.4);

  // tablets counted out of stock
  const stock = Math.round(interpolate(t, [W.tracksTablet + 0.1, W.tracksTablet + 0.9], [90, 85], clamp));

  const labelP = ramp(t, W.printsLabel, 1.1, EASE_IN_OUT);

  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {/* RACE */}
      <AbsoluteFill style={{ opacity: race }}>
        <div style={{ position: "absolute", top: 90, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Words
            t={t}
            size={70}
            weight={700}
            accent={{ "counter,": "#fdba74" }}
            words={[
              ["Before", W.beforePatient + 0.28],
              ["the", 52.64],
              ["patient", 52.8],
              ["reaches", 53.42],
              ["the", 53.82],
              ["counter,", W.counter],
            ]}
          />
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <line x1={x0} y1={trackY} x2={x1} y2={trackY} stroke="rgba(255,255,255,.25)" strokeWidth={4} strokeDasharray="4 18" strokeLinecap="round" />
          <path
            d={`M${x0} ${trackY - 210} Q ${(x0 + x1) / 2} ${trackY - 210 - 340} ${x1} ${trackY - 210}`}
            stroke={COL}
            strokeWidth={4}
            fill="none"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - rxP}
            style={{ filter: `drop-shadow(0 0 10px ${COL})` }}
          />
        </svg>
        {[
          { x: x0, label: "Doctor", color: ROLE.doctor.color, icon: "stethoscope" as const },
          { x: x1, label: "Pharmacy", color: COL, icon: "pill" as const },
        ].map((n) => (
          <div key={n.label} style={{ position: "absolute", left: n.x, top: trackY, translate: "-50% -50%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 120, height: 120, borderRadius: 34, background: n.color, display: "grid", placeItems: "center", boxShadow: `0 0 60px ${n.color}` }}>
              <Icon name={n.icon} size={64} color="#fff" />
            </div>
            <div style={{ fontFamily: body, fontWeight: 700, fontSize: 30, color: "#fff" }}>{n.label}</div>
          </div>
        ))}
        {/* the patient, walking */}
        <div
          style={{
            position: "absolute",
            left: x0 + 140 + (x1 - x0) * walkP,
            top: trackY + 90 + Math.abs(Math.sin(t * 9)) * -10,
            translate: "-50% -50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="user" size={70} color="#e2e8f0" />
          <div style={{ fontFamily: body, fontSize: 22, color: "#94a3b8" }}>patient</div>
        </div>
        {/* the prescription, already flying */}
        <div
          style={{
            position: "absolute",
            left: rxX,
            top: rxY,
            translate: "-50% -50%",
            rotate: `${(1 - rxP) * -14}deg`,
            scale: String(0.9 + Math.sin(rxP * Math.PI) * 0.25),
            opacity: ramp(t, 52.0, 0.3) * (1 - ramp(t, LAND, 0.3)),
          }}
        >
          <div
            style={{
              width: 250,
              height: 320,
              borderRadius: 10,
              overflow: "hidden",
              background: "#fff",
              boxShadow: `0 0 60px ${COL}, 0 20px 40px rgba(0,0,0,.5)`,
            }}
          >
            <Img src={staticFile("stills/rx-pdf.png")} style={{ width: 250, height: 324, objectFit: "cover", objectPosition: "top" }} />
          </div>
        </div>
        {/* landing ping */}
        {[0, 0.15].map((d) => {
          const p = ramp(t, LAND + d, 0.8);
          return (
            <div
              key={d}
              style={{
                position: "absolute",
                left: x1,
                top: trackY,
                width: 120,
                height: 120,
                borderRadius: 40,
                border: `4px solid ${COL}`,
                translate: "-50% -50%",
                scale: String(1 + p * 2.2),
                opacity: t > LAND + d ? 1 - p : 0,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* DISPENSING */}
      <div style={{ position: "absolute", left: 120, top: 120, opacity: winIn }}>
        <Chip t={t} at={WIN_IN + 0.2} label="Pharmacy" color={COL} icon={<Icon name="pill" size={24} color="#fff" />} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 730,
          top: interpolate(winIn, [0, 1], [1200, 210]),
          perspective: 2200,
          opacity: winIn,
        }}
      >
        <div style={{ transform: `rotateY(${-8 + Math.sin(t * 0.5) * 2}deg) rotateX(${2 + Math.cos(t * 0.4) * 1.5}deg)`, transformOrigin: "left center" }}>
          <AppWindow
            t={t}
            width={1060}
            accent={COL}
            url="clinic.local:5173/pharmacy"
            cam={[
              [WIN_IN, 960, 540, 1],
              [55.6, 960, 540, 1.0],
              [56.3, 960, 700, 1.3],
              [58.8, 960, 720, 1.4],
              [60.4, 960, 540, 1.0],
            ]}
          >
            <Clip name="dispense" at={D_AT} rate={D_RATE} from={f(WIN_IN)} />
          </AppWindow>
        </div>
      </div>

      {/* notification toast */}
      <Glass
        accent={COL}
        style={{
          position: "absolute",
          right: 70,
          top: 110,
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: toast,
          translate: `${(1 - ramp(t, LAND, 0.4)) * 200}px 0px`,
          fontWeight: 700,
          fontSize: 28,
        }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 99, background: COL, display: "grid", placeItems: "center" }}>
          <Icon name="file" size={26} color="#fff" />
        </div>
        RX000002 is waiting
      </Glass>

      {/* already waiting */}
      <div style={{ position: "absolute", left: 120, top: 250, width: 560, opacity: win(t, 55.2, W.picksBatch - 0.1, 0.3, 0.3) }}>
        <Words t={t} size={72} accent={{ "waiting.": "#fdba74" }} words={[["Already", W.alreadyWaiting], ["waiting.", W.alreadyWaiting + 0.42]]} />
      </div>

      {/* first expiry, first out */}
      <div style={{ position: "absolute", left: 120, top: 240, width: 560, opacity: win(t, W.picksBatch - 0.1, W.tracksTablet - 0.05, 0.3, 0.25) }}>
        <Words t={t} size={52} weight={700} accent={{ first: "#fdba74" }} words={[["Picks", 57.28], ["the", 57.52], ["batch", 57.74], ["that", 57.92], ["expires", W.expiresFirst], ["first", 58.46]]} />
        <div style={{ position: "relative", height: 260, marginTop: 30 }}>
          {BATCHES.map((b, i) => {
            const swap = ramp(t, 57.75, 0.6, EASE_IN_OUT);
            const slot = b.soon ? interpolate(swap, [0, 1], [1, 0]) : interpolate(swap, [0, 1], [0, 1]);
            const hi = b.soon ? ramp(t, 58.4, 0.3) : 0;
            return (
              <div
                key={b.id}
                style={{
                  position: "absolute",
                  left: 0,
                  top: slot * 125,
                  width: 520,
                  padding: "18px 24px",
                  borderRadius: 18,
                  background: hi ? `linear-gradient(90deg, ${COL}55, rgba(15,23,42,.6))` : "rgba(15,23,42,.55)",
                  border: `2px solid ${hi ? COL : "rgba(255,255,255,.2)"}`,
                  boxShadow: hi ? `0 0 40px ${COL}88` : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#fff",
                  fontFamily: body,
                  translate: `${b.soon ? Math.sin(swap * Math.PI) * 60 : -Math.sin(swap * Math.PI) * 30}px 0px`,
                  zIndex: b.soon ? 2 : 1,
                }}
              >
                <div>
                  <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 28 }}>{b.id}</div>
                  <div style={{ fontSize: 22, color: "#cbd5e1" }}>Expires {b.exp}</div>
                </div>
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: COL,
                    fontWeight: 800,
                    fontSize: 20,
                    letterSpacing: 1,
                    opacity: hi,
                    scale: String(0.6 + hi * 0.4),
                  }}
                >
                  PICK FIRST
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* every tablet tracked */}
      <div style={{ position: "absolute", left: 120, top: 250, width: 560, opacity: win(t, W.tracksTablet - 0.05, SCENES.pharmacy[1], 0.25, 0.3) }}>
        <Words t={t} size={60} accent={{ tablet: "#fdba74" }} words={[["Tracks", W.tracksTablet], ["every", 59.46], ["tablet.", 59.86]]} />
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 20 }}>
          <div style={{ fontFamily: body, fontSize: 26, color: "#cbd5e1" }}>Cetirizine 10mg</div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 64, color: "#fff", minWidth: 90 }}>{stock}</div>
          <div style={{ fontFamily: body, fontSize: 26, color: "#fdba74" }}>in stock</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {new Array(5).fill(0).map((_, i) => {
            const p = ramp(t, W.tracksTablet + 0.1 + i * 0.16, 0.35);
            return (
              <div
                key={i}
                style={{
                  width: 54,
                  height: 26,
                  borderRadius: 99,
                  background: "linear-gradient(90deg, #fff 50%, #fdba74 50%)",
                  opacity: p,
                  translate: `0px ${(1 - p) * -60}px`,
                  rotate: `${(1 - p) * 90}deg`,
                  boxShadow: "0 4px 12px rgba(0,0,0,.4)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* the real medicine label prints out */}
      <div style={{ position: "absolute", left: 110, top: 610, width: 560, opacity: ramp(t, W.printsLabel - 0.1, 0.3) }}>
        <div
          style={{
            width: 560,
            height: 50,
            borderRadius: 16,
            background: "linear-gradient(180deg, #334155, #1e293b)",
            border: "1.5px solid rgba(255,255,255,.25)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 18px",
            color: "#e2e8f0",
            fontFamily: body,
            fontWeight: 600,
            fontSize: 22,
            position: "relative",
            zIndex: 2,
          }}
        >
          <Icon name="printer" size={28} color="#fdba74" /> Printing label…
          <div style={{ marginLeft: "auto", width: 12, height: 12, borderRadius: 99, background: "#22c55e", opacity: 0.5 + 0.5 * Math.sin(t * 12) }} />
        </div>
        <div style={{ height: 300, overflow: "hidden", marginTop: -6, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 500,
              translate: `0px ${interpolate(labelP, [0, 1], [-260, 0])}px`,
              background: "#fff",
              borderRadius: "0 0 10px 10px",
              boxShadow: "0 20px 40px rgba(0,0,0,.45)",
              padding: 10,
            }}
          >
            <Img src={staticFile("stills/label-crop.png")} style={{ width: 480 }} />
          </div>
        </div>
      </div>

      <AbsoluteFill style={{ backgroundColor: COL, opacity: interpolate(t, [LAND, LAND + 0.05, LAND + 0.4], [0, 0.25, 0], clamp), mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
