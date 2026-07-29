import type { StudioLayer, TextLayer, ThumbnailProject } from "./types";
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
    layers: Array.isArray(input.layers) ? input.layers : [],
    updatedAt: new Date().toISOString(),
  };
}

export function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
