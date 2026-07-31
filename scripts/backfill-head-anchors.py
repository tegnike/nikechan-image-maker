#!/usr/bin/env python3
"""Backfill reviewed head anchors for the original AI Nike-chan character set."""

from __future__ import annotations

import argparse
import json
import os
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path


# Coordinates are normalized against the complete source PNG. The box describes
# the main head mass (face, skull and surrounding hair), excluding hands, neck,
# and the long tail of the ponytail.
ANCHORS = {
    "2026/07/28/20260728-224207-nikechan-point-focus.png": (0.469, 0.251, 0.340, 0.250, "anime-face-cascade-reviewed"),
    "2026/07/28/20260728-231102-nikechan-faceframe-wink.png": (0.474, 0.148, 0.300, 0.175, "anime-face-cascade-reviewed"),
    "2026/07/28/20260728-233301-nikechan-smart-tip.png": (0.451, 0.218, 0.340, 0.210, "anime-face-cascade-reviewed"),
    "2026/07/28/nikechan-wave-01.png": (0.389, 0.267, 0.420, 0.335, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-000325-nikechan-ponytail-thumb.png": (0.467, 0.220, 0.360, 0.245, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-002207-nikechan-listen-ear.png": (0.530, 0.275, 0.420, 0.300, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-005256-nikechan-salute-grin.png": (0.538, 0.198, 0.350, 0.230, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-011204-nikechan-crossed-smirk.png": (0.489, 0.132, 0.270, 0.160, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-014247-nikechan-wait-palms.png": (0.468, 0.304, 0.340, 0.450, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-020053-nikechan-chat-fist.png": (0.483, 0.353, 0.360, 0.540, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-023205-nikechan-gentle-stop.png": (0.444, 0.327, 0.470, 0.450, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-025201-nikechan-search-visor.png": (0.502, 0.205, 0.390, 0.270, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-032303-nikechan-vsign-present.png": (0.490, 0.160, 0.400, 0.250, "manual-reviewed"),
    "2026/07/29/20260729-034318-nikechan-thought-side.png": (0.440, 0.165, 0.420, 0.270, "manual-reviewed"),
    "2026/07/29/20260729-042051-nikechan-maru-ok.png": (0.495, 0.132, 0.290, 0.185, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-044348-nikechan-side-glance.png": (0.419, 0.175, 0.340, 0.220, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-051223-nikechan-countdown-ready.png": (0.490, 0.220, 0.380, 0.275, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-053357-nikechan-shh-wink.png": (0.435, 0.245, 0.400, 0.300, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-060229-nikechan-heart-hands.png": (0.495, 0.145, 0.350, 0.235, "manual-reviewed"),
    "2026/07/29/20260729-062339-nikechan-listen-ear.png": (0.485, 0.320, 0.350, 0.500, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-065323-nikechan-present-down.png": (0.415, 0.215, 0.400, 0.280, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-071223-nikechan-peek-hands.png": (0.500, 0.210, 0.480, 0.340, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-074222-nikechan-morning-stretch.png": (0.475, 0.205, 0.350, 0.240, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-080223-nikechan-aha-finger.png": (0.475, 0.325, 0.360, 0.500, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-083242-nikechan-hair-pinch.png": (0.500, 0.245, 0.370, 0.280, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-084649-nikechan-lookout-step.png": (0.455, 0.165, 0.390, 0.250, "manual-reviewed"),
    "2026/07/29/20260729-094012-nikechan-wink-shrug.png": (0.500, 0.205, 0.420, 0.290, "manual-reviewed"),
    "2026/07/29/20260729-103018-nikechan-listen-ear.png": (0.465, 0.205, 0.390, 0.260, "anime-face-cascade-reviewed"),
    "2026/07/29/20260729-112154-nikechan-wave-jacket.png": (0.506, 0.245, 0.420, 0.400, "anime-face-cascade-reviewed"),
}


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as source:
        header = source.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"not a PNG: {path}")
    return struct.unpack(">II", header[16:24])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", type=Path, default=os.environ.get("THUMBNAIL_LIBRARY_ROOT"))
    args = parser.parse_args()
    if args.library_root is None:
        parser.error("--library-root or THUMBNAIL_LIBRARY_ROOT is required")
    target = args.library_root / "head-anchors.json"
    existing = {"version": 1, "updatedAt": "", "anchors": {}}
    if target.exists():
        existing = json.loads(target.read_text(encoding="utf-8"))

    anchors = dict(existing.get("anchors", {}))
    for relative, (center_x, center_y, width, height, method) in ANCHORS.items():
        asset = args.library_root / "assets" / "characters" / relative
        source_width, source_height = png_size(asset)
        anchors[f"characters/{relative}"] = {
            "centerX": center_x,
            "centerY": center_y,
            "width": width,
            "height": height,
            "sourceWidth": source_width,
            "sourceHeight": source_height,
            "method": method,
            "confidence": 0.95 if method == "manual-reviewed" else 0.90,
        }

    payload = {
        "version": 1,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "anchors": dict(sorted(anchors.items())),
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=".head-anchors-", suffix=".json", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary_name, target)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
    print(f"backfilled {len(ANCHORS)} head anchors: {target}")


if __name__ == "__main__":
    main()
