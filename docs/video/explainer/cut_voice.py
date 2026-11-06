"""Cut build/voice/full.wav (the AI Studio take) into one clip per scene, removing the bad bits.

Times come from a word-level transcript of that take. In it, the TTS read paragraph 1 twice and
spoke three stage directions aloud ("Relieved", "Mock alarm", "Curious?") plus a stray "Ah".
A new take needs new times: transcribe it and update SCENES and REMOVE.
"""
import wave
from pathlib import Path

import numpy as np

VOICE = Path(__file__).resolve().parent / "build" / "voice"

# (start, end) seconds of each scene's line in full.wav; paragraph 1 uses the second, cleaner take.
SCENES = [(13.35, 27.77), (27.77, 41.33), (41.33, 54.78), (54.78, 68.51), (68.51, 82.37),
          (82.37, 95.03), (95.03, 108.02), (108.02, 122.77), (122.77, 135.24), (136.97, 145.88)]
# Spans to drop: stage directions read aloud, and a stray "Ah."
REMOVE = [(36.12, 37.36), (45.97, 47.70), (60.61, 61.55), (135.24, 136.97)]


def main():
    with wave.open(str(VOICE / "full.wav")) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
    hop = sr // 200
    energy = np.sqrt(np.convolve(a * a, np.ones(hop) / hop, "same"))

    def snap(t, reach=0.25):
        """Move a cut to the quietest point nearby so it never lands mid-syllable."""
        i0, i1 = max(0, int((t - reach) * sr)), min(len(a) - 1, int((t + reach) * sr))
        return (i0 + int(np.argmin(energy[i0:i1]))) / sr

    def take(s, e):
        out, cursor = [], s
        for rs, re_ in REMOVE:
            if s < rs < e:
                out.append((cursor, snap(rs)))
                cursor = snap(re_)
        out.append((cursor, e))
        fade = int(0.012 * sr)
        pieces = []
        for ps, pe in out:
            seg = a[int(snap(ps) * sr):int(snap(pe) * sr)].copy()
            if len(seg) > 2 * fade:
                seg[:fade] *= np.linspace(0, 1, fade)
                seg[-fade:] *= np.linspace(1, 0, fade)
            pieces += [seg, np.zeros(int(0.12 * sr), np.float32)]
        clip = np.concatenate(pieces[:-1])
        loud = np.where(np.abs(clip) > 600)[0]  # trim edge silence, keep a little air
        return clip[max(0, loud[0] - sr // 20): loud[-1] + sr // 8] if len(loud) else clip

    for k, (s, e) in enumerate(SCENES, 1):
        clip = take(s, e)
        with wave.open(str(VOICE / f"line-{k:02d}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(np.clip(clip, -32768, 32767).astype(np.int16).tobytes())
        print(f"line {k:2d}: {len(clip) / sr:5.1f}s")


if __name__ == "__main__":
    main()
