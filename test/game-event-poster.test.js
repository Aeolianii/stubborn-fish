import { describe, expect, it } from "vitest";

import {
  createFakeCanvas
} from "./helpers/aquarium-test-runtime.js";

describe("event-locked poster rendering", () => {
  it("uses the requested event and both participants instead of the latest story", async () => {
    const loadedSources = [];
    const renderer = globalThis.AquariumPosterRenderer.createPosterRenderer({
      canvasFactory: createFakeCanvas,
      loadImage: async (source) => {
        loadedSources.push(source);
        return { src: source, naturalWidth: 160, naturalHeight: 120 };
      },
      now: () => 20_000
    });
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.fish[0].iconUrl = "/game/assets/fish-memory.png";
    state.objects = [{
      id: "object-1",
      type: "object",
      name: "旧车票",
      state: "bottom",
      previewUrl: "/game/assets/object-memory.png"
    }];
    state.offlineEvents = [
      {
        id: "older-event",
        participantAId: "fish-1",
        participantBId: "object-1",
        title: "更早的屋檐",
        body: "旧车票落进水里后，月白绕着它慢慢游了两圈，最后停在下面，像是认真选好了一处安静的小屋檐。",
        posterLine: "有些走过的路，会在水里变成屋檐。",
        occurredAt: 10_000,
        readAt: null
      },
      {
        id: "latest-event",
        participantAId: "fish-2",
        participantBId: "object-1",
        title: "最新故事",
        body: "这是最近的一篇故事，但它不应该出现在指定旧事件生成的纪念海报中，因为海报必须锁定传入的事件编号。",
        posterLine: "这不是要选择的短句。",
        occurredAt: 19_000,
        readAt: null
      }
    ];
    state.stories = state.offlineEvents.slice();

    const sceneCanvas = { id: "aquarium-scene" };
    const poster = await renderer.createEventPoster("older-event", state, sceneCanvas);

    expect(poster).toMatchObject({ width: 1080, height: 1440 });
    expect(poster.layout).toMatchObject({
      kind: "event",
      eventId: "older-event",
      title: "更早的屋檐",
      participantIds: ["fish-1", "object-1"]
    });
    expect(poster.layout.title).not.toBe("最新故事");
    expect(loadedSources).toEqual([
      "/game/assets/fish-memory.png",
      "/game/assets/object-memory.png"
    ]);
    expect(poster.canvas.getContext("2d").drawImageCalls.map((call) => call[0]))
      .toEqual([
        sceneCanvas,
        expect.objectContaining({ src: "/game/assets/fish-memory.png" }),
        expect.objectContaining({ src: "/game/assets/object-memory.png" })
      ]);
  });

  it("loads IndexedDB participant images and falls back to local silhouettes", async () => {
    const loadedSources = [];
    const assetBlob = { type: "image/png", size: 12 };
    const renderer = globalThis.AquariumPosterRenderer.createPosterRenderer({
      canvasFactory: createFakeCanvas,
      loadAsset: async (key) => key === "memory-fish-image" ? assetBlob : null,
      loadImage: async (source) => {
        loadedSources.push(source);
        if (source === "/broken-object.png") throw new Error("missing image");
        return { src: source, naturalWidth: 100, naturalHeight: 100 };
      },
      now: () => 30_000
    });
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.fish[0].iconUrl = "";
    state.fish[0].imageKey = "memory-fish-image";
    state.objects = [{
      id: "object-1",
      type: "object",
      name: "旧车票",
      state: "bottom",
      previewUrl: "/broken-object.png"
    }];
    state.offlineEvents = [{
      id: "image-event",
      participantAId: "fish-1",
      participantBId: "object-1",
      title: "水下合影",
      body: "月白游到旧车票旁边，水光从它们身上慢慢滑过，像是替这次安静相遇留下了一张没有声音的合影。",
      posterLine: "它们在同一束水光里停了一会儿。",
      occurredAt: 25_000,
      readAt: null
    }];

    const poster = await renderer.createEventPoster("image-event", state, null);
    const visuals = poster.canvas.getContext("2d").drawImageCalls.map((call) => call[0]);

    expect(loadedSources).toContain(assetBlob);
    expect(loadedSources).toContain("/broken-object.png");
    expect(loadedSources).toContain("/game/assets/ui/object-fallback.svg");
    expect(visuals).toEqual([
      expect.objectContaining({ src: assetBlob }),
      expect.objectContaining({ src: "/game/assets/ui/object-fallback.svg" })
    ]);
  });

  it("creates a poster for a current-backend online story without an offline copy", async () => {
    const renderer = globalThis.AquariumPosterRenderer.createPosterRenderer({
      canvasFactory: createFakeCanvas,
      loadImage: async (source) => ({ src: source, naturalWidth: 100, naturalHeight: 100 }),
      now: () => 40_000
    });
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    state.fish.push({
      ...state.fish[0],
      id: "fish-2",
      name: "青团",
      effectiveEventIds: [],
      effectiveEventCount: 0
    });
    state.stories = [{
      id: "online-story",
      source: "online",
      participantAId: state.fish[0].id,
      participantBId: state.fish[1].id,
      title: "水草间的招呼",
      body: "两条鱼在同一束水光里靠近，又各自慢慢游开。",
      posterLine: "一次很轻的相遇，也会被水记住。",
      occurredAt: 39_000
    }];
    state.offlineEvents = [];

    const poster = await renderer.createEventPoster("online-story", state, null);

    expect(poster.layout).toMatchObject({
      kind: "event",
      eventId: "online-story",
      title: "水草间的招呼",
      participantIds: [state.fish[0].id, state.fish[1].id]
    });
  });
});
