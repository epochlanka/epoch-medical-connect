import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Icon } from "../components/Icons";
import { Chip, Glass, Words } from "../components/Type";
import { AppWindow, Clip } from "../components/Window";
import { pop, ramp, useT, win } from "../lib/anim";
import { SCENES, sec, W } from "../timeline";
import { body, clamp, display, EASE_IN_OUT, mono, ROLE } from "../theme";

const START = SCENES.reception[0];
const f = (abs: number) => sec(abs - START);
const COL = ROLE.reception.color;

// clip cut points (absolute seconds)
const CUT_FAMILY = 30.9;
const CUT_QUEUE = 32.85;

const Avatar: React.FC<{ initials: string; color: string; size?: number }> = ({ initials, color, size = 84 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: `linear-gradient(135deg, ${color}, ${color}88)`,
      display: "grid",
      placeItems: "center",
      color: "#fff",
      fontFamily: body,
      fontWeight: 700,
      fontSize: size * 0.36,
      boxShadow: `0 0 30px ${color}88`,
      border: "2px solid rgba(255,255,255,.5)",
    }}
  >
    {initials}
  </div>
);

export const Reception: React.FC = () => {
  const t = useT(START);
  const inP = ramp(t, START, 0.7, EASE_IN_OUT);
  const out = ramp(t, SCENES.reception[1] - 0.45, 0.45);

  // which clip is on screen, with a quick flash at each cut
  const cutFlash = Math.max(
    interpolate(t, [CUT_FAMILY - 0.08, CUT_FAMILY, CUT_FAMILY + 0.25], [0, 1, 0], clamp),
    interpolate(t, [CUT_QUEUE - 0.08, CUT_QUEUE, CUT_QUEUE + 0.25], [0, 1, 0], clamp),
  );

  const leftText = (a: number, b: number, node: React.ReactNode) => (
    <div style={{ position: "absolute", left: 110, top: 260, width: 640, opacity: win(t, a, b, 0.3, 0.3) }}>{node}</div>
  );

  // the live queue: walk-ins and bookings merge into one lane
  const lane = (t - W.liveQueue) * 120;

  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div style={{ position: "absolute", left: 110, top: 120 }}>
        <Chip t={t} at={START + 0.3} label="Reception" color={COL} icon={<Icon name="users" size={24} color="#fff" />} />
      </div>

      {/* the real front desk */}
      <div
        style={{
          position: "absolute",
          left: interpolate(inP, [0, 1], [1300, 760]),
          top: 190,
          perspective: 2200,
          opacity: inP,
        }}
      >
        <div style={{ transform: `rotateY(${-9 + Math.sin(t * 0.5) * 2}deg) rotateX(${2 + Math.cos(t * 0.4) * 1.5}deg)`, transformOrigin: "left center" }}>
          <AppWindow
            t={t}
            width={1020}
            accent={COL}
            url="clinic.local:5173/reception"
            cam={[
              [28.0, 960, 540, 1],
              [28.7, 900, 470, 1.55],
              [CUT_FAMILY - 0.01, 900, 470, 1.55],
              [CUT_FAMILY, 1100, 560, 1.15],
              [31.9, 1100, 600, 1.35],
              [CUT_QUEUE - 0.01, 1100, 600, 1.35],
              [CUT_QUEUE, 1000, 560, 1.0],
              [33.6, 1000, 620, 1.25],
              [35.2, 1150, 620, 1.3],
            ]}
          >
            <Clip name="find" at={0.6} from={0} durationInFrames={f(CUT_FAMILY)} />
            <Clip name="family" at={2.4} from={f(CUT_FAMILY)} durationInFrames={f(CUT_QUEUE) - f(CUT_FAMILY)} />
            <Clip name="queue" at={0.85} from={f(CUT_QUEUE)} />
          </AppWindow>
        </div>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: cutFlash * 0.25, mixBlendMode: "screen" }} />

      {/* 1. found in seconds */}
      {leftText(
        W.patientsFound - 0.1,
        W.registeredOnce - 0.1,
        <>
          <Words t={t} size={76} words={[["Found", W.patientsFound], ["in", 28.96]]} />
          <div
            style={{
              fontFamily: display,
              fontWeight: 800,
              fontSize: 150,
              letterSpacing: -6,
              color: "#fff",
              opacity: ramp(t, W.seconds, 0.3),
              scale: String(pop(t, W.seconds, 0.5)),
              transformOrigin: "left center",
              textShadow: `0 0 60px ${COL}`,
            }}
          >
            seconds.
          </div>
          <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 16, opacity: ramp(t, 28.5, 0.4) }}>
            <Icon name="search" size={40} color="#c4b5fd" />
            <span style={{ fontFamily: mono, fontSize: 34, color: "#e9d5ff" }}>
              {"Nimal".slice(0, Math.floor(interpolate(t, [28.25, 29.0], [0, 5], clamp)))}
              <span style={{ opacity: Math.floor(t * 3) % 2 }}>▍</span>
            </span>
            <span style={{ fontFamily: body, fontSize: 28, color: "#a7f3d0", opacity: ramp(t, 29.3, 0.3) }}>→ 1 match</span>
          </div>
        </>,
      )}

      {/* 2. registered once, linked to family */}
      {leftText(
        W.registeredOnce - 0.1,
        CUT_QUEUE,
        <>
          <Words t={t} size={70} words={[["Registered", W.registeredOnce], ["once.", 30.36]]} />
          <div style={{ marginTop: 18 }}>
            <Words t={t} size={70} accent={{ "families.": "#c4b5fd" }} words={[["Linked", W.families], ["to", 31.36], ["families.", 31.74]]} />
          </div>
          <div style={{ position: "relative", marginTop: 40, height: 240 }}>
            <svg width={640} height={240} style={{ position: "absolute", inset: 0 }}>
              {[
                [90, 170],
                [252, 170],
              ].map(([x, y], i) => (
                <line
                  key={i}
                  x1={x + 42}
                  y1={y}
                  x2={420}
                  y2={70}
                  stroke={COL}
                  strokeWidth={4}
                  strokeDasharray="8 14"
                  strokeDashoffset={-t * 60}
                  opacity={ramp(t, W.families + 0.2 + i * 0.15, 0.4)}
                />
              ))}
            </svg>
            <div style={{ position: "absolute", left: 48, top: 128, scale: String(pop(t, 30.4)) }}>
              <Avatar initials="NP" color="#6366f1" />
              <div style={{ fontFamily: body, color: "#e2e8f0", fontSize: 22, marginTop: 8, fontWeight: 600, whiteSpace: "nowrap" }}>Nimal Perera</div>
            </div>
            <div style={{ position: "absolute", left: 210, top: 128, scale: String(pop(t, W.families + 0.1)) }}>
              <Avatar initials="KF" color="#d946ef" />
              <div style={{ fontFamily: body, color: "#e2e8f0", fontSize: 22, marginTop: 8, fontWeight: 600, whiteSpace: "nowrap" }}>Kumari Fernando</div>
            </div>
            <Glass
              accent={COL}
              style={{
                position: "absolute",
                left: 330,
                top: 16,
                padding: "16px 22px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                scale: String(pop(t, 31.6)),
                fontWeight: 700,
                fontSize: 26,
                whiteSpace: "nowrap",
              }}
            >
              <Icon name="building" size={32} color="#c4b5fd" /> Perera Family
            </Glass>
          </div>
        </>,
      )}

      {/* 3. one live queue */}
      {leftText(
        W.liveQueue - 0.1,
        SCENES.reception[1],
        <>
          <Words t={t} size={76} accent={{ "live": "#c4b5fd" }} words={[["One", W.liveQueue], ["live", 33.34], ["queue.", 33.8]]} />
          <div style={{ position: "relative", height: 300, marginTop: 30, marginBottom: 50 }}>
            {/* two feeders merging into one lane */}
            <svg width={640} height={300} style={{ position: "absolute", inset: 0 }}>
              <path d="M10 40 C 200 40, 220 150, 380 150 L 640 150" stroke="rgba(196,181,253,.35)" strokeWidth={46} fill="none" strokeLinecap="round" />
              <path d="M10 260 C 200 260, 220 150, 380 150" stroke="rgba(196,181,253,.35)" strokeWidth={46} fill="none" strokeLinecap="round" />
            </svg>
            <div style={{ position: "absolute", left: 0, top: 2, fontFamily: body, fontWeight: 700, fontSize: 22, color: "#fff", letterSpacing: 2, opacity: ramp(t, W.walkIn, 0.3) }}>WALK-IN</div>
            <div style={{ position: "absolute", left: 0, top: 284, fontFamily: body, fontWeight: 700, fontSize: 22, color: "#fff", letterSpacing: 2, opacity: ramp(t, W.booked, 0.3) }}>BOOKED</div>
            {["A-001", "A-002", "A-003", "A-004", "A-005"].map((tok, i) => {
              const k = ((lane - i * 130) % 900) / 900; // 0..1 along the path
              if (t < W.liveQueue + i * 0.35) return null;
              const fromTop = i % 2 === 0;
              const x = 10 + k * 620;
              const yStart = fromTop ? 40 : 260;
              const y = k < 0.6 ? interpolate(k, [0, 0.6], [yStart, 150], { ...clamp, easing: EASE_IN_OUT }) : 150;
              return (
                <div
                  key={tok}
                  style={{
                    position: "absolute",
                    left: x - 50,
                    top: y - 22,
                    width: 100,
                    height: 44,
                    borderRadius: 12,
                    background: fromTop ? "#8b5cf6" : "#6366f1",
                    color: "#fff",
                    fontFamily: mono,
                    fontWeight: 600,
                    fontSize: 22,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 8px 20px rgba(0,0,0,.35)",
                    opacity: interpolate(k, [0, 0.05, 0.92, 1], [0, 1, 1, 0], clamp),
                  }}
                >
                  {tok}
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 54,
              color: "#fff",
              opacity: ramp(t, W.nobodyLost, 0.35),
              translate: `0px ${(1 - ramp(t, W.nobodyLost, 0.4)) * 20}px`,
            }}
          >
            <div style={{ width: 58, height: 58, borderRadius: 99, background: "#22c55e", display: "grid", placeItems: "center", scale: String(pop(t, W.nobodyLost)) }}>
              <Icon name="check" size={38} color="#fff" stroke={3} />
            </div>
            Nobody gets lost.
          </div>
        </>,
      )}
    </AbsoluteFill>
  );
};
