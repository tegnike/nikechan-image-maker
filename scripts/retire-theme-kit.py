#!/usr/bin/env python3
"""Recoverably retire one theme kit and its indexed files."""

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


def atomic_json(path: Path, payload: object) -> None:
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.stem}-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("theme_id")
    parser.add_argument("--library-root", type=Path, default=os.environ.get("THUMBNAIL_LIBRARY_ROOT"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.library_root is None:
        parser.error("--library-root or THUMBNAIL_LIBRARY_ROOT is required")

    root = args.library_root.resolve()
    manifest_path = root / "theme-kits.json"
    index_path = root / "index.jsonl"
    if root == Path("/") or not manifest_path.is_file() or not index_path.is_file():
        raise SystemExit(f"refusing unexpected library root: {root}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    matches = [theme for theme in manifest.get("themes", []) if theme.get("id") == args.theme_id]
    if len(matches) != 1:
        raise SystemExit(f"expected exactly one theme, found {len(matches)}: {args.theme_id}")
    theme = matches[0]
    asset_paths = {
        normalize_asset_path(theme["backgroundAssetPath"]),
        normalize_asset_path(theme["titleAssetPath"]),
        *(
            normalize_asset_path(accent["assetPath"])
            for accent in theme.get("accentAssets", [])
            if accent.get("assetPath")
        ),
    }

    kept_rows: list[str] = []
    retired_rows: list[dict] = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("theme_id") == args.theme_id:
            retired_rows.append(row)
        else:
            kept_rows.append(line)

    files: set[Path] = set()
    for relative in asset_paths:
        candidate = root / "assets" / relative
        if candidate.is_file():
            files.add(candidate)
    for row in retired_rows:
        if row.get("prompt"):
            candidate = root / str(PurePosixPath(row["prompt"]))
            if candidate.is_file():
                files.add(candidate)

    print(f"theme: {theme['name']} ({args.theme_id})")
    print(f"assets referenced: {len(asset_paths)}")
    print(f"index rows retired: {len(retired_rows)}")
    print(f"files moved: {len(files)}")
    if not args.apply:
        print("dry run only; pass --apply to move files")
        return

    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    trash = root / ".trash" / f"retired-theme-{args.theme_id}-{stamp}"
    trash.mkdir(parents=True, exist_ok=False)
    shutil.copy2(manifest_path, trash / "theme-kits.before.json")
    shutil.copy2(index_path, trash / "index.before.jsonl")
    for source in files:
        target = trash / source.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(source, target)

    manifest["themes"] = [item for item in manifest.get("themes", []) if item.get("id") != args.theme_id]
    manifest["updatedAt"] = datetime.now().astimezone().isoformat()
    atomic_json(manifest_path, manifest)
    temporary_index = index_path.with_suffix(".jsonl.tmp")
    temporary_index.write_text("\n".join(kept_rows) + "\n", encoding="utf-8")
    os.replace(temporary_index, index_path)
    print(f"recoverable trash: {trash}")


if __name__ == "__main__":
    main()
