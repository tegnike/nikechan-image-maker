import type {
  AssetType,
  HeadAnchor,
  ImageLayer,
  StudioLayer,
  SupportCopyPreset,
  TextLayer,
  ThumbnailProject,
  TitleLayoutPreset,
} from "./types";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyProject(): ThumbnailProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: createId("project"),
    name: "朝活サムネイル",
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: "#fff8e8",
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createTitleLayer(): TextLayer {
  return {
    id: createId("text"),
    kind: "text",
    name: "メインタイトル",
    text: "朝活",
    x: 70,
    y: 92,
    width: 610,
    height: 240,
    rotation: -3,
    opacity: 1,
    visible: true,
    locked: false,
    scaleX: 1,
    scaleY: 1,
    fontFamily: "Hiragino Sans",
    fontSize: 176,
    fontStyle: "bold",
    align: "center",
    fill: "#ffd83d",
    stroke: "#153f50",
    strokeWidth: 14,
    shadowColor: "#ff6f61",
    shadowBlur: 0,
    shadowOffsetX: 13,
    shadowOffsetY: 13,
    lineHeight: 0.95,
  };
}

export function cloneLayer(layer: StudioLayer): StudioLayer {
  return {
    ...layer,
    id: createId(layer.kind),
    name: `${layer.name} コピー`,
    x: layer.x + 28,
    y: layer.y + 28,
  };
}

export type ThumbnailTemplate = "character-right" | "character-left" | "center-impact";
export type FinishPreset = "soft-morning" | "pop-contrast";

function findMainTitle(layers: StudioLayer[]) {
  return [...layers].reverse().find(
    (layer) => layer.compositionRole === "main-title"
      || (layer.compositionRole !== "title-part-asa"
        && layer.compositionRole !== "title-part-katsu"
        && layer.compositionRole !== "support-copy"
        && (layer.kind === "text" || layer.assetType === "texts")),
  );
}

function isTitlePart(layer: StudioLayer) {
  return layer.compositionRole === "title-part-asa" || layer.compositionRole === "title-part-katsu";
}

export function imageAppearanceDefaults(assetType: AssetType) {
  const isBackground = assetType === "backgrounds";
  const isCharacter = assetType === "characters";
  return {
    blurRadius: 0,
    brightness: isBackground ? -0.04 : 0,
    saturation: isBackground ? -0.08 : 0,
    tintColor: "#302454",
    tintOpacity: isBackground ? 0.08 : 0,
    outlineColor: "#fffaf0",
    outlineWidth: isCharacter ? 10 : 0,
    imageShadowColor: "#281f43",
    imageShadowBlur: isCharacter ? 18 : 0,
    imageShadowOpacity: isCharacter ? 0.42 : 0,
    imageShadowOffsetX: isCharacter ? 10 : 0,
    imageShadowOffsetY: isCharacter ? 12 : 0,
  };
}

export function normalizeImageLayer(layer: ImageLayer): ImageLayer {
  return { ...imageAppearanceDefaults(layer.assetType), ...layer };
}

function fitLayerInBox<T extends StudioLayer>(
  layer: T,
  box: { x: number; y: number; width: number; height: number },
  alignX: 0 | 0.5 | 1 = 0.5,
  alignY: 0 | 0.5 | 1 = 0.5,
): T {
  const scale = Math.min(box.width / layer.width, box.height / layer.height);
  const width = layer.width * scale;
  const height = layer.height * scale;
  return {
    ...layer,
    x: box.x + (box.width - width) * alignX,
    y: box.y + (box.height - height) * alignY,
    scaleX: layer.scaleX < 0 ? -scale : scale,
    scaleY: layer.scaleY < 0 ? -scale : scale,
  };
}

export function remapHeadAnchorToCrop(
  anchor: HeadAnchor,
  sourceWidth: number,
  sourceHeight: number,
  crop: { x: number; y: number; width: number; height: number },
): HeadAnchor {
  return {
    ...anchor,
    centerX: (anchor.centerX * sourceWidth - crop.x) / crop.width,
    centerY: (anchor.centerY * sourceHeight - crop.y) / crop.height,
    width: anchor.width * sourceWidth / crop.width,
    height: anchor.height * sourceHeight / crop.height,
  };
}

function placeCharacterByHead<T extends ImageLayer>(
  layer: T,
  target: { x: number; y: number; headHeight: number },
): T {
  const anchor = layer.headAnchor;
  if (!anchor || anchor.height <= 0) return layer;
  const scale = target.headHeight / (layer.height * anchor.height);
  const scaleX = layer.scaleX < 0 ? -scale : scale;
  const scaleY = layer.scaleY < 0 ? -scale : scale;
  return {
    ...layer,
    x: target.x - layer.width * anchor.centerX * scaleX,
    y: target.y - layer.height * anchor.centerY * scaleY,
    scaleX,
    scaleY,
  };
}

export function applyThumbnailTemplate(layers: StudioLayer[], preset: ThumbnailTemplate): StudioLayer[] {
  const character = [...layers].reverse().find(
    (layer): layer is ImageLayer => layer.kind === "image" && layer.assetType === "characters",
  );
  const title = [...layers].reverse().find(
    (layer) => layer.compositionRole !== "support-copy"
      && !isTitlePart(layer)
      && (layer.kind === "text" || (layer.kind === "image" && layer.assetType === "texts")),
  );

  let next = layers.map((layer) => {
    if (layer.id === character?.id) {
      if (preset === "character-right") {
        const fallback = fitLayerInBox(character, { x: 650, y: -110, width: 690, height: 900 }, 1, 1);
        return { ...placeCharacterByHead(character, { x: 1030, y: 235, headHeight: 370 }), ...(!character.headAnchor ? fallback : {}), rotation: 0 };
      }
      if (preset === "character-left") {
        const fallback = fitLayerInBox(character, { x: -60, y: -110, width: 690, height: 900 }, 0, 1);
        return { ...placeCharacterByHead(character, { x: 250, y: 235, headHeight: 370 }), ...(!character.headAnchor ? fallback : {}), rotation: 0 };
      }
      const fallback = fitLayerInBox(character, { x: 430, y: -210, width: 850, height: 1040 }, 1, 1);
      return { ...placeCharacterByHead(character, { x: 950, y: 260, headHeight: 510 }), ...(!character.headAnchor ? fallback : {}), rotation: 0 };
    }
    if (layer.id === title?.id) {
      if (preset === "character-right") {
        return { ...fitLayerInBox(layer, { x: 22, y: 44, width: 760, height: 500 }, 0, 0.5), rotation: -3 };
      }
      if (preset === "character-left") {
        return { ...fitLayerInBox(layer, { x: 500, y: 44, width: 758, height: 500 }, 1, 0.5), rotation: 3 };
      }
      return { ...fitLayerInBox(layer, { x: 42, y: 398, width: 850, height: 294 }, 0, 1), rotation: -2 };
    }
    return layer;
  });

  if (title) {
    const titleLayer = next.find((layer) => layer.id === title.id);
    next = [...next.filter((layer) => layer.id !== title.id), ...(titleLayer ? [titleLayer] : [])];
  }
  return next;
}

function placeSupportCopy<T extends StudioLayer>(layer: T, layers: StudioLayer[]): T {
  let box = { x: 90, y: 510, width: 560, height: 92 };
  let rotation = -2;
  if (layers.some((item) => isTitlePart(item) && item.visible)) {
    box = { x: 430, y: 585, width: 420, height: 82 };
    rotation = 0;
  } else {
    const mainTitle = findMainTitle(layers);
    if (mainTitle && Math.abs(mainTitle.rotation) >= 8) {
      box = { x: 120, y: 570, width: 580, height: 88 };
      rotation = -8;
    } else if (mainTitle && mainTitle.y >= 340) {
      box = { x: 90, y: 78, width: 560, height: 92 };
    }
  }

  if (layer.kind === "image") {
    return { ...fitLayerInBox(layer, box, 0.5, 0.5), rotation };
  }
  return { ...layer, ...box, rotation };
}

export function applyTitleLayout(layers: StudioLayer[], preset: TitleLayoutPreset): StudioLayer[] {
  const source = findMainTitle(layers);
  const asa = layers.find((layer) => layer.compositionRole === "title-part-asa");
  const katsu = layers.find((layer) => layer.compositionRole === "title-part-katsu");
  if (preset === "split-character" && (!asa || !katsu)) {
    return source ? applyTitleLayout(layers, "side-by-side") : layers;
  }
  if (preset !== "split-character" && !source) return layers;

  let next = layers.map((layer) => {
    if (source && layer.id === source.id) {
      return { ...layer, compositionRole: "main-title" as const, visible: preset !== "split-character" };
    }
    if (isTitlePart(layer)) return { ...layer, visible: preset === "split-character" };
    return layer;
  });

  if (preset === "side-by-side") {
    return next.map((layer) => layer.compositionRole === "support-copy"
      ? placeSupportCopy(layer, next)
      : layer);
  }

  const character = [...next].reverse().find(
    (layer): layer is ImageLayer => layer.kind === "image" && layer.assetType === "characters",
  );

  if (preset === "diagonal-impact") {
    next = next.map((layer) => {
      if (source && layer.id === source.id) {
        return { ...fitLayerInBox(layer, { x: 10, y: 36, width: 900, height: 590 }, 0, 0.5), rotation: -12 };
      }
      if (layer.id === character?.id) {
        const fallback = fitLayerInBox(character, { x: 690, y: -150, width: 650, height: 930 }, 1, 1);
        return { ...placeCharacterByHead(character, { x: 1035, y: 240, headHeight: 405 }), ...(!character.headAnchor ? fallback : {}), rotation: 0 };
      }
      return layer;
    });
  } else if (asa && katsu) {
    next = next.map((layer) => {
      if (layer.id === asa.id) return fitLayerInBox(layer, { x: 30, y: 145, width: 400, height: 430 });
      if (layer.id === katsu.id) return fitLayerInBox(layer, { x: 850, y: 145, width: 400, height: 430 });
      if (layer.id === character?.id) {
        const fallback = fitLayerInBox(character, { x: 330, y: -150, width: 620, height: 930 }, 0.5, 1);
        return { ...placeCharacterByHead(character, { x: 640, y: 235, headHeight: 405 }), ...(!character.headAnchor ? fallback : {}), rotation: 0 };
      }
      return layer;
    });
  }

  return next.map((layer) => layer.compositionRole === "support-copy"
    ? placeSupportCopy(layer, next)
    : layer);
}

export function applyGeneratedSupportCopy(layers: StudioLayer[], preset: SupportCopyPreset): StudioLayer[] {
  const next = layers.map((layer) => layer.compositionRole === "support-copy"
    ? { ...layer, visible: preset !== "none" && layer.kind === "image" && layer.supportCopyPreset === preset }
    : layer);
  return next.map((layer) => layer.compositionRole === "support-copy" && layer.visible
    ? placeSupportCopy(layer, next)
    : layer);
}

export function applyFinishPreset(layers: StudioLayer[], preset: FinishPreset): StudioLayer[] {
  const soft = preset === "soft-morning";
  return layers.map((layer) => {
    if (layer.kind === "text") {
      return soft
        ? { ...layer, strokeWidth: Math.max(8, layer.strokeWidth), shadowBlur: 8, shadowOffsetX: 8, shadowOffsetY: 8 }
        : { ...layer, strokeWidth: Math.max(12, layer.strokeWidth), shadowBlur: 2, shadowOffsetX: 12, shadowOffsetY: 12 };
    }
    if (layer.assetType === "backgrounds") {
      return {
        ...normalizeImageLayer(layer),
        blurRadius: soft ? 5 : 2,
        brightness: soft ? -0.04 : -0.1,
        saturation: soft ? -0.18 : -0.28,
        tintColor: soft ? "#fff1dc" : "#2c2150",
        tintOpacity: soft ? 0.12 : 0.18,
      };
    }
    if (layer.assetType === "characters") {
      return {
        ...normalizeImageLayer(layer),
        outlineColor: soft ? "#fffaf1" : "#ffffff",
        outlineWidth: soft ? 10 : 14,
        imageShadowColor: soft ? "#694f78" : "#211936",
        imageShadowBlur: soft ? 18 : 24,
        imageShadowOpacity: soft ? 0.36 : 0.52,
        imageShadowOffsetX: soft ? 8 : 12,
        imageShadowOffsetY: soft ? 10 : 14,
      };
    }
    if (layer.assetType === "texts" || layer.assetType === "decorations") {
      return {
        ...normalizeImageLayer(layer),
        imageShadowColor: soft ? "#6a506e" : "#211936",
        imageShadowBlur: soft ? 8 : 12,
        imageShadowOpacity: soft ? 0.24 : 0.38,
        imageShadowOffsetX: soft ? 5 : 8,
        imageShadowOffsetY: soft ? 6 : 9,
      };
    }
    return layer;
  });
}

export function analyzeThumbnail(layers: StudioLayer[]) {
  const character = layers.find((layer) => layer.kind === "image" && layer.assetType === "characters");
  const background = layers.find((layer) => layer.kind === "image" && layer.assetType === "backgrounds");
  const title = layers.find(
    (layer) => layer.compositionRole !== "support-copy"
      && layer.visible
      && (layer.kind === "text" || (layer.kind === "image" && layer.assetType === "texts")),
  );
  const checks = [
    { label: "人物", ok: Boolean(character) },
    { label: "主題文字", ok: Boolean(title) },
    { label: "背景", ok: Boolean(background) },
    {
      label: "人物を分離",
      ok: Boolean(character && character.kind === "image" && ((character.outlineWidth || 0) >= 6 || (character.imageShadowOpacity || 0) >= 0.25)),
    },
    {
      label: "背景を抑制",
      ok: Boolean(background && background.kind === "image" && ((background.blurRadius || 0) >= 2 || (background.tintOpacity || 0) >= 0.08 || (background.brightness || 0) <= -0.06)),
    },
    {
      label: "大きな人物",
      ok: Boolean(character && Math.abs(character.height * character.scaleY) >= CANVAS_HEIGHT * 0.78),
    },
    {
      label: "大きな文字",
      ok: Boolean(title && (
        Math.abs(title.width * title.scaleX) >= CANVAS_WIDTH * 0.38
        || Math.abs(title.height * title.scaleY) >= CANVAS_HEIGHT * 0.52
      )),
    },
  ];
  return { passed: checks.filter((check) => check.ok).length, total: checks.length, checks };
}

export function replaceBackgroundLayer(layers: StudioLayer[], background: StudioLayer): StudioLayer[] {
  return [
    background,
    ...layers.filter(
      (layer) => !(layer.kind === "image" && layer.assetType === "backgrounds"),
    ),
  ];
}

export function replaceThemeKitLayers(
  layers: StudioLayer[],
  background: ImageLayer,
  accents: StudioLayer[],
  title?: ImageLayer,
  titleParts: ImageLayer[] = [],
  supports: ImageLayer[] = [],
): StudioLayer[] {
  const remaining = layers
    .filter((layer) => {
      if (layer.kind !== "image") return false;
      if (layer.assetType === "backgrounds") return false;
      if (["title", "title-part-asa", "title-part-katsu", "support-copy", "prop", "foreground-accent"].includes(layer.themeRole || "")) return false;
      return !(layer.themeId && (layer.assetType === "texts" || layer.assetType === "decorations"));
    })
    .filter((layer) => layer.compositionRole !== "support-copy")
    .filter((layer) => !isTitlePart(layer));
  return [background, ...remaining, ...accents, ...(title ? [title] : []), ...titleParts, ...supports];
}

export function scaleLayerFromCenter<T extends StudioLayer>(layer: T, factor: number): T {
  if (!Number.isFinite(factor) || factor <= 0) return layer;

  const clampScale = (value: number) => {
    const sign = value < 0 ? -1 : 1;
    return sign * Math.min(8, Math.max(0.05, Math.abs(value) * factor));
  };
  const nextScaleX = clampScale(layer.scaleX);
  const nextScaleY = clampScale(layer.scaleY);
  const radians = (layer.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const width = layer.width * layer.scaleX;
  const height = layer.height * layer.scaleY;
  const nextWidth = layer.width * nextScaleX;
  const nextHeight = layer.height * nextScaleY;
  const centerX = layer.x + cosine * width / 2 - sine * height / 2;
  const centerY = layer.y + sine * width / 2 + cosine * height / 2;

  return {
    ...layer,
    x: centerX - cosine * nextWidth / 2 + sine * nextHeight / 2,
    y: centerY - sine * nextWidth / 2 - cosine * nextHeight / 2,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
  };
}

export function sanitizeProject(input: ThumbnailProject): ThumbnailProject {
  return {
    ...input,
    version: 1,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: input.backgroundColor || "#fff8e8",
    layers: Array.isArray(input.layers)
      ? input.layers
        .filter((layer) => layer.kind === "image")
        .filter((layer) => (layer as { compositionRole?: string }).compositionRole !== "title-part")
        .map(normalizeImageLayer)
      : [],
    updatedAt: new Date().toISOString(),
  };
}

export function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
