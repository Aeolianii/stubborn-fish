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
    directory: "D:/test/rest-cutouts",
    ttlMs: 60_000
  },
  upload: { maxBytes: 1024 * 1024 }
};

describe("REST image grounding test page", () => {
  it("serves the image-to-text cutout UI without video task routes", async () => {
    const app = await buildApp({ config });

    expect(
      app.hasRoute({
        method: "POST",
        url: "/api/video-cutouts/tasks"
      })
    ).toBe(false);

    const page = await app.inject({
      method: "GET",
      url: "/rest-test"
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("拍摄你想要的物品");
    expect(page.body).toContain(
      "内容由AI生成，使用时请遵守抖音平台公约"
    );
    expect(page.body).not.toMatch(
      /测试|本地|REST|定位 JSON|Canvas|Doubao Seed/
    );
    expect(page.body).not.toContain("AI 识别区域");
    expect(page.body).not.toContain("localization-preview");
    expect(page.body).toContain('id="step-capture"');
    expect(page.body).toContain('id="step-generate" hidden');
    expect(page.body).toContain('id="step-aquarium" hidden');
    expect(page.body).toContain('id="generating-state"');
    expect(page.body).toContain('id="subject-type"');
    expect(page.body).toContain('<option value="" selected disabled>');
    expect(page.body).toContain('<option value="person">人物</option>');
    expect(page.body).toContain('<option value="animal">动物</option>');
    expect(page.body).toContain('<option value="plant">植物</option>');
    expect(page.body).toContain('<option value="other">其他</option>');
    expect(page.body).toContain(
      "/rest-test/js/object-segmentation.js?v=solid-polygon-1"
    );

    const segmentationModule = await app.inject({
      method: "GET",
      url: "/rest-test/js/object-segmentation.js"
    });
    expect(segmentationModule.statusCode).toBe(200);
    expect(segmentationModule.body).toContain("refineObjectMask");

    const mainModule = await app.inject({
      method: "GET",
      url: "/rest-test/js/main.js"
    });
    expect(mainModule.body).toContain("showStep(2)");
    expect(mainModule.body).toContain("showStep(3)");
    expect(mainModule.body).toContain(
      'form.append("subjectType", subjectType)'
    );
    expect(mainModule.body).toContain("elements.subjectType.value &&");
    expect(mainModule.body).toMatch(
      /elements\.subjectType\.addEventListener\(\s*"change"/
    );

    await app.close();
  });
});
