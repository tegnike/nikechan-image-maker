import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset, AssetType, GeneratedSupportCopyPreset, HeadAnchor, ImageLayer, ProjectSummary, SupportCopyPreset, ThemeAccentRole, ThemeKit, ThumbnailProject, TitleLayoutPreset } from "../src/types";
import { remapHeadAnchorToCrop } from "../src/lib";

export const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
export const LIBRARY_ROOT = path.resolve(
  process.env.THUMBNAIL_LIBRARY_ROOT || "/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker",
);
export const ASSETS_ROOT = path.join(LIBRARY_ROOT, "assets");
export const PROJECTS_ROOT = path.join(LIBRARY_ROOT, "projects");
export const EXPORTS_ROOT = path.join(LIBRARY_ROOT, "exports");
export const PROMPTS_ROOT = path.join(LIBRARY_ROOT, "prompts");
export const HEAD_ANCHORS_PATH = path.join(LIBRARY_ROOT, "head-anchors.json");
export const THEME_KITS_PATH = path.join(LIBRARY_ROOT, "theme-kits.json");
export const REFERENCES_ROOT = path.join(PROJECT_ROOT, "references");

export const ASSET_TYPES: AssetType[] = ["characters", "backgrounds", "texts", "decorations"];

async function assertConfiguredVolumeAvailable() {
  if (!LIBRARY_ROOT.startsWith("/Volumes/")) return;
  const volumeName = LIBRARY_ROOT.split(path.sep)[2];
  const volumeRoot = path.join("/Volumes", volumeName || "");
  const [volumesInfo, volumeInfo] = await Promise.all([stat("/Volumes"), stat(volumeRoot)]);
  if (volumesInfo.dev === volumeInfo.dev) {
    throw new Error(`External volume is not mounted: ${volumeRoot}`);
  }
  await access(volumeRoot, fsConstants.R_OK | fsConstants.W_OK);
}

export async function ensureLibrary() {
  await assertConfiguredVolumeAvailable();
  await Promise.all([
    ...ASSET_TYPES.map((type) => mkdir(path.join(ASSETS_ROOT, type), { recursive: true })),
    mkdir(PROJECTS_ROOT, { recursive: true }),
    mkdir(EXPORTS_ROOT, { recursive: true }),
    mkdir(PROMPTS_ROOT, { recursive: true }),
  ]);
}

export async function libraryHealth() {
  const mounted = await assertConfiguredVolumeAvailable()
    .then(() => true)
    .catch(() => false);
  const writable = await access(LIBRARY_ROOT, fsConstants.R_OK | fsConstants.W_OK)
    .then(() => true)
    .catch(() => false);
  return { mounted, writable };
}

export function safeId(value: string) {
  const normalized = value.normalize("NFKC").replace(/[^\p{L}\p{N}_-]/gu, "-").replace(/-+/g, "-");
  return normalized.replace(/^-|-$/g, "").slice(0, 96) || `item-${Date.now()}`;
}

export function safeFileName(value: string) {
  const parsed = path.parse(value.normalize("NFKC"));
  const base = parsed.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, "-");
  const ext = parsed.ext.toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `${base.slice(0, 96) || "asset"}${ext}`;
}

async function walkImages(root: string, max = 500) {
  const found: Array<{ absolute: string; relative: string; mtime: Date }> = [];
  async function walk(current: string) {
    if (found.length >= max) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) {
        const info = await stat(absolute);
        found.push({ absolute, relative: path.relative(root, absolute), mtime: info.mtime });
      }
      if (found.length >= max) break;
    }
  }
  await walk(root);
  return found.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

function assetUrl(prefix: string, relative: string) {
  return `${prefix}/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

type HeadAnchorIndex = {
  version: 1;
  updatedAt: string;
  anchors: Record<string, HeadAnchor>;
};

function portablePath(value: string) {
  return value.split(path.sep).join("/");
}

function canonicalHeadAnchorPath(value: string) {
  return portablePath(value).replace(/^assets\//, "");
}

function normalizeHeadAnchor(value: unknown): HeadAnchor | null {
  if (!value || typeof value !== "object") return null;
  const anchor = value as Partial<HeadAnchor>;
  if (
    ![anchor.centerX, anchor.centerY, anchor.width, anchor.height, anchor.confidence].every(Number.isFinite)
    || !["anime-face-cascade-reviewed", "manual-reviewed", "manual"].includes(anchor.method || "")
  ) return null;
  return {
    centerX: anchor.centerX!,
    centerY: anchor.centerY!,
    width: anchor.width!,
    height: anchor.height!,
    ...(Number.isFinite(anchor.sourceWidth) ? { sourceWidth: anchor.sourceWidth } : {}),
    ...(Number.isFinite(anchor.sourceHeight) ? { sourceHeight: anchor.sourceHeight } : {}),
    method: anchor.method!,
    confidence: anchor.confidence!,
  };
}

function normalizeHeadAnchorIndex(input: unknown): HeadAnchorIndex {
  if (!input || typeof input !== "object") {
    return { version: 1, updatedAt: new Date(0).toISOString(), anchors: {} };
  }
  const parsed = input as Record<string, unknown>;
  const anchors: Record<string, HeadAnchor> = {};
  const merge = (entries: Record<string, unknown>) => {
    for (const [assetPath, value] of Object.entries(entries)) {
      const canonical = canonicalHeadAnchorPath(assetPath);
      const anchor = normalizeHeadAnchor(value);
      if (canonical.startsWith("characters/") && anchor) anchors[canonical] = anchor;
    }
  };
  if (parsed.anchors && typeof parsed.anchors === "object" && !Array.isArray(parsed.anchors)) {
    merge(parsed.anchors as Record<string, unknown>);
  }
  merge(parsed);
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    anchors,
  };
}

export async function loadHeadAnchors(): Promise<HeadAnchorIndex> {
  try {
    return normalizeHeadAnchorIndex(JSON.parse(await readFile(HEAD_ANCHORS_PATH, "utf8")) as unknown);
  } catch {
    return { version: 1, updatedAt: new Date(0).toISOString(), anchors: {} };
  }
}

function libraryAssetPathFromUrl(src: string) {
  const prefix = "/library-assets/";
  if (!src.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(src.slice(prefix.length));
  } catch {
    return null;
  }
}

function anchorForLayer(layer: ImageLayer, anchor: HeadAnchor) {
  if (!anchor.sourceWidth || !anchor.sourceHeight || !layer.cropWidth || !layer.cropHeight) return anchor;
  return remapHeadAnchorToCrop(anchor, anchor.sourceWidth, anchor.sourceHeight, {
    x: layer.cropX || 0,
    y: layer.cropY || 0,
    width: layer.cropWidth,
    height: layer.cropHeight,
  });
}

async function hydrateProjectHeadAnchors(project: ThumbnailProject): Promise<ThumbnailProject> {
  const index = await loadHeadAnchors();
  return {
    ...project,
    layers: project.layers.map((layer) => {
      if (layer.kind !== "image" || layer.assetType !== "characters" || layer.headAnchor) return layer;
      const assetPath = layer.assetPath || libraryAssetPathFromUrl(layer.src) || undefined;
      const anchor = assetPath ? index.anchors[portablePath(assetPath)] : undefined;
      return anchor ? { ...layer, assetPath, headAnchor: anchorForLayer(layer, anchor) } : layer;
    }),
  };
}

export async function listAssets(type: AssetType): Promise<Asset[]> {
  const root = path.join(ASSETS_ROOT, type);
  const [libraryFiles, headAnchors] = await Promise.all([
    walkImages(root),
    type === "characters" ? loadHeadAnchors() : Promise.resolve(null),
  ]);
  const assets: Asset[] = libraryFiles.map((file) => ({
    id: `${type}:${file.relative}`,
    name: path.parse(file.relative).name,
    type,
    url: assetUrl(`/library-assets/${type}`, file.relative),
    assetPath: portablePath(path.join(type, file.relative)),
    source: "library",
    createdAt: file.mtime.toISOString(),
    headAnchor: headAnchors?.anchors[portablePath(path.join(type, file.relative))],
  }));

  if (type === "characters") {
    const references = await walkImages(REFERENCES_ROOT, 30);
    assets.push(
      ...references.map((file) => ({
        id: `reference:${file.relative}`,
        name: `公式資料 · ${path.parse(file.relative).name}`,
        type,
        url: assetUrl("/reference-assets", file.relative),
        source: "reference" as const,
        createdAt: file.mtime.toISOString(),
      })),
    );
  }
  return assets;
}

type ThemeAccentRecord = {
  assetPath: string;
  role: ThemeAccentRole;
  placement: { x: number; y: number; width: number };
};

type ThemeKitRecord = Omit<ThemeKit, "background" | "title" | "splitTitle" | "supports" | "accents"> & {
  backgroundAssetPath: string;
  titleAssetPath?: string;
  splitTitleAssetPaths?: { asa: string; katsu: string };
  supportAssetPaths?: Partial<Record<GeneratedSupportCopyPreset, string>>;
  supportAssetPath?: string;
  accentAssets?: ThemeAccentRecord[];
};

const TITLE_LAYOUTS = new Set<TitleLayoutPreset>(["side-by-side", "split-character", "diagonal-impact"]);
const SUPPORT_COPIES = new Set<SupportCopyPreset>(["none", "stream", "casual", "reading", "english"]);
const GENERATED_SUPPORT_COPIES: GeneratedSupportCopyPreset[] = ["stream", "casual", "reading", "english"];

function themeAsset(assetPath: string, type: AssetType, themeId: string, createdAt: string): Asset {
  const normalized = assetPath.replaceAll("\\", "/").replace(/^assets\//, "");
  const prefix = `${type}/`;
  if (!normalized.startsWith(prefix) || normalized.includes("..")) {
    throw new Error(`Invalid ${type} theme asset path: ${assetPath}`);
  }
  const relative = normalized.slice(prefix.length);
  return {
    id: `theme:${themeId}:${normalized}`,
    name: path.parse(relative).name,
    type,
    url: assetUrl(`/library-assets/${type}`, relative),
    assetPath: normalized,
    themeId,
    source: "library",
    createdAt,
  };
}

export async function listThemeKits(): Promise<ThemeKit[]> {
  try {
    const parsed = JSON.parse(await readFile(THEME_KITS_PATH, "utf8")) as unknown;
    const themes = !Array.isArray(parsed)
      && typeof parsed === "object"
      && parsed !== null
      && (parsed as { version?: unknown }).version === 1
      && Array.isArray((parsed as { themes?: unknown }).themes)
      ? (parsed as { themes: ThemeKitRecord[] }).themes
      : Array.isArray(parsed)
        ? parsed.filter((item): item is ThemeKitRecord => (
          typeof item === "object" && item !== null && "id" in item
        ))
        : [];
    return themes.flatMap((theme): ThemeKit[] => {
      try {
        const splitTitle = theme.splitTitleAssetPaths ? {
        asa: themeAsset(theme.splitTitleAssetPaths.asa, "texts", theme.id, theme.createdAt),
        katsu: themeAsset(theme.splitTitleAssetPaths.katsu, "texts", theme.id, theme.createdAt),
        } : undefined;
        const supportPaths = { ...(theme.supportAssetPaths || {}) };
        if (
          theme.supportAssetPath
          && theme.supportCopy
          && theme.supportCopy !== "none"
          && !supportPaths[theme.supportCopy]
        ) supportPaths[theme.supportCopy] = theme.supportAssetPath;
        const supports = Object.fromEntries(GENERATED_SUPPORT_COPIES.flatMap((preset) => {
          const assetPath = supportPaths[preset];
          return assetPath ? [[preset, themeAsset(assetPath, "texts", theme.id, theme.createdAt)]] : [];
        })) as ThemeKit["supports"];
        const requestedLayout = TITLE_LAYOUTS.has(theme.titleLayout as TitleLayoutPreset) ? theme.titleLayout : undefined;
        const title = theme.titleAssetPath
          ? themeAsset(theme.titleAssetPath, "texts", theme.id, theme.createdAt)
          : undefined;
        const usableLayout = requestedLayout === "split-character"
          ? (splitTitle ? requestedLayout : (title ? "side-by-side" : undefined))
          : (title ? requestedLayout : undefined);
        return [{
          id: theme.id,
          name: theme.name,
          category: theme.category,
          concept: theme.concept,
          palette: theme.palette,
          shapeLanguage: theme.shapeLanguage,
          titleLayout: usableLayout,
          supportCopy: SUPPORT_COPIES.has(theme.supportCopy as SupportCopyPreset) ? theme.supportCopy : undefined,
          createdAt: theme.createdAt,
          background: themeAsset(theme.backgroundAssetPath, "backgrounds", theme.id, theme.createdAt),
          title,
          splitTitle,
          supports,
          accents: (theme.accentAssets || []).flatMap((accent) => {
            const placement = accent.placement;
            if (
              !["prop", "foreground-accent"].includes(accent.role)
              || !placement
              || ![placement.x, placement.y, placement.width].every(Number.isFinite)
              || placement.width <= 0
            ) return [];
            try {
              return [{
                asset: themeAsset(accent.assetPath, "decorations", theme.id, theme.createdAt),
                role: accent.role,
                placement,
              }];
            } catch {
              return [];
            }
          }),
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export async function storeAsset(type: AssetType, originalName: string, bytes: Buffer) {
  const now = new Date();
  const day = [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")];
  const targetDir = path.join(ASSETS_ROOT, type, ...day);
  await mkdir(targetDir, { recursive: true });
  const base = safeFileName(originalName);
  const target = path.join(targetDir, `${Date.now()}-${base}`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, target);
  return target;
}

export async function saveProject(project: ThumbnailProject) {
  const id = safeId(project.id);
  const now = new Date().toISOString();
  const next: ThumbnailProject = {
    ...project,
    version: 1,
    id,
    width: 1280,
    height: 720,
    updatedAt: now,
    createdAt: project.createdAt || now,
  };
  const target = path.join(PROJECTS_ROOT, `${id}.json`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return next;
}

export async function loadProject(id: string): Promise<ThumbnailProject> {
  const content = await readFile(path.join(PROJECTS_ROOT, `${safeId(id)}.json`), "utf8");
  return hydrateProjectHeadAnchors(JSON.parse(content) as ThumbnailProject);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const entries = await readdir(PROJECTS_ROOT, { withFileTypes: true }).catch(() => []);
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        try {
          const project = JSON.parse(await readFile(path.join(PROJECTS_ROOT, entry.name), "utf8")) as ThumbnailProject;
          return { id: project.id, name: project.name, updatedAt: project.updatedAt };
        } catch {
          return null;
        }
      }),
  );
  return projects
    .filter((project): project is ProjectSummary => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveExport(projectId: string, projectName: string, png: Buffer) {
  const now = new Date();
  const day = [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")];
  const dir = path.join(EXPORTS_ROOT, ...day);
  await mkdir(dir, { recursive: true });
  const timestamp = `${day.join("")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const target = path.join(dir, `${timestamp}-${safeId(projectName)}.png`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, png, { flag: "wx" });
  await rename(temporary, target);
  const metadataTarget = target.replace(/\.png$/, ".json");
  await writeFile(metadataTarget, `${JSON.stringify({ projectId, projectName, exportedAt: now.toISOString(), width: 1280, height: 720 }, null, 2)}\n`);
  return target;
}
