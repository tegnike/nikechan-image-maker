import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset, AssetType, ProjectSummary, ThumbnailProject } from "../src/types";

export const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
export const LIBRARY_ROOT = path.resolve(
  process.env.THUMBNAIL_LIBRARY_ROOT || "/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker",
);
export const ASSETS_ROOT = path.join(LIBRARY_ROOT, "assets");
export const PROJECTS_ROOT = path.join(LIBRARY_ROOT, "projects");
export const EXPORTS_ROOT = path.join(LIBRARY_ROOT, "exports");
export const PROMPTS_ROOT = path.join(LIBRARY_ROOT, "prompts");
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

export async function listAssets(type: AssetType): Promise<Asset[]> {
  const root = path.join(ASSETS_ROOT, type);
  const libraryFiles = await walkImages(root);
  const assets: Asset[] = libraryFiles.map((file) => ({
    id: `${type}:${file.relative}`,
    name: path.parse(file.relative).name,
    type,
    url: assetUrl(`/library-assets/${type}`, file.relative),
    source: "library",
    createdAt: file.mtime.toISOString(),
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
  return JSON.parse(content) as ThumbnailProject;
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
