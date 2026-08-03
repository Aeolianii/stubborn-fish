import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = {
  server: { host: "127.0.0.1", port: 3000 },
  seedream: {
    apiKey: "test-key",
    baseUrl: "https://example.invalid/api/v3",
    model: "doubao-seedream-5-0-pro-260628",
    timeoutMs: 5_000
  },
  vision: {
    apiKey: "test-key",
    baseUrl: "https://example.invalid/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 5_000
  },
  story: {
    apiKey: "test-key",
    baseUrl: "https://example.invalid/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 12_000
  },
  storage: {
    directory: "D:/test/fish-game-cutouts",
    ttlMs: 60_000
  },
  upload: { maxBytes: 5 * 1024 * 1024 }
};

const presetFishUrls = [
  "/game/assets/preset-fish/big-dog-fish.png",
  "/game/assets/preset-fish/cat-fish.png",
  "/game/assets/preset-fish/milk-cat-fish.png",
  "/game/assets/preset-fish/milk-fish.png",
  "/game/assets/preset-fish/tingquan-fish.png"
];

describe("preset fish static routes", () => {
  it("serves all five preset fish as local PNG assets", async () => {
    const app = await buildApp({ config });

    for (const url of presetFishUrls) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"], url).toBe("image/png");
      expect(response.rawPayload.subarray(0, 8), url).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      );
    }

    await app.close();
  });
});
