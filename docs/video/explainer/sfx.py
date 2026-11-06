"""Sound effects and a synthwave backing track, synthesised from scratch with numpy."""
import numpy as np
from scipy.signal import lfilter

SR = 48000
rng = np.random.default_rng(42)


def _t(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, a=0.005, r=0.2):
    """Attack/exponential-release envelope over n samples."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(r, 1e-4))
    return e


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeps)."""
    if np.ndim(cutoff) == 0:
        a = 1 - np.exp(-2 * np.pi * cutoff / SR)
        return lfilter([a], [1, a - 1], x)
    cutoff = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # small sounds only; fine in pure python
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def saw(f, t):
    ph = np.cumsum(np.broadcast_to(f, t.shape) / SR)
    return 2 * (ph % 1) - 1


def sine(f, t):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape) / SR))


def square(f, t):
    return np.sign(sine(f, t))


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


# ---- effects ------------------------------------------------------------------------------------

def whoosh(dur=0.7, up=True):
    t = _t(dur)
    k = t / dur
    cut = 300 + 5000 * (k if up else 1 - k) ** 2
    x = lowpass(noise(dur), cut) * np.sin(np.pi * k) ** 1.5
    return 0.9 * x / (np.abs(x).max() + 1e-9)


def riser(dur=1.2):
    t = _t(dur)
    k = t / dur
    x = 0.5 * saw(200 + 1200 * k ** 2, t) * k ** 2 + 0.4 * lowpass(noise(dur), 500 + 8000 * k ** 2) * k
    return 0.8 * x / np.abs(x).max()


def impact(dur=1.4):
    """Sub-bass drop + noise crack."""
    t = _t(dur)
    sub = sine(55 * np.exp(-t * 3) + 35, t) * np.exp(-t * 2.2)
    crack = lowpass(noise(dur), 2500) * np.exp(-t * 18)
    return 0.95 * np.tanh(1.6 * (sub + 0.6 * crack))


def boing(dur=0.6, f0=180):
    t = _t(dur)
    f = f0 + 260 * np.exp(-t * 6) * (1 + 0.3 * np.sin(2 * np.pi * 22 * t))
    return 0.7 * sine(f, t) * env(len(t), 0.003, 0.25)


def bonk(dur=0.35):
    t = _t(dur)
    x = sine(140 * np.exp(-t * 8) + 90, t) * np.exp(-t * 14) + 0.5 * lowpass(noise(dur), 1500) * np.exp(-t * 40)
    return 0.95 * np.tanh(2 * x)


def pop_snd(dur=0.12, f=900):
    t = _t(dur)
    return 0.6 * sine(f * np.exp(-t * 20) + 200, t) * env(len(t), 0.001, 0.03)


def ding(f=1318.5, dur=1.4):
    t = _t(dur)
    x = sum(a * sine(f * m, t) * np.exp(-t * d) for a, m, d in [(1, 1, 3), (0.5, 2.76, 5), (0.3, 5.4, 8), (0.2, 8.9, 12)])
    return 0.45 * x * np.minimum(1, t / 0.002)


def kaching():
    t = _t(1.2)
    clunk = lowpass(noise(1.2), 1200) * np.exp(-t * 30)
    bells = ding(2093, 1.2) + 0.7 * np.concatenate([np.zeros(int(SR * 0.08)), ding(2637, 1.2)[: int(SR * 1.12)]])
    return 0.8 * (0.6 * clunk + bells)


def click():
    t = _t(0.03)
    return 0.5 * lowpass(noise(0.03), 4000) * np.exp(-t * 300)


def typing(n=6, gap=0.09):
    out = np.zeros(int(SR * gap * n) + int(SR * 0.05))
    for k in range(n):
        s = int(SR * (k * gap + rng.uniform(-0.015, 0.015)))
        s = max(0, s)
        c = click() * rng.uniform(0.6, 1)
        out[s:s + len(c)] += c
    return out


def sad_trombone():
    """Wah... wah... wah... waaaah."""
    notes = [(311, 0.45), (293, 0.45), (277, 0.45), (262, 1.6)]
    parts = []
    for i, (f, d) in enumerate(notes):
        t = _t(d)
        vib = 1 + (0.012 * np.sin(2 * np.pi * 5.5 * t) * (t / d) if i == 3 else 0)
        bend = 1 - (0.06 * (t / d) if i == 3 else 0.02 * (t / d))
        x = saw(f * vib * bend, t) * 0.6 + square(f * vib * bend * 0.5, t) * 0.2
        x = lowpass(x, 900 + 600 * np.sin(np.pi * t / d))
        parts.append(x * env(len(t), 0.04, d * 0.9) * np.minimum(1, (d - t) / 0.05))
    x = np.concatenate(parts)
    return 0.8 * x / np.abs(x).max()


def airhorn(dur=1.1):
    t = _t(dur)
    f = 466 * (1 + 0.01 * np.sin(2 * np.pi * 6 * t))
    x = sum(saw(f * m, t) for m in (1, 1.005, 1.5, 2.0))
    x = np.tanh(2.5 * x) * np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.08)
    return 0.45 * x


def zap(dur=0.5):
    t = _t(dur)
    return 0.6 * square(2500 * np.exp(-t * 7) + 80, t) * np.exp(-t * 5)


def thud(dur=0.5):
    t = _t(dur)
    return 0.9 * np.tanh(3 * sine(70 * np.exp(-t * 6) + 40, t) * np.exp(-t * 9))


def slide_whistle(dur=0.9, down=True):
    t = _t(dur)
    k = t / dur
    f = (1800 - 1300 * k) if down else (500 + 1300 * k)
    return 0.45 * sine(f * (1 + 0.01 * np.sin(2 * np.pi * 7 * t)), t) * np.sin(np.pi * k) ** 0.5


def shred(dur=1.0):
    t = _t(dur)
    buzz = square(90 + 10 * np.sin(2 * np.pi * 13 * t), t) * 0.3
    tear = lowpass(noise(dur), 3000) * (0.5 + 0.5 * np.sin(2 * np.pi * 17 * t) ** 2)
    return 0.6 * (buzz + tear) * np.sin(np.pi * t / dur) ** 0.4


def printer(dur=1.2):
    t = _t(dur)
    whirr = square(220 + 30 * np.sin(2 * np.pi * 9 * t), t) * 0.15
    ticks = (np.sin(2 * np.pi * 30 * t) > 0.95) * 0.5
    return (whirr + lowpass(noise(dur), 2000) * ticks) * np.minimum(1, (dur - t) / 0.05)


def alarm(n=3):
    out = []
    for _ in range(n):
        t = _t(0.18)
        out += [0.35 * square(1100, t) * env(len(t), 0.002, 0.2), np.zeros(int(SR * 0.08))]
    return np.concatenate(out)


def drumroll(dur=1.2):
    t = _t(dur)
    hits = (np.sin(2 * np.pi * 28 * t) > 0.6).astype(float)
    return 0.5 * lowpass(noise(dur), 2500) * hits * (0.4 + 0.6 * t / dur)


def tick_roll(dur=1.0, rate=18):
    out = np.zeros(int(SR * dur))
    for k in range(int(dur * rate)):
        s = int(SR * k / rate)
        c = pop_snd(0.03, 2400)
        out[s:s + len(c)] += 0.6 * c[: len(out) - s]
    return out


def lock():
    return np.concatenate([click() * 2, np.zeros(int(SR * 0.05)), thud(0.25) * 0.6])


def record_scratch(dur=0.5):
    t = _t(dur)
    return 0.5 * lowpass(noise(dur), 1500 + 1200 * np.sin(2 * np.pi * 6 * t)) * np.sin(np.pi * t / dur)


SOUNDS = {
    "whoosh": lambda: whoosh(), "whoosh_down": lambda: whoosh(0.6, False), "riser": riser, "impact": impact,
    "boing": boing, "bonk": bonk, "pop": pop_snd, "ding": ding, "kaching": kaching, "typing": typing,
    "trombone": sad_trombone, "airhorn": airhorn, "zap": zap, "thud": thud, "fall": slide_whistle,
    "rise": lambda: slide_whistle(0.7, False), "shred": shred, "printer": printer, "alarm": alarm,
    "drumroll": drumroll, "ticks": tick_roll, "lock": lock, "scratch": record_scratch, "click": click,
}


# ---- music --------------------------------------------------------------------------------------

def music(dur, bpm=104):
    """A cheerful synthwave loop: kick, snare, hats, bass and pad over Am-F-C-G."""
    n = int(SR * dur)
    out = np.zeros(n)
    beat = 60 / bpm
    t_kick = _t(0.35)
    kick = np.tanh(3 * sine(50 + 120 * np.exp(-t_kick * 35), t_kick) * np.exp(-t_kick * 9))
    t_sn = _t(0.25)
    snare = 0.5 * lowpass(noise(0.25), 5000) * np.exp(-t_sn * 18) + 0.3 * sine(190, t_sn) * np.exp(-t_sn * 25)
    t_hat = _t(0.06)
    hat = 0.18 * (noise(0.06) - lowpass(noise(0.06), 6000)) * np.exp(-t_hat * 70)
    chords = [(220.0, [220, 261.6, 329.6]), (174.6, [174.6, 220, 261.6]),
              (130.8, [261.6, 329.6, 392]), (196.0, [196, 246.9, 293.7])]

    def put(sig, at, gain=1.0):
        s = int(at * SR)
        if s >= n:
            return
        e = min(n, s + len(sig))
        out[s:e] += gain * sig[: e - s]

    bars = int(dur / (4 * beat)) + 1
    for b in range(bars):
        root, triad = chords[b % 4]
        t0 = b * 4 * beat
        for q in range(4):
            put(kick, t0 + q * beat, 0.9)
            if q in (1, 3):
                put(snare, t0 + q * beat, 0.7)
        for e8 in range(8):
            put(hat, t0 + e8 * beat / 2, 0.8)
            tb = _t(beat / 2 * 0.95)
            bass = saw(root / 2, tb) * env(len(tb), 0.005, 0.18)
            put(lowpass(bass, 700), t0 + e8 * beat / 2, 0.35)
        tp = _t(4 * beat)
        pad = sum(saw(f * d, tp) for f in triad for d in (1, 1.004))
        pad = lowpass(pad, 1400) * np.minimum(1, tp / 0.3) * np.minimum(1, (4 * beat - tp) / 0.3)
        put(pad, t0, 0.05)
        # little arpeggio sparkle
        for k in range(8):
            ta = _t(beat / 2)
            note = sine(triad[k % 3] * 2, ta) * env(len(ta), 0.002, 0.12)
            put(note, t0 + k * beat / 2, 0.08)
    return out / (np.abs(out).max() + 1e-9)
