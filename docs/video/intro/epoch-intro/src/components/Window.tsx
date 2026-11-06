import { Video } from "@remotion/media";
import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import { keys } from "../lib/anim";
import { body, mono } from "../theme";

export type Cam = [t: number, x: number, y: number, zoom: number][];

/**
 * A floating app window: glass chrome, address bar, and the real screen inside it.
 * The screen is always 1920x1080 and is scaled into `width`. `cam` keyframes pan and
 * zoom onto a point of the 1920x1080 screen (x, y = point to centre, zoom >= 1).
 */
export const AppWindow: React.FC<{
  t: number;
  width: number;
  url?: string;
  accent?: string;
  cam?: Cam;
  children: React.ReactNode;
  style?: React.CSSProperties;
  glow?: number;
}> = ({ t, width, url = "http://clinic.local:5173", accent = "#3b82f6", cam, children, style, glow = 1 }) => {
  const s = width / 1920;
  const barH = Math.max(34, 54 * s);
  let tx = 0;
  let ty = 0;
  let z = 1;
  if (cam && cam.length) {
    const cx = keys(t, cam.map((c) => [c[0], c[1]]));
    const cy = keys(t, cam.map((c) => [c[0], c[2]]));
    z = keys(t, cam.map((c) => [c[0], c[3]]));
    // keep the zoomed screen covering the viewport
    const maxX = (1920 * (z - 1)) / 2;
    const maxY = (1080 * (z - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, (960 - cx) * z));
    ty = Math.max(-maxY, Math.min(maxY, (540 - cy) * z));
  }
  return (
    <div
      style={{
        width,
        borderRadius: 22 * Math.max(s, 0.6),
        overflow: "hidden",
        background: "rgba(15,23,42,.55)",
        border: "1.5px solid rgba(255,255,255,.22)",
        boxShadow: `0 40px 120px rgba(0,0,0,.55), 0 0 ${90 * glow}px ${accent}55, inset 0 1px 0 rgba(255,255,255,.25)`,
        ...style,
      }}
    >
      <div
        style={{
          height: barH,
          display: "flex",
          alignItems: "center",
          gap: 10 * Math.max(s, 0.7),
          padding: `0 ${18 * Math.max(s, 0.7)}px`,
          background: "linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.06))",
          backdropFilter: "blur(12px)",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13 * Math.max(s, 0.75), height: 13 * Math.max(s, 0.75), borderRadius: 99, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 16 * s,
            flex: 1,
            maxWidth: "62%",
            height: barH * 0.58,
            borderRadius: 99,
            background: "rgba(2,6,23,.45)",
            border: "1px solid rgba(255,255,255,.12)",
            color: "rgba(226,232,240,.85)",
            fontFamily: mono,
            fontSize: Math.max(13, 19 * s),
            display: "flex",
            alignItems: "center",
            paddingLeft: 16 * Math.max(s, 0.7),
            gap: 8,
          }}
        >
          <span style={{ color: accent, fontFamily: body, fontWeight: 700 }}>●</span>
          {url}
        </div>
      </div>
      <div style={{ width, height: width * (1080 / 1920), position: "relative", overflow: "hidden", background: "#f4f6fb" }}>
        <div
          style={{
            width: 1920,
            height: 1080,
            transformOrigin: "top left",
            scale: String(s),
            position: "absolute",
            left: 0,
            top: 0,
          }}
        >
          <div style={{ width: 1920, height: 1080, translate: `${tx}px ${ty}px`, scale: String(z) }}>{children}</div>
        </div>
      </div>
    </div>
  );
};

/** A recorded clip of the real app. `at` = video seconds shown when the scene clock is at `start`. */
export const Clip: React.FC<{
  name: string;
  at?: number;
  rate?: number;
  from?: number; // frames, relative to parent sequence
  durationInFrames?: number;
}> = ({ name, at = 0, rate = 1, from, durationInFrames }) => {
  const { fps } = useVideoConfig();
  return (
    <Video
      src={staticFile(`clips/${name}.mp4`)}
      trimBefore={Math.round(at * fps)}
      playbackRate={rate}
      muted
      from={from}
      durationInFrames={durationInFrames}
      premountFor={fps}
      style={{ width: 1920, height: 1080, position: "absolute", inset: 0 }}
    />
  );
};

export const Still: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <Img src={staticFile(`stills/${name}.png`)} style={{ width: 1920, height: 1080, ...style }} />
);
