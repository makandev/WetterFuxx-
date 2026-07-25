#!/usr/bin/env python3
"""Generate Wetterfux PWA icons (pure Python, no deps).
Renders a sky-gradient rounded tile with a sun and a cloud, plus SVG."""
import math, struct, zlib, os

MASTER = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def rounded_alpha(x, y, w, h, r):
    """Anti-aliased coverage (0..1) for a rounded rectangle."""
    dx = max(r - x, x - (w - r), 0)
    dy = max(r - y, y - (h - r), 0)
    if dx == 0 and dy == 0:
        return 1.0
    d = math.hypot(dx, dy)
    return max(0.0, min(1.0, r - d + 0.5))


def disc_cov(x, y, cx, cy, rad):
    d = math.hypot(x - cx, y - cy)
    return max(0.0, min(1.0, rad - d + 0.5))


def render(maskable=False):
    S = MASTER
    buf = [[(0, 0, 0, 0)] * S for _ in range(S)]
    pad = 0 if maskable else int(S * 0.06)
    tile = S - 2 * pad
    radius = S * (0.5 if maskable else 0.22)

    sky_top = (0x6d, 0xb3, 0xff)
    sky_bot = (0x1c, 0x4c, 0x8f)
    # sun & cloud geometry (in full-S coords)
    sun_cx, sun_cy, sun_r = S * 0.40, S * 0.40, S * 0.155
    clouds = [
        (S * 0.60, S * 0.66, S * 0.15),
        (S * 0.72, S * 0.63, S * 0.115),
        (S * 0.50, S * 0.66, S * 0.11),
        (S * 0.61, S * 0.72, S * 0.14),
    ]
    for y in range(S):
        row = buf[y]
        for x in range(S):
            lx, ly = x - pad, y - pad
            cov = rounded_alpha(lx + 0.5, ly + 0.5, tile, tile, radius)
            if cov <= 0:
                continue
            t = ly / tile
            r, g, b = mix(sky_top, sky_bot, max(0.0, min(1.0, t)))
            # subtle diagonal light
            light = 1.0 + 0.06 * (1 - (x + y) / (2 * S))
            r, g, b = [min(255, int(v * light)) for v in (r, g, b)]

            # sun (radial gradient + glow)
            sd = math.hypot(x - sun_cx, y - sun_cy)
            if sd < sun_r * 2.2:
                glow = max(0.0, 1 - sd / (sun_r * 2.2)) * 0.45
                r = min(255, int(lerp(r, 255, glow * 0.5)))
                g = min(255, int(lerp(g, 236, glow * 0.5)))
                b = min(255, int(lerp(b, 150, glow * 0.4)))
            sc = disc_cov(x, y, sun_cx, sun_cy, sun_r)
            if sc > 0:
                st = min(1.0, sd / sun_r)
                sun_col = mix((255, 240, 176), (255, 168, 48), st)
                r = int(lerp(r, sun_col[0], sc))
                g = int(lerp(g, sun_col[1], sc))
                b = int(lerp(b, sun_col[2], sc))

            # cloud
            cc = 0.0
            for (ccx, ccy, ccr) in clouds:
                cc = max(cc, disc_cov(x, y, ccx, ccy, ccr))
            # flat cloud base
            if S * 0.50 <= x <= S * 0.80 and S * 0.66 <= y <= S * 0.78:
                cc = max(cc, 1.0)
            if cc > 0:
                shade = 1.0 - 0.10 * ((y - S * 0.55) / (S * 0.25))
                cr = int(255 * max(0.85, shade)); cgc = int(255 * max(0.88, shade)); cb = 255
                r = int(lerp(r, cr, cc)); g = int(lerp(g, cgc, cc)); b = int(lerp(b, cb, cc))

            a = int(round(cov * 255))
            row[x] = (r, g, b, a)
    return buf


def downsample(buf, size):
    S = len(buf)
    factor = S // size
    out = bytearray()
    for oy in range(size):
        for ox in range(size):
            r = g = b = a = 0
            for dy in range(factor):
                for dx in range(factor):
                    pr, pg, pb, pa = buf[oy * factor + dy][ox * factor + dx]
                    # premultiply for correct edge blending
                    r += pr * pa; g += pg * pa; b += pb * pa; a += pa
            n = factor * factor
            aa = min(255, a // n)
            if a > 0:
                out += bytes([min(255, r // a), min(255, g // a), min(255, b // a), aa])
            else:
                out += bytes([0, 0, 0, 0])
    return bytes(out)


def write_png(path, rgba, size):
    def chunk(typ, data):
        c = typ + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


print('Rendering master (any)…')
master = render(maskable=False)
for size in (512, 192):
    write_png(os.path.join(OUT, f'icon-{size}.png'), downsample(master, size), size)
    print(f'  icon-{size}.png')

print('Rendering master (maskable)…')
mm = render(maskable=True)
write_png(os.path.join(OUT, 'icon-maskable.png'), downsample(mm, 512), 512)
print('  icon-maskable.png')

# SVG version (crisp, scalable)
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6db3ff"/><stop offset="1" stop-color="#1c4c8f"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff0b0"/><stop offset="1" stop-color="#ffa830"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="114" fill="url(#sky)"/>
  <circle cx="205" cy="205" r="80" fill="url(#sun)"/>
  <g fill="#ffffff">
    <circle cx="307" cy="338" r="77"/><circle cx="369" cy="322" r="59"/>
    <circle cx="256" cy="338" r="56"/><circle cx="312" cy="368" r="72"/>
    <rect x="256" y="338" width="154" height="62" rx="30"/>
  </g>
</svg>'''
with open(os.path.join(OUT, 'icon.svg'), 'w') as f:
    f.write(svg)
print('  icon.svg')
print('Done.')
