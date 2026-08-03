import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("share package config", () => {
  it("uses the confirmed vision model by default", () => {
    const config = loadConfig({
      ARK_API_KEY: "test-key"
    });

    expect(config.vision.model).toBe(
      "doubao-seed-2-1-turbo-260628"
    );
    expect(config.server).toEqual({
      host: "127.0.0.1",
      port: 3000
    });
  });

  it("requires an API key", () => {
    expect(() => loadConfig({})).toThrow(
      "缺少必需环境变量 ARK_API_KEY"
    );
  });
});
