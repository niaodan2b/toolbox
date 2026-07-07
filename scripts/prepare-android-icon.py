#!/usr/bin/env python3
"""Prepare Android adaptive-icon foreground from app-logo.png.

Tauri's android_fg_scale only applies to legacy ic_launcher.png when both
android_bg and android_fg are set. Adaptive icons use ic_launcher_foreground.png,
which is generated at full bleed. This script pre-scales the logo onto a
transparent canvas so the foreground layer fits Android's safe zone.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src-tauri" / "icon-manifest.json"
DEFAULT_SOURCE = ROOT / "src/assets/app-logo.png"
DEFAULT_OUTPUT = ROOT / "src/assets/app-logo-android-fg.png"
DEFAULT_SIZE = 1024


def load_manifest() -> dict:
    with MANIFEST.open(encoding="utf-8") as f:
        return json.load(f)


def resolve_path(relative: str) -> Path:
    return (MANIFEST.parent / relative).resolve()


def prepare_android_fg(
    source: Path,
    output: Path,
    *,
    size: int = DEFAULT_SIZE,
    scale_percent: float = 70,
) -> None:
    image = Image.open(source).convert("RGBA")
    if image.width != image.height:
        raise SystemExit(f"Source icon must be square, got {image.width}x{image.height}")

    scaled_size = max(1, round(size * scale_percent / 100))
    scaled = image.resize((scaled_size, scaled_size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - scaled_size) // 2, (size - scaled_size) // 2)
    canvas.paste(scaled, offset, scaled)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    print(
        f"Prepared Android foreground: {output.relative_to(ROOT)} "
        f"({scale_percent}% scale on {size}x{size})"
    )


def main() -> int:
    manifest = load_manifest()
    source = resolve_path(manifest.get("default", "../src/assets/app-logo.png"))
    output = resolve_path(
        manifest.get("android_fg", "../src/assets/app-logo-android-fg.png")
    )
    scale_percent = float(manifest.get("android_fg_scale", 70))

    if not source.exists():
        print(f"Source icon not found: {source}", file=sys.stderr)
        return 1

    prepare_android_fg(source, output, scale_percent=scale_percent)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
