"""The ten scenes. Each knows its length, draws itself at time t, and lists its sound cues and hits."""
import math
import random
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

from engine import (AMBER, cross, BLUE, CX, CY, GREEN, H, INK, NAVY, PAPER, PINK, RED, TEAL, W, WHITE, YELLOW,
                    box, burst, card, clamp, confetti, desk_bg, ease_in, ease_in_out, ease_out, emoji,
                    extruded_text, font, lerp, paste_center, pop, prog, project, rounded_card, starwarp,
                    synthwave, text_sprite, ui_card)


# ---- shared sprites -----------------------------------------------------------------------------

@lru_cache(maxsize=None)
def paper(seed, w=300, h=380, scribble=0.6):
    rnd = random.Random(seed)
    im = rounded_card(w, h, PAPER, 6)
    d = ImageDraw.Draw(im)
    for row in range(9):
        y = 40 + row * 36
        x = 26
        pts = []
        end = rnd.uniform(0.5, 0.95) * (w - 50)
        while x < end:
            pts.append((x, y + rnd.uniform(-6, 6) * scribble))
            x += rnd.uniform(6, 14)
        if len(pts) > 1:
            d.line(pts, fill=(110, 100, 90), width=3)
    if rnd.random() < 0.5:
        cx, cy = rnd.uniform(60, w - 60), rnd.uniform(80, h - 80)
        d.ellipse((cx - 45, cy - 45, cx + 45, cy + 45), outline=(150, 110, 70), width=7)
    return im


@lru_cache(maxsize=None)
def patient_card(name="Nimal Perera", sub="52  ·  077 123 4567  ·  P-0142", accent=BLUE):
    im = rounded_card(640, 200)
    d = ImageDraw.Draw(im)
    d.ellipse((30, 40, 150, 160), fill=(219, 234, 254))
    d.text((90, 100), name[0], font=font(64, "Black"), fill=accent, anchor="mm")
    d.text((180, 52), name, font=font(46, "Black"), fill=INK)
    d.text((182, 118), sub, font=font(28, "Regular"), fill=(71, 85, 105))
    d.rounded_rectangle((2, 2, 637, 197), 28, outline=accent, width=4)
    return im


@lru_cache(maxsize=None)
def role_card(icon, label, sub, color):
    im = rounded_card(330, 300)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 329, 16), 8, fill=color)
    im.alpha_composite(emoji(icon, 96), (117, 40))
    d.text((165, 185), label, font=font(40, "Black"), fill=INK, anchor="mm")
    d.text((165, 240), sub, font=font(24, "Regular"), fill=(71, 85, 105), anchor="mm")
    return im


@lru_cache(maxsize=None)
def pill(text, bg, fg=WHITE, size=40):
    f = font(size, "Black")
    l, t, r, b = f.getbbox(text)
    im = Image.new("RGBA", (r - l + 64, b - t + 36), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2, fill=bg, outline=INK, width=4)
    d.text((32 - l, 18 - t), text, font=f, fill=fg)
    return im


@lru_cache(maxsize=None)
def token_label(text, color):
    im = Image.new("RGBA", (220, 220), color + (255,))
    d = ImageDraw.Draw(im)
    d.text((110, 110), text, font=font(58, "Black"), fill=WHITE, anchor="mm", stroke_width=3, stroke_fill=INK)
    return im


@lru_cache(maxsize=None)
def bubble(text, size=40):
    f = font(size, "Black")
    l, t, r, b = f.getbbox(text)
    w, h = r - l + 60, b - t + 50
    im = Image.new("RGBA", (w, h + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 26, fill=WHITE, outline=INK, width=5)
    d.polygon([(40, h - 4), (80, h - 4), (36, h + 28)], fill=WHITE, outline=INK)
    d.line([(42, h - 4), (78, h - 4)], fill=WHITE, width=6)
    d.text((30 - l, 25 - t), text, font=f, fill=INK)
    return im


_STUDIO = None


def studio(t, tint=(14, 20, 52)):
    """Dark radial studio backdrop with a slowly drifting dot grid (for UI-heavy scenes)."""
    global _STUDIO
    if _STUDIO is None:
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.hypot((xx - CX) / 1100, (yy - CY) / 750)
        base = np.clip(1.15 - r, 0, 1)[..., None]
        _STUDIO = (np.array(NAVY) + base * np.array(tint) * 2.2).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(_STUDIO.copy())
    d = ImageDraw.Draw(img)
    off = (t * 20) % 60
    for y in range(-60, H + 60, 60):
        for x in range(-60, W + 60, 60):
            d.point((x + off, y + off * 0.5), fill=(60, 80, 140))
    return img


def title(img, text, t, t0=0.15, color=WHITE):
    k = pop(t, t0, 0.5)
    if k > 0:
        paste_center(img, text_sprite(text, 74, color, "Black", 6, INK), CX, 110, k)


# ---- scene base ---------------------------------------------------------------------------------

class Scene:
    min_dur = 8.0
    glow = 0.45

    def __init__(self, voice_len):
        self.voice = voice_len
        self.dur = max(self.min_dur, voice_len + 1.4)

    def cues(self):
        """[(t, sound, gain)]"""
        return []

    def hits(self):
        """[(t, shake_px)] — camera shake + chromatic aberration."""
        return []

    def flashes(self):
        return []

    def draw(self, t):
        raise NotImplementedError


# 1 -----------------------------------------------------------------------------------------------

class Pile(Scene):
    min_dur = 11.0
    glow = 0.0

    @property
    def tc(self):
        return self.dur - 3.6

    def cues(self):
        return [(0.35, "thud", 0.9), (3.6, "pop", 0.8), (self.tc - 1.2, "drumroll", 0.6),
                (self.tc, "whoosh", 0.8), (self.tc + 0.25, "thud", 1.0), (self.tc + 0.5, "trombone", 0.8)]

    def hits(self):
        return [(0.35, 10), (self.tc + 0.25, 26)]

    def draw(self, t):
        img = desk_bg()
        rnd = random.Random(5)
        n = 15
        wobble = 0.0 if t < self.tc - 1.4 else (t - self.tc + 1.4) * 2.2
        for i in range(n):
            base = np.array([rnd.uniform(-40, 40), 330 - i * 30, 300.0])
            rz0 = rnd.uniform(-14, 14)
            if t < self.tc:
                sway = math.sin(t * 2.4) * (4 + wobble * 6) * (i / n)
                pos = base + np.array([sway * i * 1.4, 0, 0])
                rz = rz0 + sway * 0.5
                rx = 62
            else:
                u = t - self.tc
                v = np.array([rnd.uniform(-1400, 1400), rnd.uniform(-1300, -300), rnd.uniform(-600, 800)])
                pos = base + v * u + np.array([0, 2600, 0]) * u * u
                rz = rz0 + rnd.uniform(-600, 600) * u
                rx = 62 + rnd.uniform(-400, 400) * u
            card(img, paper(i), pos, 1.0, rx=rx, rz=rz)
        k = pop(t, 0.3, 0.4)
        if k > 0:
            paste_center(img, pill("THE FILING SYSTEM", RED, WHITE, 64), CX, 130, 2.6 - 1.6 * k, -6, min(1, k * 2))
        if 3.5 < t < self.tc + 0.2:
            k = pop(t, 3.5)
            paste_center(img, bubble("Nimal's BP, 2019. Probably.", 34), CX + 430, CY - 40, k, 4)
        if t > self.tc + 0.8:
            k = pop(t, self.tc + 0.8)
            paste_center(img, text_sprite("...anyway.", 64, YELLOW, "Black", 5, INK), CX, CY + 60, k)
        return img


# 2 -----------------------------------------------------------------------------------------------

class Logo(Scene):
    min_dur = 10.0
    T_HIT = 1.3

    def cues(self):
        c = [(0.0, "riser", 0.9), (self.T_HIT - 0.05, "impact", 1.0), (self.T_HIT, "airhorn", 0.5),
             (2.2, "whoosh", 0.5)]
        c += [(3.6 + k * 0.35, "pop", 0.7) for k in range(4)]
        c += [(self.t_shout, "bonk", 0.9)]
        return c

    @property
    def t_shout(self):
        return min(self.dur - 2.2, 8.4)

    def hits(self):
        return [(self.T_HIT, 34), (self.t_shout, 12)]

    def flashes(self):
        return [(self.T_HIT, 0.8)]

    def draw(self, t):
        img = synthwave(t, speed=1.0 + 4 * max(0, 1 - t / self.T_HIT))
        if t < self.T_HIT + 0.3:
            starwarp(img, t, speed=1.5 + 3 * prog(t, 0, self.T_HIT))
        k = ease_out(prog(t, 0.45, self.T_HIT - 0.45))
        z = lerp(4200, -60, k)
        hover = math.sin(t * 2.2) * 12 if t > self.T_HIT else 0
        card(img, extruded_text("E-POCH", 210, WHITE, BLUE, 24), (0, -170 + hover, z), 1.0,
             ry=lerp(720, 0, k) + (math.sin(t * 1.3) * 8 if t > self.T_HIT else 0),
             rx=lerp(-30, 0, k), opacity=clamp(k * 3))
        kt = pop(t, 2.2)
        if kt > 0:
            paste_center(img, text_sprite("ONE SYSTEM.  THE WHOLE CLINIC.", 46, YELLOW, "Black", 5, INK), CX, CY + 10, kt)
        roles = [("🛎️", "Front desk", "register · check in", BLUE), ("🩺", "Doctor", "consult · prescribe", TEAL),
                 ("💊", "Pharmacy", "dispense · stock", GREEN), ("🧾", "Office", "billing · reports", PINK)]
        for i, (ic, label, sub, col) in enumerate(roles):
            kr = ease_out(prog(t, 3.6 + i * 0.35, 0.6))
            if kr <= 0:
                continue
            x = -630 + i * 420
            card(img, role_card(ic, label, sub, col), (x, 215 + math.sin(t * 2 + i) * 8, 0), 0.85,
                 ry=lerp(100, 0, kr), rx=lerp(40, 0, kr), opacity=clamp(kr * 2))
        ks = pop(t, self.t_shout)
        if ks > 0:
            paste_center(img, emoji("📢", 150), CX + 720, CY - 40, ks)
            cross(img, CX + 720, CY - 40, 190, ks)
        return img


# 3 -----------------------------------------------------------------------------------------------

class Reception(Scene):
    min_dur = 11.0

    def cues(self):
        return [(0.3, "whoosh", 0.6), (1.0, "typing", 0.9), (2.0, "ding", 0.8), (5.4, "whoosh", 0.7),
                (6.2, "bonk", 1.0), (6.5, "alarm", 0.5), (8.0, "pop", 0.9)]

    def hits(self):
        return [(6.2, 30)]

    def draw(self, t):
        img = studio(t)
        title(img, "FIND ANY PATIENT. FAST.", t)
        out = ease_in(prog(t, 5.0, 0.5))
        typed = "Nimal"[: int(clamp((t - 1.0) / 0.5) * 5)]
        k = ease_out(prog(t, 0.2, 0.7))
        ui = ui_card("Reception  ·  Find a patient", ("Search:  " + typed + ("|" if int(t * 3) % 2 else ""),), 760, 220)
        card(img, ui, (-430, -40 - out * 900, 0), 1.0, rx=lerp(80, 0, k), ry=14, opacity=k)
        kr = ease_out(prog(t, 2.0, 0.6))
        if kr > 0:
            card(img, patient_card(), (430, 60 - out * 900, 0), 1.0, ry=lerp(-90, -12, kr), opacity=kr)
        if t > 5.2:
            # the accidental twins
            u = ease_in(prog(t, 5.3, 0.9))
            merge = ease_in_out(prog(t, 7.6, 0.4))
            for side in (-1, 1):
                x = side * lerp(1400, 330, u) * (1 - merge)
                rz = side * -8 * (1 - u) + (math.sin(t * 40) * 3 if 6.2 < t < 6.6 else 0)
                op = 1 if side < 0 else 1 - merge
                card(img, patient_card(), (x, 80, 0), 0.9, rz=rz, opacity=op)
            if 6.2 <= t < 7.6:
                paste_center(img, pill("DUPLICATE?!", RED, WHITE, 52), CX, CY - 150, pop(t, 6.4), -5)
            burst(img, "BONK!", (CX, CY + 80), 6.2, t)
            if t > 7.9:
                paste_center(img, text_sprite("Not twins. Same Nimal.", 56, YELLOW, "Black", 5, INK), CX, CY + 280, pop(t, 8.0))
        return img


# 4 -----------------------------------------------------------------------------------------------

class Queue(Scene):
    min_dur = 11.0
    T_CALL, T_FALL, T_RECALL = 2.6, 5.6, 7.8

    def cues(self):
        return [(self.T_CALL, "click", 1.0), (self.T_CALL + 0.05, "ding", 0.7), (self.T_CALL + 0.2, "rise", 0.6),
                (self.T_FALL, "fall", 0.8), (self.T_FALL + 0.9, "thud", 0.6), (self.T_RECALL, "click", 1.0),
                (self.T_RECALL + 0.1, "boing", 0.9), (self.dur - 2.6, "pop", 0.8)]

    def hits(self):
        return [(self.T_FALL + 0.9, 10)]

    def draw(self, t):
        img = synthwave(t * 0.6)
        d = ImageDraw.Draw(img)
        title(img, "ONE LIVE QUEUE", t)
        # conveyor belt
        box(d, (0, 250, 300), (2600, 40, 260), 18, 0, 0, (40, 44, 70))
        colors = [BLUE, TEAL, PINK, BLUE, TEAL, PINK, BLUE]
        belt = (t * 90) % 260
        for i in range(7):
            num = 11 + i
            x = 700 - i * 260 + belt
            y, z, rx, ry, rz = 150.0, 300.0, 18, 20 + math.sin(t + i) * 4, 0
            if i == 0:  # the next patient gets called up and away
                u = prog(t, self.T_CALL + 0.15, 1.2)
                x += u * 300
                y -= ease_in(u) * 1400
                z += ease_in(u) * 1500
                ry += u * 300
                if u >= 1:
                    continue
            if i == 3:  # quietly sitting patient gets skipped... and recalled
                f = prog(t, self.T_FALL, 0.9)
                back = ease_out(prog(t, self.T_RECALL, 0.7))
                drop = ease_in(f) * 600 * (1 - back)
                y += drop
                rz += f * 200 * (1 - back)
                x += f * 80 * (1 - back)
            col = colors[i % len(colors)]
            front = box(d, (x, y, z), (190, 190, 190), rx, ry, rz, col, outline=INK)
            if front:
                from engine import warp_onto
                warp_onto(img, token_label(f"T-0{num:02d}", col), front)
        kb = pop(t, 1.6)
        press = 1 - 0.15 * math.exp(-max(0, t - self.T_CALL) * 10) * (t > self.T_CALL)
        if kb > 0:
            paste_center(img, pill("CALL NEXT", BLUE, WHITE, 46), CX + 600, CY - 170, kb * press)
        if t > self.T_FALL + 0.2:
            press2 = 1 - 0.15 * math.exp(-max(0, t - self.T_RECALL) * 10) * (t > self.T_RECALL)
            paste_center(img, pill("RECALL", AMBER, INK, 46), CX - 600, CY - 170, pop(t, self.T_FALL + 0.4) * press2)
        if t > self.dur - 2.7:
            paste_center(img, text_sprite("NO PATIENT LEFT BEHIND", 64, YELLOW, "Black", 6, INK), CX, CY + 360,
                         pop(t, self.dur - 2.6))
        return img


# 5 -----------------------------------------------------------------------------------------------

class Consult(Scene):
    min_dur = 13.0

    def cues(self):
        return [(0.3, "whoosh", 0.6), (5.6, "whoosh_down", 0.6), (6.4, "typing", 0.8),
                (7.3, "pop", 0.6), (7.45, "pop", 0.6), (7.6, "pop", 0.6), (8.4, "ding", 0.8),
                (self.t_tea, "boing", 0.9), (self.t_tea + 0.8, "ding", 0.6)]

    @property
    def t_tea(self):
        return self.dur - 3.6

    def draw(self, t):
        img = studio(t, (30, 20, 60))
        title(img, "WHOLE HISTORY. ONE SCREEN.", t)
        shrink = ease_in_out(prog(t, 5.4, 0.8))
        cx, cy, cz, sc = lerp(0, -560, shrink), lerp(40, 60, shrink), 500, lerp(1.0, 0.62, shrink)
        hist = [("📅", "12 Aug · BP 150/95"), ("🧪", "Lab · lipid profile"), ("💊", "Rx · amlodipine"),
                ("📋", "14 Mar · follow-up"), ("⚠️", "Allergies · none")]
        items = []
        for i, (ic, txt) in enumerate(hist):
            a = math.radians(t * 40 + i * 72)
            x, z = math.sin(a) * 620 * sc, math.cos(a) * 520 * sc
            items.append((z, i, ic, txt, x, -math.cos(a) * 150 * sc))
        enter = ease_out(prog(t, 0.3, 1.0))

        def avatar():
            card(img, patient_card("Nimal", "the man, the legend", BLUE), (cx, cy, cz), 0.8 * sc * enter)

        drew_avatar = False
        for z, i, ic, txt, x, yo in sorted(items, reverse=True):
            if z < 0 and not drew_avatar:
                avatar()
                drew_avatar = True
            sp = hist_card(ic, txt)
            card(img, sp, (cx + x, cy - 20 + yo, cz + z), sc * enter, ry=-math.degrees(math.atan2(x, 900)) * 1.6)
        if not drew_avatar:
            avatar()
        ki = ease_out(prog(t, 6.0, 0.7))
        if ki > 0:
            typed = "hyper"[: int(clamp((t - 6.4) / 0.6) * 5)]
            rows = ["Search:  " + typed]
            if t > 7.3:
                rows.append("BA00  Essential hypertension")
            if t > 7.45:
                rows.append("BA01  Hypertensive heart disease")
            if t > 7.6:
                rows.append("5A11  Type 2 diabetes")
            hl = 1 if t > 8.4 else -1
            ui = ui_card("ICD-11  ·  Diagnosis", tuple(rows), 820, 420, BLUE, hl)
            card(img, ui, (380, 60, 0), 1.0, ry=lerp(-90, -10, ki), opacity=ki)
        if t > self.t_tea:
            swing = math.sin((t - self.t_tea) * 4) * 14 * math.exp(-(t - self.t_tea) * 0.8)
            drop = ease_out(prog(t, self.t_tea, 0.5))
            paste_center(img, pill("INTERNET: ON TEA BREAK", AMBER, INK, 40), CX + 380, lerp(-100, 250, drop), 1, swing)
            paste_center(img, emoji("☕", 90), CX + 720, lerp(-100, 240, drop), 1, swing)
            if t > self.t_tea + 0.8:
                paste_center(img, pill("ICD-11 STILL WORKS!", GREEN, WHITE, 40), CX + 380, CY + 330, pop(t, self.t_tea + 0.8))
        return img


@lru_cache(maxsize=None)
def hist_card(ic, txt):
    im = rounded_card(420, 130)
    im.alpha_composite(emoji(ic, 64), (24, 33))
    ImageDraw.Draw(im).text((110, 65), txt, font=font(30, "Bold"), fill=INK, anchor="lm")
    return im


# 6 -----------------------------------------------------------------------------------------------

class Prescription(Scene):
    min_dur = 12.0
    T_SHRED, T_FORM, T_ROLL = 2.8, 3.9, 7.0

    def cues(self):
        return [(1.4, "pop", 0.6), (self.T_SHRED, "shred", 0.9), (self.T_FORM, "whoosh", 0.6),
                (4.5, "typing", 0.8), (5.3, "typing", 0.8), (6.1, "typing", 0.8), (self.T_ROLL, "ticks", 0.7),
                (self.T_ROLL + 1.1, "kaching", 0.9), (self.t_fish, "scratch", 0.8), (self.t_fish + 0.2, "boing", 0.9)]

    @property
    def t_fish(self):
        return self.dur - 2.8

    def hits(self):
        return [(self.T_ROLL + 1.1, 12)]

    def draw(self, t):
        img = studio(t, (20, 40, 60))
        title(img, "TYPED. NOT SCRIBBLED.", t)
        if t < self.T_SHRED + 1.5:
            sp = paper(99, 420, 520, scribble=3.5)
            if t < self.T_SHRED:
                card(img, sp, (-480, 60, 0), 1.0, rz=-5, ry=10)
                k = pop(t, 1.4)
                if k > 0:
                    paste_center(img, emoji("🔍", 140), CX - 380 + math.sin(t * 3) * 40, CY + 20, k)
                    paste_center(img, bubble("Is that... 5 mg?", 34), CX - 300, CY - 230, k, -3)
            else:  # shredded into falling strips
                u = t - self.T_SHRED
                strips = 7
                sw = sp.width // strips
                for s in range(strips):
                    piece = sp.crop((s * sw, 0, (s + 1) * sw, sp.height))
                    x = -480 - sp.width / 2 + sw * (s + 0.5) + (s - 3) * 30 * u
                    card(img, piece, (x, 60 + 1600 * u * u + s * 10 * u, 0), 1.0, rz=-5 + (s - 3) * 25 * u)
        kf = ease_out(prog(t, self.T_FORM, 0.7))
        if kf > 0:
            fields = [("Medicine", "Amlodipine 5 mg", 4.5), ("Dose", "1 tablet, once a day", 5.3),
                      ("Days", "30", 6.1)]
            rows = []
            for name, val, t0 in fields:
                shown = val[: int(clamp((t - t0) / 0.6) * len(val))]
                rows.append(f"{name}:  {shown}")
            ui = ui_card("New prescription", tuple(rows), 820, 360)
            card(img, ui, (330, -20, 0), 1.0, ry=lerp(-90, -8, kf), opacity=kf)
        if t > self.T_ROLL:
            u = prog(t, self.T_ROLL, 1.1)
            n = 30 if u >= 1 else int(random.Random(int(t * 30)).uniform(0, 99))
            paste_center(img, pill(f"QUANTITY: {n} TABLETS", BLUE if u < 1 else GREEN, WHITE, 52), CX + 330, CY + 260,
                         1 + 0.12 * math.exp(-max(0, t - self.T_ROLL - 1.1) * 8) * (u >= 1))
            confetti(img, t - self.T_ROLL - 1.1, (330, 200, 0), 90, seed=6, power=0.8)
        if t > self.t_fish:
            u = prog(t, self.t_fish, 2.6)
            fx = lerp(-1100, 1100, u)
            fy = -abs(math.sin(u * math.pi * 3)) * 160
            paste_center(img, emoji("🐟", 130), CX + fx, CY + 120 + fy, 1, math.sin(t * 20) * 25)
            paste_center(img, bubble("5 mg... or fish?", 40), CX + fx + 60, CY - 60 + fy, pop(t, self.t_fish + 0.2))
        return img


# 7 -----------------------------------------------------------------------------------------------

class Pharmacy(Scene):
    min_dur = 13.0
    T_PICK, T_STOCK, T_LOW = 2.6, 5.2, 7.4

    def cues(self):
        return [(0.3, "whoosh", 0.6), (self.T_PICK, "fall", 0.6), (self.T_PICK + 0.7, "boing", 0.9),
                (self.T_STOCK, "ticks", 0.6), (self.T_LOW, "alarm", 0.6), (self.t_print, "printer", 0.8),
                (self.t_print + 1.3, "ding", 0.6)]

    @property
    def t_print(self):
        return self.dur - 4.0

    def hits(self):
        return [(self.T_PICK + 0.7, 8), (self.T_LOW, 10)]

    def draw(self, t):
        img = synthwave(t, line=GREEN, glow=TEAL)
        d = ImageDraw.Draw(img)
        title(img, "OLDEST STOCK FIRST", t)
        boxes = [(-420, "Batch A", "exp 2027", (230, 236, 245)), (180, "Batch B", "exp NOV 2026", (230, 245, 236))]
        for i, (x, name, exp, col) in enumerate(boxes):
            k = ease_out(prog(t, 0.3 + i * 0.25, 0.8))
            front = box(d, (x, lerp(-900, 60, k), 300), (420, 260, 160), 12, -18 + math.sin(t + i) * 6, 0, col,
                        outline=INK)
            if front:
                from engine import warp_onto
                warp_onto(img, med_label(name, exp), front)
        if t > self.T_PICK:
            # spotlight + crown on the batch that expires first
            sx, sy, _ = project((180, 60, 300))
            cone = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(cone).polygon([(sx - 40, 0), (sx + 40, 0), (sx + 260, sy + 160), (sx - 260, sy + 160)],
                                         fill=(255, 240, 160, int(60 * prog(t, self.T_PICK, 0.3))))
            img.paste(cone, (0, 0), cone)
            cy = lerp(-200, sy - 150, ease_out(prog(t, self.T_PICK, 0.7)))
            paste_center(img, emoji("👑", 120), sx, cy, 1, math.sin(t * 3) * 8)
            paste_center(img, pill("USE ME FIRST", GREEN, WHITE, 40), sx, sy + 210, pop(t, self.T_PICK + 0.8))
        if t > self.T_STOCK:
            n = int(round(lerp(240, 210, prog(t, self.T_STOCK, 1.4))))
            paste_center(img, pill(f"IN STOCK: {n}", INK, WHITE, 44), CX + 640, CY - 160, pop(t, self.T_STOCK))
        if t > self.T_LOW:
            paste_center(img, pill("LOW STOCK!", AMBER, INK, 44), CX + 640, CY - 60, pop(t, self.T_LOW),
                         math.sin(t * 30) * 4 * math.exp(-(t - self.T_LOW) * 3))
        if t > self.t_print:
            u = ease_out(prog(t, self.t_print, 1.3))
            paste_center(img, print_label(), CX - 600, CY + 200 + u * 110, 1, -3, clamp(u * 3))
            box(d, (-600, 210, 0), (520, 90, 120), 15, 0, 0, (60, 64, 90), outline=INK)
        return img


@lru_cache(maxsize=None)
def med_label(name, exp):
    im = Image.new("RGBA", (420, 260), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 420, 56), fill=GREEN)
    d.text((210, 28), "AMLODIPINE 5 mg", font=font(30, "Black"), fill=WHITE, anchor="mm")
    d.text((210, 125), name, font=font(52, "Black"), fill=INK, anchor="mm")
    d.text((210, 195), exp, font=font(34, "Bold"), fill=(71, 85, 105), anchor="mm")
    return im


@lru_cache(maxsize=None)
def print_label():
    im = rounded_card(460, 200, WHITE, 10, INK, 3)
    d = ImageDraw.Draw(im)
    d.text((24, 20), "NIMAL PERERA", font=font(34, "Black"), fill=INK)
    d.text((24, 76), "Amlodipine 5 mg  ×30", font=font(28, "Bold"), fill=(71, 85, 105))
    d.text((24, 126), "1 tablet once a day", font=font(30, "Black"), fill=GREEN)
    return im


# 8 -----------------------------------------------------------------------------------------------

class Billing(Scene):
    min_dur = 12.0

    def cues(self):
        return ([(1.0 + 0.6 * k, "thud", 0.7) for k in range(3)] +
                [(3.0, "kaching", 1.0), (4.2, "thud", 1.0), (6.0, "whoosh", 0.6), (6.5, "ticks", 0.6),
                 (8.1, "ding", 0.8), (self.t_calc, "rise", 0.7)])

    @property
    def t_calc(self):
        return self.dur - 2.6

    def hits(self):
        return [(3.0, 10), (4.2, 22)]

    def draw(self, t):
        img = studio(t, (40, 30, 20))
        title(img, "THE BILL BUILDS ITSELF", t)
        k = ease_out(prog(t, 0.2, 0.6))
        base = rounded_card(760, 600)
        card(img, base, (-430, 60, 0), 1.0, ry=10, opacity=k)
        lines = [("Consultation", "1,500"), ("Amlodipine ×30", "900"), ("Lab · lipid profile", "2,200")]
        for i, (item, amt) in enumerate(lines):
            u = ease_in(prog(t, 0.6 + 0.6 * i, 0.4))
            if u > 0:
                card(img, bill_row(item, amt), (-430, lerp(-900, -130 + i * 110, u), 0), 1.0, ry=10)
        if t > 3.0:
            card(img, bill_row("TOTAL", "Rs. 4,600", True), (-430, 230, 0), 1.0 + 0.1 * math.exp(-(t - 3) * 8), ry=10)
        if t > 4.2:
            s = lerp(3.0, 1.0, ease_out(prog(t, 4.2, 0.25)))
            paste_center(img, pill("PAID", GREEN, WHITE, 90), CX - 430, CY + 350, s, -10, clamp((t - 4.2) * 6))
        kc = ease_out(prog(t, 6.0, 0.6))
        if kc > 0:
            counted = int(lerp(80000, 86400, prog(t, 6.5, 1.5)))
            ui = ui_card("End-of-day cash count", ("Expected:  Rs. 86,400", f"Counted:   Rs. {counted:,}"), 760, 300)
            card(img, ui, (430, -20, 0), 1.0, ry=lerp(-90, -10, kc), opacity=kc)
            if t > 8.1:
                paste_center(img, pill("IT MATCHES!", GREEN, WHITE, 48), CX + 430, CY + 220, pop(t, 8.1))
                confetti(img, t - 8.1, (430, 100, 0), 120, seed=8)
        if t > self.t_calc:
            u = prog(t, self.t_calc, 2.4)
            paste_center(img, emoji("🧮", 120), CX + lerp(0, 700, u), CY + lerp(380, -700, ease_in(u)), 1, u * 360)
            paste_center(img, bubble("Retiring! Bye!", 36), CX + lerp(0, 700, u) + 120, CY + lerp(280, -800, ease_in(u)), 1)
        return img


@lru_cache(maxsize=None)
def bill_row(item, amt, total=False):
    im = rounded_card(680, 90, (225, 236, 255) if total else (248, 250, 252), 16)
    d = ImageDraw.Draw(im)
    d.text((28, 45), item, font=font(36, "Black" if total else "Bold"), fill=INK, anchor="lm")
    d.text((652, 45), amt, font=font(36, "Black"), fill=BLUE if total else INK, anchor="rm")
    return im


# 9 -----------------------------------------------------------------------------------------------

class Security(Scene):
    min_dur = 12.0

    def cues(self):
        return [(0.4, "whoosh", 0.6), (2.0, "bonk", 0.8), (2.8, "ding", 0.7), (5.4, "lock", 1.0),
                (7.4, "typing", 0.6), (self.t_night, "pop", 0.8), (self.t_night + 0.3, "ding", 0.5)]

    @property
    def t_night(self):
        return self.dur - 3.0

    def hits(self):
        return [(5.4, 18)]

    def draw(self, t):
        img = synthwave(t * 0.5, line=(90, 80, 220), glow=PINK)
        d = ImageDraw.Draw(img)
        title(img, "YOUR RECORDS STAY HOME", t)
        # rotating wireframe icosahedron, glowing in the background
        phi = (1 + 5 ** 0.5) / 2
        v = np.array([[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi],
                      [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]]) * 170
        from engine import rot
        wv = v @ rot(t * 20, t * 35, 0).T + np.array([0, -120, 1600])
        pts = [project(p)[:2] for p in wv]
        for a in range(12):
            for b in range(a + 1, 12):
                if abs(np.linalg.norm(v[a] - v[b]) - 340) < 5:
                    d.line((pts[a], pts[b]), fill=(40, 120, 130), width=2)
        for i, (ic, label, x) in enumerate([("🖥️", "Front desk", -560), ("💻", "Doctor's room", 560)]):
            k = ease_out(prog(t, 0.4 + i * 0.2, 0.6))
            card(img, device_card(ic, label), (x, 120, 0), k)
        if t > 1.2:
            pulse = 0.5 + 0.5 * math.sin(t * 8)
            d.line((CX - 380, CY + 120, CX + 380, CY + 120), fill=(int(32 + 200 * pulse), 220, 200), width=8)
        if t > 2.0:
            paste_center(img, emoji("☁️", 120), CX, CY - 180, pop(t, 2.0))
            cross(img, CX, CY - 180, 130, pop(t, 2.0))
            if t > 2.8:
                paste_center(img, pill("STILL WORKING!", GREEN, WHITE, 40), CX, CY - 40, pop(t, 2.8))
        if t > 5.4:
            s = lerp(2.5, 1.0, ease_out(prog(t, 5.4, 0.25)))
            paste_center(img, emoji("🔒", 140), CX, CY + 120, s)
        if t > 7.2:
            log = ("09:12  Dr. Silva  edited diagnosis", "09:30  Front desk  took payment", "09:41  Pharmacy  dispensed Rx")
            card(img, ui_card("Change log", log, 900, 330), (0, 360, 0), 0.75 * ease_out(prog(t, 7.2, 0.5)))
        if t > self.t_night:
            paste_center(img, emoji("🌙", 110), CX + 760, CY - 330, pop(t, self.t_night))
            paste_center(img, pill("NIGHTLY BACKUP", BLUE, WHITE, 36), CX + 640, CY - 200, pop(t, self.t_night + 0.3))
        return img


@lru_cache(maxsize=None)
def device_card(ic, label):
    im = rounded_card(360, 260, (30, 36, 70), 26, TEAL, 3)
    im.alpha_composite(emoji(ic, 120), (120, 30))
    ImageDraw.Draw(im).text((180, 205), label, font=font(34, "Black"), fill=WHITE, anchor="mm")
    return im


# 10 ----------------------------------------------------------------------------------------------

class Outro(Scene):
    min_dur = 8.5
    T_DROP, T_ZAP, T_BOOM = 0.3, 1.5, 1.85

    def cues(self):
        return [(self.T_DROP, "fall", 0.6), (self.T_DROP + 0.5, "thud", 1.0), (self.T_ZAP, "zap", 0.9),
                (self.T_BOOM, "impact", 1.0), (2.4, "whoosh", 0.6), (self.t_piles, "boing", 0.8),
                (self.dur - 1.9, "airhorn", 0.45)]

    @property
    def t_piles(self):
        return min(self.dur - 2.4, self.voice * 0.75 + 0.5)

    def hits(self):
        return [(self.T_DROP + 0.5, 16), (self.T_BOOM, 30)]

    def flashes(self):
        return [(self.T_BOOM, 0.9)]

    def draw(self, t):
        img = synthwave(t)
        if t < self.T_BOOM:
            fall = ease_in(prog(t, self.T_DROP, 0.5))
            for i in range(8):
                card(img, paper(40 + i), (math.sin(i * 7) * 30, lerp(-1500, 200, fall) - i * 30, 300), 1.0, rx=62,
                     rz=math.sin(i * 3) * 12)
            if t > self.T_ZAP:
                d = ImageDraw.Draw(img)
                for wdt, col in ((40, (255, 64, 160)), (14, WHITE)):
                    d.line((W, 0, CX, CY + 140), fill=col, width=wdt)
        confetti(img, t - self.T_BOOM, (0, 150, 300), 260, seed=10, power=1.3)
        k = ease_out(prog(t, 2.3, 0.8))
        if k > 0:
            card(img, extruded_text("E-POCH", 230, WHITE, BLUE, 26), (0, -150 + math.sin(t * 2) * 10, lerp(3000, 0, k)),
                 1.0, ry=lerp(-540, 0, k) + math.sin(t * 1.4) * 6, opacity=clamp(k * 3))
        if t > 3.0:
            paste_center(img, text_sprite("ONE VISIT. ONE RECORD.", 72, YELLOW, "Black", 6, INK), CX, CY + 110, pop(t, 3.0))
        if t > self.t_piles:
            paste_center(img, pill("(and absolutely no piles)", PINK, WHITE, 44), CX, CY + 250, pop(t, self.t_piles), -4)
        return img


SCENES = [Pile, Logo, Reception, Queue, Consult, Prescription, Pharmacy, Billing, Security, Outro]
