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

const audioRoutes: ReadonlyArray<readonly [string, string]> = [
  ["/game/assets/sfx/ambient/bubbles.wav", "audio/wav"],
  ["/game/assets/sfx/ambient/gentle-stream.mp3", "audio/mpeg"],
  ["/game/assets/sfx/ambient/water-flow.mp3", "audio/mpeg"],
  ["/game/assets/sfx/interaction/feed.mp3", "audio/mpeg"],
  ["/game/assets/sfx/interaction/fish-enter.mp3", "audio/mpeg"],
  ["/game/assets/sfx/interaction/fish-swim.mp3", "audio/mpeg"],
  ["/game/assets/sfx/interaction/ui-click.mp3", "audio/mpeg"],
  ...Array.from({ length: 12 }, (_, index) => [
    `/game/assets/sfx/interaction/coins/coin-${String(index + 1).padStart(2, "0")}.ogg`,
    "audio/ogg"
  ] as const)
];

describe("aquarium audio routes", () => {
  it("serves the local sound manager and every bundled sound effect", async () => {
    const app = await buildApp({ config });
    const manager = await app.inject({ method: "GET", url: "/game/js/sound-manager.js" });
    expect(manager.statusCode).toBe(200);
    expect(manager.headers["content-type"]).toContain("text/javascript");
    expect(manager.body).toContain("root.SoundManager");

    for (const [url, contentType] of audioRoutes) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"], url).toBe(contentType);
      expect(response.rawPayload.length, url).toBeGreaterThan(1_000);
    }

    await app.close();
  });
});
