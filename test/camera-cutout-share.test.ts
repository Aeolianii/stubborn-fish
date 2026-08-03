import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = join(process.cwd(), "camera-cutout-test");

describe("camera cutout share package", () => {
  it("contains a standalone entry page and server package", async () => {
    await expect(access(join(packageRoot, "index.html"))).resolves.toBeUndefined();
    await expect(access(join(packageRoot, "package.json"))).resolves.toBeUndefined();

    const packageJson = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      dev: expect.any(String),
      build: expect.any(String),
      start: expect.any(String),
      test: expect.any(String)
    });
  });

  it("uses portable relative browser asset paths", async () => {
    const html = await readFile(join(packageRoot, "index.html"), "utf8");

    expect(html).toContain('href="./styles/main.css"');
    expect(html).toContain('src="./js/object-segmentation.js"');
    expect(html).toContain('src="./js/main.js"');
    expect(html).not.toContain('href="/rest-test/');
    expect(html).not.toContain('src="/rest-test/');
  });

  it("keeps the confirmed vision model in the share configuration", async () => {
    const example = await readFile(join(packageRoot, ".env.example"), "utf8");

    expect(example).toContain(
      "ARK_VISION_MODEL=doubao-seed-2-1-turbo-260628"
    );
  });

  it("keeps the two-stage grounding backend synchronized", async () => {
    const sharedFiles = [
      "prompts/object-grounding-prompt.ts",
      "services/ark-vision-client.ts",
      "services/grounding-image-crop.ts"
    ];

    for (const relativePath of sharedFiles) {
      const mainSource = await readFile(
        join(process.cwd(), "src", relativePath),
        "utf8"
      );
      const standaloneSource = await readFile(
        join(packageRoot, "src", relativePath),
        "utf8"
      );

      expect(standaloneSource).toBe(mainSource);
    }
  });
});
