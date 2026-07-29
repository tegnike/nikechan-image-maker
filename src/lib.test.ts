import { describe, expect, it } from "vitest";
import { cloneLayer, createEmptyProject, createTitleLayer, moveItem, replaceBackgroundLayer, sanitizeProject, scaleLayerFromCenter } from "./lib";

describe("thumbnail project model", () => {
  it("creates a 1280x720 project with editable title text", () => {
    const project = createEmptyProject();
    expect(project.width).toBe(1280);
    expect(project.height).toBe(720);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0]).toMatchObject({ kind: "text", text: "朝活" });
  });

  it("duplicates a layer without reusing its identity", () => {
    const layer = createTitleLayer();
    const copy = cloneLayer(layer);
    expect(copy.id).not.toBe(layer.id);
    expect(copy.name).toContain("コピー");
    expect(copy.x).toBe(layer.x + 28);
  });

  it("keeps the canvas contract when sanitizing", () => {
    const project = createEmptyProject();
    const sanitized = sanitizeProject({ ...project, width: 1280, height: 720 });
    expect(sanitized).toMatchObject({ version: 1, width: 1280, height: 720 });
    expect(new Date(sanitized.updatedAt).getTime()).not.toBeNaN();
  });

  it("reorders layers without mutating the source", () => {
    const source = ["background", "text", "character"];
    expect(moveItem(source, 0, 2)).toEqual(["text", "character", "background"]);
    expect(source).toEqual(["background", "text", "character"]);
  });

  it("scales a rotated layer around its visual center", () => {
    const layer = { ...createTitleLayer(), x: 120, y: 80, rotation: 18 };
    const center = (item: typeof layer) => {
      const radians = (item.rotation * Math.PI) / 180;
      return {
        x: item.x + Math.cos(radians) * item.width * item.scaleX / 2 - Math.sin(radians) * item.height * item.scaleY / 2,
        y: item.y + Math.sin(radians) * item.width * item.scaleX / 2 + Math.cos(radians) * item.height * item.scaleY / 2,
      };
    };
    const before = center(layer);
    const scaled = scaleLayerFromCenter(layer, 1.2);

    expect(scaled.scaleX).toBeCloseTo(1.2);
    expect(scaled.scaleY).toBeCloseTo(1.2);
    expect(center(scaled).x).toBeCloseTo(before.x);
    expect(center(scaled).y).toBeCloseTo(before.y);
  });

  it("keeps flipped layers flipped and clamps wheel scaling", () => {
    const layer = { ...createTitleLayer(), scaleX: -1, scaleY: 1 };
    const scaled = scaleLayerFromCenter(layer, 100);
    expect(scaled.scaleX).toBe(-8);
    expect(scaled.scaleY).toBe(8);
  });

  it("replaces every existing background while preserving other layers", () => {
    const title = createTitleLayer();
    const oldBackground = {
      ...title,
      id: "old-background",
      kind: "image" as const,
      src: "/old.png",
      assetType: "backgrounds" as const,
    };
    const character = {
      ...oldBackground,
      id: "character",
      src: "/character.png",
      assetType: "characters" as const,
    };
    const nextBackground = { ...oldBackground, id: "new-background", src: "/new.png" };

    const replaced = replaceBackgroundLayer([oldBackground, title, character], nextBackground);
    expect(replaced.map((layer) => layer.id)).toEqual(["new-background", title.id, "character"]);
    expect(replaced.filter((layer) => layer.kind === "image" && layer.assetType === "backgrounds")).toHaveLength(1);
  });
});
