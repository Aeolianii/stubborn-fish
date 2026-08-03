import { describe, expect, it } from "vitest";

import {
  createFallbackStoryAgent,
  createMemoryStorage
} from "./helpers/aquarium-test-runtime.js";

const API_NAMES = [
  "init",
  "getViewModel",
  "subscribe",
  "feedFish",
  "openAddFlow",
  "selectInputImage",
  "generateCutout",
  "cancelCutout",
  "confirmAddObject",
  "setViewing",
  "toggleBackground",
  "toggleSound",
  "setObjectState",
  "setObjectScale",
  "removeObject",
  "setFishScale",
  "removeFish",
  "setDecorScale",
  "removeDecor",
  "upgradeCapacity",
  "purchaseUnlock",
  "chooseMaturity",
  "startJourney",
  "openOfflineEvent",
  "resolveEventChoice",
  "createEventPoster",
  "createPoster",
  "savePoster",
  "saveNow"
];

describe("stable AquariumAPI contract", () => {
  it("exposes exactly the frozen 29 functions with stable result envelopes", async () => {
    globalThis.AquariumCore.resetForTests();
    globalThis.AquariumCore.configure({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 50_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });

    expect(Object.keys(globalThis.AquariumAPI)).toEqual(API_NAMES);
    API_NAMES.forEach((name) => {
      expect(globalThis.AquariumAPI[name]).toBeTypeOf("function");
    });

    const init = await globalThis.AquariumAPI.init();
    expect(init).toMatchObject({
      ok: true,
      viewModel: {
        ready: true,
        feed: 200,
        income: {
          activeFishCount: 1,
          multiplier: 1.4965
        },
        fishCards: expect.arrayContaining([
          expect.objectContaining({ id: "fish-1", affection: 99 })
        ])
      }
    });
    expect(init.viewModel.fishCards[0]).toMatchObject({
      effectiveEventCount: 2,
      eventCount: 2,
      canStartJourney: false
    });

    const events = [];
    const unsubscribe = globalThis.AquariumAPI.subscribe((event) => events.push(event));
    const fed = await globalThis.AquariumAPI.feedFish("fish-1");
    expect(fed).toMatchObject({
      ok: true,
      data: {
        fishId: "fish-1",
        spent: 4,
        previousAffection: 99,
        affectionGained: 1,
        growth: 100,
        affection: 100,
        mature: true,
        matured: true
      },
      viewModel: {
        feed: 196
      }
    });
    expect(events.map((event) => event.type)).toEqual([
      "state:changed",
      "maturity:ready"
    ]);

    const missing = await globalThis.AquariumAPI.openOfflineEvent("missing");
    expect(missing).toMatchObject({
      ok: false,
      code: "EVENT_NOT_FOUND",
      message: expect.any(String),
      viewModel: { ready: true }
    });
    unsubscribe();
    globalThis.AquariumCore.resetForTests();
  });

  it("resolves every public async function without leaking an exception", async () => {
    globalThis.AquariumCore.resetForTests();
    globalThis.AquariumCore.configure({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 60_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await globalThis.AquariumAPI.init();
    const calls = [
      ["feedFish", ["fish-1"]],
      ["openAddFlow", []],
      ["selectInputImage", [null]],
      ["generateCutout", [{}]],
      ["cancelCutout", []],
      ["confirmAddObject", [{}]],
      ["setViewing", [true]],
      ["toggleBackground", []],
      ["toggleSound", []],
      ["setObjectState", ["missing", "bottom"]],
      ["setObjectScale", ["missing", 1]],
      ["removeObject", ["missing"]],
      ["setFishScale", ["fish-1", 0.12]],
      ["removeFish", ["missing"]],
      ["setDecorScale", ["missing", 1]],
      ["removeDecor", ["missing"]],
      ["upgradeCapacity", []],
      ["purchaseUnlock", ["decor", "stone-cave"]],
      ["chooseMaturity", ["fish-1", "stay"]],
      ["startJourney", ["fish-1"]],
      ["openOfflineEvent", ["missing"]],
      ["resolveEventChoice", ["missing", "missing"]],
      ["createEventPoster", ["missing"]],
      ["createPoster", []],
      ["savePoster", []],
      ["saveNow", []]
    ];

    for (const [name, args] of calls) {
      const result = await globalThis.AquariumAPI[name](...args);
      expect(result, name).toEqual(expect.objectContaining({
        ok: expect.any(Boolean),
        viewModel: expect.any(Object)
      }));
      if (!result.ok) {
        expect(result.code, name).toBeTypeOf("string");
        expect(result.message, name).toBeTypeOf("string");
      }
    }
    globalThis.AquariumCore.resetForTests();
  });
});
