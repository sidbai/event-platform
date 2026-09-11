"""
The tab icon, from the lockup.

    python3 scripts/brand/make-icons.py

Source is public/logo-lockup.png: the flat emblem — ring, 卷, ball — with
"KING JUAN SOCCER" set below it. The wordmark is unreadable at 16px, so the
emblem is cut out by finding the first run of inked rows (the emblem) and
stopping at the gap before the text; nothing is retouched. It sits on a white
rounded square whose corners are transparent — a favicon's corners are
whatever the image's corners are — nearly edge to edge, because a 10% margin
once read as a smaller, different logo.

The .ico is rebuilt from the same rendering at every size it holds. The Apple
touch icon is left square: iOS masks it itself, and pre-rounding it puts
white ears in the corners.
"""
import numpy as np
from PIL import Image, ImageDraw

SOURCE = "public/logo-lockup.png"
BG = (255, 255, 255, 255)
RADIUS = 0.22   # of the side; iOS is ~0.225, Material ~0.2
INSET = 0.04    # the ring's stroke should not kiss the tile edge at 16px


def emblem() -> Image.Image:
    """The emblem alone, squared on white, with the wordmark cut away."""
    im = Image.open(SOURCE).convert("RGB")
    a = np.array(im).astype(int)
    ink = a.min(axis=2) < 200
    ys = np.where(ink.any(axis=1))[0]
    # The first run of inked rows is the emblem; the text starts after a gap.
    y1 = ys[0]
    for y in ys[1:]:
        if y != y1 + 1:
            break
        y1 = y
    y0 = ys[0]
    xs = np.where(ink[y0 : y1 + 1].any(axis=0))[0]
    x0, x1 = xs[0], xs[-1]
    side = max(x1 - x0, y1 - y0) + 1
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    out = Image.new("RGBA", (side, side), BG)
    out.paste(im.crop(box), (0, 0))
    return out


def tile(mark: Image.Image, side: int, rounded: bool) -> Image.Image:
    # Draw at 4x and shrink, so the corner is a curve and not a staircase at 16px.
    s = side * 4
    r = int(s * RADIUS) if rounded else 0
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, s - 1, s - 1), radius=r, fill=BG)
    box = int(s * (1 - 2 * INSET))
    m = mark.resize((box, box), Image.LANCZOS)
    off = (s - box) // 2
    img.alpha_composite(m, (off, off))
    return img.resize((side, side), Image.LANCZOS)


mark = emblem()
tile(mark, 512, rounded=True).save("src/app/icon.png", optimize=True)
tile(mark, 180, rounded=False).save("src/app/apple-icon.png", optimize=True)
sizes = [16, 32, 48, 64]
frames = [tile(mark, n, rounded=True) for n in sizes]
frames[-1].save("src/app/favicon.ico", format="ICO", sizes=[(n, n) for n in sizes], append_images=frames[:-1])
print("emblem", mark.size, "→ icon.png 512, apple-icon.png 180, favicon.ico", sizes)
