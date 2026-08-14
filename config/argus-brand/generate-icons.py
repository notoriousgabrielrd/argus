#!/usr/bin/env python3
"""Generate every Argus icon asset from argus-logo-source.png.

The source is a **finished tile**: a black squircle carrying the gold laurel mark, with
transparent corners and its own soft shadow. Earlier revisions took a white-on-white glyph
and built the tile here (squircle mask, gradient fill, synthetic shadow); that pipeline is
gone, because recolouring a finished tile would throw away the gold it exists for.

So the tile ships as authored, and the only thing still derived is the **silhouette** — the
menu-bar template and the in-app mark are monochrome by contract, and the mark separates
from the tile by *saturation*: the laurel is chromatic and the ground is not.

Re-applicable: run after any upstream merge that clobbers resources/, or after swapping the
source art. Requires Pillow; the .icns step shells out to iconutil (macOS only — skip with
--no-icns elsewhere).

  python3 config/argus-brand/generate-icons.py [--no-icns]
"""

from __future__ import annotations

import base64
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BRAND_DIR = Path(__file__).resolve().parent
REPO = BRAND_DIR.parent.parent
SOURCE = BRAND_DIR / "argus-logo-source.png"

# Proportions measured off the upstream icon so the two read as one family.
TILE = 1024
MARGIN = 0.10  # empty ring around the tile, as a fraction of the canvas
# Why saturation and not luminance: the squircle carries a specular rim along its top edge at
# roughly the same brightness as the laurel's darkest shading, so any luminance cut either
# swallows that rim or eats the leaves. The rim is neutral (S~8) and the gold is not (S~150),
# which separates them completely — and keeps more of the mark than a luminance cut did.
MARK_SATURATION = 64  # of 255
MARK_VALUE = 90  # of 255; drops the near-black ground without touching the darkest gold
SMOOTH = 1.5  # px of blur before the final threshold, to round the contours


def source_tile() -> Image.Image:
    """The authored icon, trimmed to its own bounds so the margin below is exact."""
    art = Image.open(SOURCE).convert("RGBA")
    return art.crop(art.getbbox())


def mark_alpha() -> Image.Image:
    """Alpha mask of the laurel mark, cut out of the finished tile by saturation."""
    art = source_tile()
    _, saturation, value = art.convert("RGB").convert("HSV").split()
    chromatic = ImageChops.multiply(
        saturation.point(lambda v: 255 if v >= MARK_SATURATION else 0),
        value.point(lambda v: 255 if v >= MARK_VALUE else 0),
    )
    # Why the alpha term: the tile's anti-aliased edge blends toward the transparent corners,
    # and those partial pixels can read as chromatic.
    mask = ImageChops.multiply(chromatic, art.split()[3].point(lambda v: 255 if v >= 128 else 0))
    mask = mask.filter(ImageFilter.GaussianBlur(SMOOTH)).point(lambda v: 255 if v >= 128 else 0)
    return mask.crop(mask.getbbox())


def fit(image: Image.Image, target: int) -> Image.Image:
    scale = target / max(image.size)
    return image.resize(
        (max(round(image.width * scale), 1), max(round(image.height * scale), 1)), Image.LANCZOS
    )


def compose(badge: str | None = None) -> Image.Image:
    """The shipped canvas: the authored tile, inset so macOS has its breathing room."""
    canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    side = round(TILE * (1 - 2 * MARGIN))
    tile = fit(source_tile(), side)
    canvas.alpha_composite(tile, ((TILE - tile.width) // 2, (TILE - tile.height) // 2))
    if badge:
        draw_badge(canvas, badge, (TILE - side) // 2, side)
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
    """macOS Template image: black mark, shape carried entirely by alpha."""
    small = fit(alpha, round(size * 0.92))
    fitted = Image.new("L", (size, size), 0)
    fitted.paste(small, ((size - small.width) // 2, (size - small.height) // 2))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (size, size), (0, 0, 0, 255)), mask=fitted)
    return out


def write_logo_svg(alpha: Image.Image, dests: list[Path]) -> None:
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
    svg = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        "<!-- Argus mark. Generated by config/argus-brand/generate-icons.py; do not hand-edit. -->\n"
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{mark.width}" height="{mark.height}" viewBox="0 0 {mark.width} {mark.height}">\n'
        f'  <image width="{mark.width}" height="{mark.height}" xlink:href="data:image/png;base64,{href}"/>\n'
        "</svg>\n"
    )
    for dest in dests:
        dest.write_text(svg)


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
    dev = compose(badge="D")

    build = REPO / "resources" / "build"
    shipped.save(build / "icon.png")
    # Why the crop: macOS wants the tile inset with a margin, Windows wants it to fill its
    # canvas — the repo asserts a >=0.92 fill fraction on the committed .ico.
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

    alpha = mark_alpha()
    # Why both: the second is the Icon Composer project's asset, so a run of
    # resources/icon-source/generate.sh cannot resurrect the previous mark.
    write_logo_svg(
        alpha,
        [res / "logo.svg", res / "icon-source" / "icon.icon" / "Assets" / "logo.svg"],
    )
    tray = res / "tray"
    template_tray(alpha, 22).save(tray / "orca-menu-barTemplate.png")
    template_tray(alpha, 44).save(tray / "orca-menu-barTemplate@2x.png")

    print("argus icons written to resources/")


if __name__ == "__main__":
    main()
