#!/usr/bin/env python3
"""Normalize legacy head-anchor keys and repair the manifest shape."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path


CORE_FIELDS = ("centerX", "centerY", "width", "height", "sourceWidth", "sourceHeight")
METHODS = {"anime-face-cascade-reviewed", "manual-reviewed", "manual"}


def canonical_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    return normalized.removeprefix("assets/")


def normalize_anchor(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    required = ("centerX", "centerY", "width", "height", "confidence")
    if any(not isinstance(value.get(field), (int, float)) for field in required):
        return None
    if value.get("method") not in METHODS:
        return None
    result = {field: value[field] for field in ("centerX", "centerY", "width", "height")}
    for field in ("sourceWidth", "sourceHeight"):
        if isinstance(value.get(field), (int, float)):
            result[field] = value[field]
    result["method"] = value["method"]
    result["confidence"] = value["confidence"]
    return result


def core(anchor: dict) -> tuple:
    return tuple(anchor.get(field) for field in CORE_FIELDS)


def collect_manifest(payload: object) -> tuple[dict[str, dict], int, int]:
    if not isinstance(payload, dict):
        raise ValueError("head-anchors root must be an object")
    collected: dict[str, dict] = {}
    raw_entries = 0
    misplaced = 0

    def merge(entries: dict, source: str) -> None:
        nonlocal raw_entries, misplaced
        for asset_path, value in entries.items():
            if not isinstance(asset_path, str):
                continue
            canonical = canonical_path(asset_path)
            if not canonical.startswith("characters/"):
                continue
            anchor = normalize_anchor(value)
            if not anchor:
                continue
            raw_entries += 1
            if source == "root" or asset_path.startswith("assets/"):
                misplaced += 1
            previous = collected.get(canonical)
            if previous and core(previous) != core(anchor):
                raise ValueError(f"conflicting coordinates for {canonical}")
            collected[canonical] = anchor

    nested = payload.get("anchors", {})
    if isinstance(nested, dict):
        merge(nested, "anchors")
    merge(payload, "root")
    return dict(sorted(collected.items())), raw_entries, misplaced


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", type=Path, default=os.environ.get("THUMBNAIL_LIBRARY_ROOT"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.library_root is None:
        parser.error("--library-root or THUMBNAIL_LIBRARY_ROOT is required")
    target = args.library_root / "head-anchors.json"
    if not target.is_file() or not (args.library_root / "assets" / "characters").is_dir():
        raise SystemExit(f"invalid thumbnail library: {args.library_root}")

    payload = json.loads(target.read_text(encoding="utf-8"))
    anchors, raw_entries, misplaced = collect_manifest(payload)
    repaired = {
        "version": 1,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "anchors": anchors,
    }
    print(f"raw entries: {raw_entries}")
    print(f"canonical anchors: {len(anchors)}")
    print(f"misplaced or prefixed entries: {misplaced}")
    if not args.apply:
        print("dry run only; pass --apply to repair the manifest")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = args.library_root / ".trash" / f"head-anchors-repair-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(target, backup_dir / "head-anchors.before.json")

    fd, temporary_name = tempfile.mkstemp(prefix=".head-anchors-", suffix=".json", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(repaired, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary_name, target)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    verified = json.loads(target.read_text(encoding="utf-8"))
    if (
        not isinstance(verified, dict)
        or verified.get("version") != 1
        or not isinstance(verified.get("anchors"), dict)
        or any(not key.startswith("characters/") for key in verified["anchors"])
    ):
        shutil.copy2(backup_dir / "head-anchors.before.json", target)
        raise SystemExit("verification failed; restored the original manifest")
    print(f"backup: {backup_dir / 'head-anchors.before.json'}")
    print(f"repaired: {target}")


if __name__ == "__main__":
    main()
