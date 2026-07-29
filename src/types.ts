export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export type AssetType = "characters" | "backgrounds" | "texts" | "decorations";

export type HeadAnchor = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  method: "anime-face-cascade-reviewed" | "manual-reviewed" | "manual";
  confidence: number;
};

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  url: string;
  assetPath?: string;
  source: "library" | "reference";
  createdAt: string;
  headAnchor?: HeadAnchor;
};

type LayerBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  scaleX: number;
  scaleY: number;
};

export type ImageLayer = LayerBase & {
  kind: "image";
  src: string;
  assetPath?: string;
  assetType: AssetType;
  headAnchor?: HeadAnchor;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  blurRadius?: number;
  brightness?: number;
  saturation?: number;
  tintColor?: string;
  tintOpacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  imageShadowColor?: string;
  imageShadowBlur?: number;
  imageShadowOpacity?: number;
  imageShadowOffsetX?: number;
  imageShadowOffsetY?: number;
};

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
  align: "left" | "center" | "right";
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  lineHeight: number;
};

export type StudioLayer = ImageLayer | TextLayer;

export type ThumbnailProject = {
  version: 1;
  id: string;
  name: string;
  width: typeof CANVAS_WIDTH;
  height: typeof CANVAS_HEIGHT;
  backgroundColor: string;
  layers: StudioLayer[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = Pick<ThumbnailProject, "id" | "name" | "updatedAt">;

export type Health = {
  ok: boolean;
  libraryRoot: string;
  mounted: boolean;
  writable: boolean;
};
