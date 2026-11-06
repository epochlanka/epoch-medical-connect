import React from "react";
import { Composition, Folder } from "remotion";
import { Intro } from "./Intro";
import { Billing } from "./scenes/Billing";
import { Chaos } from "./scenes/Chaos";
import { Clinical } from "./scenes/Clinical";
import { OneSystem } from "./scenes/OneSystem";
import { Pharmacy } from "./scenes/Pharmacy";
import { Reception } from "./scenes/Reception";
import { Reveal } from "./scenes/Reveal";
import { Tagline } from "./scenes/Tagline";
import { Trust } from "./scenes/Trust";

// Scene compositions preview each scene on its own (without the shared background and audio).
// Durations match timeline.ts SCENES at 30 fps.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="EpochIntro" component={Intro} durationInFrames={2640} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="S1-Chaos" component={Chaos} durationInFrames={336} fps={30} width={1920} height={1080} />
        <Composition id="S2-Reveal" component={Reveal} durationInFrames={189} fps={30} width={1920} height={1080} />
        <Composition id="S3-OneSystem" component={OneSystem} durationInFrames={354} fps={30} width={1920} height={1080} />
        <Composition id="S4-Reception" component={Reception} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="S5-Clinical" component={Clinical} durationInFrames={447} fps={30} width={1920} height={1080} />
        <Composition id="S6-Pharmacy" component={Pharmacy} durationInFrames={318} fps={30} width={1920} height={1080} />
        <Composition id="S7-Billing" component={Billing} durationInFrames={201} fps={30} width={1920} height={1080} />
        <Composition id="S8-Trust" component={Trust} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="S9-Tagline" component={Tagline} durationInFrames={312} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
