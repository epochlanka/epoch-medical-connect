"""Render the E-Poch explainer: frames + narration + sound effects + music -> MP4.

    python render.py                 # full video -> build/epoch-explainer.mp4
    python render.py --stills 3 40   # PNG stills at those seconds -> build/still-*.png (quick checks)
    python render.py --audio         # only rebuild the soundtrack
"""
import argparse
import math
import subprocess
import sys
import wave
from multiprocessing import Pool
from pathlib import Path

import numpy as np

import sfx
from engine import FPS, H, W, caption, finish
from scenes import SCENES
from script import LINES

BUILD = Path(__file__).resolve().parent / "build"
VOICE = BUILD / "voice"
VOICE_LEAD = 0.5  # seconds into a scene before its line starts
TAIL = 1.2        # black fade at the very end


# ---- narration ----------------------------------------------------------------------------------

def _read_wav(path):
    with wave.open(str(path)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        return a, w.getframerate()


def split_full_narration():
    """Cut build/voice/full.wav (all lines, read with pauses between) at its longest silences."""
    full = VOICE / "full.wav"
    a, sr = _read_wav(full)
    hop = sr // 100  # 10 ms
    e = np.sqrt(np.convolve(a * a, np.ones(hop * 3) / (hop * 3), "same"))[::hop]
    quiet = e < 0.012
    runs, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((i - start, start, i))
            start = None
    gaps = sorted(sorted(runs, reverse=True)[: len(LINES) - 1], key=lambda r: r[1])
    if len(gaps) < len(LINES) - 1:
        sys.exit("could not find a pause between every line in full.wav")
    cuts = [0] + [(s + e_) // 2 * hop for _, s, e_ in gaps] + [len(a)]
    for k in range(len(LINES)):
        seg = a[cuts[k]:cuts[k + 1]]
        active = np.where(np.abs(seg) > 0.02)[0]
        seg = seg[max(0, active[0] - sr // 20): active[-1] + sr // 10] if len(active) else seg
        with wave.open(str(VOICE / f"line-{k + 1:02d}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((seg * 32767).astype(np.int16).tobytes())


def voice_clips():
    """[(samples at 48 kHz or None, seconds)] per line; estimated lengths if no audio yet."""
    if not (VOICE / "line-01.wav").exists() and (VOICE / "full.wav").exists():
        split_full_narration()
    out = []
    for k, line in enumerate(LINES, 1):
        p = VOICE / f"line-{k:02d}.wav"
        if p.exists():
            a, sr = _read_wav(p)
            a = np.interp(np.arange(int(len(a) * 48000 / sr)) * sr / 48000, np.arange(len(a)), a)
            out.append((a, len(a) / 48000))
        else:
            out.append((None, len(line.split()) / 2.6))
    return out


def timeline():
    clips = voice_clips()
    scenes, start = [], 0.0
    for cls, (_, secs) in zip(SCENES, clips):
        s = cls(secs)
        scenes.append((start, s))
        start += s.dur
    return scenes, clips, start + TAIL


SCENE_LIST, CLIPS, TOTAL = timeline()


# ---- frames -------------------------------------------------------------------------------------

def shake_at(t):
    amp, flash = 0.0, 0.0
    for start, s in SCENE_LIST:
        for ht, px in s.hits():
            u = t - (start + ht)
            if 0 <= u < 1.0:
                amp += px * math.exp(-u * 7)
        for ft, k in s.flashes():
            u = t - (start + ft)
            if 0 <= u < 0.5:
                flash = max(flash, k * math.exp(-u * 9))
        u = t - start  # a small kick at every scene change
        if 0 <= u < 0.3 and start > 0:
            amp += 8 * math.exp(-u * 14)
    return amp, flash


def render_frame(i):
    t = i / FPS
    if t >= TOTAL - TAIL:
        start, scene = SCENE_LIST[-1]
        lt = scene.dur
    else:
        start, scene = next((st, s) for st, s in reversed(SCENE_LIST) if t >= st)
        lt = t - start
    idx = [s for _, s in SCENE_LIST].index(scene)
    img = scene.draw(lt).convert("RGB")
    caption(img, LINES[idx], lt - VOICE_LEAD, CLIPS[idx][1])
    amp, flash = shake_at(t)
    img = finish(img, i, shake=amp, aberration=amp * 0.5, flash=flash, glow=scene.glow)
    fade = min(1.0, t / 0.4, max(0.0, (TOTAL - t) / TAIL))
    if fade < 1:
        img = img.point(lambda v: int(v * fade))
    return img.tobytes()


def render_video(out):
    n = int(TOTAL * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "18", "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
    with Pool() as pool:
        for k, frame in enumerate(pool.imap(render_frame, range(n), chunksize=6)):
            ff.stdin.write(frame)
            if k % (FPS * 5) == 0:
                print(f"  {k / FPS:6.1f}s / {TOTAL:.1f}s", flush=True)
    ff.stdin.close()
    ff.wait()


# ---- soundtrack ---------------------------------------------------------------------------------

def render_audio(out):
    sr = sfx.SR
    n = int(TOTAL * sr) + sr
    voice = np.zeros(n)
    fx = np.zeros(n)

    def put(buf, sig, at, gain):
        s = int(at * sr)
        e = min(n, s + len(sig))
        if 0 <= s < n:
            buf[s:e] += gain * sig[: e - s]

    cache = {}
    for (start, scene), (clip, _) in zip(SCENE_LIST, CLIPS):
        if clip is not None:
            put(voice, clip, start + VOICE_LEAD, 1.0)
        for ct, name, gain in scene.cues():
            if name not in cache:
                cache[name] = sfx.SOUNDS[name]()
            put(fx, cache[name], start + ct, gain * 0.55)
        if start > 0:
            put(fx, cache.setdefault("whoosh", sfx.SOUNDS["whoosh"]()), start - 0.35, 0.3)
    # music from the logo reveal on, ducked under the narration
    m_start = SCENE_LIST[1][0] + SCENE_LIST[1][1].T_HIT
    mus = np.zeros(n)
    put(mus, sfx.music(TOTAL - m_start + 1), m_start, 1.0)
    env = np.convolve(np.abs(voice), np.ones(sr // 10) / (sr // 10), "same")
    duck = 1 - 0.6 * np.clip(env / 0.05, 0, 1)
    fade = np.clip((TOTAL - np.arange(n) / sr) / TAIL, 0, 1)
    mix = (voice * 1.0 + fx + mus * 0.2 * duck) * fade
    mix = np.tanh(mix * 1.1) * 0.95
    stereo = np.stack([mix, mix], axis=1)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="*", type=float)
    ap.add_argument("--audio", action="store_true")
    args = ap.parse_args()
    BUILD.mkdir(exist_ok=True)
    print(f"total {TOTAL:.1f}s; scenes start at " + ", ".join(f"{st:.1f}" for st, _ in SCENE_LIST))
    if args.stills is not None:
        from PIL import Image
        for s in args.stills:
            Image.frombytes("RGB", (W, H), render_frame(int(s * FPS))).save(BUILD / f"still-{s:06.1f}.png")
        return
    audio = BUILD / "soundtrack.wav"
    render_audio(audio)
    print("soundtrack done")
    if args.audio:
        return
    silent = BUILD / "video-silent.mp4"
    render_video(silent)
    final = BUILD / "epoch-explainer.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(audio), "-map", "0:v",
                    "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(final)],
                   check=True)
    print(f"wrote {final}")


if __name__ == "__main__":
    main()
