import { afterEach, describe, expect, it } from "vitest";

import "./helpers/aquarium-test-runtime.js";

const originalCatalog = globalThis.AquariumStoryTemplateCatalog.slice();

afterEach(() => {
  globalThis.AquariumStoryTemplateCatalog = originalCatalog.slice();
});

describe("independently maintained story template catalog", () => {
  it("selects a newly added valid template without gameplay code changes", () => {
    globalThis.AquariumStoryTemplateCatalog = [{
      id: "writer-added-template",
      enabled: true,
      eventType: "first-meeting",
      participants: ["fish", "object"],
      weight: 100,
      promptGuide: "故事策划新增的第一次见面。",
      imageHints: [],
      immediatePattern: "{fishName}看见了{objectName}。",
      fallbackTitle: "新模板",
      fallbackBody: "{fishName}看见{objectName}后慢慢游近，又在一小圈水波之外停下，把这次见面安静地记在了今天。",
      fallbackPosterLine: "新的相遇，会自己找到位置。"
    }];

    expect(globalThis.AquariumStoryTemplates.select({
      eventType: "first-meeting",
      participants: ["fish", "object"],
      random: () => 0
    })).toMatchObject({ id: "writer-added-template" });
  });

  it("skips invalid entries and returns a generic fallback when needed", () => {
    globalThis.AquariumStoryTemplateCatalog = [{
      id: "broken",
      enabled: true,
      eventType: "eleventh-type",
      participants: ["fish"],
      weight: 0
    }];

    expect(globalThis.AquariumStoryTemplates.list()).toEqual([]);
    expect(globalThis.AquariumStoryTemplates.select({
      eventType: "first-meeting",
      participants: ["fish", "object"]
    })).toMatchObject({
      generic: true,
      fallbackTitle: expect.any(String),
      fallbackBody: expect.any(String)
    });
  });
});
