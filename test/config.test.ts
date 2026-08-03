import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads the Seedream and storage settings from environment variables", () => {
    const config = loadConfig({
      ARK_API_KEY: "test-key",
      SEEDREAM_BASE_URL: "https://example.invalid/api/v3/",
      SEEDREAM_MODEL: "ep-test",
      SEEDREAM_TIMEOUT_MS: "90000",
      TEMP_STORAGE_DIR: "./data/test",
      TEMP_STORAGE_TTL_MINUTES: "45",
      MAX_UPLOAD_MB: "4"
    });

    expect(config.seedream).toEqual({
      apiKey: "test-key",
      baseUrl: "https://example.invalid/api/v3",
      model: "ep-test",
      timeoutMs: 90_000
    });
    expect(config.vision).toEqual({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-2-1-turbo-260628",
      timeoutMs: 120_000
    });
    expect(config.story).toEqual({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-2-1-turbo-260628",
      timeoutMs: 12_000
    });
    expect(config.storage.ttlMs).toBe(45 * 60_000);
    expect(config.upload.maxBytes).toBe(4 * 1024 * 1024);
  });

  it("uses the configured Seedream 5.0 model by default", () => {
    const config = loadConfig({
      ARK_API_KEY: "test-key"
    });

    expect(config.seedream.model).toBe(
      "doubao-seedream-5-0-260128"
    );
  });

  it("loads explicit Ark vision grounding settings", () => {
    const config = loadConfig({
      ARK_API_KEY: "test-key",
      ARK_VISION_BASE_URL: "https://vision.example.test/api/v3/",
      ARK_VISION_MODEL: "ep-vision-test",
      ARK_VISION_TIMEOUT_MS: "12000"
    });

    expect(config.vision).toEqual({
      apiKey: "test-key",
      baseUrl: "https://vision.example.test/api/v3",
      model: "ep-vision-test",
      timeoutMs: 12_000
    });
  });

  it("loads explicit Ark story generation settings", () => {
    const config = loadConfig({
      ARK_API_KEY: "test-key",
      ARK_STORY_BASE_URL: "https://story.example.test/api/v3/",
      ARK_STORY_MODEL: "ep-story-test",
      ARK_STORY_TIMEOUT_MS: "9000"
    });

    expect(config.story).toEqual({
      apiKey: "test-key",
      baseUrl: "https://story.example.test/api/v3",
      model: "ep-story-test",
      timeoutMs: 9_000
    });
  });

  it("keeps SEEDREAM_API_KEY as a backwards-compatible fallback", () => {
    const config = loadConfig({
      SEEDREAM_API_KEY: "legacy-test-key"
    });

    expect(config.seedream.apiKey).toBe("legacy-test-key");
  });

  it("fails fast when the API key is missing", () => {
    expect(() => loadConfig({})).toThrow(/ARK_API_KEY/);
  });

  it("rejects invalid numeric settings", () => {
    expect(() =>
      loadConfig({
        ARK_API_KEY: "test-key",
        MAX_UPLOAD_MB: "zero"
      })
    ).toThrow(/MAX_UPLOAD_MB/);
  });
});
