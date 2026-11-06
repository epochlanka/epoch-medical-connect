import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Easing } from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_SECONDS = 88;
export const TOTAL_FRAMES = TOTAL_SECONDS * FPS;

export const display = loadSora("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
}).fontFamily;
export const body = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
}).fontFamily;
export const mono = loadMono("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
}).fontFamily;

export const C = {
  ink: "#040814",
  navy: "#071233",
  blue: "#2563eb",
  sky: "#38bdf8",
  cyan: "#22d3ee",
  violet: "#7c3aed",
  emerald: "#10b981",
  orange: "#f97316",
  amber: "#f59e0b",
  red: "#ef4444",
  white: "#f8fafc",
  mute: "#94a3b8",
};

/** Workspace colours, matching each role's sign-in confirmation screen in the app. */
export const ROLE = {
  reception: { label: "Reception", color: "#8b5cf6" },
  doctor: { label: "Doctor", color: "#10b981" },
  pharmacy: { label: "Pharmacy", color: "#f97316" },
  admin: { label: "Administration", color: "#3b82f6" },
};

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
