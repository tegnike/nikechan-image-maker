import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedSupportCopyPreset, StudioConfig, TitleLayoutPreset } from "../src/types";

const SUPPORT_SLOTS: GeneratedSupportCopyPreset[] = ["stream", "casual", "reading", "english"];
const CONFIGURABLE_LAYOUTS = new Set<TitleLayoutPreset>(["side-by-side", "split-character", "diagonal-pair"]);

export const STUDIO_CONFIG_PATH = path.resolve(
  process.env.STUDIO_CONFIG_PATH || path.resolve(import.meta.dirname, "..", "studio.config.json"),
);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("studio.config.json must contain an object");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required in studio.config.json`);
  return value.trim();
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || !value.length || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`${field} must be a non-empty string array in studio.config.json`);
  }
  return value.map((item) => String(item).trim());
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

export function parseStudioConfig(input: unknown): StudioConfig {
  const root = record(input);
  if (root.version !== 1) throw new Error("studio.config.json version must be 1");
  const title = record(root.title);
  const character = record(root.character);
  const generation = record(root.generation);
  const supportInput = record(title.supportCopies);
  const supportCopies = Object.fromEntries(SUPPORT_SLOTS.flatMap((slot) => {
    const value = supportInput[slot];
    return typeof value === "string" && value.trim() ? [[slot, value.trim()]] : [];
  })) as StudioConfig["title"]["supportCopies"];
  const layouts = stringList(title.layouts, "title.layouts");
  if (!layouts.every((layout) => CONFIGURABLE_LAYOUTS.has(layout as TitleLayoutPreset))) {
    throw new Error("title.layouts contains an unsupported layout");
  }
  const splitParts = title.splitParts === undefined
    ? undefined
    : stringList(title.splitParts, "title.splitParts");
  if (splitParts && splitParts.length !== 2) throw new Error("title.splitParts must contain exactly two strings");
  if (layouts.some((layout) => layout === "split-character" || layout === "diagonal-pair") && !splitParts) {
    throw new Error("title.splitParts is required for split-character or diagonal-pair");
  }
  if (layouts.some((layout) => layout === "side-by-side" || layout === "diagonal-pair") && !Object.keys(supportCopies).length) {
    throw new Error("title.supportCopies requires at least one value for side-by-side or diagonal-pair");
  }

  return {
    version: 1,
    studioName: requiredString(root.studioName, "studioName"),
    channelName: requiredString(root.channelName, "channelName"),
    defaultProjectName: requiredString(root.defaultProjectName, "defaultProjectName"),
    category: requiredString(root.category, "category"),
    title: {
      primary: requiredString(title.primary, "title.primary"),
      ...(splitParts ? { splitParts: [splitParts[0], splitParts[1]] as [string, string] } : {}),
      supportCopies,
      layouts: layouts as StudioConfig["title"]["layouts"],
    },
    character: {
      name: requiredString(character.name, "character.name"),
      referenceImages: stringList(character.referenceImages, "character.referenceImages"),
      prompt: requiredString(character.prompt, "character.prompt"),
    },
    referenceSearchQueries: stringList(root.referenceSearchQueries, "referenceSearchQueries"),
    generation: {
      themeSetsPerCycle: boundedInteger(generation.themeSetsPerCycle, "generation.themeSetsPerCycle", 1, 6),
      characterAssetsPerCycle: boundedInteger(generation.characterAssetsPerCycle, "generation.characterAssetsPerCycle", 0, 6),
      intervalMinutes: boundedInteger(generation.intervalMinutes, "generation.intervalMinutes", 5, 1440),
    },
  };
}

export async function loadStudioConfig() {
  let source: string;
  try {
    source = await readFile(STUDIO_CONFIG_PATH, "utf8");
  } catch {
    throw new Error("studio.config.json is required. Copy studio.config.example.json and complete setup with Codex.");
  }
  try {
    return parseStudioConfig(JSON.parse(source) as unknown);
  } catch (error) {
    if (error instanceof Error && error.message.includes("studio.config.json")) throw error;
    throw new Error("studio.config.json must contain valid JSON");
  }
}
