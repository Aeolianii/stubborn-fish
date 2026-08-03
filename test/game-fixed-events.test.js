import { describe, expect, it } from "vitest";

import {
  createMemoryStorage
} from "./helpers/aquarium-test-runtime.js";

function addSecondFish(state, name = "青团") {
  state.fish.push({
    id: "fish-2",
    type: "fish",
    name,
    affection: 20,
    effectiveEventIds: [],
    effectiveEventCount: 0,
    active: true,
    source: "preset"
  });
}

function addObject(state) {
  state.objects.push({
    id: "object-1",
    type: "object",
    name: "旧纽扣",
    state: "bottom"
  });
}

describe("fixed aquarium events", () => {
  it("registers seven valid fixed events with explicit triggers", () => {
    const fixed = globalThis.AquariumStoryTemplates.list()
      .filter((template) => template.storyMode === "fixed");

    expect(fixed).toHaveLength(7);
    fixed.forEach((template) => {
      expect(template.triggers.length).toBeGreaterThan(0);
      expect(globalThis.AquariumStoryTemplates.validate(template).valid).toBe(true);
    });
    expect(fixed.find((template) => (
      template.id === "fixed-offline-yellow-sponge-starfish-01"
    ))).toMatchObject({
      fallbackTitle: "黄色海绵与粉色海星",
      fallbackBody: expect.stringContaining("正准备去抓水母")
    });
  });

  it("alternates fixed and generated-template stories while randomizing inside each group", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    addSecondFish(state, "小青");
    addObject(state);

    const first = globalThis.AquariumEventDirector.createOnlineEvent(state, 2_000);
    const second = globalThis.AquariumEventDirector.createOnlineEvent(state, 3_000);
    const third = globalThis.AquariumEventDirector.createOnlineEvent(state, 4_000);

    expect([first.storyMode, second.storyMode, third.storyMode])
      .toEqual(["fixed", "template", "fixed"]);
    expect(first.status).toBe("fixed");
    expect(first.body).toContain("月白");
    expect(first.body).toContain("小青");
  });

  it("creates a non-progression feeding story only when two fish are present", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    expect(globalThis.AquariumEventDirector.createFeedEvent(state, "fish-1", 2_000))
      .toBeNull();

    addSecondFish(state, "小青");
    const event = globalThis.AquariumEventDirector.createFeedEvent(
      state,
      "fish-1",
      2_001
    );

    expect(event).toMatchObject({
      source: "feed",
      storyMode: "fixed",
      templateId: "fixed-feed-food-race-01",
      effective: false,
      reward: 0,
      status: "fixed"
    });
    expect(event.body).toContain("月白和小青");
  });

  it("returns fixed feeding text from the core without sending it to the story agent", async () => {
    let generationCount = 0;
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 3_000,
      autoTimers: false,
      storyAgent: {
        generate() {
          generationCount += 1;
          return Promise.reject(new Error("fixed event should not be generated"));
        }
      }
    });
    await core.init();
    addSecondFish(core.getStateForTesting(), "小青");

    const result = await core.feedFish("fish-1");

    expect(result.data.event).toMatchObject({
      source: "feed",
      storyMode: "fixed",
      status: "fixed"
    });
    expect(result.data.event.immediateText).toContain("月白和小青");
    expect(generationCount).toBe(0);
    core.destroy();
  });

  it("applies both positive and negative algae-coin outcomes across fixed offline events", () => {
    const rewards = [];
    for (let index = 0; index < 80; index += 1) {
      const state = globalThis.AquariumStateStore.createDefaultState(1_000 + index);
      state.stateId = `fixed-currency-${index}`;
      addObject(state);
      const created = globalThis.AquariumEventDirector.settleOfflineEvents(
        state,
        8 * 60 * 60 * 1000,
        10_000 + index
      );
      const fixed = created.find((event) => event.storyMode === "fixed");
      if (fixed) rewards.push(fixed.reward);
    }

    expect(rewards.some((reward) => reward < 0)).toBe(true);
    expect(rewards.some((reward) => reward > 0)).toBe(true);
  });

  it("keeps fixed offline events out of short background returns", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    addSecondFish(state);
    addObject(state);

    const created = globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      1,
      1_001
    );

    expect(created).toHaveLength(3);
    expect(created.every((event) => event.storyMode === "template")).toBe(true);
  });
});
