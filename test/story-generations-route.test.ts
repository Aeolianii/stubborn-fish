import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  CutoutServiceContract
} from "../src/services/cutout-service.js";
import type {
  ObjectGroundingServiceContract
} from "../src/services/object-grounding-service.js";
import type {
  StoryGenerationServiceContract
} from "../src/services/ark-story-client.js";

const config: AppConfig = {
  server: { host: "127.0.0.1", port: 3000 },
  seedream: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seedream-5-0-pro-260628",
    timeoutMs: 5_000
  },
  vision: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 8_000
  },
  story: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 12_000
  },
  storage: {
    directory: "D:/test/story-generations",
    ttlMs: 60_000
  },
  upload: { maxBytes: 1024 * 1024 }
};

function fakeCutoutService(): CutoutServiceContract {
  return {
    create: vi.fn(),
    get: vi.fn(),
    getImage: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
}

function fakeGroundingService(): ObjectGroundingServiceContract {
  return {
    locate: vi.fn()
  };
}

describe("story generation route", () => {
  it("forwards a bounded prompt to the Ark story service", async () => {
    const content = JSON.stringify({
      title: "水下屋檐",
      body: "月白绕着旧车票慢慢游了两圈，最后停在它的下方。水面落下来的光一闪一闪，像给这段安静相遇留了一个小小记号。",
      posterLine: "走过的路，也能在水里留下屋檐。"
    });
    const storyService: StoryGenerationServiceContract = {
      generate: vi.fn().mockResolvedValue(content)
    };
    const app = await buildApp({
      config,
      service: fakeCutoutService(),
      groundingService: fakeGroundingService(),
      storyService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/story-generations",
      payload: { prompt: "为月白和旧车票写一个克制的故事。" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: content });
    expect(storyService.generate).toHaveBeenCalledWith({
      prompt: "为月白和旧车票写一个克制的故事。"
    });

    await app.close();
  });

  it.each([
    [{ prompt: " " }, "STORY_PROMPT_REQUIRED"],
    [{ prompt: "水".repeat(8_001) }, "STORY_PROMPT_TOO_LONG"],
    [{ prompt: 42 }, "STORY_PROMPT_REQUIRED"]
  ])("rejects an invalid story prompt", async (payload, code) => {
    const storyService: StoryGenerationServiceContract = {
      generate: vi.fn()
    };
    const app = await buildApp({
      config,
      service: fakeCutoutService(),
      groundingService: fakeGroundingService(),
      storyService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/story-generations",
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(code);
    expect(storyService.generate).not.toHaveBeenCalled();

    await app.close();
  });
});
