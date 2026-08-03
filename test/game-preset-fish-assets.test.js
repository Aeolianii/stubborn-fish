import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/app.js", import.meta.url)),
  "utf8"
);

const presets = [
  ["big-dog-fish", "大狗鱼", "big-dog-fish.png"],
  ["cat-fish", "猫鱼", "cat-fish.png"],
  ["milk-cat-fish", "奶猫鱼", "milk-cat-fish.png"],
  ["milk-fish", "奶鱼", "milk-fish.png"],
  ["tingquan-fish", "听泉鱼", "tingquan-fish.png"]
];

describe("user preset fish assets", () => {
  it("registers all five local images in the owned placement catalog", () => {
    presets.forEach(([id, name, fileName]) => {
      const assetPath = fileURLToPath(
        new URL(`../game/assets/preset-fish/${fileName}`, import.meta.url)
      );
      expect(fs.statSync(assetPath).size).toBeGreaterThan(0);
      expect(appSource).toContain(`id: "${id}"`);
      expect(appSource).toContain(`name: "${name}"`);
      expect(appSource).toContain(
        `imageUrl: "/game/assets/preset-fish/${fileName}"`
      );
    });
    expect(appSource).toContain('assetKind: "preset-image-fish"');
    expect(appSource).toContain('item.assetKind === "preset-image-fish"');
    expect(appSource).toContain("function resolvePresetFishImage");
    expect(appSource).toContain("const isPresetImageFish");
  });
});
