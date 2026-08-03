import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";

const ASSETS = {
  "/rest-test": {
    file: "rest-cutout-test/index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/rest-test/": {
    file: "rest-cutout-test/index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/rest-test/styles/main.css": {
    file: "rest-cutout-test/styles/main.css",
    contentType: "text/css; charset=utf-8"
  },
  "/rest-test/js/main.js": {
    file: "rest-cutout-test/js/main.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/rest-test/js/object-segmentation.js": {
    file: "rest-cutout-test/js/object-segmentation.js",
    contentType: "text/javascript; charset=utf-8"
  }
} as const;

export async function registerRestTestRoutes(
  app: FastifyInstance
): Promise<void> {
  for (const [url, asset] of Object.entries(ASSETS)) {
    app.get(url, async (_request, reply) => {
      const contents = await readFile(resolve(process.cwd(), asset.file));
      reply.header("cache-control", "no-store");
      return reply.type(asset.contentType).send(contents);
    });
  }
}
