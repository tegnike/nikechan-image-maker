import type { AssetType, ImageLayer, StudioLayer, TextLayer, ThumbnailProject } from "./types";
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
    layers: [createTitleLayer()],
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

export function applyThumbnailTemplate(layers: StudioLayer[], preset: ThumbnailTemplate): StudioLayer[] {
  const character = [...layers].reverse().find(
    (layer) => layer.kind === "image" && layer.assetType === "characters",
  );
  const title = [...layers].reverse().find(
    (layer) => layer.kind === "text" || (layer.kind === "image" && layer.assetType === "texts"),
  );

  let next = layers.map((layer) => {
    if (layer.id === character?.id) {
      if (preset === "character-right") {
        return { ...fitLayerInBox(layer, { x: 650, y: -110, width: 690, height: 900 }, 1, 1), rotation: 0 };
      }
      if (preset === "character-left") {
        return { ...fitLayerInBox(layer, { x: -60, y: -110, width: 690, height: 900 }, 0, 1), rotation: 0 };
      }
      return { ...fitLayerInBox(layer, { x: 430, y: -210, width: 850, height: 1040 }, 1, 1), rotation: 0 };
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
    (layer) => layer.kind === "text" || (layer.kind === "image" && layer.assetType === "texts"),
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
      ? input.layers.map((layer) => layer.kind === "image" ? normalizeImageLayer(layer) : layer)
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
