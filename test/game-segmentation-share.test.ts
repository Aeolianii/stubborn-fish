import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("game segmentation bundle", () => {
  it("stays identical to the verified REST test implementation", async () => {
    const [gameModule, restModule] = await Promise.all([
      readFile("game/js/object-segmentation.js", "utf8"),
      readFile("rest-cutout-test/js/object-segmentation.js", "utf8")
    ]);

    expect(gameModule).toBe(restModule);
  });
});
