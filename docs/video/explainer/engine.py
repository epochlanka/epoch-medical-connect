"""A tiny software 3D/2D motion-graphics engine on Pillow + numpy.

Everything is a pure function of time, so frames can be rendered in any order, in parallel.
"""
import math
import random
from functools import lru_cache

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
CX, CY = W / 2, H / 2
FOCAL = 1400.0

NAVY = (7, 11, 31)
INK = (15, 23, 42)
BLUE = (37, 99, 235)
TEAL = (32, 178, 170)
GREEN = (12, 143, 110)
PINK = (255, 64, 160)
YELLOW = (255, 214, 10)
WHITE = (255, 255, 255)
PAPER = (245, 239, 227)
RED = (230, 57, 70)
AMBER = (245, 158, 11)

FONT_DIR = "/usr/share/fonts/truetype/noto/"


# ---- timing -------------------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, t0, dur):
    return clamp((t - t0) / dur) if dur > 0 else float(t >= t0)


def lerp(a, b, k):
    return a + (b - a) * k


def ease_out(k):
    return 1 - (1 - k) ** 3


def ease_in(k):
    return k ** 3


def ease_in_out(k):
    return 4 * k ** 3 if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2


def ease_back(k, s=1.9):
    k -= 1
    return k * k * ((s + 1) * k + s) + 1


def ease_elastic(k):
    if k in (0, 1):
        return k
    return 2 ** (-10 * k) * math.sin((k * 10 - 0.75) * (2 * math.pi) / 3) + 1


def pop(t, t0, dur=0.45):
    """0 -> 1 with an overshoot; the go-to entrance."""
    return ease_back(prog(t, t0, dur))


# ---- fonts and sprites --------------------------------------------------------------------------

@lru_cache(maxsize=None)
def font(size, weight="Black"):
    name = {"Black": "NotoSans-Black.ttf", "XBold": "NotoSans-ExtraBold.ttf", "Bold": "NotoSans-Bold.ttf",
            "Regular": "NotoSans-Regular.ttf", "Mono": "NotoSansMono-Bold.ttf"}[weight]
    return ImageFont.truetype(FONT_DIR + name, size)


@lru_cache(maxsize=None)
def emoji(ch, size):
    f = ImageFont.truetype(FONT_DIR + "NotoColorEmoji.ttf", 109)
    im = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 0), ch, font=f, embedded_color=True)
    im = im.crop(im.getbbox())
    return im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)


def text_size(s, f):
    l, t, r, b = f.getbbox(s)
    return r - l, b - t


@lru_cache(maxsize=256)
def text_sprite(s, size, color=WHITE, weight="Black", stroke=0, stroke_color=INK):
    f = font(size, weight)
    l, t, r, b = f.getbbox(s, stroke_width=stroke)
    im = Image.new("RGBA", (r - l + 8, b - t + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - l, 4 - t), s, font=f, fill=color, stroke_width=stroke, stroke_fill=stroke_color)
    return im


@lru_cache(maxsize=64)
def extruded_text(s, size, face=WHITE, side=BLUE, depth=18, dx=0.55, dy=0.9, outline=INK):
    """Text with a solid 3D extrusion behind it (a sprite to fly around with card())."""
    f = font(size, "Black")
    l, t, r, b = f.getbbox(s, stroke_width=4)
    pad = depth * 2 + 12
    im = Image.new("RGBA", (r - l + pad, b - t + pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = 6 - l, 6 - t
    for k in range(depth, 0, -1):
        shade = tuple(int(c * (0.55 + 0.45 * (1 - k / depth))) for c in side)
        d.text((ox + k * dx, oy + k * dy), s, font=f, fill=shade, stroke_width=4, stroke_fill=shade)
    d.text((ox, oy), s, font=f, fill=face, stroke_width=4, stroke_fill=outline)
    return im


def rounded_card(w, h, fill=WHITE, radius=28, border=None, border_w=0):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=fill, outline=border, width=border_w)
    return im


@lru_cache(maxsize=128)
def ui_card(title, lines, w=760, h=460, accent=BLUE, highlight=-1):
    """An app-window card: title bar, three dots, rows of text. lines = tuple of str."""
    im = rounded_card(w, h)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, 70), 28, fill=(238, 242, 248))
    d.rectangle((0, 40, w - 1, 70), fill=(238, 242, 248))
    for k, c in enumerate([(248, 113, 113), (251, 191, 36), (52, 211, 153)]):
        d.ellipse((24 + k * 30, 26, 42 + k * 30, 44), fill=c)
    d.text((130, 16), title, font=font(30, "XBold"), fill=accent)
    y = 100
    for k, line in enumerate(lines):
        if k == highlight:
            d.rounded_rectangle((20, y - 10, w - 20, y + 54), 14, fill=(225, 236, 255))
        d.text((40, y), line, font=font(34, "Bold" if k == highlight else "Regular"), fill=INK)
        y += 74
    return im


# ---- 3D -----------------------------------------------------------------------------------------

def rot(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix from degrees (applied z, then y, then x)."""
    a, b, c = (math.radians(v) for v in (rx, ry, rz))
    mx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    my = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    mz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return mx @ my @ mz


def project(p, cam=(0.0, 0.0, 0.0)):
    """World point (x right, y down, z into the screen) -> screen px. Camera sits at z = -FOCAL."""
    x, y, z = p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]
    s = FOCAL / max(FOCAL + z, 1.0)
    return CX + x * s, CY + y * s, s


def _perspective_coeffs(dst, src):
    """Coefficients mapping output (dst) points back onto the source image, for Image.transform."""
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = [c for pt in src for c in pt]
    return np.linalg.solve(np.array(a, float), np.array(b, float))


def warp_onto(canvas, sprite, quad, opacity=1.0):
    """Paste sprite onto canvas so its corners land on quad [(tl), (tr), (br), (bl)] in screen px."""
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    x0, y0 = int(math.floor(min(xs))), int(math.floor(min(ys)))
    x1, y1 = int(math.ceil(max(xs))), int(math.ceil(max(ys)))
    if x1 < 0 or y1 < 0 or x0 > W or y0 > H or x1 - x0 < 2 or y1 - y0 < 2 or (x1 - x0) * (y1 - y0) > 9e6:
        return
    sw, sh = sprite.size
    dst = [(p[0] - x0, p[1] - y0) for p in quad]
    try:
        coeffs = _perspective_coeffs(dst, [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    except np.linalg.LinAlgError:
        return
    out = sprite.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
    if opacity < 1:
        out.putalpha(out.getchannel("A").point(lambda v: int(v * opacity)))
    canvas.alpha_composite(out, (x0, y0)) if canvas.mode == "RGBA" else canvas.paste(out, (x0, y0), out)


def card(canvas, sprite, pos, scale=1.0, rx=0.0, ry=0.0, rz=0.0, opacity=1.0, cam=(0, 0, 0), backface=True):
    """Draw a flat sprite as a 3D card centred at pos (world), rotated in degrees."""
    if opacity <= 0.01 or scale <= 0.001:
        return
    w, h = sprite.size[0] * scale / 2, sprite.size[1] * scale / 2
    m = rot(rx, ry, rz)
    corners = np.array([[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]]) @ m.T + np.array(pos)
    if not backface and (m @ np.array([0, 0, -1]))[2] > 0.05:
        return
    if np.any(corners[:, 2] - cam[2] < -FOCAL + 60):
        return
    quad = [project(c, cam)[:2] for c in corners]
    warp_onto(canvas, sprite, quad, opacity)


def box(draw, pos, size, rx, ry, rz, color, cam=(0, 0, 0), outline=None):
    """A shaded solid box; returns the projected front-face quad (for labels) or None if hidden."""
    sx, sy, sz = (s / 2 for s in size)
    v = np.array([[x, y, z] for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)])
    m = rot(rx, ry, rz)
    wv = v @ m.T + np.array(pos)
    faces = {"front": (0, 2, 6, 4), "back": (5, 7, 3, 1), "left": (1, 3, 2, 0),
             "right": (4, 6, 7, 5), "top": (1, 0, 4, 5), "bottom": (2, 3, 7, 6)}
    light = np.array([-0.4, -0.8, -0.5])
    light /= np.linalg.norm(light)
    drawn, front = [], None
    for name, idx in faces.items():
        pts = wv[list(idx)]
        n = np.cross(pts[1] - pts[0], pts[3] - pts[0])
        n /= np.linalg.norm(n) + 1e-9
        to_cam = np.array([cam[0], cam[1], cam[2] - FOCAL]) - pts.mean(axis=0)
        if np.dot(n, to_cam) <= 0:
            continue
        k = 0.45 + 0.55 * max(0.0, float(np.dot(n, -light)))
        drawn.append((pts[:, 2].mean(), [project(p, cam)[:2] for p in pts], tuple(int(c * k) for c in color), name))
    for _, quad, col, name in sorted(drawn, key=lambda d: -d[0]):
        draw.polygon(quad, fill=col, outline=outline)
        if name == "front":
            front = [quad[0], quad[3], quad[2], quad[1]]  # as top-left, top-right, bottom-right, bottom-left
    return front


# ---- worlds -------------------------------------------------------------------------------------

def _vgrad(top, bottom, h=H):
    a = np.linspace(0, 1, h)[:, None]
    g = (np.array(top)[None, :] * (1 - a) + np.array(bottom)[None, :] * a).astype(np.uint8)
    return np.repeat(g[:, None, :], W, axis=1)


_SKY = None


def synthwave(t, speed=1.0, horizon=0.6, line=TEAL, glow=PINK):
    """Neon perspective grid floor under a starry sky. Returns an RGB image."""
    global _SKY
    if _SKY is None:
        sky = _vgrad((5, 6, 22), (40, 14, 70))
        rng = np.random.default_rng(7)
        for _ in range(500):
            x, y = rng.integers(0, W), rng.integers(0, int(H * horizon))
            sky[y, x] = (255, 255, 255) if rng.random() < 0.3 else (150, 160, 255)
        _SKY = sky
    img = Image.fromarray(_SKY.copy())
    d = ImageDraw.Draw(img)
    hy = H * horizon
    d.rectangle((0, hy, W, H), fill=(14, 6, 32))
    # striped retro sun sitting on the horizon
    sun = Image.new("L", (560, 300), 0)
    sd = ImageDraw.Draw(sun)
    sd.ellipse((10, 10, 550, 550), fill=255)
    for k in range(7):
        y0 = 150 + k * 22
        sd.rectangle((0, y0, 560, y0 + 4 + k * 2), fill=0)
    sun_col = Image.fromarray(_vgrad((255, 214, 10), (255, 64, 160), 300)[:, :560])
    img.paste(sun_col, (int(CX - 280), int(hy - 300)), sun)
    # floor lines
    for k in range(-24, 25):
        x_far = CX + k * 40
        x_near = CX + k * 420
        d.line((x_far, hy, x_near, H), fill=line, width=2)
    off = (t * speed * 0.9) % 1.0
    for k in range(22):
        z = (k + 1 - off)
        y = hy + (H - hy) * (1.6 / (z + 0.6)) ** 1.0 - (H - hy) * 0.0
        if hy < y < H:
            d.line((0, y, W, y), fill=line, width=2)
    d.line((0, hy, W, hy), fill=glow, width=3)
    return img


def desk(t):
    """Warm, dim desk under a lamp: the paper world."""
    base = _vgrad((46, 30, 22), (18, 12, 10))
    yy, xx = np.mgrid[0:H, 0:W]
    spot = np.clip(1.2 - np.hypot((xx - CX) / 900, (yy - CY + 80) / 600), 0, 1)[..., None]
    out = np.clip(base + spot * np.array([90, 70, 40]), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


_DESK = None


def desk_bg():
    global _DESK
    if _DESK is None:
        _DESK = desk(0)
    return _DESK.copy()


def starwarp(img, t, speed=1.0, n=420, seed=3):
    """Stars streaking past the camera."""
    d = ImageDraw.Draw(img)
    rng = random.Random(seed)
    for _ in range(n):
        x, y = rng.uniform(-3000, 3000), rng.uniform(-1800, 1800)
        z = (rng.uniform(0, 4000) - t * 3000 * speed) % 4000
        a = project((x, y, z))
        b = project((x, y, z + 60 + 400 * speed))
        c = int(clamp(1 - z / 4000) * 255)
        d.line((a[0], a[1], b[0], b[1]), fill=(c, c, min(255, c + 40)), width=max(1, int(3 * a[2])))


CONFETTI = [YELLOW, PINK, TEAL, BLUE, WHITE, (124, 58, 237)]


def confetti(img, t, origin=(0, -200, 0), n=160, seed=1, power=1.0):
    """Exploding 3D confetti; t = seconds since the burst."""
    if t < 0 or t > 4:
        return
    d = ImageDraw.Draw(img)
    rng = random.Random(seed)
    for _ in range(n):
        v = np.array([rng.uniform(-1, 1), rng.uniform(-1.4, -0.2), rng.uniform(-1, 1)]) * 1100 * power
        p = np.array(origin) + v * t + np.array([0, 900, 0]) * t * t
        spin = rng.uniform(4, 14) * t
        x, y, s = project(p)
        if s <= 0:
            continue
        r = 9 * s
        c, sn = math.cos(spin), math.sin(spin)
        col = rng.choice(CONFETTI)
        d.polygon([(x - r * c, y - r * sn * 0.4), (x + r * sn, y - r * c), (x + r * c, y + r * sn * 0.4),
                   (x - r * sn, y + r * c)], fill=col)


def burst(img, text, center, t0, t, color=YELLOW, size=110, spikes=14, rz=-8):
    """A comic-book impact burst ("BONK!") that pops in and fades."""
    k = pop(t, t0, 0.35)
    life = prog(t, t0 + 1.1, 0.4)
    if k <= 0 or life >= 1:
        return
    r_out, r_in = 230 * k, 150 * k
    sp = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(sp)
    pts = []
    for i in range(spikes * 2):
        a = math.pi * i / spikes + math.radians(rz)
        r = r_out if i % 2 == 0 else r_in
        pts.append((260 + r * math.cos(a), 260 + r * math.sin(a)))
    d.polygon(pts, fill=color, outline=INK, width=6)
    label = text_sprite(text, max(10, int(size * k)), INK, "Black").rotate(rz, expand=True, resample=Image.BICUBIC)
    sp.alpha_composite(label, (int(260 - label.width / 2), int(260 - label.height / 2)))
    if life > 0:
        sp.putalpha(sp.getchannel("A").point(lambda v: int(v * (1 - life))))
    img.paste(sp, (int(center[0] - 260), int(center[1] - 260)), sp)


def cross(img, x, y, size, k=1.0, color=RED):
    """A drawn red X (glyph-free, so it always renders)."""
    if k <= 0:
        return
    r = size / 2 * k
    d = ImageDraw.Draw(img)
    for a, b in (((x - r, y - r), (x + r, y + r)), ((x - r, y + r), (x + r, y - r))):
        d.line((a, b), fill=INK, width=int(34 * k))
        d.line((a, b), fill=color, width=int(22 * k))


def paste_center(img, sprite, x, y, scale=1.0, angle=0.0, opacity=1.0):
    if scale <= 0.01 or opacity <= 0.01:
        return
    sp = sprite
    if scale != 1.0:
        sp = sp.resize((max(1, int(sp.width * scale)), max(1, int(sp.height * scale))), Image.BICUBIC)
    if angle:
        sp = sp.rotate(angle, expand=True, resample=Image.BICUBIC)
    if opacity < 1:
        sp = sp.copy()
        sp.putalpha(sp.getchannel("A").point(lambda v: int(v * opacity)))
    img.paste(sp, (int(x - sp.width / 2), int(y - sp.height / 2)), sp)


# ---- captions -----------------------------------------------------------------------------------

def caption(img, text, t, dur):
    """Karaoke subtitles: words appear as spoken; the current word glows yellow."""
    if t < 0 or t > dur + 0.6:
        return
    words = text.split()
    weights = [len(w) + 2 for w in words]
    total = sum(weights)
    # group words into lines of ~46 chars, show the line being spoken
    lines, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if sum(len(words[j]) + 1 for j in cur) > 46 or w.endswith((".", "?", "!")):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    acc, starts = 0, []
    for wgt in weights:
        starts.append(acc / total * dur)
        acc += wgt
    spoken = max([i for i, s in enumerate(starts) if s <= t] or [0])
    line = next(l for l in lines if spoken in l)
    f = font(46, "Black")
    x_total = sum(text_size(words[i] + " ", f)[0] for i in line)
    x = CX - x_total / 2
    y = H - 118
    d = ImageDraw.Draw(img)
    for i in line:
        w = words[i]
        col = YELLOW if i == spoken else WHITE if i < spoken else (150, 160, 185)
        d.text((x, y), w, font=f, fill=col, stroke_width=6, stroke_fill=(0, 0, 0))
        x += text_size(w + " ", f)[0]


# ---- post-processing ----------------------------------------------------------------------------

_VIGNETTE = None


def finish(img, frame, shake=0.0, aberration=0.0, glow=0.45, flash=0.0):
    """Glow, chromatic aberration, camera shake, vignette and grain."""
    global _VIGNETTE
    if glow > 0:
        small = img.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
        bright = small.point(lambda v: int(max(0, v - 175) * 2.0 * glow))
        img = ImageChops.add(img, bright.resize((W, H), Image.BILINEAR))
    a = np.asarray(img).astype(np.int16)
    if aberration > 0.5:
        k = int(aberration)
        a[..., 0] = np.roll(a[..., 0], k, axis=1)
        a[..., 2] = np.roll(a[..., 2], -k, axis=1)
    if shake > 0.5:
        rng = random.Random(frame)
        a = np.roll(a, (int(rng.uniform(-shake, shake)), int(rng.uniform(-shake, shake))), axis=(0, 1))
    if _VIGNETTE is None:
        yy, xx = np.mgrid[0:H, 0:W]
        _VIGNETTE = np.clip(1.25 - 0.55 * np.hypot((xx - CX) / CX, (yy - CY) / CY), 0.35, 1)[..., None]
    a = a * _VIGNETTE
    if flash > 0:
        a = a + (255 - a) * flash
    noise = np.random.default_rng(frame).integers(-6, 7, size=(H, W, 1))
    return Image.fromarray(np.clip(a + noise, 0, 255).astype(np.uint8))
