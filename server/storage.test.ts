import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../src/lib";

let temporaryRoot = "";
let storage: typeof import("./storage");

beforeAll(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nikechan-thumbnail-storage-"));
  process.env.THUMBNAIL_LIBRARY_ROOT = temporaryRoot;
  vi.resetModules();
  storage = await import("./storage");
  await storage.ensureLibrary();
});

afterAll(async () => {
  delete process.env.THUMBNAIL_LIBRARY_ROOT;
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("thumbnail library storage", () => {
  it("creates all asset and output directories", async () => {
    const health = await storage.libraryHealth();
    expect(health).toEqual({ mounted: true, writable: true });
    for (const type of storage.ASSET_TYPES) {
      expect((await stat(path.join(storage.ASSETS_ROOT, type))).isDirectory()).toBe(true);
    }
    expect(storage.ASSET_TYPES).toEqual(["characters", "backgrounds", "texts", "decorations"]);
  });

  it("saves, lists, and reloads an editable project", async () => {
    const project = createEmptyProject();
    project.name = "朝活テスト";
    const saved = await storage.saveProject(project);
    const listed = await storage.listProjects();
    const loaded = await storage.loadProject(saved.id);
    expect(listed).toContainEqual(expect.objectContaining({ id: saved.id, name: "朝活テスト" }));
    expect(loaded.layers[0]).toMatchObject({ kind: "text", text: "朝活" });
  });

  it("keeps Japanese names readable and strips path separators", () => {
    expect(storage.safeId("朝活サムネイル・シンプル構成")).toBe("朝活サムネイル-シンプル構成");
    expect(storage.safeId("../../escape")).toBe("escape");
    expect(storage.safeFileName("朝活/背景?.png")).toBe("背景-.png");
  });

  it("attaches stored head anchors to character assets", async () => {
    const characterDir = path.join(storage.ASSETS_ROOT, "characters", "2026", "07", "29");
    await mkdir(characterDir, { recursive: true });
    await writeFile(path.join(characterDir, "character.png"), "test");
    await writeFile(storage.HEAD_ANCHORS_PATH, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      anchors: {
        "characters/2026/07/29/character.png": {
          centerX: 0.5,
          centerY: 0.2,
          width: 0.4,
          height: 0.3,
          sourceWidth: 1000,
          sourceHeight: 1600,
          method: "manual-reviewed",
          confidence: 0.95,
        },
      },
    }));

    const assets = await storage.listAssets("characters");
    expect(assets.find((asset) => asset.name === "character")).toMatchObject({
      assetPath: "characters/2026/07/29/character.png",
      headAnchor: { centerX: 0.5, centerY: 0.2 },
    });
  });

  it("loads a background, title, and movable accent as one theme kit", async () => {
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      themes: [{
        id: "theme-test",
        name: "Theme Test",
        category: "朝活",
        concept: "coherent test theme",
        palette: ["#112233", "#ddeeff"],
        shapeLanguage: "large curves",
        titleLayout: "split-character",
        supportCopy: "reading",
        backgroundAssetPath: "backgrounds/2026/07/29/background.png",
        titleAssetPath: "texts/2026/07/29/title.png",
        accentAssets: [{
          assetPath: "decorations/2026/07/29/mug.png",
          role: "prop",
          placement: { x: 850, y: 430, width: 260 },
        }],
        createdAt: new Date().toISOString(),
      }],
    }));

    const themes = await storage.listThemeKits();
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      id: "theme-test",
      titleLayout: "split-character",
      supportCopy: "reading",
      background: { type: "backgrounds", themeId: "theme-test" },
      title: { type: "texts", themeId: "theme-test" },
      accents: [{
        asset: { type: "decorations", themeId: "theme-test" },
        role: "prop",
        placement: { x: 850, y: 430, width: 260 },
      }],
    });
  });

  it("salvages theme records from a malformed root array", async () => {
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify([
      "version",
      "themes",
      {
        id: "recovered-theme",
        name: "Recovered Theme",
        category: "朝活",
        concept: "recoverable theme",
        palette: ["#112233"],
        shapeLanguage: "curves",
        backgroundAssetPath: "backgrounds/background.png",
        titleAssetPath: "texts/title.png",
        createdAt: new Date().toISOString(),
      },
    ]));

    const themes = await storage.listThemeKits();
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({ id: "recovered-theme", accents: [] });
  });
});
