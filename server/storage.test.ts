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
    expect(loaded.layers).toEqual([]);
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

  it("recovers assets-prefixed and root-level head anchors", async () => {
    const characterDir = path.join(storage.ASSETS_ROOT, "characters", "2026", "07", "29");
    await mkdir(characterDir, { recursive: true });
    await writeFile(path.join(characterDir, "nested.png"), "test");
    await writeFile(path.join(characterDir, "root.png"), "test");
    const anchor = {
      centerX: 0.46,
      centerY: 0.126,
      width: 0.275,
      height: 0.217,
      sourceWidth: 941,
      sourceHeight: 1672,
      method: "manual-reviewed",
      confidence: 0.88,
    };
    await writeFile(storage.HEAD_ANCHORS_PATH, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      anchors: { "assets/characters/2026/07/29/nested.png": anchor },
      "assets/characters/2026/07/29/root.png": anchor,
    }));

    const assets = await storage.listAssets("characters");
    expect(assets.find((asset) => asset.name === "nested")?.headAnchor).toMatchObject({ centerX: 0.46, centerY: 0.126 });
    expect(assets.find((asset) => asset.name === "root")?.headAnchor).toMatchObject({ centerX: 0.46, centerY: 0.126 });
  });

  it("loads a background, title, generated support copy, and movable accent as one theme kit", async () => {
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
        splitTitleAssetPaths: {
          asa: "texts/2026/07/29/asa.png",
          katsu: "texts/2026/07/29/katsu.png",
        },
        supportAssetPaths: {
          stream: "texts/2026/07/29/stream.png",
          casual: "texts/2026/07/29/casual.png",
          reading: "texts/2026/07/29/reading.png",
          english: "texts/2026/07/29/english.png",
        },
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
      splitTitle: {
        asa: { type: "texts", themeId: "theme-test", assetPath: "texts/2026/07/29/asa.png" },
        katsu: { type: "texts", themeId: "theme-test", assetPath: "texts/2026/07/29/katsu.png" },
      },
      supports: {
        stream: { assetPath: "texts/2026/07/29/stream.png" },
        casual: { assetPath: "texts/2026/07/29/casual.png" },
        reading: { assetPath: "texts/2026/07/29/reading.png" },
        english: { assetPath: "texts/2026/07/29/english.png" },
      },
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
    expect(themes[0]).toMatchObject({ id: "recovered-theme", supports: {}, accents: [] });
  });

  it("keeps a legacy generated support image but never fakes missing split title assets", async () => {
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      themes: [{
        id: "legacy-theme",
        name: "Legacy Theme",
        category: "朝活",
        concept: "legacy support migration",
        palette: ["#112233"],
        shapeLanguage: "curves",
        titleLayout: "split-character",
        supportCopy: "casual",
        backgroundAssetPath: "backgrounds/background.png",
        titleAssetPath: "texts/title.png",
        supportAssetPath: "texts/support.png",
        createdAt: new Date().toISOString(),
      }],
    }));

    const themes = await storage.listThemeKits();
    expect(themes[0]).toMatchObject({
      titleLayout: "side-by-side",
      splitTitle: undefined,
      supports: { casual: { assetPath: "texts/support.png" } },
    });
  });

  it("loads a split theme made from only two independently generated title images", async () => {
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      themes: [{
        id: "two-part-theme",
        name: "Two Part Theme",
        category: "朝活",
        concept: "character between two generated characters",
        palette: ["#112233"],
        shapeLanguage: "bold split forms",
        titleLayout: "split-character",
        supportCopy: "none",
        backgroundAssetPath: "backgrounds/background.png",
        splitTitleAssetPaths: {
          asa: "texts/asa.png",
          katsu: "texts/katsu.png",
        },
        createdAt: new Date().toISOString(),
      }],
    }));

    const themes = await storage.listThemeKits();
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      titleLayout: "split-character",
      title: undefined,
      splitTitle: {
        asa: { assetPath: "texts/asa.png" },
        katsu: { assetPath: "texts/katsu.png" },
      },
      supports: {},
    });
  });

  it("uses split title assets for diagonal layouts and downgrades legacy combined titles", async () => {
    const createdAt = new Date().toISOString();
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify({
      version: 1,
      updatedAt: createdAt,
      themes: [
        {
          id: "diagonal-parts",
          name: "Diagonal Parts",
          category: "朝活",
          concept: "朝 upper-left and 活 lower-right",
          palette: ["#112233"],
          shapeLanguage: "diagonal rhythm",
          titleLayout: "diagonal-impact",
          supportCopy: "none",
          backgroundAssetPath: "backgrounds/diagonal.png",
          splitTitleAssetPaths: { asa: "texts/asa.png", katsu: "texts/katsu.png" },
          createdAt,
        },
        {
          id: "legacy-diagonal",
          name: "Legacy Diagonal",
          category: "朝活",
          concept: "combined title from the old contract",
          palette: ["#445566"],
          shapeLanguage: "legacy",
          titleLayout: "diagonal-impact",
          backgroundAssetPath: "backgrounds/legacy.png",
          titleAssetPath: "texts/asakatsu.png",
          createdAt,
        },
      ],
    }));

    const themes = await storage.listThemeKits();
    expect(themes.find((theme) => theme.id === "diagonal-parts")).toMatchObject({
      titleLayout: "diagonal-impact",
      title: undefined,
      splitTitle: {
        asa: { assetPath: "texts/asa.png" },
        katsu: { assetPath: "texts/katsu.png" },
      },
    });
    expect(themes.find((theme) => theme.id === "legacy-diagonal")).toMatchObject({
      titleLayout: "side-by-side",
      title: { assetPath: "texts/asakatsu.png" },
      splitTitle: undefined,
    });
  });

  it("keeps valid themes visible when one manifest record has an invalid asset path", async () => {
    const createdAt = new Date().toISOString();
    await writeFile(storage.THEME_KITS_PATH, JSON.stringify({
      version: 1,
      updatedAt: createdAt,
      themes: [
        {
          id: "valid-theme",
          name: "Valid Theme",
          category: "朝活",
          concept: "valid",
          palette: ["#ffffff"],
          shapeLanguage: "simple",
          backgroundAssetPath: "backgrounds/valid.png",
          titleAssetPath: "texts/valid.png",
          createdAt,
        },
        {
          id: "invalid-theme",
          name: "Invalid Theme",
          category: "朝活",
          concept: "invalid",
          palette: ["#ffffff"],
          shapeLanguage: "simple",
          backgroundAssetPath: "../escape.png",
          titleAssetPath: "texts/invalid.png",
          createdAt,
        },
      ],
    }));

    const themes = await storage.listThemeKits();
    expect(themes.map((theme) => theme.id)).toEqual(["valid-theme"]);
  });
});
