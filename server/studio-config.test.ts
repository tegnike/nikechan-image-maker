import { describe, expect, it } from "vitest";
import { parseStudioConfig } from "./studio-config";

const validConfig = {
  version: 1,
  studioName: "Test Studio",
  channelName: "Test Channel",
  defaultProjectName: "New stream thumbnail",
  category: "chat stream",
  title: {
    primary: "TALK",
    splitParts: ["T", "K"],
    supportCopies: { stream: "LIVE", reading: "CHAT" },
    layouts: ["side-by-side", "split-character", "diagonal-pair"],
  },
  character: {
    name: "Test Character",
    referenceImages: ["references/model-sheet.png"],
    prompt: "Keep the reference character identity.",
  },
  referenceSearchQueries: ["VTuber chat thumbnail"],
  generation: {
    themeSetsPerCycle: 2,
    characterAssetsPerCycle: 1,
    intervalMinutes: 15,
  },
};

describe("studio config", () => {
  it("accepts user-selected workflow and title settings", () => {
    expect(parseStudioConfig(validConfig)).toMatchObject({
      category: "chat stream",
      title: { primary: "TALK", splitParts: ["T", "K"] },
      generation: { themeSetsPerCycle: 2, characterAssetsPerCycle: 1, intervalMinutes: 15 },
    });
  });

  it("requires split parts when a split layout is enabled", () => {
    expect(() => parseStudioConfig({
      ...validConfig,
      title: { ...validConfig.title, splitParts: undefined },
    })).toThrow("title.splitParts is required");
  });

  it("rejects placeholder-free but incomplete configuration", () => {
    expect(() => parseStudioConfig({ ...validConfig, category: "" })).toThrow("category is required");
  });

  it("requires a generated support copy for layouts that use one", () => {
    expect(() => parseStudioConfig({
      ...validConfig,
      title: { ...validConfig.title, supportCopies: {} },
    })).toThrow("title.supportCopies requires at least one value");
  });
});
