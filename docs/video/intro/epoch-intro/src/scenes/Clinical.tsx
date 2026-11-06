import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Icon, IconName } from "../components/Icons";
import { Chip, Glass, Slam, Words } from "../components/Type";
import { AppWindow, Clip } from "../components/Window";
import { pop, ramp, useT, win } from "../lib/anim";
import { SCENES, sec, W } from "../timeline";
import { body, clamp, display, EASE_IN_OUT, mono, ROLE } from "../theme";

const START = SCENES.clinical[0];
const f = (abs: number) => sec(abs - START);
const COL = ROLE.doctor.color;

const CUT_ICD = 41.35;
const CUT_RX = 47.35;
// mouse clicks in the prescription clip (clip seconds 3.8, 7.5, 9.0) at playback rate 2.4 from 0.9
const RX_AT = 0.9;
const RX_RATE = 2.4;
const rxT = (clipSec: number) => CUT_RX + (clipSec - RX_AT) / RX_RATE;
const RX_CLICKS = [rxT(3.8), rxT(7.5), rxT(9.0)];

// real ICD-11 results shown in the clip's dropdown
const CODES = ["5A11", "5A14", "JA63.2", "5A13.4", "BA00", "CA40"];

const Pill: React.FC<{ t: number; at: number; icon: IconName; label: string; sub: string; color: string }> = ({ t, at, icon, label, sub, color }) => (
  <Glass
    accent={color}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      padding: "18px 26px 18px 18px",
      scale: String(pop(t, at, 0.5)),
      opacity: ramp(t, at, 0.2),
      transformOrigin: "left center",
    }}
  >
    <div style={{ width: 64, height: 64, borderRadius: 18, background: color, display: "grid", placeItems: "center", boxShadow: `0 0 30px ${color}` }}>
      <Icon name={icon} size={36} color="#fff" />
    </div>
    <div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 36 }}>{label}</div>
      <div style={{ fontFamily: body, fontSize: 22, color: "#cbd5e1" }}>{sub}</div>
    </div>
  </Glass>
);

export const Clinical: React.FC = () => {
  const t = useT(START);
  const inP = ramp(t, START, 0.7, EASE_IN_OUT);
  const out = ramp(t, SCENES.clinical[1] - 0.5, 0.5);
  const cut = (c: number) => interpolate(t, [c - 0.08, c, c + 0.25], [0, 1, 0], clamp);
  const clicks = RX_CLICKS.filter((c) => t >= c).length;

  const right = (a: number, b: number, node: React.ReactNode, top = 250) => (
    <div style={{ position: "absolute", left: 1330, top, width: 540, opacity: win(t, a, b, 0.3, 0.3) }}>{node}</div>
  );

  return (
    <AbsoluteFill style={{ opacity: 1 - out, translate: `${-out * 120}px 0px` }}>
      <div style={{ position: "absolute", left: 1330, top: 120 }}>
        <Chip t={t} at={START + 0.4} label="Clinical" color={COL} icon={<Icon name="stethoscope" size={24} color="#fff" />} />
      </div>

      <div style={{ position: "absolute", left: interpolate(inP, [0, 1], [-900, 120]), top: 190, perspective: 2200, opacity: inP }}>
        <div style={{ transform: `rotateY(${8 + Math.sin(t * 0.5) * 2}deg) rotateX(${2 + Math.cos(t * 0.45) * 1.5}deg)`, transformOrigin: "right center" }}>
          <AppWindow
            t={t}
            width={1120}
            accent={COL}
            url="clinic.local:5173/doctor"
            cam={[
              [37.4, 960, 540, 1],
              [38.1, 900, 380, 1.35],
              [39.3, 900, 380, 1.35],
              [39.9, 900, 640, 1.35],
              [CUT_ICD - 0.01, 900, 640, 1.35],
              [CUT_ICD, 960, 540, 1.0],
              [42.1, 850, 760, 1.5],
              [CUT_RX - 0.01, 850, 760, 1.5],
              [CUT_RX, 960, 540, 1.0],
              [48.3, 1000, 520, 1.3],
              [50.0, 1100, 560, 1.4],
            ]}
          >
            <Clip name="consult" at={3.4} from={0} durationInFrames={f(CUT_ICD)} />
            <Clip name="icd" at={0.2} from={f(CUT_ICD)} durationInFrames={f(CUT_RX) - f(CUT_ICD)} />
            <Clip name="rx" at={RX_AT} rate={RX_RATE} from={f(CUT_RX)} />
          </AppWindow>
        </div>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: Math.max(cut(CUT_ICD), cut(CUT_RX)) * 0.25, mixBlendMode: "screen" }} />

      {/* full history, one screen */}
      {right(
        W.consultationRoom,
        CUT_ICD - 0.1,
        <>
          <Words t={t} size={66} weight={700} words={[["The", W.consultationRoom], ["consultation", 37.9], ["room.", 38.22]]} />
          <div style={{ marginTop: 34 }}>
            <Words t={t} size={74} accent={{ history: "#6ee7b7" }} words={[["Full", W.fullHistory], ["history.", 39.3]]} />
            <Words t={t} size={74} accent={{ screen: "#6ee7b7" }} words={[["One", W.oneScreen], ["screen.", 40.38]]} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 34, flexWrap: "wrap" }}>
            {["Visits", "Diagnoses", "Prescriptions", "Lab results", "Allergies"].map((s, i) => (
              <div
                key={s}
                style={{
                  padding: "10px 20px",
                  borderRadius: 99,
                  background: "rgba(16,185,129,.18)",
                  border: "1.5px solid rgba(110,231,183,.55)",
                  color: "#d1fae5",
                  fontFamily: body,
                  fontWeight: 600,
                  fontSize: 24,
                  opacity: ramp(t, 39.4 + i * 0.12, 0.3),
                  translate: `0px ${(1 - ramp(t, 39.4 + i * 0.12, 0.4)) * 20}px`,
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </>,
      )}

      {/* ICD-11 */}
      {right(
        W.diagnoses - 0.1,
        W.labTests - 0.1,
        <>
          <Words t={t} size={48} weight={600} color="#cbd5e1" words={[["Diagnoses", W.diagnoses], ["coded", 42.16], ["with", 42.38]]} />
          <div style={{ marginTop: 10 }}>
            <Slam t={t} at={W.icd} text="ICD-11" size={170} glow={COL} />
          </div>
          <div style={{ position: "relative", height: 130 }}>
            {CODES.map((c, i) => {
              const p = ramp(t, W.searched + i * 0.1, 0.5);
              const drift = Math.sin(t * 1.3 + i) * 8;
              return (
                <div
                  key={c}
                  style={{
                    position: "absolute",
                    left: (i % 3) * 170,
                    top: Math.floor(i / 3) * 62 + drift,
                    padding: "8px 16px",
                    borderRadius: 10,
                    background: "rgba(37,99,235,.25)",
                    border: "1.5px solid rgba(96,165,250,.6)",
                    fontFamily: mono,
                    fontWeight: 600,
                    fontSize: 26,
                    color: "#bfdbfe",
                    opacity: p,
                    scale: String(0.6 + p * 0.4),
                  }}
                >
                  {c}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            <Words t={t} size={44} weight={600} words={[["Searched", W.searched], ["as", 44.2], ["you", 44.5], ["type.", 44.66]]} />
          </div>
          <div
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 22px",
              borderRadius: 16,
              background: "rgba(34,197,94,.18)",
              border: "2px solid #22c55e",
              color: "#dcfce7",
              fontFamily: body,
              fontWeight: 700,
              fontSize: 32,
              scale: String(pop(t, W.offline)),
              opacity: ramp(t, W.offline, 0.2),
            }}
          >
            <Icon name="wifiOff" size={36} color="#86efac" /> Even offline
          </div>
        </>,
        200,
      )}

      {/* labs & follow-ups, then the typed prescription */}
      {right(
        W.labTests - 0.1,
        SCENES.clinical[1],
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Pill t={t} at={W.labTests} icon="flask" label="Lab tests" sub="Ordered from the same screen" color="#0ea5e9" />
            <Pill t={t} at={W.followUps} icon="calendar" label="Follow-ups" sub="Tracked automatically" color="#8b5cf6" />
          </div>
          <div style={{ marginTop: 44 }}>
            <Words t={t} size={62} accent={{ "Typed.": "#6ee7b7" }} words={[["Clear.", 48.26], ["Typed.", W.typedRx]]} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 18, opacity: ramp(t, 48.5, 0.3) }}>
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: 120,
                color: "#fff",
                lineHeight: 1,
                textShadow: `0 0 50px ${COL}`,
                scale: String(1 + 0.25 * Math.max(0, 1 - (t - (RX_CLICKS[clicks - 1] ?? -10)) * 4)),
                transformOrigin: "left bottom",
              }}
            >
              {clicks}
            </div>
            <div style={{ fontFamily: body, fontSize: 36, fontWeight: 600, color: "#a7f3d0" }}>{clicks === 1 ? "click" : "clicks"}</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 24, color: "#d1fae5", marginTop: 8, opacity: ramp(t, rxT(10.2), 0.4) }}>
            Paracetamol 500mg · TDS · 5 days → 15 tablets
          </div>
        </>,
        180,
      )}
    </AbsoluteFill>
  );
};
