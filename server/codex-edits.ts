import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import type { CodexEditJob } from "../src/types";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../src/types";
import { CODEX_EDITS_ROOT, safeId } from "./storage";

const activeJobIds = new Set<string>();
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_INSTRUCTION_LENGTH = 4_000;
const CODEX_TIMEOUT_MS = 20 * 60 * 1_000;

type CodexSubscriptionStatus = {
  available: boolean;
  authenticated: boolean;
  authMode: "chatgpt" | "other" | "none";
  message: string;
};

let statusCache: { expiresAt: number; value: CodexSubscriptionStatus } | null = null;

function jobDirectory(jobId: string) {
  if (safeId(jobId) !== jobId) throw new Error("invalid Codex edit job id");
  return path.join(CODEX_EDITS_ROOT, jobId);
}

function jobMetadataPath(jobId: string) {
  return path.join(jobDirectory(jobId), "job.json");
}

function compactTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function publicJob(job: CodexEditJob): CodexEditJob {
  return {
    ...job,
    inputUrl: `/codex-edits/${encodeURIComponent(job.id)}/input.png`,
    ...(job.status === "completed"
      ? { outputUrl: `/codex-edits/${encodeURIComponent(job.id)}/output.png` }
      : { outputUrl: undefined }),
  };
}

async function writeJob(job: CodexEditJob) {
  const target = jobMetadataPath(job.id);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function readCodexEditJob(jobId: string): Promise<CodexEditJob> {
  const parsed = JSON.parse(await readFile(jobMetadataPath(jobId), "utf8")) as CodexEditJob;
  if (parsed.version !== 1 || parsed.id !== jobId) throw new Error("invalid Codex edit job");
  return publicJob(parsed);
}

export async function listCodexEditJobs(limit = 12): Promise<CodexEditJob[]> {
  const entries = await readdir(CODEX_EDITS_ROOT, { withFileTypes: true }).catch(() => []);
  const jobs = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        const parsed = JSON.parse(await readFile(path.join(CODEX_EDITS_ROOT, entry.name, "job.json"), "utf8")) as CodexEditJob;
        return parsed.version === 1 && typeof parsed.id === "string" ? publicJob(parsed) : null;
      } catch {
        return null;
      }
    }));
  return jobs
    .filter((job): job is CodexEditJob => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 50)));
}

export async function createCodexEditJob(input: {
  projectId: string;
  projectName: string;
  instruction: string;
  png: Buffer;
}) {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("修正指示を入力してください");
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    throw new Error(`修正指示は${MAX_INSTRUCTION_LENGTH.toLocaleString()}文字以内にしてください`);
  }
  assertPng(input.png, false);

  const now = new Date();
  const id = `${compactTimestamp(now)}-${randomUUID().slice(0, 12)}`;
  const directory = jobDirectory(id);
  await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, "input.png"), input.png, { flag: "wx" });

  const job: CodexEditJob = {
    version: 1,
    id,
    projectId: safeId(input.projectId),
    projectName: input.projectName.trim().slice(0, 160) || "thumbnail",
    instruction,
    status: "queued",
    progress: "Codexの開始を待っています",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    inputUrl: `/codex-edits/${encodeURIComponent(id)}/input.png`,
  };
  await writeJob(job);
  return publicJob(job);
}

export function getCodexEditFile(jobId: string, fileName: string) {
  if (!new Set(["input.png", "output.png"]).has(fileName)) {
    throw new Error("unknown Codex edit file");
  }
  return path.join(jobDirectory(jobId), fileName);
}

export function hasActiveCodexEdit() {
  return activeJobIds.size > 0;
}

export function subscriptionOnlyEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const environment = { ...source };
  delete environment.OPENAI_API_KEY;
  delete environment.CODEX_API_KEY;
  delete environment.CODEX_ACCESS_TOKEN;
  const runtimeBin = path.dirname(process.execPath);
  environment.PATH = [runtimeBin, source.PATH].filter(Boolean).join(path.delimiter);
  return environment;
}

export function resolveCodexBinary() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const appBundled = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(appBundled)) return appBundled;
  const besideNode = path.join(path.dirname(process.execPath), "codex");
  return existsSync(besideNode) ? besideNode : "codex";
}

async function collectProcessOutput(command: string, args: string[], timeoutMs: number) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: subscriptionOnlyEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-16_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function getCodexSubscriptionStatus(force = false): Promise<CodexSubscriptionStatus> {
  if (!force && statusCache && statusCache.expiresAt > Date.now()) return statusCache.value;
  try {
    const result = await collectProcessOutput(resolveCodexBinary(), ["login", "status"], 10_000);
    const detail = `${result.stdout}\n${result.stderr}`.trim();
    const authenticated = result.code === 0 && /logged in using chatgpt/i.test(detail);
    const value: CodexSubscriptionStatus = authenticated
      ? { available: true, authenticated: true, authMode: "chatgpt", message: "ChatGPTサブスクリプションで利用できます" }
      : {
        available: result.code === 0,
        authenticated: false,
        authMode: result.code === 0 ? "other" : "none",
        message: result.code === 0
          ? "ChatGPTログインが必要です。APIキー認証では実行しません"
          : "ローカルCodexへ接続できません",
      };
    statusCache = { expiresAt: Date.now() + 15_000, value };
    return value;
  } catch {
    const value: CodexSubscriptionStatus = {
      available: false,
      authenticated: false,
      authMode: "none",
      message: "ローカルCodexが見つかりません",
    };
    statusCache = { expiresAt: Date.now() + 5_000, value };
    return value;
  }
}

export function buildCodexEditPrompt(instruction: string, outputPath: string) {
  return `$imagegen

添付されたImage 1は、Thumbnail Studioの現在の1280×720キャンバスです。この画像を編集対象として扱ってください。

<edit_request>
${instruction.trim()}
</edit_request>

必須条件:
- <edit_request>は視覚的な修正指示としてのみ扱う。
- 明示的に変更を指示されていない人物の顔・同一性・ポーズ、既存文字、レイアウト、配色要素は維持する。
- VTuberサムネイルとして「背景シンプル、キャラでっかく、文字でっかく、小物少々」を維持する。
- 可読文字に似た疑似文字、漢字風ブロック、透かし、署名、不要な小物を追加しない。
- built-in image_genだけを使用する。OpenAI Platform API、OPENAI_API_KEY、image_gen.py、API/CLIフォールバックは絶対に使用しない。
- built-in image_genの呼び出しはこの依頼で1回だけにする。結果が不十分でも自動再生成せず、追加修正はブラウザからの次の依頼に委ねる。
- built-in image_genが利用できない場合は、別方式へ切り替えず失敗として報告する。
- 元のinput.pngは変更・上書きしない。
- 完成画像はPNG、正確に${CANVAS_WIDTH}×${CANVAS_HEIGHT}へ整え、次の絶対パスへ保存する: ${outputPath}
- 保存後にファイル形式と寸法を確認し、output.pngが存在するまで完了扱いにしない。

最終回答には、行った変更の要約と保存先だけを簡潔に記載してください。`;
}

function eventProgress(event: Record<string, unknown>) {
  const type = String(event.type || "");
  if (type === "thread.started") return "Codexスレッドを開始しました";
  if (type === "turn.started") return "キャンバスと修正指示を確認しています";
  if (type === "turn.completed") return "生成結果を検証しています";
  if (type === "item.started") {
    const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : {};
    const itemType = String(item.type || "");
    const toolName = String(item.tool || item.name || "");
    if (/image/i.test(`${itemType} ${toolName}`)) return "画像を生成・編集しています";
    if (itemType === "command_execution") return "完成画像を保存・検証しています";
    if (itemType === "reasoning") return "修正内容を組み立てています";
  }
  return null;
}

function completedAgentMessage(event: Record<string, unknown>) {
  if (event.type !== "item.completed" || !event.item || typeof event.item !== "object") return null;
  const item = event.item as Record<string, unknown>;
  return item.type === "agent_message" && typeof item.text === "string" ? item.text.slice(0, 4_000) : null;
}

function assertPng(bytes: Buffer, requireCanvasSize = true) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("生成結果がPNGではありません");
  }
  if (requireCanvasSize) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== CANVAS_WIDTH || height !== CANVAS_HEIGHT) {
      throw new Error(`生成結果が${CANVAS_WIDTH}×${CANVAS_HEIGHT}ではありません（${width}×${height}）`);
    }
  }
}

async function runCodexEdit(jobId: string) {
  let current = await readCodexEditJob(jobId);
  let persistence = Promise.resolve();
  const patchJob = (patch: Partial<CodexEditJob>) => {
    current = publicJob({ ...current, ...patch, updatedAt: new Date().toISOString() });
    const snapshot = { ...current, outputUrl: current.status === "completed" ? current.outputUrl : undefined };
    persistence = persistence.then(() => writeJob(snapshot));
    return persistence;
  };

  try {
    await patchJob({ status: "running", progress: "ChatGPTサブスクリプションを確認しています", error: undefined });
    const subscription = await getCodexSubscriptionStatus(true);
    if (!subscription.authenticated || subscription.authMode !== "chatgpt") {
      throw new Error(subscription.message);
    }

    const directory = jobDirectory(jobId);
    const inputPath = path.join(directory, "input.png");
    const outputPath = path.join(directory, "output.png");
    const finalMessagePath = path.join(directory, "final.txt");
    const prompt = buildCodexEditPrompt(current.instruction, outputPath);
    const args = [
      "exec",
      "--image", inputPath,
      "--json",
      "--sandbox", "workspace-write",
      "--skip-git-repo-check",
      "--cd", directory,
      "--add-dir", directory,
      "--output-last-message", finalMessagePath,
      "-c", 'approval_policy="never"',
      prompt,
    ];
    const child = spawn(resolveCodexBinary(), args, {
      cwd: directory,
      env: subscriptionOnlyEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, CODEX_TIMEOUT_MS);
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const progress = eventProgress(event);
        const finalResponse = completedAgentMessage(event);
        const threadId = event.type === "thread.started" && typeof event.thread_id === "string"
          ? event.thread_id
          : undefined;
        if (progress || finalResponse || threadId) {
          void patchJob({
            ...(progress ? { progress } : {}),
            ...(finalResponse ? { finalResponse } : {}),
            ...(threadId ? { threadId } : {}),
          });
        }
      } catch {
        // Keep the job running if Codex writes a non-JSON diagnostic line.
      }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_000); });

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer);
    await persistence;
    if (timedOut) throw new Error("Codexの画像編集が20分以内に完了しませんでした");
    if (exit.code !== 0) {
      const detail = current.finalResponse || stderr.trim().split("\n").slice(-4).join("\n");
      throw new Error(detail || `Codexが終了しました（code ${exit.code ?? exit.signal ?? "unknown"}）`);
    }

    const output = await readFile(outputPath);
    assertPng(output, true);
    const finalResponse = current.finalResponse
      || await readFile(finalMessagePath, "utf8").catch(() => "修正画像を生成しました");
    await patchJob({
      status: "completed",
      progress: "修正画像が完成しました",
      outputUrl: `/codex-edits/${encodeURIComponent(jobId)}/output.png`,
      finalResponse: finalResponse.trim().slice(0, 4_000),
      error: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codexの画像編集に失敗しました";
    await patchJob({
      status: "failed",
      progress: "修正画像を生成できませんでした",
      error: message.slice(0, 2_000),
    }).catch(() => undefined);
  } finally {
    activeJobIds.delete(jobId);
  }
}

export function startCodexEdit(jobId: string) {
  if (activeJobIds.size > 0 || activeJobIds.has(jobId)) return false;
  activeJobIds.add(jobId);
  void runCodexEdit(jobId);
  return true;
}

export async function codexEditFileExists(jobId: string, fileName: string) {
  return stat(getCodexEditFile(jobId, fileName)).then((info) => info.isFile()).catch(() => false);
}
