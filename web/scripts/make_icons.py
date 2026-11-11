#!/usr/bin/env python3
# Copyright (C) 2026 Keenin Krehbiel
# THIS FILE WAS WRITTEN ENTIRELY BY ARTIFICIAL INTELLIGENCE (Grok, xAI).
# SPDX-License-Identifier: GPL-2.0-only

"""Draw the Solar Time PWA icons. Run from anywhere; writes web/public/icons."""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
BG = (18, 18, 18, 255)
NIGHT = (42, 42, 42, 255)
HORIZON = (85, 85, 85, 255)
DAY = (255, 179, 0, 255)
SUN = (255, 213, 79, 255)
GLOW = (255, 179, 0, 70)


def draw_icon(size: int, pad_ratio: float) -> Image.Image:
    image = Image.new("RGBA", (size, size), BG)
    pen = ImageDraw.Draw(image)
    inset = int(round(size * pad_ratio))
    box = [inset, inset, size - inset - 1, size - inset - 1]
    stroke = max(2, round(size / 28))
    cx = size / 2
    cy = size / 2
    radius = (box[2] - box[0]) / 2
    pen.ellipse(box, outline=NIGHT, width=stroke)
    pen.line((cx - radius, cy, cx + radius, cy), fill=HORIZON, width=max(1, round(size / 90)))
    # Pillow arcs start at 3 o'clock and increase clockwise.
    # Sunrise-ish (left) through noon (top) to sunset-ish (right): 200° → 340°.
    pen.arc(box, start=200, end=340, fill=DAY, width=stroke)
    sun_radius = size * 0.065
    angle = math.radians(270)
    # 270° clockwise from 3 o'clock is 12 o'clock.
    sx = cx + radius * math.cos(angle)
    sy = cy + radius * math.sin(angle)
    glow = sun_radius * 2.1
    pen.ellipse((sx - glow, sy - glow, sx + glow, sy + glow), fill=GLOW)
    pen.ellipse(
        (sx - sun_radius, sy - sun_radius, sx + sun_radius, sy + sun_radius),
        fill=SUN,
    )
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, 0.1).save(OUT / "icon-192.png")
    draw_icon(512, 0.1).save(OUT / "icon-512.png")
    draw_icon(512, 0.18).save(OUT / "icon-maskable-512.png")
    draw_icon(180, 0.1).save(OUT / "apple-touch-icon.png")
    draw_icon(32, 0.08).save(OUT / "favicon-32.png")


if __name__ == "__main__":
    main()
