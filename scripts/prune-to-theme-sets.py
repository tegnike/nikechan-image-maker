#!/usr/bin/env python3
"""Remove legacy standalone design assets while keeping complete theme pairs."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path, PurePosixPath


def normalize_asset_path(value: str) -> str:
    normalized = str(PurePosixPath(value.replace("\\", "/")))
    return normalized.removeprefix("assets/")


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
    parser.add_argument("--library-root", type=Path, default=Path("/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = args.library_root.resolve()
    if root == Path("/") or not (root / "theme-kits.json").is_file() or not (root / "index.jsonl").is_file():
        raise SystemExit(f"refusing unexpected library root: {root}")

    manifest_path = root / "theme-kits.json"
    index_path = root / "index.jsonl"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    themes = manifest.get("themes", [])
    keep_assets: set[str] = set()
    for theme in themes:
        theme["backgroundAssetPath"] = normalize_asset_path(theme["backgroundAssetPath"])
        theme["titleAssetPath"] = normalize_asset_path(theme["titleAssetPath"])
        theme.pop("decorationAssetPaths", None)
        keep_assets.update((theme["backgroundAssetPath"], theme["titleAssetPath"]))

    design_images: list[Path] = []
    for kind in ("backgrounds", "texts", "decorations"):
        design_images.extend(
            path for path in (root / "assets" / kind).rglob("*")
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        )
    remove_assets = [
        path for path in design_images
        if path.relative_to(root / "assets").as_posix() not in keep_assets
    ]

    rows: list[tuple[str, dict]] = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append((line, json.loads(line)))
        except json.JSONDecodeError:
            rows.append((line, {}))
    keep_rows: list[str] = []
    removed_rows: list[dict] = []
    kept_prompt_paths: set[str] = set()
    for original, row in rows:
        asset = normalize_asset_path(str(row.get("asset", "")))
        keep = row.get("asset_type") == "character" or asset in keep_assets or not row
        if keep:
            keep_rows.append(original)
            if row.get("prompt"):
                kept_prompt_paths.add(str(PurePosixPath(str(row["prompt"]))))
        else:
            removed_rows.append(row)

    remove_prompts: list[Path] = []
    for row in removed_rows:
        prompt = row.get("prompt")
        if not prompt:
            continue
        relative = str(PurePosixPath(str(prompt)))
        if relative in kept_prompt_paths:
            continue
        candidate = root / relative
        if candidate.is_file():
            remove_prompts.append(candidate)

    print(f"themes kept: {len(themes)}")
    print(f"design assets kept: {len(keep_assets)}")
    print(f"design assets removed: {len(remove_assets)}")
    print(f"index rows kept: {len(keep_rows)}")
    print(f"index rows removed: {len(removed_rows)}")
    print(f"prompt records removed: {len(set(remove_prompts))}")
    if not args.apply:
        print("dry run only; pass --apply to move files")
        return

    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    trash = root / ".trash" / f"legacy-standalone-assets-{stamp}"
    trash.mkdir(parents=True, exist_ok=False)
    shutil.copy2(manifest_path, trash / "theme-kits.before.json")
    shutil.copy2(index_path, trash / "index.before.jsonl")

    for source in [*remove_assets, *set(remove_prompts)]:
        relative = source.relative_to(root)
        target = trash / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(source, target)

    manifest["updatedAt"] = datetime.now().astimezone().isoformat()
    atomic_json(manifest_path, manifest)
    index_temporary = index_path.with_suffix(".jsonl.tmp")
    index_temporary.write_text("\n".join(keep_rows) + "\n", encoding="utf-8")
    os.replace(index_temporary, index_path)
    print(f"recoverable trash: {trash}")


if __name__ == "__main__":
    main()
