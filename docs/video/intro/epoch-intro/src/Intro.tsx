import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Background, Grain } from "./components/Background";
import { SfxTrack } from "./Sfx";
import { Billing } from "./scenes/Billing";
import { Chaos } from "./scenes/Chaos";
import { Clinical } from "./scenes/Clinical";
import { OneSystem } from "./scenes/OneSystem";
import { Pharmacy } from "./scenes/Pharmacy";
import { Reception } from "./scenes/Reception";
import { Reveal } from "./scenes/Reveal";
import { Tagline } from "./scenes/Tagline";
import { Trust } from "./scenes/Trust";
import { SCENES, sec } from "./timeline";

const span = (k: keyof typeof SCENES) => ({
  from: sec(SCENES[k][0]),
  durationInFrames: sec(SCENES[k][1] - SCENES[k][0]),
});

export const Intro: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#030716" }}>
      <Background />

      <Sequence name="1 Chaos" {...span("chaos")} premountFor={fps}>
        <Chaos />
      </Sequence>
      <Sequence name="2 Reveal" {...span("reveal")} premountFor={fps}>
        <Reveal />
      </Sequence>
      <Sequence name="3 One system" {...span("oneSystem")} premountFor={fps}>
        <OneSystem />
      </Sequence>
      <Sequence name="4 Reception" {...span("reception")} premountFor={fps}>
        <Reception />
      </Sequence>
      <Sequence name="5 Clinical" {...span("clinical")} premountFor={fps}>
        <Clinical />
      </Sequence>
      <Sequence name="6 Pharmacy" {...span("pharmacy")} premountFor={fps}>
        <Pharmacy />
      </Sequence>
      <Sequence name="7 Billing" {...span("billing")} premountFor={fps}>
        <Billing />
      </Sequence>
      <Sequence name="8 Trust" {...span("trust")} premountFor={fps}>
        <Trust />
      </Sequence>
      <Sequence name="9 Tagline" {...span("tagline")} premountFor={fps}>
        <Tagline />
      </Sequence>

      <Grain />

      <Audio name="Voiceover" src={staticFile("audio/voice.wav")} volume={1} />
      <Audio name="Music" src={staticFile("audio/music.wav")} volume={0.32} />
      <SfxTrack />
    </AbsoluteFill>
  );
};
