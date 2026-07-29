import { mkdtemp, rm, stat } from "node:fs/promises";
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
});
