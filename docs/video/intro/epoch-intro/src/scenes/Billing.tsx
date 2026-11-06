import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Icon } from "../components/Icons";
import { Chip, Words } from "../components/Type";
import { AppWindow, Clip } from "../components/Window";
import { pop, ramp, useT } from "../lib/anim";
import { SCENES, sec, W } from "../timeline";
import { body, clamp, display, EASE_IN_OUT, mono } from "../theme";

const START = SCENES.billing[0];
const f = (abs: number) => sec(abs - START);
const COL = "#06b6d4";
const CUT_RECON = 64.9;

// INV-2026-0005 exactly as the app shows it
const LINES: [string, string, string, number][] = [
  ["Consultation fee", "1", "500.00", 62.35],
  ["Cetirizine 10mg", "5", "40.00", 62.75],
  ["Cetirizine 10mg", "5", "40.00", 63.15],
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const Billing: React.FC = () => {
  const t = useT(START);
  const inP = ramp(t, START, 0.6, EASE_IN_OUT);
  const out = ramp(t, SCENES.billing[1] - 0.45, 0.45);
  const total = interpolate(t, [62.4, 63.7], [0, 580], clamp);
  const stamp = pop(t, W.reconciled, 0.45);
  const cut = interpolate(t, [CUT_RECON - 0.08, CUT_RECON, CUT_RECON + 0.25], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div style={{ position: "absolute", left: 110, top: 110 }}>
        <Chip t={t} at={START + 0.3} label="Billing" color={COL} icon={<Icon name="receipt" size={24} color="#fff" />} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 200 }}>
        <Words t={t} size={74} accent={{ "itself.": "#67e8f9" }} words={[["The", W.billBuilds], ["bill", 62.28], ["builds", 62.46], ["itself.", 62.8]]} />
      </div>

      {/* the invoice assembling itself */}
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 330,
          width: 660,
          background: "#ffffff",
          borderRadius: 22,
          padding: "30px 36px",
          boxShadow: `0 40px 90px rgba(0,0,0,.5), 0 0 70px ${COL}44`,
          fontFamily: body,
          color: "#0f172a",
          rotate: `${-2 + Math.sin(t * 0.7)}deg`,
          translate: `${(1 - inP) * -500}px ${Math.sin(t * 0.9) * 6}px`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 30, color: "#2563eb" }}>E-Poch</div>
          <div style={{ fontFamily: mono, fontSize: 22, color: "#475569" }}>INV-2026-0005</div>
        </div>
        <div style={{ fontSize: 22, color: "#64748b", marginTop: 4 }}>Kumari Fernando · Consultation + Pharmacy</div>
        <div style={{ height: 1.5, background: "#e2e8f0", margin: "18px 0" }} />
        {LINES.map(([name, qty, amt, at], i) => {
          const p = ramp(t, at, 0.4);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 26,
                padding: "8px 0",
                opacity: p,
                translate: `${(1 - p) * 60}px 0px`,
                background: p < 1 ? `rgba(6,182,212,${(1 - p) * 0.25})` : undefined,
              }}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
              <span style={{ width: 60, color: "#64748b" }}>×{qty}</span>
              <span style={{ width: 150, textAlign: "right", fontFamily: mono }}>{amt}</span>
            </div>
          );
        })}
        <div style={{ height: 1.5, background: "#e2e8f0", margin: "14px 0" }} />
        <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>
          <span style={{ flex: 1 }}>Total</span>
          <span style={{ fontFamily: mono }}>LKR {money(total)}</span>
        </div>
        <div style={{ display: "flex", fontSize: 26, marginTop: 10, opacity: ramp(t, W.payments, 0.3), color: "#16a34a", fontWeight: 700 }}>
          <span style={{ flex: 1 }}>Paid</span>
          <span style={{ fontFamily: mono }}>LKR 300.00</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            marginTop: 6,
            opacity: ramp(t, W.balances, 0.3),
            color: "#dc2626",
            fontWeight: 700,
            background: `rgba(220,38,38,${0.12 * Math.max(0, 1 - Math.abs(t - W.balances - 0.3) * 2)})`,
          }}
        >
          <span style={{ flex: 1 }}>Balance</span>
          <span style={{ fontFamily: mono }}>LKR 280.00</span>
        </div>

        {/* reconciled stamp */}
        <div
          style={{
            position: "absolute",
            right: -40,
            bottom: -60,
            padding: "14px 26px",
            border: "6px solid #16a34a",
            borderRadius: 18,
            color: "#16a34a",
            background: "rgba(240,253,244,.92)",
            fontFamily: display,
            fontWeight: 800,
            fontSize: 44,
            letterSpacing: 3,
            rotate: "-12deg",
            scale: String(interpolate(stamp, [0, 1], [2.4, 1])),
            opacity: ramp(t, W.reconciled, 0.12),
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 10px 30px rgba(22,163,74,.35)",
          }}
        >
          <Icon name="check" size={46} color="#16a34a" stroke={3.5} /> RECONCILED
        </div>
      </div>

      {/* payments · balances · cash count */}
      <div style={{ position: "absolute", left: 830, top: 900, display: "flex", gap: 18 }}>
        {[
          ["Payments", W.payments],
          ["Balances", W.balances],
          ["Day's cash count", W.cashCount],
        ].map(([s, at]) => (
          <div
            key={s as string}
            style={{
              padding: "12px 24px",
              borderRadius: 99,
              background: "rgba(6,182,212,.2)",
              border: "1.5px solid rgba(103,232,249,.6)",
              color: "#ecfeff",
              fontFamily: body,
              fontWeight: 700,
              fontSize: 28,
              scale: String(pop(t, at as number)),
              opacity: ramp(t, at as number, 0.2),
            }}
          >
            {s}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: interpolate(inP, [0, 1], [1500, 880]), top: 150, perspective: 2200, opacity: inP }}>
        <div style={{ transform: `rotateY(${-8 + Math.sin(t * 0.6) * 2}deg) rotateX(${2 + Math.cos(t * 0.5) * 1.5}deg)`, transformOrigin: "left center" }}>
          <AppWindow
            t={t}
            width={920}
            accent={COL}
            url="clinic.local:5173/admin/billing"
            cam={[
              [START, 960, 540, 1],
              [62.9, 960, 540, 1.4],
              [CUT_RECON - 0.01, 960, 540, 1.4],
              [CUT_RECON, 960, 540, 1],
              [65.8, 960, 540, 1],
              [66.3, 960, 520, 1.5],
            ]}
          >
            <Clip name="billing" at={0.7} from={0} durationInFrames={f(CUT_RECON)} />
            <Clip name="recon" at={0.9} from={f(CUT_RECON)} />
          </AppWindow>
        </div>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: cut * 0.25, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
