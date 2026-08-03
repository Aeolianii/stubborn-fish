import { describe, expect, it } from "vitest";

import {
  createMemoryStorage
} from "./helpers/aquarium-test-runtime.js";

describe("aquarium state store", () => {
  it("starts new players with tutorial funds and a nearly mature companion fish", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(500);

    expect(state).toMatchObject({
      schemaVersion: 2,
      feed: 200
    });
    expect(state.fish[0]).toMatchObject({
      growth: 99,
      affection: 99,
      effectiveEventCount: 2,
      mature: false,
      active: true,
      sprite: 0,
      atlas: "original",
      assetKind: "atlas-fish",
      iconUrl: "/game/assets/fish-atlas.png"
    });
  });

  it("migrates the starter fish away from the legacy four-fish thumbnail atlas", () => {
    const state = globalThis.AquariumStateStore.normalizeState({
      fish: [{
        id: "fish-1",
        name: "月白",
        iconUrl: "/game/assets/default-fish-atlas.png"
      }]
    }, 800);

    expect(state.fish[0]).toMatchObject({
      name: "月白",
      sprite: 0,
      atlas: "original",
      assetKind: "atlas-fish",
      iconUrl: "/game/assets/fish-atlas.png"
    });
  });

  it("recovers the last valid primary snapshot from backup", () => {
    let now = 1_000;
    const storage = createMemoryStorage();
    const store = globalThis.AquariumStateStore.createStateStore({
      storage,
      now: () => now,
      indexedDB: null
    });
    const state = globalThis.AquariumStateStore.createDefaultState(now);

    state.feed = 31;
    store.save(state);
    now += 1_000;
    state.feed = 47;
    store.save(state);
    storage.setItem(globalThis.AquariumStateStore.PRIMARY_KEY, "{broken-json");

    const loaded = store.load();

    expect(loaded.source).toBe("backup");
    expect(loaded.recovered).toBe(true);
    expect(loaded.state.feed).toBe(31);
  });

  it("merges legacy growth and affection into one affection value", () => {
    const state = globalThis.AquariumStateStore.normalizeState({
      fish: [{
        id: "legacy-progress",
        growth: 75,
        affection: 30,
        effectiveEventIds: ["event-1"],
        effectiveEventCount: 1
      }]
    }, 1_500);

    expect(state.fish[0]).toMatchObject({
      growth: 75,
      affection: 75,
      mature: false
    });
  });

  it("migrates the legacy Canvas snapshot without losing memory entities", () => {
    const storage = createMemoryStorage({
      "quiet-aquarium-state-v2": JSON.stringify({
        soundOn: true,
        backgroundId: "classic",
        memoryObjects: [{
          id: "legacy-object",
          name: "旧车票",
          state: "bottom",
          x: 0.4,
          y: 0.8,
          imageKey: "legacy-object-image",
          aspectRatio: 1.4,
          motionProfile: "tail"
        }],
        customFish: [{
          id: "legacy-fish",
          name: "纸鱼",
          x: 0.6,
          y: 0.4,
          imageKey: "legacy-fish-image",
          aspectRatio: 0.8,
          motionProfile: "sway",
          personality: { preferredDepth: 0.4 }
        }]
      })
    });
    const store = globalThis.AquariumStateStore.createStateStore({
      storage,
      now: () => 2_000,
      indexedDB: null
    });

    const loaded = store.load();

    expect(loaded.source).toBe("quiet-aquarium-state-v2");
    expect(loaded.state.schemaVersion).toBe(2);
    expect(loaded.state.objects).toEqual([
      expect.objectContaining({
        id: "legacy-object",
        name: "旧车票",
        imageKey: "legacy-object-image",
        aspectRatio: 1.4,
        motionProfile: "tail"
      })
    ]);
    expect(loaded.state.fish).toContainEqual(
      expect.objectContaining({
        id: "legacy-fish",
        source: "memory",
        imageKey: "legacy-fish-image",
        aspectRatio: 0.8,
        motionProfile: "sway",
        personality: { preferredDepth: 0.4 }
      })
    );
    expect(loaded.state.settings).toMatchObject({
      soundOn: true,
      backgroundId: "classic"
    });
  });

  it("normalizes catalog inventory and migrates legacy unlocks to one owned copy", () => {
    const storage = createMemoryStorage({
      stubborn_fish_state_v1: JSON.stringify({
        schemaVersion: 1,
        feed: 30,
        unlocks: { decor: ["stone-cave"], fish: ["betta"] },
        inventory: {
          decor: { "stone-cave": 3, invalid: -2 },
          fish: { betta: 2.8 }
        }
      })
    });
    const loaded = globalThis.AquariumStateStore.createStateStore({
      storage,
      indexedDB: null,
      now: () => 5_000
    }).load();

    expect(loaded.state.inventory).toEqual({
      decor: { "stone-cave": 3 },
      fish: { betta: 2 }
    });

    const legacyStorage = createMemoryStorage({
      stubborn_fish_state_v1: JSON.stringify({
        schemaVersion: 1,
        unlocks: { decor: ["driftwood"], fish: ["guppy"] }
      })
    });
    const migrated = globalThis.AquariumStateStore.createStateStore({
      storage: legacyStorage,
      indexedDB: null,
      now: () => 6_000
    }).load();
    expect(migrated.state.inventory).toEqual({
      decor: { driftwood: 1 },
      fish: { guppy: 1 }
    });
  });
});
