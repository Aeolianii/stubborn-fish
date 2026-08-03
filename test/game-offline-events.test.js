import { describe, expect, it } from "vitest";

import {
  createFallbackStoryAgent,
  createMemoryStorage
} from "./helpers/aquarium-test-runtime.js";

describe("offline relationship events", () => {
  it("does not treat first-time initialization as an offline return", async () => {
    let now = 1_000;
    const core = globalThis.AquariumCore.createCore({
      storage: createMemoryStorage(),
      indexedDB: null,
      now: () => ++now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });

    await core.init();

    expect(core.getViewModel().feed).toBe(200);
    expect(core.getViewModel().offlineEventBubbles).toHaveLength(0);
    core.destroy();
  });

  it("does not treat a freshly migrated Canvas save as an offline return", async () => {
    let now = 2_000;
    const storage = createMemoryStorage({
      "quiet-aquarium-state-v2": JSON.stringify({
        soundOn: false,
        backgroundId: "westlake",
        memoryObjects: [],
        customFish: []
      })
    });
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => ++now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });

    await core.init();

    expect(core.getViewModel().feed).toBe(200);
    expect(core.getViewModel().offlineEventBubbles).toHaveLength(0);
    core.destroy();
  });

  it("fills three unread events after any positive offline gap in temporary test mode", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.objects = [
      {
        id: "object-1",
        type: "object",
        name: "旧车票",
        state: "bottom"
      },
      {
        id: "object-2",
        type: "object",
        name: "玻璃纽扣",
        state: "suspended"
      }
    ];

    const created = globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      1,
      1_001
    );
    expect(created).toHaveLength(3);
    expect(globalThis.AquariumEventDirector.getUnreadOfflineEvents(state))
      .toHaveLength(3);
  });

  it("drops restored unread events whose participants were deleted", async () => {
    const now = 8 * 60 * 60 * 1000 + 2_000;
    const saved = globalThis.AquariumStateStore.createDefaultState(1_000);
    saved.fish = [];
    saved.objects = [];
    saved.ready = true;
    saved.lastActiveAt = 1_000;
    saved.offlineEvents = [{
      id: "offline-event-ghost",
      source: "offline",
      eventType: "fish-fish-shared",
      participantAId: "deleted-fish-a",
      participantBId: "deleted-fish-b",
      title: "ghost",
      body: "ghost",
      readAt: null,
      occurredAt: 1_000
    }];
    saved.stories = saved.offlineEvents.slice();
    saved.activeStoryId = "offline-event-ghost";
    const storage = createMemoryStorage({
      stubborn_fish_state_v1: JSON.stringify(saved)
    });
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });

    await core.init();

    expect(core.getViewModel().offlineEventBubbles).toEqual([]);
    expect(core.getStateForTesting()).toMatchObject({
      offlineEvents: [],
      stories: [],
      activeStoryId: null
    });
    core.destroy();
  });

  it("refills bubbles only with participants that still exist", async () => {
    const now = 8 * 60 * 60 * 1000 + 3_000;
    const saved = globalThis.AquariumStateStore.createDefaultState(1_000);
    saved.objects = [{
      id: "object-1",
      type: "object",
      name: "object",
      state: "bottom"
    }];
    saved.ready = true;
    saved.lastActiveAt = 1_000;
    saved.offlineEvents = [{
      id: "offline-event-ghost",
      source: "offline",
      eventType: "fish-fish-shared",
      participantAId: "deleted-fish-a",
      participantBId: "deleted-fish-b",
      title: "ghost",
      body: "ghost",
      readAt: null,
      occurredAt: 1_000
    }];
    saved.stories = saved.offlineEvents.slice();
    const storage = createMemoryStorage({
      stubborn_fish_state_v1: JSON.stringify(saved)
    });
    const core = globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });

    await core.init();

    const bubbles = core.getViewModel().offlineEventBubbles;
    expect(bubbles).toHaveLength(1);
    expect([
      bubbles[0].participantA.id,
      bubbles[0].participantB.id
    ].sort()).toEqual(["fish-1", "object-1"]);
    expect(core.getStateForTesting().offlineEvents.map((event) => event.id))
      .not.toContain("offline-event-ghost");
    core.destroy();
  });

  it("creates at most three unread fish-fish, fish-object and object-object events", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.fish.push({
      id: "fish-2",
      type: "fish",
      name: "青团",
      affection: 20,
      active: true,
      source: "preset"
    });
    state.objects = [
      {
        id: "object-1",
        type: "object",
        name: "旧车票",
        state: "bottom",
        x: 0.3,
        y: 0.8
      },
      {
        id: "object-2",
        type: "object",
        name: "玻璃纽扣",
        state: "suspended",
        x: 0.7,
        y: 0.5
      }
    ];

    const created = globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      8 * 60 * 60 * 1000,
      9_000
    );

    expect(created).toHaveLength(3);
    expect(new Set(created.map((event) => (
      event.participants.map((participant) => participant.type).sort().join("|")
    )))).toEqual(new Set(["fish|fish", "fish|object", "object|object"]));
    expect(new Set(created.map((event) => (
      [event.participantAId, event.participantBId].sort().join("|")
    ))).size).toBe(3);
    expect(globalThis.AquariumEventDirector.getUnreadOfflineEvents(state)).toHaveLength(3);
    created.forEach((event) => {
      expect(event.readAt).toBeNull();
      expect(event.anchor.x).toBeGreaterThanOrEqual(0);
      expect(event.anchor.x).toBeLessThanOrEqual(1);
      expect(event.anchor.y).toBeGreaterThanOrEqual(0);
      expect(event.anchor.y).toBeLessThanOrEqual(1);
    });
  });

  it("fills only available unread slots and never applies rewards during story resolution", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.objects = [
      { id: "object-1", type: "object", name: "旧车票", state: "bottom" },
      { id: "object-2", type: "object", name: "纽扣", state: "suspended" }
    ];
    const initial = globalThis.AquariumEventDirector.settleOfflineEvents(state, 1, 1_001);
    expect(initial).toHaveLength(3);

    const openedId = initial[0].id;
    globalThis.AquariumEventDirector.openOfflineEvent(state, openedId, 1_002);
    const feedBeforeResolution = state.feed;
    const growthBeforeResolution = state.fish.map((fish) => fish.growth);
    const relationshipSnapshot = JSON.stringify(state.relationships);
    const generated = {
      title: "新的标题",
      body: "月白和旧车票在水光里安静地停了一会儿，另一条鱼从远处慢慢游过，没有打断这段刚好发生的小小相遇。",
      posterLine: "相遇之后，水光替它们记住了片刻。",
      status: "generated",
      resolvedAt: 1_003
    };
    globalThis.AquariumEventDirector.resolveStory(state, openedId, generated);
    globalThis.AquariumEventDirector.resolveStory(state, openedId, generated);

    expect(state.feed).toBe(feedBeforeResolution);
    expect(state.fish.map((fish) => fish.growth)).toEqual(growthBeforeResolution);
    expect(JSON.stringify(state.relationships)).toBe(relationshipSnapshot);

    const refill = globalThis.AquariumEventDirector.settleOfflineEvents(state, 1, 1_004);
    expect(refill).toHaveLength(1);
    expect(globalThis.AquariumEventDirector.getUnreadOfflineEvents(state)).toHaveLength(3);
    expect(globalThis.AquariumEventDirector.getUnreadOfflineEvents(state).map((event) => event.id))
      .not.toContain(openedId);
    expect(globalThis.AquariumEventDirector.settleOfflineEvents(state, 1, 1_005))
      .toHaveLength(0);
  });

  it("persists unread events and never restores a read bubble", async () => {
    let now = 2_000;
    const storage = createMemoryStorage();
    const createCore = () => globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    let core = createCore();
    await core.init();
    const state = core.getStateForTesting();
    state.objects = [
      { id: "object-1", type: "object", name: "旧车票", state: "bottom" },
      { id: "object-2", type: "object", name: "纽扣", state: "suspended" }
    ];
    globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      8 * 60 * 60 * 1000,
      now
    );
    await core.saveNow();
    const eventId = core.getViewModel().offlineEventBubbles[0].id;
    core.destroy();

    core = createCore();
    await core.init();
    const restoredBubbles = core.getViewModel().offlineEventBubbles;
    expect(restoredBubbles).toHaveLength(3);
    restoredBubbles.forEach((bubble) => {
      expect(bubble).toMatchObject({
        source: "offline",
        eventType: expect.any(String),
        title: expect.any(String),
        participantA: { id: expect.any(String), name: expect.any(String) },
        participantB: { id: expect.any(String), name: expect.any(String) }
      });
    });
    const opened = await core.openOfflineEvent(eventId);
    expect(opened.ok).toBe(true);
    expect(opened.data.event.readAt).toBe(now);
    expect(core.getViewModel().offlineEventBubbles).toHaveLength(2);
    await core.saveNow();
    core.destroy();

    core = createCore();
    await core.init();
    expect(core.getViewModel().offlineEventBubbles.map((item) => item.id))
      .not.toContain(eventId);
    expect(core.getStateForTesting().offlineEvents.find((event) => event.id === eventId))
      .toMatchObject({ id: eventId, readAt: now });
    core.destroy();
  });

  it("persists one event choice and applies its rewards only once", async () => {
    const now = 7_000;
    const storage = createMemoryStorage();
    const createCore = () => globalThis.AquariumCore.createCore({
      storage,
      indexedDB: null,
      now: () => now,
      autoTimers: false,
      storyAgent: createFallbackStoryAgent()
    });
    let core = createCore();
    await core.init();
    const state = core.getStateForTesting();
    state.objects = [
      { id: "object-1", type: "object", name: "旧车票", state: "bottom" },
      { id: "object-2", type: "object", name: "纽扣", state: "suspended" }
    ];
    const event = globalThis.AquariumEventDirector.settleOfflineEvents(
      state,
      1,
      now
    )[0];
    const choice = event.choices[0];
    const feedBefore = state.feed;
    const relationshipBefore = globalThis.AquariumRelationships.getRelationship(
      state,
      event.participantAId,
      event.participantBId
    ).value;

    const selected = await core.resolveEventChoice(event.id, choice.id);

    expect(selected).toMatchObject({
      ok: true,
      data: {
        duplicate: false,
        event: {
          id: event.id,
          selectedChoice: {
            id: choice.id,
            outcome: choice.fallbackOutcome,
            appliedAlgaeCoins: choice.algaeCoins,
            appliedIntimacy: choice.intimacy
          }
        }
      }
    });
    expect(core.getViewModel().feed).toBe(feedBefore + choice.algaeCoins);
    expect(globalThis.AquariumRelationships.getRelationship(
      state,
      event.participantAId,
      event.participantBId
    ).value).toBe(Math.min(100, relationshipBefore + choice.intimacy));

    const duplicate = await core.resolveEventChoice(event.id, choice.id);
    expect(duplicate).toMatchObject({ ok: true, data: { duplicate: true } });
    expect(core.getViewModel().feed).toBe(feedBefore + choice.algaeCoins);
    expect((await core.resolveEventChoice(event.id, event.choices[1].id))).toMatchObject({
      ok: false,
      code: "EVENT_CHOICE_ALREADY_RESOLVED"
    });

    await core.saveNow();
    core.destroy();
    core = createCore();
    await core.init();
    expect(core.getStateForTesting().offlineEvents.find((item) => item.id === event.id))
      .toMatchObject({ selectedChoice: { id: choice.id } });
    core.destroy();
  });
});
