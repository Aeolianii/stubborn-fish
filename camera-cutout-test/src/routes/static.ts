import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";

const ASSETS = {
  "/": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/index.html": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/styles/main.css": {
    file: "styles/main.css",
    contentType: "text/css; charset=utf-8"
  },
  "/js/main.js": {
    file: "js/main.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/js/object-segmentation.js": {
    file: "js/object-segmentation.js",
    contentType: "text/javascript; charset=utf-8"
  }
} as const;

export async function registerStaticRoutes(
  app: FastifyInstance,
  publicDirectory: string
): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));

  for (const [url, asset] of Object.entries(ASSETS)) {
    app.get(url, async (_request, reply) => {
      const contents = await readFile(
        resolve(publicDirectory, asset.file)
      );
      reply.header("cache-control", "no-store");
      return reply.type(asset.contentType).send(contents);
    });
  }
}
