import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  ObjectGroundingServiceContract
} from "../src/services/object-grounding-service.js";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);

const config: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000
  },
  vision: {
    apiKey: "test-key",
    baseUrl: "https://example.invalid/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 120_000
  },
  upload: {
    maxBytes: 5 * 1024 * 1024
  }
};

function multipartBody(boundary: string): Buffer {
  return Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="description"',
      "",
      "画面中央的红色玩具鱼",
      `--${boundary}`,
      'Content-Disposition: form-data; name="subjectType"',
      "",
      "other",
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="test.png"',
      "Content-Type: image/png",
      "",
      "fake-png",
      `--${boundary}--`,
      ""
    ].join("\r\n")
  );
}

describe("standalone share server", () => {
  it("serves the entry page and health check", async () => {
    const groundingService: ObjectGroundingServiceContract = {
      locate: vi.fn()
    };
    const app = await buildApp({
      config,
      groundingService,
      publicDirectory: packageRoot
    });

    const page = await app.inject({ method: "GET", url: "/" });
    const health = await app.inject({ method: "GET", url: "/health" });

    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("拍摄你想要的物品");
    expect(health.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("accepts the photo grounding request", async () => {
    const locate = vi.fn().mockResolvedValue({
      targetLabel: "玩具鱼",
      bbox: { xMin: 0.1, yMin: 0.1, xMax: 0.9, yMax: 0.9 },
      center: { x: 0.5, y: 0.5 },
      polygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 }
      ],
      confidence: 0.9
    });
    const app = await buildApp({
      config,
      groundingService: { locate },
      publicDirectory: packageRoot
    });
    const boundary = "----camera-cutout-test";

    const response = await app.inject({
      method: "POST",
      url: "/api/object-groundings",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload: multipartBody(boundary)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().grounding.targetLabel).toBe("玩具鱼");
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "画面中央的红色玩具鱼",
        subjectType: "other",
        mimeType: "image/png"
      })
    );

    await app.close();
  });
});
