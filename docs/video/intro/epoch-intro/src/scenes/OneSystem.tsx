import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Icon, IconName } from "../components/Icons";
import { LogoMark } from "../components/Logo";
import { Words } from "../components/Type";
import { AppWindow, Clip, Still } from "../components/Window";
import { pop, ramp, useT, win } from "../lib/anim";
import { SCENES, sec, W } from "../timeline";
import { body, clamp, EASE_IN_OUT, mono, ROLE } from "../theme";

const START = SCENES.oneSystem[0];
const f = (abs: number) => sec(abs - START);

const NODES: { key: keyof typeof ROLE; at: number; icon: IconName; angle: number; target: number; still: string }[] = [
  { key: "reception", at: W.reception, icon: "users", angle: 200, target: 207, still: "confirm-reception" },
  { key: "doctor", at: W.doctor, icon: "stethoscope", angle: 340, target: 333, still: "confirm-doctor" },
  { key: "pharmacy", at: W.pharmacy, icon: "pill", angle: 20, target: 27, still: "confirm-pharmacist" },
  { key: "admin", at: W.administration, icon: "chart", angle: 160, target: 153, still: "confirm-admin" },
];

/** Orbit angle for a node, easing from its drifting orbit into its fixed spot around the window. */
const angleOf = (n: (typeof NODES)[number], orbit: number, phase2: number) => {
  const a = (((n.angle + orbit) % 360) + 360) % 360;
  let target = n.target;
  while (target - a > 180) target -= 360;
  while (a - target > 180) target += 360;
  return ((a + (target - a) * phase2) * Math.PI) / 180;
};

const URL = "http://clinic.local:5173";

export const OneSystem: React.FC = () => {
  const t = useT(START);
  const sceneOut = ramp(t, SCENES.oneSystem[1] - 0.45, 0.45);
  // phase 2: the hub steps back and the sign-in window takes the stage
  const phase2 = ramp(t, W.oneAddress - 0.4, 0.9, EASE_IN_OUT);
  const orbit = t * 7;
  const hubScale = interpolate(t, [START, START + 0.7], [1.5, 1], { ...clamp, easing: EASE_IN_OUT });

  const cx = 960;
  const cy = interpolate(phase2, [0, 1], [600, 590]);
  const rx = interpolate(phase2, [0, 1], [560, 820]);
  const ry = interpolate(phase2, [0, 1], [270, 380]);

  const typed = Math.floor(interpolate(t, [W.oneAddress, W.oneSignIn - 0.1], [0, URL.length], clamp));
  const fan = ramp(t, W.everyone + 0.2, 0.9);

  return (
    <AbsoluteFill style={{ opacity: 1 - sceneOut, translate: `0px ${-sceneOut * 60}px` }}>
      {/* headline swaps from "One system…" to "One address. One sign-in." */}
      <div style={{ position: "absolute", top: 90, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Words
          t={t}
          size={84}
          out={W.oneAddress - 0.45}
          accent={{ whole: "#60a5fa" }}
          words={[
            ["One", W.oneSystem],
            ["system", 17.12],
            ["for", 17.36],
            ["the", 17.76],
            ["whole", W.wholeClinic],
            ["clinic.", 18.22],
          ]}
        />
      </div>
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Words
          t={t}
          size={78}
          accent={{ "address.": "#60a5fa", "sign-in.": "#60a5fa" }}
          out={W.everyone + 0.1}
          words={[
            ["One", W.oneAddress],
            ["address.", 22.78],
            ["One", W.oneSignIn],
            ["sign-in.", 23.82],
          ]}
        />
      </div>
      <div style={{ position: "absolute", top: 76, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Words
          t={t}
          size={64}
          weight={700}
          accent={{ "own": "#60a5fa", "workspace.": "#60a5fa" }}
          words={[
            ["Everyone", W.everyone],
            ["lands", 25.18],
            ["in", 25.58],
            ["their", 25.84],
            ["own", 26.22],
            ["workspace.", W.workspace],
          ]}
        />
      </div>

      {/* energy lines from the hub to each workspace */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 1 - phase2 * 0.75 }}>
        {NODES.map((n, i) => {
          const a = angleOf(n, orbit, phase2);
          const x = cx + Math.cos(a) * rx;
          const y = cy + Math.sin(a) * ry;
          const p = ramp(t, n.at - 0.1, 0.5);
          const col = ROLE[n.key].color;
          return (
            <g key={i} opacity={p}>
              <line x1={cx} y1={cy} x2={cx + (x - cx) * p} y2={cy + (y - cy) * p} stroke={col} strokeWidth={3} strokeOpacity={0.35} />
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={col}
                strokeWidth={4}
                strokeDasharray="10 26"
                strokeDashoffset={-t * 90}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 8px ${col})` }}
              />
              {[0, 0.33, 0.66].map((o) => {
                const k = (t * 0.7 + o + i * 0.17) % 1;
                return <circle key={o} cx={cx + (x - cx) * k} cy={cy + (y - cy) * k} r={6} fill="#fff" opacity={p * Math.sin(k * Math.PI)} />;
              })}
            </g>
          );
        })}
      </svg>

      {/* hub */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          translate: "-50% -50%",
          scale: String(hubScale * (1 - phase2) + 0.0001),
          opacity: 1 - phase2,
        }}
      >
        <div style={{ position: "absolute", inset: -60, borderRadius: 999, border: "2px solid rgba(96,165,250,.35)", scale: String(1 + 0.08 * Math.sin(t * 3)) }} />
        <div style={{ position: "absolute", inset: -120, borderRadius: 999, border: "1.5px dashed rgba(96,165,250,.25)", rotate: `${t * 20}deg` }} />
        <LogoMark size={190} />
      </div>

      {/* workspace nodes */}
      {NODES.map((n, i) => {
        const a = angleOf(n, orbit, phase2);
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const role = ROLE[n.key];
        const p = pop(t, n.at, 0.55);
        // in phase 2 each node becomes that role's real sign-in screen, fanned around the window
        const cardW = interpolate(fan, [0, 1], [0, 400]);
        return (
          <div
            key={n.key}
            style={{
              position: "absolute",
              left: x,
              top: y,
              translate: "-50% -50%",
              scale: String(p),
              opacity: ramp(t, n.at - 0.05, 0.2),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 28px 16px 16px",
                borderRadius: 24,
                background: `linear-gradient(135deg, ${role.color}55, rgba(15,23,42,.6))`,
                border: `2px solid ${role.color}`,
                boxShadow: `0 0 50px ${role.color}77, 0 20px 50px rgba(0,0,0,.45)`,
                color: "#fff",
                fontFamily: body,
                fontWeight: 700,
                fontSize: 36,
              }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 18, background: role.color, display: "grid", placeItems: "center" }}>
                <Icon name={n.icon} size={38} color="#fff" stroke={2.2} />
              </div>
              {role.label}
            </div>
            {fan > 0.01 ? (
              <div
                style={{
                  width: cardW,
                  height: cardW * 0.5625,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: `2px solid ${role.color}`,
                  boxShadow: `0 0 40px ${role.color}66`,
                  opacity: fan,
                }}
              >
                <div style={{ width: 1920, height: 1080, scale: String(cardW / 1920), transformOrigin: "top left" }}>
                  <Still name={n.still} />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* the one address + one sign-in, using the real login recording */}
      <div
        style={{
          position: "absolute",
          left: 960,
          top: interpolate(phase2, [0, 1], [1300, 610]),
          translate: "-50% -50%",
          opacity: phase2,
          perspective: 2000,
        }}
      >
        <div style={{ transform: `rotateX(${interpolate(phase2, [0, 1], [35, 4])}deg) rotateY(${Math.sin(t * 0.6) * 3}deg)` }}>
          <AppWindow
            t={t}
            width={940}
            url={URL.slice(0, typed) + (t < W.oneSignIn && Math.floor(t * 4) % 2 ? "|" : "")}
            accent="#3b82f6"
            cam={[
              [W.oneSignIn, 960, 540, 1],
              [W.oneSignIn + 0.6, 1150, 520, 1.35],
              [25.5, 1150, 520, 1.35],
              [25.9, 960, 540, 1],
            ]}
          >
            <Still name="login" />
            <Clip name="login" at={0.6} rate={2} from={f(W.oneSignIn - 0.2)} />
          </AppWindow>
        </div>
      </div>

      {/* address pill that types itself */}
      <div
        style={{
          position: "absolute",
          left: 960,
          top: 980,
          translate: "-50% 0",
          opacity: win(t, W.oneAddress, W.everyone, 0.3, 0.4),
          fontFamily: mono,
          fontSize: 34,
          color: "#bfdbfe",
          padding: "10px 26px",
          borderRadius: 99,
          border: "1.5px solid rgba(147,197,253,.45)",
          background: "rgba(2,6,23,.5)",
        }}
      >
        Everyone opens <span style={{ color: "#fff", fontWeight: 600 }}>{URL}</span>
      </div>
    </AbsoluteFill>
  );
};
