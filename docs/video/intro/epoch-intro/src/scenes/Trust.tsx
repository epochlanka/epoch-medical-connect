import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Icon } from "../components/Icons";
import { Glass, Words } from "../components/Type";
import { pop, ramp, rand, useT } from "../lib/anim";
import { SCENES, W } from "../timeline";
import { body, display, EASE_IN_OUT, mono } from "../theme";

const START = SCENES.trust[0];
const TEAL = "#2dd4bf";

// Representative entries for the visit shown in this video (who, what, when)
const LOG = [
  ["17:47:12", "reception", "CHECK_IN", "Kumari Fernando → T-003"],
  ["17:49:30", "reception", "CALL_NEXT", "queue · Nimal Perera"],
  ["17:56:02", "doctor", "UPDATE", "consultation #3 · dx 5A11"],
  ["17:56:31", "doctor", "UPDATE", "prescription · Paracetamol"],
  ["17:56:58", "pharmacist", "DISPENSE", "RX000002 · CTZ-2026-01 ×5"],
  ["17:58:04", "admin", "PAYMENT", "INV-2026-0005 · LKR 300"],
  ["17:58:40", "admin", "VIEW", "cash reconciliation"],
  ["17:59:12", "doctor", "VIEW", "patient PT-SEED-002"],
];

const HEX = "0123456789abcdef";

export const Trust: React.FC = () => {
  const t = useT(START);
  const inP = ramp(t, START + 0.1, 0.8, EASE_IN_OUT);
  const out = ramp(t, SCENES.trust[1] - 0.5, 0.5);
  const dome = ramp(t, W.staysInside, 1.4, EASE_IN_OUT);
  const lan = ramp(t, W.ownNetwork, 0.8);
  const snap = ramp(t, W.internetDoesnt, 0.3);
  const logIn = ramp(t, W.logsChange - 0.2, 0.6, EASE_IN_OUT);
  const lock = ramp(t, W.backsUp + 0.3, 0.35);

  const cx = 700;
  const baseY = 830;
  const R = 470;

  const devices = [
    { x: cx - 280, y: baseY - 120, label: "Front desk PC", icon: "monitor" as const },
    { x: cx + 280, y: baseY - 120, label: "Doctor's PC", icon: "monitor" as const },
    { x: cx, y: baseY - 300, label: "Clinic server", icon: "database" as const },
  ];

  return (
    <AbsoluteFill style={{ opacity: inP * (1 - out) }}>
      <div style={{ position: "absolute", left: 110, top: 100 }}>
        <Words
          t={t}
          size={70}
          accent={{ "inside": "#5eead4" }}
          words={[
            ["It", 68.5],
            ["all", 68.6],
            ["stays", 68.82],
            ["inside", 69.1],
            ["the", 69.7],
            ["clinic.", 69.9],
          ]}
        />
      </div>

      {/* the clinic dome */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="domefill" cx="50%" cy="100%" r="100%">
            <stop offset="0" stopColor={TEAL} stopOpacity={0.28} />
            <stop offset="1" stopColor={TEAL} stopOpacity={0.02} />
          </radialGradient>
        </defs>
        <ellipse cx={cx} cy={baseY} rx={R + 40} ry={60} fill="rgba(45,212,191,.12)" stroke="rgba(94,234,212,.5)" strokeWidth={2} opacity={dome} />
        <path d={`M ${cx - R} ${baseY} A ${R} ${R} 0 0 1 ${cx + R} ${baseY}`} fill="url(#domefill)" opacity={dome} />
        <path
          d={`M ${cx - R} ${baseY} A ${R} ${R} 0 0 1 ${cx + R} ${baseY}`}
          fill="none"
          stroke={TEAL}
          strokeWidth={5}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - dome}
          style={{ filter: `drop-shadow(0 0 14px ${TEAL})` }}
        />
        {/* hex-ish shield grid shimmer */}
        {new Array(7).fill(0).map((_, i) => {
          const a = Math.PI * (0.12 + (i / 6) * 0.76);
          return (
            <line
              key={i}
              x1={cx}
              y1={baseY}
              x2={cx - Math.cos(a) * R}
              y2={baseY - Math.sin(a) * R}
              stroke={TEAL}
              strokeOpacity={0.12 + 0.1 * Math.sin(t * 3 + i)}
              strokeWidth={2}
              opacity={dome}
            />
          );
        })}
        {/* LAN links */}
        {[
          [0, 2],
          [1, 2],
          [0, 1],
        ].map(([a, b], i) => (
          <g key={i} opacity={lan}>
            <line x1={devices[a].x} y1={devices[a].y} x2={devices[b].x} y2={devices[b].y} stroke="#5eead4" strokeWidth={4} strokeDasharray="12 16" strokeDashoffset={-t * 80} />
            {[0, 0.5].map((o) => {
              const k = (t * 0.8 + o + i * 0.2) % 1;
              return <circle key={o} cx={devices[a].x + (devices[b].x - devices[a].x) * k} cy={devices[a].y + (devices[b].y - devices[a].y) * k} r={7} fill="#fff" />;
            })}
          </g>
        ))}
        {/* the internet link, which snaps */}
        <line
          x1={cx + 120}
          y1={baseY - 340}
          x2={interpolate(snap, [0, 1], [1290, 1240])}
          y2={interpolate(snap, [0, 1], [250, 300])}
          stroke={snap > 0 ? "#ef4444" : "#94a3b8"}
          strokeWidth={4}
          strokeDasharray="10 12"
          opacity={ramp(t, W.keepsWorking, 0.4) * (1 - snap * 0.6)}
        />
        {/* orbiting data inside the dome */}
        {new Array(26).fill(0).map((_, i) => {
          const a = Math.PI * (rand(i) + t * (0.08 + rand(i + 4) * 0.12));
          const rr = 120 + rand(i + 9) * (R - 170);
          const y = baseY - Math.abs(Math.sin(a)) * rr;
          return <circle key={i} cx={cx + Math.cos(a) * rr} cy={y} r={3 + rand(i) * 3} fill="#99f6e4" opacity={dome * 0.7} />;
        })}
      </svg>

      {devices.map((d, i) => (
        <div
          key={d.label}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            translate: "-50% -50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            scale: String(pop(t, (i === 2 ? W.staysInside + 0.4 : W.ownNetwork) + i * 0.12)),
          }}
        >
          <div style={{ width: 110, height: 110, borderRadius: 28, background: "rgba(15,118,110,.55)", border: `2px solid ${TEAL}`, display: "grid", placeItems: "center", boxShadow: `0 0 40px ${TEAL}66` }}>
            <Icon name={d.icon} size={60} color="#ccfbf1" />
            {i === 2 ? (
              <div
                style={{
                  position: "absolute",
                  right: -26,
                  bottom: 18,
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: lock > 0 ? "#16a34a" : "#334155",
                  display: "grid",
                  placeItems: "center",
                  scale: String(pop(t, W.backsUp, 0.5)),
                  boxShadow: lock > 0 ? "0 0 30px #22c55e" : "none",
                }}
              >
                <Icon name={lock > 0.5 ? "lock" : "lockOpen"} size={38} color="#fff" />
              </div>
            ) : null}
          </div>
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: 24, color: "#e2e8f0", whiteSpace: "nowrap" }}>{d.label}</div>
        </div>
      ))}

      {/* network label + status */}
      <div style={{ position: "absolute", left: cx, top: baseY + 70, translate: "-50% 0", display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 40, color: "#fff", opacity: lan }}>Your own network</div>
        <div
          style={{
            padding: "8px 18px",
            borderRadius: 99,
            background: "rgba(34,197,94,.18)",
            border: "1.5px solid #22c55e",
            color: "#bbf7d0",
            fontFamily: body,
            fontWeight: 700,
            fontSize: 24,
            opacity: ramp(t, W.keepsWorking, 0.3),
          }}
        >
          <span style={{ opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 4)) }}>●</span> Running
        </div>
      </div>

      {/* the internet, outside */}
      <div style={{ position: "absolute", left: 1290, top: 250, translate: "-50% -50%", opacity: ramp(t, W.keepsWorking, 0.4), display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", filter: `grayscale(${snap})`, opacity: 1 - snap * 0.5 }}>
          <Icon name="globe" size={110} color="#93c5fd" stroke={1.6} />
          <div style={{ position: "absolute", right: -18, top: -10, scale: String(pop(t, W.internetDoesnt)), opacity: snap }}>
            <div style={{ width: 54, height: 54, borderRadius: 99, background: "#ef4444", display: "grid", placeItems: "center" }}>
              <Icon name="x" size={34} color="#fff" stroke={3} />
            </div>
          </div>
        </div>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 26, color: snap > 0.5 ? "#fca5a5" : "#cbd5e1" }}>{snap > 0.5 ? "Internet down" : "Internet"}</div>
      </div>
      <div style={{ position: "absolute", left: 1150, top: 380, width: 640, opacity: ramp(t, W.keepsWorking, 0.4) * (1 - logIn) }}>
        <Words t={t} size={50} weight={700} accent={{ "working": "#5eead4" }} words={[["Keeps", W.keepsWorking], ["working", 72.54], ["when", 72.9], ["the", 73.1], ["internet", 73.22], ["doesn't.", 73.46]]} />
      </div>

      {/* audit log terminal */}
      <Glass
        accent={TEAL}
        style={{
          position: "absolute",
          left: 1130,
          top: 330,
          width: 720,
          padding: 0,
          overflow: "hidden",
          opacity: logIn,
          translate: `${(1 - logIn) * 300}px 0px`,
          background: "rgba(2,6,23,.82)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.1)", fontFamily: body, fontWeight: 700, fontSize: 24 }}>
          <Icon name="history" size={28} color={TEAL} /> Audit log
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 18, color: "#5eead4" }}>every change</span>
        </div>
        <div style={{ padding: "12px 20px 18px", height: 330, overflow: "hidden" }}>
          {LOG.map((l, i) => {
            const at = W.logsChange + i * 0.17;
            const p = ramp(t, at, 0.2);
            return (
              <div key={i} style={{ display: "flex", gap: 14, fontFamily: mono, fontSize: 19, lineHeight: "38px", opacity: p, translate: `${(1 - p) * 30}px 0px`, whiteSpace: "nowrap" }}>
                <span style={{ color: "#64748b" }}>{l[0]}</span>
                <span style={{ color: "#93c5fd", width: 110 }}>{l[1]}</span>
                <span style={{ color: "#fde68a", width: 130 }}>{l[2]}</span>
                <span style={{ color: "#e2e8f0" }}>{l[3]}</span>
              </div>
            );
          })}
        </div>
      </Glass>

      {/* encrypted backup */}
      <div style={{ position: "absolute", left: 1130, top: 740, width: 720, opacity: ramp(t, W.backsUp, 0.3) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: display, fontWeight: 700, fontSize: 46, color: "#fff" }}>
          <div style={{ width: 62, height: 62, borderRadius: 16, background: lock > 0 ? "#16a34a" : "#334155", display: "grid", placeItems: "center", boxShadow: lock > 0 ? "0 0 30px #22c55e" : "none" }}>
            <Icon name={lock > 0.5 ? "lock" : "lockOpen"} size={38} color="#fff" />
          </div>
          Backed up. Encrypted.
        </div>
        <div style={{ fontFamily: mono, fontSize: 22, color: "#86efac", marginTop: 14, letterSpacing: 1 }}>
          {new Array(44)
            .fill(0)
            .map((_, i) => HEX[Math.floor(rand(i * 13 + Math.floor(t * 18)) * 16)])
            .join("")}
        </div>
        <div style={{ fontFamily: body, fontSize: 22, color: "#94a3b8", marginTop: 6, opacity: ramp(t, W.encrypted, 0.3) }}>AES-256 · stays on the clinic's machine</div>
      </div>
    </AbsoluteFill>
  );
};
