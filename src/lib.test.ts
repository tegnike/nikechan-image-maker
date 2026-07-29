import { describe, expect, it } from "vitest";
import {
  analyzeThumbnail,
  applyFinishPreset,
  applyThumbnailTemplate,
  cloneLayer,
  createEmptyProject,
  createTitleLayer,
  imageAppearanceDefaults,
  moveItem,
  replaceBackgroundLayer,
  remapHeadAnchorToCrop,
  sanitizeProject,
  scaleLayerFromCenter,
} from "./lib";

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

  it("moves generated title images with a completed template", () => {
    const base = createTitleLayer();
    const character = {
      ...base,
      id: "character",
      kind: "image" as const,
      src: "/character.png",
      assetType: "characters" as const,
      width: 700,
      height: 1000,
    };
    const titleImage = {
      ...character,
      id: "generated-title",
      src: "/title.png",
      assetType: "texts" as const,
      width: 900,
      height: 500,
    };
    const arranged = applyThumbnailTemplate([character, titleImage], "character-right");
    const arrangedTitle = arranged.find((layer) => layer.id === titleImage.id)!;

    expect(arranged.at(-1)?.id).toBe(titleImage.id);
    expect(arrangedTitle.x).toBeLessThan(100);
    expect(Math.abs(arrangedTitle.width * arrangedTitle.scaleX)).toBeGreaterThan(600);
  });

  it("positions and scales a character from its head anchor", () => {
    const base = createTitleLayer();
    const character = {
      ...base,
      id: "anchored-character",
      kind: "image" as const,
      src: "/character.png",
      assetType: "characters" as const,
      width: 600,
      height: 1400,
      headAnchor: {
        centerX: 0.5,
        centerY: 0.18,
        width: 0.4,
        height: 0.25,
        method: "manual-reviewed" as const,
        confidence: 0.95,
      },
    };
    const arranged = applyThumbnailTemplate([base, character], "center-impact");
    const next = arranged.find((layer) => layer.id === character.id)!;
    const anchor = character.headAnchor;

    expect(next.kind).toBe("image");
    expect(next.height * Math.abs(next.scaleY) * anchor.height).toBeCloseTo(510);
    expect(next.x + next.width * next.scaleX * anchor.centerX).toBeCloseTo(950);
    expect(next.y + next.height * next.scaleY * anchor.centerY).toBeCloseTo(260);
  });

  it("remaps a source head anchor after transparent whitespace is cropped", () => {
    const anchor = {
      centerX: 0.5,
      centerY: 0.25,
      width: 0.3,
      height: 0.2,
      method: "manual-reviewed" as const,
      confidence: 0.95,
    };
    const remapped = remapHeadAnchorToCrop(anchor, 1000, 1600, { x: 100, y: 40, width: 800, height: 1480 });

    expect(remapped.centerX).toBeCloseTo(0.5);
    expect(remapped.centerY).toBeCloseTo(360 / 1480);
    expect(remapped.width).toBeCloseTo(0.375);
    expect(remapped.height).toBeCloseTo(320 / 1480);
  });

  it("applies separation and background suppression finishing", () => {
    const base = createTitleLayer();
    const background = {
      ...base,
      ...imageAppearanceDefaults("backgrounds"),
      id: "background",
      kind: "image" as const,
      src: "/background.png",
      assetType: "backgrounds" as const,
    };
    const character = {
      ...background,
      ...imageAppearanceDefaults("characters"),
      id: "character",
      src: "/character.png",
      assetType: "characters" as const,
      height: 720,
    };
    const finished = applyFinishPreset([background, character, base], "pop-contrast");
    const report = analyzeThumbnail(finished);

    expect(finished.find((layer) => layer.id === background.id)).toMatchObject({ blurRadius: 2, tintOpacity: 0.18 });
    expect(finished.find((layer) => layer.id === character.id)).toMatchObject({ outlineWidth: 14, imageShadowOpacity: 0.52 });
    expect(report.checks.find((check) => check.label === "人物を分離")?.ok).toBe(true);
    expect(report.checks.find((check) => check.label === "背景を抑制")?.ok).toBe(true);
  });

  it("adds image appearance defaults while sanitizing older projects", () => {
    const project = createEmptyProject();
    const legacyImage = {
      ...createTitleLayer(),
      id: "legacy-character",
      kind: "image" as const,
      src: "/legacy.png",
      assetType: "characters" as const,
    };
    const sanitized = sanitizeProject({ ...project, layers: [legacyImage] });

    expect(sanitized.layers[0]).toMatchObject({ outlineWidth: 10, imageShadowOpacity: 0.42 });
  });

  it("accepts a large vertical generated title", () => {
    const base = createTitleLayer();
    const verticalTitle = {
      ...base,
      id: "vertical-title",
      kind: "image" as const,
      src: "/vertical-title.png",
      assetType: "texts" as const,
      width: 320,
      height: 900,
      scaleX: 0.55,
      scaleY: 0.55,
    };
    const report = analyzeThumbnail([verticalTitle]);

    expect(report.checks.find((check) => check.label === "大きな文字")?.ok).toBe(true);
  });
});
