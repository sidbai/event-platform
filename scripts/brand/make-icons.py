"""
The tab icon, the touch icon and the header mark, from one drawing.

    python3 scripts/brand/make-icons.py

Source is scripts/brand/app-icon.png: the white emblem — ring, 卷, ball — on
a gold rounded square, as the owner had it drawn. Only the white is taken
from it. The tile is drawn here in King Juan Gold (#C58A24), the brand's
primary, so the icon is the same gold as every button on the site rather
than whatever the drawing's export happened to be (it came out #B88428).

The corners are transparent on everything but the Apple touch icon, which
iOS masks itself; pre-rounding that one puts white ears in the corners. The
.ico is rebuilt from the same rendering at every size it holds.
"""
import numpy as np
from PIL import Image, ImageDraw

SOURCE = "scripts/brand/app-icon.png"
GOLD = (0xC5, 0x8A, 0x24, 255)
# Of the side. The drawing's own corner is ~0.237; drawn any tighter than
# that, the white outside its corner would show inside ours.
RADIUS = 0.24


def emblem() -> Image.Image:
    """The white of the drawing as an alpha mask, squared on the tile."""
    im = Image.open(SOURCE).convert("RGB")
    a = np.array(im).astype(int)
    ink = a.min(axis=2) < 240  # gold or emblem; the paper around the tile is not
    ys = np.where(ink.any(axis=1))[0]
    xs = np.where(ink.any(axis=0))[0]
    y0, y1, x0, x1 = ys[0], ys[-1], xs[0], xs[-1]
    side = max(x1 - x0, y1 - y0) + 1
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    tile = np.array(im.crop(box)).astype(float)
    # White is the emblem; the ramp keeps its anti-aliased edge soft.
    white = np.clip((tile.min(axis=2) - 160) / (235 - 160), 0, 1)
    mask = Image.fromarray((white * 255).astype(np.uint8))
    # Nothing outside our own corner counts, whatever the drawing had there —
    # and nothing along its edge either, where the export's anti-aliasing
    # blends the gold into the paper and would read as a pale rim.
    keep = Image.new("L", (side, side), 0)
    rim = side // 100
    ImageDraw.Draw(keep).rounded_rectangle(
        (rim, rim, side - 1 - rim, side - 1 - rim), radius=int(side * RADIUS), fill=255
    )
    return Image.fromarray(np.minimum(np.array(mask), np.array(keep)))


def tile(mark: Image.Image, side: int, rounded: bool) -> Image.Image:
    # Draw at the mark's own size and shrink, so a 16px corner is a curve.
    s = mark.size[0]
    r = int(s * RADIUS) if rounded else 0
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, s - 1, s - 1), radius=r, fill=GOLD)
    white = Image.new("RGBA", (s, s), (255, 255, 255, 255))
    img.paste(white, (0, 0), mark)
    return img.resize((side, side), Image.LANCZOS)


mark = emblem()
tile(mark, 512, rounded=True).save("src/app/icon.png", optimize=True)
tile(mark, 180, rounded=False).save("src/app/apple-icon.png", optimize=True)
tile(mark, 512, rounded=True).save("public/logo-mark.png", optimize=True)
sizes = [16, 32, 48, 64]
frames = [tile(mark, n, rounded=True) for n in sizes]
frames[-1].save("src/app/favicon.ico", format="ICO", sizes=[(n, n) for n in sizes], append_images=frames[:-1])
print("mark", mark.size, "→ icon.png 512, apple-icon.png 180, logo-mark.png 512, favicon.ico", sizes)
