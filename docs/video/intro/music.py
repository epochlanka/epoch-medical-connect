"""Synthesize the E-Poch intro music bed, locked to the voiceover's word timings.

    python music.py <voiceover.wav> <out.wav>

Sections (seconds, from the voiceover):
  0.0 - 10.6   chaos: dissonant drone, ticking clock, rising noise
  10.6 - 13.74 hope: major pad swells, reverse-cymbal suck into the reveal
  13.74        "This is Epoch": impact
  15.74 - 67.74  beat: kick, clap, hats, sub, arp, pumping pad (120 BPM, downbeat on 13.74)
  67.74 - 77.74  breakdown under "it all stays inside the clinic", riser at the end
  78.08 / 79.40 / 80.88  stabs on "One visit / One record / Zero chaos"
  81.64        "Epoch": final chord, long tail
The bed is ducked under the voice so every word stays clear.
"""
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
TOTAL = 88.0
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
T0 = 13.74  # downbeat = the reveal

rng = np.random.default_rng(7)
N = int(TOTAL * SR)
L = np.zeros(N)
R = np.zeros(N)


def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0:
        return
    s = sig[: N - i] if i >= 0 else sig[-i:]
    i = max(i, 0)
    gl, gr = gain * np.sqrt(0.5 * (1 - pan)), gain * np.sqrt(0.5 * (1 + pan))
    L[i : i + len(s)] += s * gl
    R[i : i + len(s)] += s * gr


def env(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (t * f * (1 + detune)) % 1.0
    return 2 * ph - 1


# ---------- instruments ----------
def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t * 300) * 0.25
    return np.tanh((s + click) * 1.6) * gain


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) * 40)
    e += np.exp(-t * 9) * 0.35
    return noise * e * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500) * np.exp(-t * (14 if open_ else 70)) * 0.35


def pluck(f, dur=0.32):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = saw(f, n) + 0.6 * saw(f, n, 0.006)
    cutoff_env = 600 + 5200 * np.exp(-t * 18)
    # cheap time-varying LP: blend of two static filters by the envelope
    bright, dark = lp(s, 6000), lp(s, 700)
    m = (cutoff_env - 600) / 5200
    return (bright * m + dark * (1 - m)) * np.exp(-t * 9) * 0.35


def pad(freqs, dur, bright=1800, attack=0.6, release=1.2):
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    sl = np.zeros(n)
    sr_ = np.zeros(n)
    for f in freqs:
        for d, side in ((-0.007, 0), (0.0, 2), (0.007, 1)):
            w = saw(f, n, d)
            if side in (0, 2):
                sl += w
            if side in (1, 2):
                sr_ += w
    e = np.minimum(1, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (release / 4)))
    k = 0.12 / len(freqs)
    return lp(sl, bright) * e * k, lp(sr_, bright) * e * k


def add_st(pair, at, gain=1.0):
    l_, r_ = pair
    i = int(at * SR)
    if i >= N:
        return
    l_, r_ = l_[: N - i], r_[: N - i]
    L[i : i + len(l_)] += l_ * gain
    R[i : i + len(r_)] += r_ * gain


def sub(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.05).clip(0, 1)
    return np.sin(2 * np.pi * f * t) * e * 0.55


def impact(gain=1.0, length=3.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 30 + 90 * np.exp(-t * 10)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crash = lp(hp(rng.standard_normal(n), 400), 9000) * np.exp(-t * 2.2) * 0.35
    return np.tanh((boom * 1.4 + crash)) * gain


def riser(dur, f0=300, f1=7000, gain=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.05 * SR)
    for i in range(0, n, seg):  # stepped band-pass sweep
        p = i / n
        fc = f0 * (f1 / f0) ** (p ** 1.5)
        out[i : i + seg] = bp(x[i : i + seg + 256], fc * 0.7, min(fc * 1.4, SR / 2 - 100))[: len(out[i : i + seg])]
    tone = np.sin(2 * np.pi * np.cumsum(220 * (1 + 3 * (t / dur) ** 2)) / SR) * 0.15
    return (out + tone) * (t / dur) ** 2.2 * gain


def reverse_cymbal(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 5000) * (t / dur) ** 3 * 0.5


# ---------- 1. chaos 0 - 10.6 ----------
drone_n = int(11.2 * SR)
t = np.arange(drone_n) / SR
wob = 1 + 0.004 * np.sin(2 * np.pi * 0.23 * t)
drone = (saw(note(38), drone_n) * 0.5 + saw(note(38) * 1.4142 * wob, drone_n) * 0.25 + saw(note(50) * 1.012, drone_n) * 0.2)
drone = lp(drone, 380) * np.minimum(1, t / 1.5) * np.where(t < 10.4, 1, np.exp(-(t - 10.4) * 6)) * 0.28
add(drone, 0.0, pan=-0.2)
add(drone * 0.8, 0.013, pan=0.2)
# ticking clock, accelerating towards "chaos"
tt = 0.25
gap = 0.5
while tt < 10.4:
    n = int(0.03 * SR)
    tk = bp(rng.standard_normal(n), 2500, 6000) * np.exp(-np.arange(n) / SR * 160) * 0.45
    add(tk, tt, pan=0.3 if int(tt * 4) % 2 else -0.3)
    gap = max(0.17, gap * 0.965)
    tt += gap
# low heartbeat thumps
for hb in np.arange(0.3, 10.0, 1.1):
    add(kick(0.45), hb)
    add(kick(0.3), hb + 0.22)
add(riser(3.0, 200, 4000, 0.25), 7.6)
add(impact(0.55, 2.0), 9.48)  # "chaos."

# ---------- 2. hope 10.6 - 13.74 ----------
add_st(pad([note(n) for n in (53, 57, 60, 65)], 2.2, bright=1400, attack=1.2, release=0.4), 10.7, 1.0)
add(reverse_cymbal(1.4), T0 - 1.4)
add(riser(2.4, 400, 9000, 0.28), T0 - 2.4)

# ---------- 3. reveal ----------
add(impact(1.0, 4.0), T0)
add_st(pad([note(n) for n in (50, 57, 62, 65, 69)], 2.0, bright=3500, attack=0.02, release=2.0), T0, 1.3)

# ---------- 4. beat 15.74 - 67.74 ----------
prog = [(50, (62, 65, 69)), (46, (62, 65, 70)), (41, (60, 65, 69)), (48, (60, 64, 67))]  # Dm Bb F C
beat_start = T0 + BAR
beat_end = T0 + 27 * BAR  # 67.74
arp_pat = [0, 1, 2, 1, 2, 0, 1, 2]
bar = 0
tb = beat_start
while tb < beat_end - 1e-6:
    root, chord = prog[bar % 4]
    intensity = min(1.0, 0.55 + bar * 0.06)
    add_st(pad([note(c) for c in chord] + [note(root + 12)], BAR, bright=1200 + 900 * intensity, attack=0.05, release=0.3), tb, 0.9)
    for b in range(4):
        tbeat = tb + b * BEAT
        add(kick(0.9), tbeat)
        add(sub(note(root - 12), BEAT * 0.9) * 0.9, tbeat + 0.06)
        if b in (1, 3) and bar >= 1:
            add(clap(), tbeat, 0.8, pan=0.05)
        add(hat(), tbeat + BEAT / 2, 0.9, pan=0.35)
        if bar >= 2:
            add(hat(), tbeat + BEAT / 4, 0.35, pan=-0.35)
            add(hat(), tbeat + 3 * BEAT / 4, 0.35, pan=-0.35)
    if bar >= 1:
        for k in range(8):
            f = note(chord[arp_pat[k]] + 12)
            add(pluck(f), tb + k * BEAT / 2, 0.55 * intensity, pan=0.45 if k % 2 else -0.45)
    if bar % 4 == 3:
        add(riser(BAR * 0.5, 800, 8000, 0.12), tb + BAR * 0.5)
    bar += 1
    tb += BAR

# ---------- 5. breakdown 67.74 - 77.74 ----------
for k, (root, chord) in enumerate([(50, (62, 65, 69)), (46, (62, 65, 70)), (41, (60, 65, 69)), (48, (60, 64, 67)), (48, (60, 64, 67))]):
    add_st(pad([note(c) for c in chord] + [note(root)], BAR, bright=900, attack=0.4, release=0.6), beat_end + k * BAR, 1.0)
    add(sub(note(root - 12), BAR) * 0.5, beat_end + k * BAR)
add(impact(0.5, 3.0), beat_end)
add(riser(3.0, 300, 10000, 0.35), 78.08 - 3.0)

# ---------- 6. tagline ----------
for when, chord in ((78.08, (50, 62, 65, 69)), (79.40, (46, 62, 65, 70)), (80.88, (48, 60, 64, 67))):
    add(impact(0.55, 1.5), when)
    add(kick(1.0), when)
    add_st(pad([note(c) for c in chord], 0.5, bright=4000, attack=0.005, release=0.6), when, 1.0)
add(reverse_cymbal(0.7), 81.64 - 0.7)
add(impact(1.0, 5.0), 81.64)
add_st(pad([note(n) for n in (41, 53, 60, 65, 69, 72, 76)], 4.5, bright=2600, attack=0.01, release=3.0), 81.64, 1.4)

# ---------- master: duck under voice, glue, limit ----------
voice, vsr = sf.read(sys.argv[1])
if voice.ndim > 1:
    voice = voice.mean(axis=1)
idx = np.arange(int(len(voice) * SR / vsr)) * vsr / SR
voice = np.interp(idx, np.arange(len(voice)), voice)
v_env = np.abs(voice)
win = int(0.03 * SR)
v_env = np.convolve(v_env, np.ones(win) / win, "same")
duck = np.ones(N)
active = (v_env > 0.02).astype(float)
# smooth: fast attack, slow release
sm = np.zeros(N)
a_att, a_rel = np.exp(-1 / (0.02 * SR)), np.exp(-1 / (0.35 * SR))
cur = 0.0
for i in range(0, min(N, len(active)), 64):
    tgt = active[i]
    a = a_att ** 64 if tgt > cur else a_rel ** 64
    cur = tgt + (cur - tgt) * a
    sm[i : i + 64] = cur
duck = 1 - 0.55 * sm
L *= duck
R *= duck

mix = np.stack([L, R], axis=1)
mix = hp(mix.T, 28).T
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.6) / np.tanh(1.6) * 0.89
sf.write(sys.argv[2], mix.astype(np.float32), SR, subtype="PCM_16")
print(f"wrote {sys.argv[2]}: {TOTAL}s, beat {beat_start:.2f}-{beat_end:.2f}")
