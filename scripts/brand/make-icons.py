"""
The tab icon, from the logo mark.

    python3 scripts/brand/make-icons.py

The mark (public/logo-mark.png) sits on a white rounded square whose corners
are transparent — a favicon's corners are whatever the image's corners are,
and an opaque square is how the tab got sharp corners in the first place.
The .ico is rebuilt from the same rendering at every size it holds, so the
16px tab and the 512px shortcut agree. The Apple touch icon is left square:
iOS masks it itself, and pre-rounding it puts white ears in the corners.
"""
from PIL import Image, ImageDraw

MARK = "public/logo-mark.png"
BG = (255, 255, 255, 255)
RADIUS = 0.22   # of the side; iOS is ~0.225, Material ~0.2
# No padding. The mark is a ring that touches the tile's edges at the
# midpoints and leaves the corners empty on its own, so the icon that shipped
# for a year drew it edge to edge — and a 10% inset, tried once, read as a
# different, smaller logo. The rounded corners clip nothing of a round mark.
INSET = 0.0


def tile(side: int, rounded: bool) -> Image.Image:
    # Draw at 4x and shrink, so the corner is a curve and not a staircase at 16px.
    s = side * 4
    r = int(s * RADIUS) if rounded else 0
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, s - 1, s - 1), radius=r, fill=BG)
    mark = Image.open(MARK).convert("RGBA")
    box = int(s * (1 - 2 * INSET))
    mark = mark.resize((box, box), Image.LANCZOS)
    off = (s - box) // 2
    img.alpha_composite(mark, (off, off))
    return img.resize((side, side), Image.LANCZOS)


tile(512, rounded=True).save("src/app/icon.png", optimize=True)
tile(180, rounded=False).save("src/app/apple-icon.png", optimize=True)
sizes = [16, 32, 48, 64]
frames = [tile(n, rounded=True) for n in sizes]
frames[-1].save("src/app/favicon.ico", format="ICO", sizes=[(n, n) for n in sizes], append_images=frames[:-1])
print("wrote icon.png 512, apple-icon.png 180, favicon.ico", sizes)
