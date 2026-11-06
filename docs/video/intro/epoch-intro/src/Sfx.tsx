import { Audio } from "@remotion/media";
import React from "react";
import { staticFile, useVideoConfig } from "remotion";
import { W } from "./timeline";

// [time (s), file in public/sfx, volume]. Kenney packs are CC0; rm-* are Remotion's free SFX.
// Cue times follow the voiceover words (W) and the on-screen clicks in the recorded clips.
const CUES: [number, string, number][] = [
  // 1. chaos
  [0.0, "card-shuffle", 0.55],
  [0.15, "bookFlip1", 0.6],
  [0.9, "card-slide-1", 0.45],
  [1.5, "bookFlip3", 0.5],
  [2.44, "scratch_001", 0.7],
  [3.1, "scratch_003", 0.6],
  [3.7, "bookFlip2", 0.4],
  [4.66, "card-place-2", 0.5],
  [5.0, "tick_001", 0.5],
  [5.45, "tick_002", 0.5],
  [5.9, "tick_001", 0.5],
  [6.35, "tick_002", 0.5],
  [6.8, "tick_001", 0.5],
  [7.76, "glitch_001", 0.35],
  [8.6, "card-shuffle", 0.4],
  [W.chaos, "glitch_004", 0.7],
  [W.chaos + 0.05, "glitch_003", 0.5],
  // 2. reveal
  [W.soWeBuilt - 0.1, "forceField_000", 0.45],
  [W.soWeBuilt + 0.1, "rm-whoosh", 0.5],
  [W.thisIs - 0.05, "glass_002", 0.55],
  [W.thisIs, "powerUp7", 0.35],
  [W.medicalSystem, "glass_004", 0.35],
  // 3. one system
  [16.45, "rm-whoosh", 0.35],
  [W.reception, "pluck_001", 0.6],
  [W.doctor, "pluck_002", 0.6],
  [W.pharmacy, "pluck_001", 0.6],
  [W.administration, "pluck_002", 0.65],
  [22.35, "maximize_006", 0.5],
  [22.75, "click_002", 0.35],
  [22.95, "click_003", 0.35],
  [23.15, "click_002", 0.35],
  [23.35, "click_001", 0.35],
  [25.3, "rm-mouse-click", 0.6],
  [W.everyone + 0.2, "card-fan-1", 0.6],
  [26.85, "rm-mouse-click", 0.6],
  [27.0, "confirmation_002", 0.35],
  // 4. reception
  [27.85, "rm-whip", 0.45],
  [28.25, "click_001", 0.35],
  [28.42, "click_002", 0.35],
  [28.6, "click_003", 0.35],
  [28.78, "click_001", 0.35],
  [28.95, "click_002", 0.35],
  [W.seconds, "confirmation_001", 0.5],
  [W.registeredOnce, "drop_002", 0.55],
  [30.9, "rm-switch", 0.45],
  [W.families + 0.1, "select_006", 0.5],
  [31.6, "pluck_002", 0.45],
  [32.85, "rm-switch", 0.45],
  [33.0, "maximize_008", 0.4],
  [34.0, "rm-mouse-click", 0.6],
  [W.walkIn, "select_001", 0.4],
  [W.booked, "select_003", 0.4],
  [W.nobodyLost, "confirmation_002", 0.55],
  // 5. clinical
  [37.35, "rm-whip", 0.45],
  [39.2, "rm-mouse-click", 0.55],
  [41.35, "rm-switch", 0.45],
  [42.45, "click_001", 0.3],
  [42.6, "click_002", 0.3],
  [W.icd, "impactGlass_light_001", 0.5],
  [42.9, "click_003", 0.3],
  [43.1, "click_001", 0.3],
  [43.3, "click_002", 0.3],
  [43.7, "select_001", 0.45],
  [W.offline, "bong_001", 0.45],
  [46.45, "rm-mouse-click", 0.55],
  [W.labTests, "pluck_001", 0.5],
  [W.followUps, "pluck_002", 0.5],
  [47.35, "rm-switch", 0.45],
  [48.56, "rm-mouse-click", 0.6],
  [50.1, "rm-mouse-click", 0.6],
  [50.72, "rm-mouse-click", 0.6],
  [51.25, "confirmation_004", 0.45],
  // 6. pharmacy
  [52.1, "rm-whoosh", 0.55],
  [54.7, "rm-ding", 0.45],
  [54.72, "impactSoft_heavy_000", 0.5],
  [55.16, "rm-mouse-click", 0.55],
  [55.5, "threeTone1", 0.25],
  [57.16, "rm-mouse-click", 0.55],
  [57.75, "card-slide-3", 0.6],
  [58.4, "select_006", 0.5],
  [59.15, "chips-handle-2", 0.55],
  [59.87, "rm-mouse-click", 0.55],
  [W.printsLabel, "computerNoise_002", 0.3],
  [W.printsLabel + 0.1, "card-slide-6", 0.55],
  // 7. billing
  [61.75, "rm-whip", 0.45],
  [62.35, "tick_002", 0.55],
  [62.75, "tick_002", 0.55],
  [63.15, "tick_002", 0.55],
  [63.7, "chips-stack-3", 0.5],
  [W.payments, "handleCoins", 0.55],
  [W.balances, "select_003", 0.4],
  [64.9, "rm-switch", 0.4],
  [65.6, "rm-mouse-click", 0.55],
  [66.0, "maximize_006", 0.35],
  [W.reconciled, "impactPunch_heavy_000", 0.5],
  [W.reconciled + 0.05, "confirmation_001", 0.45],
  // 8. trust
  [W.staysInside, "forceField_002", 0.4],
  [W.ownNetwork, "phaserUp3", 0.3],
  [W.internetDoesnt, "zap1", 0.4],
  [W.internetDoesnt + 0.05, "error_004", 0.3],
  [W.logsChange, "computerNoise_000", 0.25],
  [W.backsUp + 0.3, "metalLatch", 0.7],
  [W.encrypted, "metalClick", 0.5],
  // 9. tagline
  [W.oneVisit - 0.05, "rm-whip", 0.4],
  [W.oneRecord - 0.05, "rm-whip", 0.4],
  [W.zeroChaos - 0.05, "rm-whip", 0.45],
  [W.epochFinal - 0.1, "glass_004", 0.5],
  [W.epochFinal, "powerUp7", 0.35],
  [W.connected, "pluck_002", 0.45],
];

export const SfxTrack: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {CUES.map(([at, file, volume], i) => (
        <Audio
          key={i}
          name={`sfx ${file}`}
          src={staticFile(`sfx/${file}.wav`)}
          volume={volume}
          from={Math.round(at * fps)}
          durationInFrames={Math.round(3 * fps)}
          premountFor={fps}
        />
      ))}
    </>
  );
};
