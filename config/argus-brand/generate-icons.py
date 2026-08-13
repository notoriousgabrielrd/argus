#!/usr/bin/env python3
"""Generate every Argus icon asset from argus-logo-source.png.

Follows the visual system of the app this forked: a black squircle with a soft
shadow and a pearl-gradient glyph — never a saturated fill or a glow. The source
art ships with a heavy radial bloom, so the mark is re-extracted here with a
contrast curve that discards the bloom and keeps only the solid shape.

Re-applicable: run after any upstream merge that clobbers resources/, or after
swapping the source logo. Requires Pillow; the .icns step shells out to
iconutil (macOS only — skip with --no-icns elsewhere).

  python3 config/argus-brand/generate-icons.py [--no-icns]
"""

from __future__ import annotations

import base64
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

BRAND_DIR = Path(__file__).resolve().parent
REPO = BRAND_DIR.parent.parent
SOURCE = BRAND_DIR / "argus-logo-source.png"

# Proportions measured off the upstream icon so the two read as one family.
TILE = 1024
MARGIN = 0.10  # empty ring around the squircle, as a fraction of the canvas
CORNER = 0.235  # corner radius, as a fraction of the squircle's side
GLYPH_FILL = 0.74  # glyph's longest side, as a fraction of the squircle's side
# The source art is white-on-white: its shapes are separated by hairline contours, not by
# any dark ground, so a luminance threshold returns one solid blob. Eroding first widens
# those hairlines into real separators, which is what makes the mark recoverable at all.
ERODE = 5  # px; must exceed the hairline width
MARK_FLOOR = 235  # after erosion, anything this bright is mark
DESPECKLE = 7  # median window that clears the ragged interior left by erosion
CLOSE = 5  # fills the pinholes despeckling leaves inside the iris and brow
SMOOTH = 2.5  # px of blur before the final threshold, to round the contours


def glyph_alpha() -> Image.Image:
    """Alpha mask of the mark, recovered from art that has no figure/ground contrast."""
    gray = ImageOps.grayscale(Image.open(SOURCE).convert("RGB"))
    mask = gray.filter(ImageFilter.MinFilter(ERODE)).point(
        lambda v: 255 if v >= MARK_FLOOR else 0
    )
    mask = mask.filter(ImageFilter.MedianFilter(DESPECKLE))
    # Morphological close: grow then shrink, so specks vanish without eating the strokes.
    mask = mask.filter(ImageFilter.MaxFilter(CLOSE)).filter(ImageFilter.MinFilter(CLOSE))
    # Blur-then-threshold rounds the stair-stepping erosion leaves on every curve.
    mask = mask.filter(ImageFilter.GaussianBlur(SMOOTH)).point(lambda v: 255 if v >= 128 else 0)
    return mask.crop(mask.getbbox())


def vertical_gradient(
    size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]
) -> Image.Image:
    w, h = size
    ramp = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        ramp.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return ramp.resize((w, h), Image.BILINEAR)


def squircle_mask(side: int, supersample: int = 4) -> Image.Image:
    """Rounded-square mask, drawn oversized then downscaled so the curve stays smooth."""
    big = side * supersample
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=round(CORNER * big), fill=255
    )
    return mask.resize((side, side), Image.LANCZOS)


def fit(alpha: Image.Image, target: int) -> Image.Image:
    scale = target / max(alpha.size)
    return alpha.resize(
        (max(round(alpha.width * scale), 1), max(round(alpha.height * scale), 1)), Image.LANCZOS
    )


def compose(flat_glyph: bool = False, badge: str | None = None) -> Image.Image:
    canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    side = round(TILE * (1 - 2 * MARGIN))
    origin = (TILE - side) // 2
    mask = squircle_mask(side)

    # The icon lands on unknown backgrounds, so it carries its own shadow.
    shadow = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    shadow.paste(
        Image.new("RGBA", (side, side), (0, 0, 0, 110)),
        (origin, origin + round(side * 0.02)),
        mask,
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(side * 0.035)))

    # Tile: near-black with a top-down lift, which keeps it from reading as a hole.
    tile_top, tile_bottom = ((26, 28, 36), (8, 8, 11)) if flat_glyph else ((38, 38, 38), (4, 4, 4))
    tile = vertical_gradient((side, side), tile_top, tile_bottom).convert("RGBA")
    tile.putalpha(mask)
    canvas.alpha_composite(tile, (origin, origin))

    # Glyph: pearl gradient for the shipped icon, flat white for the dev build.
    alpha = fit(glyph_alpha(), round(side * GLYPH_FILL))
    paint = (
        Image.new("RGB", alpha.size, (255, 255, 255))
        if flat_glyph
        else vertical_gradient(alpha.size, (255, 255, 255), (226, 226, 230))
    )
    glyph = paint.convert("RGBA")
    glyph.putalpha(alpha)
    canvas.alpha_composite(glyph, ((TILE - alpha.width) // 2, (TILE - alpha.height) // 2))

    if badge:
        draw_badge(canvas, badge, origin, side)
    return canvas


def draw_badge(canvas: Image.Image, letter: str, origin: int, side: int) -> None:
    """Corner disc marking a non-shipping build, mirroring upstream's dev badge."""
    d = round(side * 0.30)
    box = (origin + side - d, origin + side - d, origin + side, origin + side)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse(box, fill=(247, 128, 40, 255))
    font = None
    for candidate in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if Path(candidate).exists():
            font = ImageFont.truetype(candidate, round(d * 0.62))
            break
    center = ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)
    draw.text(center, letter, font=font, fill=(255, 255, 255, 255), anchor="mm")
    canvas.alpha_composite(layer)


def template_tray(alpha: Image.Image, size: int) -> Image.Image:
    """macOS Template image: black glyph, shape carried entirely by alpha."""
    small = fit(alpha, round(size * 0.92))
    fitted = Image.new("L", (size, size), 0)
    fitted.paste(small, ((size - small.width) // 2, (size - small.height) // 2))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (size, size), (0, 0, 0, 255)), mask=fitted)
    return out


def write_logo_svg(alpha: Image.Image, dest: Path) -> None:
    """The in-app mark: white on transparent, since every consumer supplies its own tile.

    Embedded as a raster because the source art is a flat render with no paths to trace;
    at the 48px the UI draws it, a 512px bitmap is indistinguishable from a vector.
    """
    mark = fit(alpha, 512)
    white = Image.new("RGBA", mark.size, (255, 255, 255, 255))
    white.putalpha(mark)
    buf = BytesIO()
    white.save(buf, format="PNG", optimize=True)
    href = base64.b64encode(buf.getvalue()).decode()
    dest.write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        "<!-- Argus mark. Generated by config/argus-brand/generate-icons.py; do not hand-edit. -->\n"
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{mark.width}" height="{mark.height}" viewBox="0 0 {mark.width} {mark.height}">\n'
        f'  <image width="{mark.width}" height="{mark.height}" xlink:href="data:image/png;base64,{href}"/>\n'
        "</svg>\n"
    )


def write_icns(base: Image.Image, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for pts in (16, 32, 128, 256, 512):
            base.resize((pts, pts), Image.LANCZOS).save(iconset / f"icon_{pts}x{pts}.png")
            base.resize((pts * 2, pts * 2), Image.LANCZOS).save(
                iconset / f"icon_{pts}x{pts}@2x.png"
            )
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(dest)], check=True)


def main() -> None:
    make_icns = "--no-icns" not in sys.argv
    shipped = compose()
    dev = compose(flat_glyph=True, badge="D")

    build = REPO / "resources" / "build"
    shipped.save(build / "icon.png")
    # Why the crop: macOS wants the squircle inset with a margin, Windows wants the tile to
    # fill its canvas — the repo asserts a >=0.92 fill fraction on the committed .ico.
    side = round(TILE * (1 - 2 * MARGIN))
    origin = (TILE - side) // 2
    shipped.crop((origin, origin, origin + side, origin + side)).save(
        build / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    if make_icns:
        write_icns(shipped, build / "icon.icns")

    res = REPO / "resources"
    shipped.resize((256, 256), Image.LANCZOS).save(res / "icon.png")
    dev.resize((256, 256), Image.LANCZOS).save(res / "icon-dev.png")

    # Alternate dock icons keep upstream filenames so app-icon.ts needs no edit.
    shipped.save(res / "app-icons" / "orca-watercolor.png")
    shipped.save(res / "app-icons" / "orca-blue.png")

    alpha = glyph_alpha()
    write_logo_svg(alpha, res / "logo.svg")
    tray = res / "tray"
    template_tray(alpha, 22).save(tray / "orca-menu-barTemplate.png")
    template_tray(alpha, 44).save(tray / "orca-menu-barTemplate@2x.png")

    print("argus icons written to resources/")


if __name__ == "__main__":
    main()
