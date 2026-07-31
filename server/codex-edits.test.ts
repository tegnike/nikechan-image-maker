import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let temporaryRoot = "";
let codexEdits: typeof import("./codex-edits");

function pngHeader(width = 1280, height = 720) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  width && bytes.writeUInt32BE(width, 16);
  height && bytes.writeUInt32BE(height, 20);
  return bytes;
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nikechan-codex-edits-"));
  process.env.THUMBNAIL_LIBRARY_ROOT = temporaryRoot;
  vi.resetModules();
  const storage = await import("./storage");
  await storage.ensureLibrary();
  codexEdits = await import("./codex-edits");
});

afterAll(async () => {
  delete process.env.THUMBNAIL_LIBRARY_ROOT;
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("Codex thumbnail edits", () => {
  it("stores the current canvas and exposes a reloadable job record", async () => {
    const job = await codexEdits.createCodexEditJob({
      projectId: "project-test",
      projectName: "朝活サムネイル",
      instruction: "背景だけを明るくしてください",
      png: pngHeader(),
    });

    expect(job).toMatchObject({
      projectId: "project-test",
      projectName: "朝活サムネイル",
      status: "queued",
      inputUrl: expect.stringMatching(/^\/codex-edits\/.+\/input\.png$/),
    });
    expect(job.id).toMatch(/^\d{8}T\d{6}Z-[a-f0-9-]{12}$/);
    expect(job.id).not.toContain("朝活");
    expect(await readFile(codexEdits.getCodexEditFile(job.id, "input.png"))).toEqual(pngHeader());
    expect((await codexEdits.listCodexEditJobs())[0]).toMatchObject({ id: job.id, instruction: "背景だけを明るくしてください" });
  });

  it("removes every API credential from the Codex child process", () => {
    const environment = codexEdits.subscriptionOnlyEnvironment({
      PATH: "/usr/bin",
      OPENAI_API_KEY: "platform-key",
      CODEX_API_KEY: "codex-api-key",
      CODEX_ACCESS_TOKEN: "automation-token",
    });

    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.CODEX_API_KEY).toBeUndefined();
    expect(environment.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(environment.PATH?.split(path.delimiter)).toEqual([path.dirname(process.execPath), "/usr/bin"]);
  });

  it("locks the prompt to built-in subscription image editing and an exact output", () => {
    const prompt = codexEdits.buildCodexEditPrompt("背景だけ変更", "/safe/job/output.png");

    expect(prompt).toContain("$imagegen");
    expect(prompt).toContain("built-in image_genだけを使用する");
    expect(prompt).toContain("OpenAI Platform API");
    expect(prompt).toContain("呼び出しはこの依頼で1回だけ");
    expect(prompt).toContain("正確に1280×720");
    expect(prompt).toContain("/safe/job/output.png");
  });

  it("rejects missing instructions and non-PNG canvas data", async () => {
    await expect(codexEdits.createCodexEditJob({
      projectId: "project",
      projectName: "thumbnail",
      instruction: " ",
      png: pngHeader(),
    })).rejects.toThrow("修正指示");
    await expect(codexEdits.createCodexEditJob({
      projectId: "project",
      projectName: "thumbnail",
      instruction: "背景を変更",
      png: Buffer.from("not png"),
    })).rejects.toThrow("PNG");
  });
});
