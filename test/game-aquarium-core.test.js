import { describe, expect, it } from "vitest";

import {
  createFallbackStoryAgent,
  createMemoryStorage
} from "./helpers/aquarium-test-runtime.js";

describe("aquarium gameplay core", () => {
  it("preserves Canvas selection IDs in the next ViewModel", async () => {
    const storage = createMemoryStorage();
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => 9_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await core.init();
    const fish = core.getStateForTesting().fish;

    core.syncSceneSnapshot({
      fish,
      objects: [],
      decor: [],
      selected: {
        fishId: "fish-2",
        objectId: "memory-selected",
        decorId: "rock-selected"
      }
    }, { silent: true });

    expect(core.getViewModel().selected).toEqual({
      fishId: "fish-2",
      objectId: "memory-selected",
      decorId: "rock-selected"
    });
    await core.saveNow();
    core.destroy();

    const reloadedCore = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => 9_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await reloadedCore.init();
    expect(reloadedCore.getViewModel().selected).toEqual({
      fishId: "fish-2",
      objectId: "memory-selected",
      decorId: "rock-selected"
    });
    reloadedCore.destroy();
  });

  it("protects feed, two-event affection, capacity and one-time journey rewards", async () => {
    let now = 10_000;
    const storage = createMemoryStorage();
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await core.init();
    const state = core.getStateForTesting();
    const initialFishCard = core.getViewModel().fishCards[0];
    expect(initialFishCard.eventCount).toBe(initialFishCard.effectiveEventCount);
    expect(initialFishCard.canStartJourney).toBe(false);
    expect(initialFishCard).toMatchObject({
      sprite: 0,
      atlas: "original",
      assetKind: "atlas-fish",
      iconUrl: "/game/assets/fish-atlas.png"
    });
    state.fish.forEach((fish) => {
      fish.growth = 0;
      fish.affection = 0;
      fish.effectiveEventIds = [];
      fish.effectiveEventCount = 0;
      fish.mature = false;
    });
    state.fish.push({
      id: "fish-2",
      type: "fish",
      name: "青团",
      growth: 0,
      affection: 0,
      effectiveEventIds: [],
      effectiveEventCount: 0,
      mature: false,
      active: true,
      source: "preset"
    });
    state.objects.push({
      id: "memory-1",
      type: "object",
      name: "旧车票",
      state: "bottom",
      source: "memory",
      x: 0.5,
      y: 0.82,
      capturedAt: "",
      capturedPlace: "",
      entryEventId: null
    });

    const first = await core.notifyObjectSettled("memory-1");
    expect(first.ok).toBe(true);
    expect(state.fish[0]).toMatchObject({
      growth: 50,
      affection: 50,
      effectiveEventCount: 1,
      mature: false
    });
    const duplicate = await core.notifyObjectSettled("memory-1");
    expect(duplicate.data.duplicate).toBe(true);
    expect(state.fish[0].effectiveEventCount).toBe(1);

    state.nextOnlineEventAt = now;
    const onlineTick = core.sceneTick(now);
    const onlineStory = core.getViewModel().latestStory;
    expect(onlineStory).toMatchObject({
      id: onlineTick.event.id,
      source: "online",
      participantA: {
        id: onlineTick.event.participantAId,
        name: expect.any(String)
      },
      participantB: {
        id: onlineTick.event.participantBId,
        name: expect.any(String)
      }
    });
    expect(state.fish[0]).toMatchObject({
      growth: 100,
      affection: 100,
      effectiveEventCount: 2,
      mature: true
    });

    const secondFishId = state.fish[1].id;
    await core.feedFish(secondFishId);
    await core.feedFish(secondFishId);
    expect(state.fish[1]).toMatchObject({
      growth: 60,
      affection: 60,
      effectiveEventCount: 1,
      mature: false
    });

    const feedBeforeChoice = state.feed;
    const stay = await core.chooseMaturity(state.fish[0].id, "stay");
    expect(stay.ok).toBe(true);
    expect(stay.data.reward).toBeGreaterThanOrEqual(30);
    expect(stay.data.reward).toBeLessThanOrEqual(60);
    expect(state.fish[0].active).toBe(true);
    expect(core.getViewModel().fishCards[0].canStartJourney).toBe(true);
    const feedAfterChoice = state.feed;
    expect(feedAfterChoice).toBe(feedBeforeChoice + stay.data.reward);

    now += 1_000;
    const journey = await core.startJourney(state.fish[0].id);
    expect(journey.ok).toBe(true);
    expect(journey.data.reward).toBe(0);
    expect(state.feed).toBe(feedAfterChoice);
    expect(state.fish[0].active).toBe(false);

    state.feed = 500;
    expect((await core.upgradeCapacity()).data.limit).toBe(5);
    expect((await core.upgradeCapacity()).data.limit).toBe(7);
    expect((await core.upgradeCapacity()).data.limit).toBe(9);
    expect(await core.upgradeCapacity()).toMatchObject({
      ok: false,
      code: "CAPACITY_MAX"
    });
    core.destroy();
  });

  it("tracks purchased catalog quantities and consumes one item per placement", async () => {
    const storage = createMemoryStorage();
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => 12_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await core.init();
    const state = core.getStateForTesting();
    state.feed = 500;

    expect((await core.purchaseUnlock("fish", "betta")).ok).toBe(true);
    expect((await core.purchaseUnlock("fish", "betta")).ok).toBe(true);
    expect(core.getViewModel().shop.fish.find((item) => item.id === "betta"))
      .toMatchObject({ owned: true, quantity: 2 });

    expect((await core.consumeOwnedCatalogItem("fish", "betta")).data.quantity).toBe(1);
    expect((await core.consumeOwnedCatalogItem("fish", "betta")).data.quantity).toBe(0);
    expect(await core.consumeOwnedCatalogItem("fish", "betta")).toMatchObject({
      ok: false,
      code: "ITEM_NOT_OWNED"
    });
    expect(core.getViewModel().shop.fish.find((item) => item.id === "betta"))
      .toMatchObject({ owned: false, quantity: 0 });
    core.destroy();

    const reloadedCore = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => 13_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await reloadedCore.init();
    expect(reloadedCore.getViewModel().shop.fish.find((item) => item.id === "betta"))
      .toMatchObject({ owned: false, quantity: 0 });
    reloadedCore.destroy();
  });

  it("offers the five user preset fish for 200 feed each", async () => {
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 14_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await core.init();
    const state = core.getStateForTesting();
    const expectedFish = [
      ["big-dog-fish", "大狗鱼", "big-dog-fish.png"],
      ["cat-fish", "猫鱼", "cat-fish.png"],
      ["milk-cat-fish", "奶猫鱼", "milk-cat-fish.png"],
      ["milk-fish", "奶鱼", "milk-fish.png"],
      ["tingquan-fish", "听泉鱼", "tingquan-fish.png"]
    ];
    const shopFish = core.getViewModel().shop.fish;

    expectedFish.forEach(([id, name, fileName]) => {
      expect(shopFish.find((item) => item.id === id)).toMatchObject({
        id,
        name,
        price: 200,
        owned: false,
        quantity: 0,
        iconUrl: `/game/assets/preset-fish/${fileName}`
      });
    });

    state.feed = 1_000;
    for (const [id] of expectedFish) {
      expect(await core.purchaseUnlock("fish", id)).toMatchObject({
        ok: true,
        data: { unlockId: id, spent: 200, quantity: 1 }
      });
    }
    expect(state.feed).toBe(0);
    expect(core.getViewModel().shop.fish.filter((item) => (
      expectedFish.some(([id]) => id === item.id)
    )).every((item) => item.owned && item.quantity === 1)).toBe(true);
    core.destroy();
  });

  it("keeps maturity choices idempotent while allowing stay to journey", async () => {
    let now = 20_000;
    const appliedEffects = [];
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent(),
      sceneAdapter: {
        applyEffect(effect) {
          appliedEffects.push(effect);
        }
      }
    });
    await core.init();
    const state = core.getStateForTesting();
    const fish = state.fish[0];
    fish.growth = 100;
    fish.effectiveEventIds = ["event-1", "event-2"];
    fish.effectiveEventCount = 2;
    fish.mature = true;

    const firstStay = await core.chooseMaturity(fish.id, "stay");
    const secondStay = await core.chooseMaturity(fish.id, "stay");
    expect(firstStay.data.reward).toBeGreaterThanOrEqual(30);
    expect(secondStay.data).toMatchObject({ reward: 0, alreadyResolved: true });
    expect(state.stories.filter((story) => story.source === "maturity")).toHaveLength(1);

    now += 1_000;
    const firstJourney = await core.chooseMaturity(fish.id, "journey");
    const secondJourney = await core.chooseMaturity(fish.id, "journey");
    expect(firstJourney.data.reward).toBe(0);
    expect(secondJourney.data).toMatchObject({ reward: 0, alreadyResolved: true });
    expect(state.journeys.filter((journey) => journey.fishId === fish.id)).toHaveLength(1);
    expect(state.stories.filter((story) => story.source === "maturity")).toHaveLength(2);
    expect(appliedEffects.filter((effect) => effect.type === "REMOVE_FISH_FROM_SCENE"))
      .toHaveLength(1);
    core.destroy();
  });

  it("allows choosing a new image after a failed cutout generation", async () => {
    let attempts = 0;
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 30_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent(),
      cutoutAdapter: {
        async generate() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary vision failure");
          return {
            transparentBlob: new Blob(["test"], { type: "image/png" }),
            canvas: { toDataURL: () => "data:image/png;base64,dGVzdA==" },
            targetLabel: "stone"
          };
        }
      }
    });
    await core.init();
    const firstFile = new Blob(["first"], { type: "image/png" });
    const secondFile = new Blob(["second"], { type: "image/webp" });

    expect((await core.selectInputImage(firstFile)).ok).toBe(true);
    expect(await core.generateCutout({
      description: "first stone",
      subjectType: "other",
      objectName: "first"
    })).toMatchObject({ ok: false, code: "CUTOUT_FAILED" });

    expect((await core.selectInputImage(secondFile)).ok).toBe(true);
    expect(await core.generateCutout({
      description: "second stone",
      subjectType: "other",
      objectName: "second"
    })).toMatchObject({ ok: true });
    expect(attempts).toBe(2);
    core.destroy();
  });

  it("turns the starter companion's first feeding into a maturity decision", async () => {
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 20_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    const events = [];
    core.subscribe((event) => events.push(event));
    await core.init();

    const result = await core.feedFish("fish-1");

    expect(result).toMatchObject({
      ok: true,
      data: {
        fishId: "fish-1",
        spent: 4,
        growth: 100,
        affection: 100,
        mature: true,
        matured: true
      }
    });
    expect(core.getStateForTesting().feed).toBe(196);
    expect(events).toContainEqual(expect.objectContaining({
      type: "maturity:ready",
      payload: expect.objectContaining({
        fishId: "fish-1",
        affection: 100,
        effectiveEventCount: 2
      })
    }));
    core.destroy();
  });

  it("persists fish removal so a deleted fish cannot be selected for feeding", async () => {
    const storage = createMemoryStorage();
    const createCore = () => globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => 22_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    const core = createCore();
    await core.init();
    const state = core.getStateForTesting();
    state.objects = [{
      id: "object-1",
      type: "object",
      name: "object",
      state: "bottom"
    }];
    globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      globalThis.AquariumEventDirector.OFFLINE_EVENT_INTERVAL_MS,
      22_000
    );
    expect(core.getViewModel().offlineEventBubbles).toHaveLength(1);

    expect((await core.removeFish("fish-1")).ok).toBe(true);
    expect(core.getViewModel().fishCards).toEqual([]);
    expect(core.getViewModel().offlineEventBubbles).toEqual([]);
    expect(state.offlineEvents).toEqual([]);
    expect(state.stories).toEqual([]);
    expect(state.relationships).toEqual({});
    core.destroy();

    const reloadedCore = createCore();
    await reloadedCore.init();
    const feedBefore = reloadedCore.getViewModel().feed;
    expect(await reloadedCore.feedFish()).toMatchObject({
      ok: false,
      code: "FISH_NOT_FOUND"
    });
    expect(reloadedCore.getViewModel()).toMatchObject({
      feed: feedBefore,
      fishCards: [],
      offlineEventBubbles: []
    });
    reloadedCore.destroy();
  });

  it("creates one non-progression story when a preset fish arrives", async () => {
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => 25_000,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    await core.init();
    const state = core.getStateForTesting();
    core.syncSceneSnapshot({
      fish: [
        ...state.fish,
        {
          id: "preset-betta-1",
          type: "fish",
          name: "铜蓝斗鱼",
          growth: 0,
          affection: 0,
          active: true,
          source: "preset"
        }
      ]
    }, { silent: true });

    const result = await core.notifyFishAdded("preset-betta-1");

    expect(result).toMatchObject({
      ok: true,
      data: {
        event: {
          source: "arrival",
          effective: false,
          participantAId: "fish-1",
          participantBId: "preset-betta-1"
        }
      }
    });
    expect(state.fish[0]).toMatchObject({
      affection: 99,
      effectiveEventCount: 2
    });
    expect((await core.notifyFishAdded("preset-betta-1")).data.duplicate).toBe(true);
    core.destroy();
  });

  it("caps offline feed at eight hours and ignores reversed time", () => {
    const economy = globalThis.AquariumEconomy;

    expect(economy.calculateOfflineFeed(0, 10 * 60 * 60 * 1000)).toMatchObject({
      feedEarned: 120,
      capped: true,
      valid: true
    });
    expect(economy.calculateOfflineFeed(5_000, 4_000)).toMatchObject({
      feedEarned: 0,
      valid: false,
      reason: "TIME_REVERSED"
    });
  });
});
