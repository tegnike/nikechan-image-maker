import { describe, expect, it } from "vitest";
import {
  analyzeThumbnail,
  applyFinishPreset,
  applyGeneratedSupportCopy,
  applyThumbnailTemplate,
  applyTitleLayout,
  cloneLayer,
  createEmptyProject,
  createTitleLayer,
  imageAppearanceDefaults,
  moveItem,
  replaceBackgroundLayer,
  replaceThemeKitLayers,
  remapHeadAnchorToCrop,
  sanitizeProject,
  scaleLayerFromCenter,
} from "./lib";

describe("thumbnail project model", () => {
  it("creates a blank 1280x720 project without synthetic text", () => {
    const project = createEmptyProject();
    expect(project.width).toBe(1280);
    expect(project.height).toBe(720);
    expect(project.layers).toHaveLength(0);
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

  it("removes legacy title slices and synthetic text instead of displaying substitutes", () => {
    const project = createEmptyProject();
    const legacySlice = {
      ...createTitleLayer(),
      id: "legacy-slice",
      kind: "image" as const,
      src: "/cropped-title.png",
      assetType: "texts" as const,
      compositionRole: "title-part",
    };
    const syntheticText = createTitleLayer();
    const sanitized = sanitizeProject({ ...project, layers: [syntheticText, legacySlice as never] });

    expect(sanitized.layers).toEqual([]);
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

  it("replaces the complete generated theme while preserving characters", () => {
    const base = createTitleLayer();
    const image = {
      ...base,
      kind: "image" as const,
      src: "/asset.png",
      assetType: "texts" as const,
    };
    const oldBackground = { ...image, id: "old-background", assetType: "backgrounds" as const, themeId: "old" };
    const oldTitle = { ...image, id: "old-title", themeId: "old", themeRole: "title" as const };
    const oldProp = { ...image, id: "old-prop", assetType: "decorations" as const, themeId: "old", themeRole: "prop" as const };
    const character = { ...image, id: "character", assetType: "characters" as const };
    const supportCopy = { ...base, id: "support-copy", compositionRole: "support-copy" as const, text: "あさかつ" };
    const nextBackground = { ...oldBackground, id: "next-background", themeId: "next", themeRole: "background" as const };
    const nextProp = { ...oldProp, id: "next-prop", themeId: "next" };
    const nextTitle = { ...oldTitle, id: "next-title", themeId: "next" };

    const replaced = replaceThemeKitLayers(
      [oldBackground, base, character, oldProp, oldTitle, supportCopy],
      nextBackground,
      [nextProp],
      nextTitle,
    );

    expect(replaced.map((layer) => layer.id)).toEqual(["next-background", "character", "next-prop", "next-title"]);
    expect(replaced.some((layer) => layer.kind === "text")).toBe(false);
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

  it("uses separately generated 朝 and 活 images without cropping the 朝活 image", () => {
    const base = createTitleLayer();
    const title = {
      ...base,
      id: "generated-title",
      kind: "image" as const,
      src: "/title.png",
      assetType: "texts" as const,
      compositionRole: "main-title" as const,
      width: 1000,
      height: 400,
    };
    const asa = {
      ...title,
      id: "generated-asa",
      src: "/asa.png",
      compositionRole: "title-part-asa" as const,
      width: 420,
      height: 500,
      visible: false,
    };
    const katsu = {
      ...title,
      id: "generated-katsu",
      src: "/katsu.png",
      compositionRole: "title-part-katsu" as const,
      width: 460,
      height: 500,
      visible: false,
    };
    const character = {
      ...title,
      id: "character",
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

    const arranged = applyTitleLayout([character, title, asa, katsu], "split-character");
    const parts = arranged.filter((layer) => layer.compositionRole === "title-part-asa" || layer.compositionRole === "title-part-katsu");
    const nextCharacter = arranged.find((layer) => layer.id === character.id)!;

    expect(arranged.find((layer) => layer.id === title.id)?.visible).toBe(false);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ src: "/asa.png", visible: true });
    expect(parts[1]).toMatchObject({ src: "/katsu.png", visible: true });
    expect("cropWidth" in parts[0]).toBe(false);
    expect("cropWidth" in parts[1]).toBe(false);
    expect(nextCharacter.x + nextCharacter.width * nextCharacter.scaleX * character.headAnchor.centerX).toBeCloseTo(640);

    const restored = applyTitleLayout(arranged, "side-by-side");
    expect(restored.filter((layer) => layer.compositionRole === "title-part-asa" || layer.compositionRole === "title-part-katsu").every((layer) => !layer.visible)).toBe(true);
    expect(restored.find((layer) => layer.id === title.id)?.visible).toBe(true);
  });

  it("assembles and positions a split theme without generating a combined 朝活 image", () => {
    const base = createTitleLayer();
    const image = {
      ...base,
      kind: "image" as const,
      src: "/asset.png",
      assetType: "texts" as const,
    };
    const background = { ...image, id: "background", assetType: "backgrounds" as const, themeRole: "background" as const };
    const asa = { ...image, id: "asa", src: "/asa.png", compositionRole: "title-part-asa" as const, themeRole: "title-part-asa" as const, visible: false };
    const katsu = { ...image, id: "katsu", src: "/katsu.png", compositionRole: "title-part-katsu" as const, themeRole: "title-part-katsu" as const, visible: false };

    const assembled = replaceThemeKitLayers([], background, [], undefined, [asa, katsu]);
    const arranged = applyTitleLayout(assembled, "split-character");

    expect(arranged.map((layer) => layer.id)).toEqual(["background", "asa", "katsu"]);
    expect(arranged.filter((layer) => layer.compositionRole === "main-title")).toHaveLength(0);
    expect(arranged.filter((layer) => layer.compositionRole === "title-part-asa" || layer.compositionRole === "title-part-katsu").every((layer) => layer.visible)).toBe(true);
  });

  it("refuses split layout when separately generated character assets are absent", () => {
    const base = createTitleLayer();
    const title = { ...base, kind: "image" as const, src: "/title.png", assetType: "texts" as const, compositionRole: "main-title" as const };
    const arranged = applyTitleLayout([title], "split-character");

    expect(arranged).toHaveLength(1);
    expect(arranged[0]).toMatchObject({ src: "/title.png", visible: true, compositionRole: "main-title" });
  });

  it("switches only between generated support-copy images", () => {
    const base = createTitleLayer();
    const title = {
      ...base,
      id: "generated-title",
      kind: "image" as const,
      src: "/title.png",
      assetType: "texts" as const,
      compositionRole: "main-title" as const,
      width: 900,
      height: 420,
    };
    const reading = { ...title, id: "reading", src: "/reading.png", compositionRole: "support-copy" as const, supportCopyPreset: "reading" as const, visible: false };
    const english = { ...title, id: "english", src: "/english.png", compositionRole: "support-copy" as const, supportCopyPreset: "english" as const, visible: false };
    const diagonal = applyTitleLayout([title, reading, english], "diagonal-impact");
    const withReading = applyGeneratedSupportCopy(diagonal, "reading");
    const withEnglish = applyGeneratedSupportCopy(withReading, "english");
    const support = withEnglish.filter((layer) => layer.compositionRole === "support-copy");

    expect(diagonal[0].rotation).toBe(-12);
    expect(support).toHaveLength(2);
    expect(support.find((layer) => layer.id === reading.id)).toMatchObject({ kind: "image", visible: false });
    expect(support.find((layer) => layer.id === english.id)).toMatchObject({ kind: "image", visible: true, src: "/english.png", rotation: -8 });
  });

  it("positions a generated support-copy image with the selected title layout", () => {
    const base = createTitleLayer();
    const title = {
      ...base,
      id: "generated-title",
      kind: "image" as const,
      src: "/title.png",
      assetType: "texts" as const,
      compositionRole: "main-title" as const,
      width: 900,
      height: 420,
    };
    const support = {
      ...title,
      id: "generated-support",
      src: "/support.png",
      compositionRole: "support-copy" as const,
      themeRole: "support-copy" as const,
      width: 1000,
      height: 180,
    };

    const diagonal = applyTitleLayout([title, support], "diagonal-impact");
    const positioned = diagonal.find((layer) => layer.id === support.id)!;

    expect(positioned).toMatchObject({ kind: "image", rotation: -8, compositionRole: "support-copy" });
    expect(Math.abs(positioned.width * positioned.scaleX)).toBeLessThanOrEqual(580);
    expect(Math.abs(positioned.height * positioned.scaleY)).toBeLessThanOrEqual(88);
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
