import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import type { FastifyInstance } from "fastify";

const GAME_ASSETS = {
  "/": {
    file: "game/index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/game": {
    file: "game/index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/game/": {
    file: "game/index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/game/styles.css": {
    file: "game/styles.css",
    contentType: "text/css; charset=utf-8"
  },
  "/game/js/app.js": {
    file: "game/js/app.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/cutout-flow.js": {
    file: "game/js/cutout-flow.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/webgl-fish-mesh.js": {
    file: "game/js/webgl-fish-mesh.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/object-segmentation.js": {
    file: "game/js/object-segmentation.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/story-template-catalog.js": {
    file: "game/js/story-template-catalog.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/fixed-event-catalog.js": {
    file: "game/js/fixed-event-catalog.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/story-template-registry.js": {
    file: "game/js/story-template-registry.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/state-store.js": {
    file: "game/js/state-store.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/economy-system.js": {
    file: "game/js/economy-system.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/relationship-system.js": {
    file: "game/js/relationship-system.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/growth-journey.js": {
    file: "game/js/growth-journey.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/event-director.js": {
    file: "game/js/event-director.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/story-agent.js": {
    file: "game/js/story-agent.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/poster-renderer.js": {
    file: "game/js/poster-renderer.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/aquarium-core.js": {
    file: "game/js/aquarium-core.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/aquarium-api.js": {
    file: "game/js/aquarium-api.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/ui-shell.js": {
    file: "game/js/ui-shell.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/sound-manager.js": {
    file: "game/js/sound-manager.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/js/tutorial-system.js": {
    file: "game/js/tutorial-system.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/game/assets/aquarium-background.png": {
    file: "game/assets/aquarium-background.png",
    contentType: "image/png"
  },
  "/game/assets/aquarium-background-westlake-v2.png": {
    file: "game/assets/aquarium-background-westlake-v2.png",
    contentType: "image/png"
  },
  "/game/assets/fish-atlas.png": {
    file: "game/assets/fish-atlas.png",
    contentType: "image/png"
  },
  "/game/assets/default-fish-atlas.png": {
    file: "game/assets/default-fish-atlas.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/betta.png": {
    file: "game/assets/preset-fish/betta.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/guppy.png": {
    file: "game/assets/preset-fish/guppy.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/butterfly-koi.png": {
    file: "game/assets/preset-fish/butterfly-koi.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/big-dog-fish.png": {
    file: "game/assets/preset-fish/big-dog-fish.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/cat-fish.png": {
    file: "game/assets/preset-fish/cat-fish.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/milk-cat-fish.png": {
    file: "game/assets/preset-fish/milk-cat-fish.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/milk-fish.png": {
    file: "game/assets/preset-fish/milk-fish.png",
    contentType: "image/png"
  },
  "/game/assets/preset-fish/tingquan-fish.png": {
    file: "game/assets/preset-fish/tingquan-fish.png",
    contentType: "image/png"
  },
  "/game/assets/preset-decor/stone-cave.png": {
    file: "game/assets/preset-decor/stone-cave.png",
    contentType: "image/png"
  },
  "/game/assets/preset-decor/driftwood.png": {
    file: "game/assets/preset-decor/driftwood.png",
    contentType: "image/png"
  },
  "/game/assets/preset-decor/amphora.png": {
    file: "game/assets/preset-decor/amphora.png",
    contentType: "image/png"
  },
  "/game/assets/preset-decor/water-lily.png": {
    file: "game/assets/preset-decor/water-lily.png",
    contentType: "image/png"
  },
  "/game/assets/default-decor-atlas.png": {
    file: "game/assets/default-decor-atlas.png",
    contentType: "image/png"
  },
  "/game/assets/surface-plants-atlas.png": {
    file: "game/assets/surface-plants-atlas.png",
    contentType: "image/png"
  },
  "/game/assets/plants.png": {
    file: "game/assets/plants.png",
    contentType: "image/png"
  },
  "/game/assets/rocks.png": {
    file: "game/assets/rocks.png",
    contentType: "image/png"
  },
  "/game/assets/catch-claw.webp": {
    file: "game/assets/catch-claw.webp",
    contentType: "image/webp"
  },
  "/game/assets/music/upbeat-loop.mp3": {
    file: "game/assets/music/upbeat-loop.mp3",
    contentType: "audio/mpeg"
  },
  "/game/assets/ui/fish-fallback.svg": {
    file: "game/assets/ui/fish-fallback.svg",
    contentType: "image/svg+xml"
  },
  "/game/assets/ui/object-fallback.svg": {
    file: "game/assets/ui/object-fallback.svg",
    contentType: "image/svg+xml"
  },
  "/game/assets/ui/poster-placeholder.svg": {
    file: "game/assets/ui/poster-placeholder.svg",
    contentType: "image/svg+xml"
  },
  "/game/assets/shop-icon.png": {
    file: "game/assets/shop-icon.png",
    contentType: "image/png"
  },
  "/game/assets/algae-coin-icon.png": {
    file: "game/assets/algae-coin-icon.png",
    contentType: "image/png"
  },
  "/game/assets/scenery-icon.png": {
    file: "game/assets/scenery-icon.png",
    contentType: "image/png"
  },
  "/game/assets/ui/add-flow/photo-frame.png": {
    file: "game/assets/ui/add-flow/photo-frame.png",
    contentType: "image/png"
  },
  "/game/assets/ui/add-flow/choice-fish.png": {
    file: "game/assets/ui/add-flow/choice-fish.png",
    contentType: "image/png"
  },
  "/game/assets/ui/add-flow/choice-bottom.png": {
    file: "game/assets/ui/add-flow/choice-bottom.png",
    contentType: "image/png"
  },
  "/game/assets/ui/add-flow/choice-suspended.png": {
    file: "game/assets/ui/add-flow/choice-suspended.png",
    contentType: "image/png"
  },
  "/game/assets/ui/add-flow/choice-surface.png": {
    file: "game/assets/ui/add-flow/choice-surface.png",
    contentType: "image/png"
  }
} as const;

const SFX_ASSETS = [
  ["ambient/bubbles.wav", "audio/wav"],
  ["ambient/gentle-stream.mp3", "audio/mpeg"],
  ["ambient/water-flow.mp3", "audio/mpeg"],
  ["interaction/feed.mp3", "audio/mpeg"],
  ["interaction/fish-enter.mp3", "audio/mpeg"],
  ["interaction/fish-swim.mp3", "audio/mpeg"],
  ["interaction/ui-click.mp3", "audio/mpeg"],
  ...Array.from({ length: 12 }, (_, index) => [
    `interaction/coins/coin-${String(index + 1).padStart(2, "0")}.ogg`,
    "audio/ogg"
  ] as const)
] as const;

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webp": "image/webp"
};

export async function registerGameRoutes(
  app: FastifyInstance
): Promise<void> {
  for (const [url, asset] of Object.entries(GAME_ASSETS)) {
    app.get(url, async (_request, reply) => {
      const contents = await readFile(resolve(process.cwd(), asset.file));
      reply.header("cache-control", "no-store");
      return reply.type(asset.contentType).send(contents);
    });
  }
  for (const [relativePath, contentType] of SFX_ASSETS) {
    app.get(`/game/assets/sfx/${relativePath}`, async (_request, reply) => {
      const contents = await readFile(resolve(process.cwd(), "game/assets/sfx", relativePath));
      reply.header("cache-control", "no-store");
      return reply.type(contentType).send(contents);
    });
  }
  app.get("/game/assets/*", async (request, reply) => {
    const relativePath = String((request.params as { "*": string })["*"] ?? "");
    const assetRoot = resolve(process.cwd(), "game/assets");
    const assetPath = resolve(assetRoot, relativePath);
    if (
      !relativePath ||
      relativePath.split(/[\\/]/).some((segment) => segment === "..") ||
      (assetPath !== assetRoot && !assetPath.startsWith(`${assetRoot}${sep}`))
    ) {
      return reply.code(404).send({ error: "Asset not found" });
    }
    try {
      const contents = await readFile(assetPath);
      const contentType = ASSET_CONTENT_TYPES[extname(assetPath).toLowerCase()]
        ?? "application/octet-stream";
      reply.header("cache-control", "no-store");
      return reply.type(contentType).send(contents);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT" || code === "EISDIR") {
        return reply.code(404).send({ error: "Asset not found" });
      }
      throw error;
    }
  });
}
