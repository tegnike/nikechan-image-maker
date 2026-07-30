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
  themeId?: string;
  source: "library" | "reference";
  createdAt: string;
  headAnchor?: HeadAnchor;
};

export type ThemeAccentRole = "prop" | "foreground-accent";

export type TitleLayoutPreset = "side-by-side" | "split-character" | "diagonal-impact" | "diagonal-pair";
export type SupportCopyPreset = "none" | "stream" | "casual" | "reading" | "english";
export type GeneratedSupportCopyPreset = Exclude<SupportCopyPreset, "none">;
export type CompositionRole = "main-title" | "title-part-asa" | "title-part-katsu" | "support-copy";

export type ThemeAccent = {
  asset: Asset;
  role: ThemeAccentRole;
  placement: {
    x: number;
    y: number;
    width: number;
  };
};

export type ThemeKit = {
  id: string;
  name: string;
  category: string;
  concept: string;
  palette: string[];
  shapeLanguage: string;
  titleLayout?: TitleLayoutPreset;
  supportCopy?: SupportCopyPreset;
  background: Asset;
  title?: Asset;
  splitTitle?: {
    asa: Asset;
    katsu: Asset;
  };
  supports: Partial<Record<GeneratedSupportCopyPreset, Asset>>;
  accents: ThemeAccent[];
  createdAt: string;
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
  compositionRole?: CompositionRole;
};

export type ImageLayer = LayerBase & {
  kind: "image";
  src: string;
  assetPath?: string;
  themeId?: string;
  themeRole?: "background" | "title" | "title-part-asa" | "title-part-katsu" | "support-copy" | ThemeAccentRole;
  assetType: AssetType;
  headAnchor?: HeadAnchor;
  supportCopyPreset?: GeneratedSupportCopyPreset;
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
