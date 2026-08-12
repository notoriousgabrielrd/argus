#!/usr/bin/env python3
"""Generate every Argus icon asset from argus-logo-source.png.

Re-applicable: run after any upstream merge that clobbers resources/, or after
swapping the source logo. Requires Pillow; the .icns step shells out to
iconutil (macOS only — skip with --no-icns elsewhere).

  python3 config/argus-brand/generate-icons.py [--no-icns]
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

BRAND_DIR = Path(__file__).resolve().parent
REPO = BRAND_DIR.parent.parent
SOURCE = BRAND_DIR / "argus-logo-source.png"


def square_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def tinted(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Keep the glyph's luminance, remap white -> rgb over the black ground."""
    gray = ImageOps.grayscale(img)
    out = Image.new("RGB", img.size, (0, 0, 0))
    tint = Image.new("RGB", img.size, rgb)
    return Image.composite(tint, out, gray).convert("RGBA")


def template_tray(img: Image.Image, size: int) -> Image.Image:
    """macOS Template image: pure black glyph, alpha taken from luminance."""
    gray = ImageOps.grayscale(img).resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    out.paste(black, mask=gray)
    return out


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
    src = Image.open(SOURCE).convert("RGBA")
    base = square_crop(src).resize((1024, 1024), Image.LANCZOS)

    build = REPO / "resources" / "build"
    base.save(build / "icon.png")
    base.save(
        build / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    if make_icns:
        write_icns(base, build / "icon.icns")

    res = REPO / "resources"
    base.resize((256, 256), Image.LANCZOS).save(res / "icon.png")
    # Dev builds get an amber-tinted icon so packaged and dev instances stay tellable apart.
    tinted(base, (255, 176, 32)).resize((256, 256), Image.LANCZOS).save(res / "icon-dev.png")

    # Alternate dock icons keep upstream filenames so app-icon.ts needs no edit.
    tinted(base, (92, 158, 255)).save(res / "app-icons" / "orca-blue.png")
    base.save(res / "app-icons" / "orca-watercolor.png")

    tray = res / "tray"
    template_tray(base, 22).save(tray / "orca-menu-barTemplate.png")
    template_tray(base, 44).save(tray / "orca-menu-barTemplate@2x.png")

    print("argus icons written to resources/")


if __name__ == "__main__":
    main()
