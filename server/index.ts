import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSETS_ROOT,
  ASSET_TYPES,
  LIBRARY_ROOT,
  PROJECT_ROOT,
  REFERENCES_ROOT,
  ensureLibrary,
  libraryHealth,
  listAssets,
  listProjects,
  listThemeKits,
  loadProject,
  saveExport,
  saveProject,
  storeAsset,
} from "./storage";
import {
  codexEditFileExists,
  createCodexEditJob,
  getCodexEditFile,
  getCodexSubscriptionStatus,
  hasActiveCodexEdit,
  listCodexEditJobs,
  readCodexEditJob,
  startCodexEdit,
} from "./codex-edits";
import type { AssetType, ThumbnailProject } from "../src/types";

const app = express();
const port = Number(process.env.PORT || 4178);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype));
  },
});

await ensureLibrary();

app.use(express.json({ limit: "30mb" }));
app.use("/library-assets", express.static(ASSETS_ROOT, { fallthrough: false, maxAge: "1m" }));
app.use("/reference-assets", express.static(REFERENCES_ROOT, { fallthrough: false, maxAge: "1h" }));

app.get("/api/health", async (_request, response) => {
  response.json({ ok: true, libraryRoot: LIBRARY_ROOT, ...(await libraryHealth()) });
});

app.get("/api/assets", async (request, response) => {
  const type = String(request.query.type || "characters") as AssetType;
  if (!ASSET_TYPES.includes(type)) {
    response.status(400).json({ error: "unknown asset type" });
    return;
  }
  response.json({ assets: await listAssets(type) });
});

app.get("/api/themes", async (_request, response) => {
  response.json({ themes: await listThemeKits() });
});

app.post("/api/assets/:type", upload.array("files", 20), async (request, response) => {
  const type = String(request.params.type) as AssetType;
  if (!ASSET_TYPES.includes(type)) {
    response.status(400).json({ error: "unknown asset type" });
    return;
  }
  const files = (request.files || []) as Express.Multer.File[];
  const stored = await Promise.all(files.map((file) => storeAsset(type, file.originalname, file.buffer)));
  response.status(201).json({ stored });
});

app.get("/api/projects", async (_request, response) => {
  response.json({ projects: await listProjects() });
});

app.get("/api/projects/:id", async (request, response) => {
  try {
    response.json({ project: await loadProject(String(request.params.id)) });
  } catch {
    response.status(404).json({ error: "project not found" });
  }
});

app.post("/api/projects", async (request, response) => {
  const project = request.body?.project as ThumbnailProject | undefined;
  if (!project || project.version !== 1 || !Array.isArray(project.layers)) {
    response.status(400).json({ error: "invalid project" });
    return;
  }
  response.json({ project: await saveProject(project) });
});

app.post("/api/exports", async (request, response) => {
  const { projectId, projectName, dataUrl } = request.body || {};
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    response.status(400).json({ error: "invalid PNG data" });
    return;
  }
  const png = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    response.status(400).json({ error: "invalid PNG signature" });
    return;
  }
  const target = await saveExport(String(projectId || "project"), String(projectName || "thumbnail"), png);
  response.json({ savedTo: target });
});

app.get("/api/codex/status", async (_request, response) => {
  response.json({ ...(await getCodexSubscriptionStatus()), active: hasActiveCodexEdit() });
});

app.get("/api/codex/edits", async (request, response) => {
  const requestedLimit = Number(request.query.limit || 12);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
  response.json({ jobs: await listCodexEditJobs(limit) });
});

app.get("/api/codex/edits/:id", async (request, response) => {
  try {
    response.json({ job: await readCodexEditJob(String(request.params.id)) });
  } catch {
    response.status(404).json({ error: "Codex edit job not found" });
  }
});

app.post("/api/codex/edits", async (request, response) => {
  if (hasActiveCodexEdit()) {
    response.status(409).json({ error: "別のCodex画像編集が進行中です" });
    return;
  }
  const subscription = await getCodexSubscriptionStatus(true);
  if (!subscription.authenticated || subscription.authMode !== "chatgpt") {
    response.status(503).json({ error: subscription.message });
    return;
  }
  const { projectId, projectName, instruction, dataUrl } = request.body || {};
  if (typeof instruction !== "string" || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    response.status(400).json({ error: "現在のキャンバスと修正指示が必要です" });
    return;
  }
  const png = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  const job = await createCodexEditJob({
    projectId: String(projectId || "project"),
    projectName: String(projectName || "thumbnail"),
    instruction,
    png,
  });
  if (!startCodexEdit(job.id)) {
    response.status(409).json({ error: "別のCodex画像編集が開始されました" });
    return;
  }
  response.status(202).json({ job });
});

app.get("/codex-edits/:id/:file", async (request, response) => {
  const fileName = String(request.params.file);
  try {
    if (!await codexEditFileExists(String(request.params.id), fileName)) {
      response.status(404).end();
      return;
    }
    response.type("png");
    response.setHeader("Cache-Control", "no-store");
    response.sendFile(getCodexEditFile(String(request.params.id), fileName));
  } catch {
    response.status(404).end();
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(PROJECT_ROOT, "dist");
  app.use(express.static(dist));
  app.use((_request, response) => response.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: PROJECT_ROOT,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unexpected error";
  response.status(500).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Thumbnail Studio: http://127.0.0.1:${port}`);
  console.log(`Asset library: ${LIBRARY_ROOT}`);
});
