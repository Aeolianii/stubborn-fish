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
    directory: "D:/test/fish-game-cutouts",
    ttlMs: 60_000
  },
  upload: { maxBytes: 5 * 1024 * 1024 }
};

describe("integrated aquarium game", () => {
  it("serves the game at the root with onboarding and gameplay dialogs", async () => {
    const app = await buildApp({ config });

    const page = await app.inject({ method: "GET", url: "/" });

    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("忍不住化身一条固执的鱼");
    expect(page.body).toContain('id="addButton"');
    expect(page.body).toContain('id="addSheet"');
    expect(page.body.match(/id="addSheet"/g)).toHaveLength(1);
    expect(page.body).toContain('id="entryScreen"');
    expect(page.body).toContain('id="shopSheet"');
    expect(page.body).toContain('id="maturityChoiceSheet"');
    expect(page.body).toContain('id="tutorialLayer"');
    expect(page.body.match(/id="shopSheet"/g)).toHaveLength(1);
    expect(page.body.match(/id="maturityChoiceSheet"/g)).toHaveLength(1);
    expect(page.body).toContain('data-cutout-view="capture"');
    expect(page.body).toContain('data-cutout-view="result"');
    expect(page.body).toContain('id="defaultCatalog"');
    expect(page.body).toContain('id="imagePicker"');
    expect(page.body).toContain('id="subjectDescription"');
    expect(page.body).toContain('id="subjectType"');
    expect(page.body).toContain('value="person"');
    expect(page.body).toContain('value="aquatic_animal"');
    expect(page.body).toContain('value="land_animal"');
    expect(page.body).toContain('value="plant"');
    expect(page.body).toContain('value="other"');
    expect(page.body).toContain("想留下什么？（选填）");
    expect(page.body).toContain('id="objectName"');
    expect(page.body).toContain('data-new-state="fish"');
    expect(page.body).toContain('data-new-state="bottom"');
    expect(page.body).toContain('data-new-state="suspended"');
    expect(page.body).toContain('data-new-state="surface"');
    expect(page.body).toContain('id="generateCutoutButton"');
    expect(page.body).toContain('id="sourcePreview"');
    expect(page.body).toContain('id="cutoutResult"');
    expect(page.body).toContain('id="backToCaptureButton"');
    expect(page.body).toContain('id="confirmAddButton"');
    expect(page.body).not.toContain("/game/js/object-segmentation.js");
    expect(page.body).toContain("/game/js/cutout-flow.js");
    expect(page.body).toContain("/game/js/webgl-fish-mesh.js");
    expect(page.body).toContain("/game/js/aquarium-api.js");
    expect(page.body).toContain("/game/js/tutorial-system.js");
    expect(page.body).toContain("/game/js/app.js");
    expect(page.body).toContain('src="/game/assets/algae-coin-icon.png?v=2"');
    expect(page.body).toContain('src="/game/assets/shop-icon.png?v=2"');
    expect(page.body).not.toContain('src="./assets/algae-coin-icon.png"');
    expect(page.body).not.toContain('src="./assets/shop-icon.png"');
    expect(page.body).toContain('id="eventModalFocus"');
    expect(page.body).not.toContain('id="eventModalEmotion"');

    const scriptOrder = [
      "cutout-flow",
      "webgl-fish-mesh",
      "story-template-catalog",
      "fixed-event-catalog",
      "story-template-registry",
      "state-store",
      "economy-system",
      "relationship-system",
      "growth-journey",
      "event-director",
      "story-agent",
      "poster-renderer",
      "aquarium-core",
      "aquarium-api",
      "ui-shell",
      "app"
    ];
    let previousIndex = -1;
    for (const script of scriptOrder) {
      const index = page.body.indexOf(`/game/js/${script}.js`);
      expect(index, script).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(page.body).not.toContain("ui-mock-data.js");

    await app.close();
  });

  it("serves the game scripts and local image assets", async () => {
    const app = await buildApp({ config });

    const flow = await app.inject({
      method: "GET",
      url: "/game/js/cutout-flow.js"
    });
    expect(flow.statusCode).toBe(200);
    expect(flow.body).toContain("createCutoutSession");
    expect(flow.body).toContain("/api/cutouts");
    expect(flow.body).toContain("transparentBlob");
    expect(flow.body).toContain('form.append("source", "album")');

    const game = await app.inject({
      method: "GET",
      url: "/game/js/app.js"
    });
    expect(game.statusCode).toBe(200);
    expect(game.body).toContain("transparentBlob");
    expect(game.body).toContain('assetKind: "custom-fish"');
    expect(game.body).toContain("webglFishRenderer.render");
    expect(game.body).toContain("reducedMotion: REDUCED_MOTION");

    const webgl = await app.inject({
      method: "GET",
      url: "/game/js/webgl-fish-mesh.js"
    });
    expect(webgl.statusCode).toBe(200);
    expect(webgl.body).toContain("createRenderer");
    expect(webgl.body).toContain("vertexShaderSource");

    const gameplayScripts = [
      "story-template-catalog",
      "fixed-event-catalog",
      "story-template-registry",
      "state-store",
      "economy-system",
      "relationship-system",
      "growth-journey",
      "event-director",
      "story-agent",
      "poster-renderer",
      "aquarium-core",
      "aquarium-api",
      "tutorial-system"
    ];
    for (const script of gameplayScripts) {
      const response = await app.inject({
        method: "GET",
        url: `/game/js/${script}.js`
      });
      expect(response.statusCode, script).toBe(200);
      expect(response.headers["content-type"], script).toContain(
        "text/javascript"
      );
    }

    const frontendAssets = [
      "/game/js/ui-shell.js",
      "/game/assets/ui/fish-fallback.svg",
      "/game/assets/ui/object-fallback.svg",
      "/game/assets/ui/poster-placeholder.svg",
      "/game/assets/catch-claw.webp",
      "/game/assets/music/upbeat-loop.mp3"
    ];
    for (const url of frontendAssets) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
      if (url === "/game/js/ui-shell.js") {
        expect(response.body).not.toContain("AquariumUIMockData");
        expect(response.body).toContain("mounted: false");
        expect(response.body).not.toContain("DOMContentLoaded");
        expect(response.body).not.toContain(
          "button.dataset.offlineEventId = bubble.id"
        );
        expect(response.body).toContain("button.dataset.unlockId = item.id");
        expect(response.body).toContain(
          'var storyText = detail.text || detail.body || ""'
        );
        expect(response.body).toContain('state.activeEventId = bubble.id');
        expect(response.body).toContain('openOfflineEvent", bubble.id');
        expect(response.body).toContain('resolveEventChoice", state.activeEventId, choiceId');
        expect(response.body).toContain('createEventPoster", state.activeEventId');
        expect(response.body).toContain('story.source !== "online"');
        expect(response.body).toContain('bubbleTextForEvent(bubble)');
        expect(response.body).not.toContain('bubble.label || "关系事件"');
        expect(response.body).toContain('function captureEventScene');
        expect(response.body).toContain('function renderEventFocus');
        expect(response.body).toContain('function eventParticipantFocus');
        expect(response.body).toContain('marker.style.width');
        expect(response.body).toContain('var bubbleClearance = assignment.fishId');
        expect(response.body).not.toContain('setText("eventModalEmotion"');
        expect(response.body).toContain('function syncOfflineEventPausedFish');
        expect(response.body).toContain('bridge.setEventPausedFishIds');
        expect(response.body).toContain('function bubbleAnchorAssignment');
        expect(response.body).toContain('button.dataset.anchorFishId');
        expect(response.body).toContain('button.dataset.eventChoiceId = choice.id');
      }
    }

    const asset = await app.inject({
      method: "GET",
      url: "/game/assets/default-fish-atlas.png"
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toBe("image/png");
    expect(asset.rawPayload.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

    const pngAssets = [
      "/game/assets/shop-icon.png",
      "/game/assets/algae-coin-icon.png",
      "/game/assets/scenery-icon.png",
      "/game/assets/preset-fish/betta.png",
      "/game/assets/preset-fish/guppy.png",
      "/game/assets/preset-fish/butterfly-koi.png",
      "/game/assets/preset-decor/stone-cave.png",
      "/game/assets/preset-decor/driftwood.png",
      "/game/assets/preset-decor/amphora.png",
      "/game/assets/preset-decor/water-lily.png"
    ];
    for (const url of pngAssets) {
      const response = await app.inject({
        method: "GET",
        url
      });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"], url).toBe("image/png");
      expect(response.rawPayload.subarray(0, 8), url).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      );
    }

    const fallbackAsset = await app.inject({
      method: "GET",
      url: "/game/assets/music/LICENSE.txt"
    });
    expect(fallbackAsset.statusCode).toBe(200);
    expect(fallbackAsset.headers["content-type"]).toContain("text/plain");

    const missingAsset = await app.inject({
      method: "GET",
      url: "/game/assets/not-present.png"
    });
    expect(missingAsset.statusCode).toBe(404);

    await app.close();
  });

  it("serves one parsable Canvas app with catch gameplay and the Core bridge", async () => {
    const app = await buildApp({ config });

    const game = await app.inject({
      method: "GET",
      url: "/game/js/app.js"
    });

    expect(game.statusCode).toBe(200);
    expect(() => new Function(game.body)).not.toThrow();
    expect(game.body).toContain("function startCatchRound");
    expect(game.body).toContain("function configureAquariumCore");
    expect(game.body).toContain("notifyObjectSettled");
    expect(game.body).toContain("MemoryAquariumAppReady");
    expect(game.body).not.toContain("aquariumApi.subscribe");
    expect(game.body).toContain("function reloadEntityImage");
    expect(game.body).toContain("function hydrateFishFromCore");
    expect(game.body).toContain("function hydrateObjectFromCore");
    expect(game.body).toContain("state.art.fallbackObject");
    expect(game.body).toContain(
      "awaitOrIgnore(state.aquariumCore.notifyObjectSettled(object.id))"
    );
    expect(game.body).toContain("globalThis.MemoryAquariumCanvas");
    expect(game.body).toContain("function setEventPausedFishIds");
    expect(game.body).toContain("holdFishAtEventAnchor(fish)");
    expect(game.body).toContain("getEventFocus: eventFocusForParticipants");
    expect(game.body).toContain("const eventPriority = isFishPausedForEvent(other)");
    expect(game.body).toContain("if (pausedA !== pausedB)");
    expect(game.body).not.toContain("captureEventSnapshot");
    expect(game.body).toContain("consumeOwnedCatalogItem");
    expect(game.body).toContain("catalog-count-badge");

    await app.close();
  });
});
