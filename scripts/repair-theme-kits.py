#!/usr/bin/env python3
"""Normalize theme-kits.json and optionally merge recoverable backup themes."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path, PurePosixPath


def normalize_asset_path(value: str) -> str:
    return str(PurePosixPath(value.replace("\\", "/"))).removeprefix("assets/")


def read_themes(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("themes"), list):
        return [item for item in payload["themes"] if isinstance(item, dict) and item.get("id")]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict) and item.get("id")]
    raise ValueError(f"unsupported theme manifest shape: {path}")


def normalize_theme(theme: dict) -> dict:
    result = dict(theme)
    result["backgroundAssetPath"] = normalize_asset_path(result["backgroundAssetPath"])
    result["titleAssetPath"] = normalize_asset_path(result["titleAssetPath"])
    accents = []
    for accent in result.get("accentAssets", []):
        normalized = dict(accent)
        normalized["assetPath"] = normalize_asset_path(normalized["assetPath"])
        accents.append(normalized)
    if accents:
        result["accentAssets"] = accents
    else:
        result.pop("accentAssets", None)
    return result


def atomic_json(path: Path, payload: object) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.stem}-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", type=Path, default=Path("/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker"))
    parser.add_argument("--backup", type=Path, action="append", default=[])
    parser.add_argument("--exclude-theme", action="append", default=[])
    parser.add_argument("--drop-accent-role", action="append", default=[])
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    root = args.library_root.resolve()
    manifest_path = root / "theme-kits.json"
    if root == Path("/") or not manifest_path.is_file():
        raise SystemExit(f"refusing unexpected library root: {root}")

    themes_by_id: dict[str, dict] = {}
    for backup in args.backup:
        for theme in read_themes(backup.resolve()):
            themes_by_id[theme["id"]] = normalize_theme(theme)
    for theme in read_themes(manifest_path):
        themes_by_id[theme["id"]] = normalize_theme(theme)
    for theme_id in args.exclude_theme:
        themes_by_id.pop(theme_id, None)
    for theme in themes_by_id.values():
        accents = [
            accent for accent in theme.get("accentAssets", [])
            if accent.get("role") not in args.drop_accent_role
        ]
        if accents:
            theme["accentAssets"] = accents
        else:
            theme.pop("accentAssets", None)

    payload = {
        "version": 1,
        "updatedAt": datetime.now().astimezone().isoformat(),
        "themes": list(themes_by_id.values()),
    }
    print(f"themes recovered: {len(payload['themes'])}")
    for theme in payload["themes"]:
        print(f"- {theme['id']}: {theme['name']}")
    if not args.apply:
        print("dry run only; pass --apply to repair the manifest")
        return

    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    recovery_dir = root / ".trash" / f"theme-manifest-backup-{stamp}"
    recovery_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(manifest_path, recovery_dir / "theme-kits.before.json")
    atomic_json(manifest_path, payload)
    verified = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(verified, dict) or verified.get("version") != 1 or not isinstance(verified.get("themes"), list):
        shutil.copy2(recovery_dir / "theme-kits.before.json", manifest_path)
        raise SystemExit("verification failed; restored source for inspection")
    print(f"previous manifest preserved: {recovery_dir}")


if __name__ == "__main__":
    main()
