import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset, AssetType, HeadAnchor, ImageLayer, ProjectSummary, ThemeAccentRole, ThemeKit, ThumbnailProject } from "../src/types";
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

export async function loadHeadAnchors(): Promise<HeadAnchorIndex> {
  try {
    const parsed = JSON.parse(await readFile(HEAD_ANCHORS_PATH, "utf8")) as HeadAnchorIndex;
    return parsed.version === 1 && parsed.anchors && typeof parsed.anchors === "object"
      ? parsed
      : { version: 1, updatedAt: new Date(0).toISOString(), anchors: {} };
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

type ThemeKitRecord = Omit<ThemeKit, "background" | "title" | "accents"> & {
  backgroundAssetPath: string;
  titleAssetPath: string;
  accentAssets?: ThemeAccentRecord[];
};

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
    const parsed = JSON.parse(await readFile(THEME_KITS_PATH, "utf8")) as { version: number; themes: ThemeKitRecord[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.themes)) return [];
    return parsed.themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      category: theme.category,
      concept: theme.concept,
      palette: theme.palette,
      shapeLanguage: theme.shapeLanguage,
      createdAt: theme.createdAt,
      background: themeAsset(theme.backgroundAssetPath, "backgrounds", theme.id, theme.createdAt),
      title: themeAsset(theme.titleAssetPath, "texts", theme.id, theme.createdAt),
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
    }));
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
