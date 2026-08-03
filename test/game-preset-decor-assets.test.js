import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/app.js", import.meta.url)),
  "utf8"
);
const economySource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/economy-system.js", import.meta.url)),
  "utf8"
);

const bottomDecor = [
  ["stone-cave", "石洞"],
  ["driftwood", "沉木"],
  ["amphora", "旧陶罐"],
  ["rooted-grass", "扎根水草"],
  ["coral", "浅色珊瑚"],
  ["ribbon-grass", "带状水草"],
  ["feather-grass", "羽叶水草"],
  ["moss-bush", "团簇水草"],
  ["river-stones", "河滩卵石"],
  ["slate-rocks", "青岩石柱"],
  ["pebble-cluster", "小卵石群"]
];

const surfaceDecor = [
  ["water-lily", "睡莲"],
  ["duckweed", "浮萍"],
  ["water-lettuce", "水鳖"],
  ["water-hyacinth", "水葫芦"],
  ["floating-heart", "荇菜"],
  ["floating-fern", "槐叶萍"],
  ["lotus-pair", "小莲花"]
];

describe("cropped preset decor catalog", () => {
  it("ships every cropped sprite and lists it in both placement and shop catalogs", () => {
    [...bottomDecor, ...surfaceDecor].forEach(([id, name]) => {
      const assetPath = fileURLToPath(
        new URL(`../game/assets/preset-decor/${id}.png`, import.meta.url)
      );
      expect(fs.statSync(assetPath).size).toBeGreaterThan(0);
      expect(appSource).toContain(`presetDecor("${id}", "${name}"`);
      expect(economySource).toContain(`decorProduct("${id}", "${name}"`);
    });
  });

  it("locks bottom and surface assets to their requested water layers", () => {
    bottomDecor.forEach(([id, name]) => {
      expect(appSource).toContain(`presetDecor("${id}", "${name}", "bottom")`);
    });
    surfaceDecor.forEach(([id, name]) => {
      expect(appSource).toContain(`presetDecor("${id}", "${name}", "surface")`);
    });
    expect(appSource).toContain('assetKind: "preset-image-decor"');
    expect(appSource).toContain("const isPresetImageDecor");
  });

  it("draws no moss or resting outline and only shows a dashed outline while editing", () => {
    const renderer = appSource.slice(
      appSource.indexOf("function drawMemoryObject"),
      appSource.indexOf("function roundedRectPath")
    );

    expect(renderer).toContain("if (isEditing) {");
    expect(renderer).toContain("ctx.setLineDash([5, 5])");
    expect(renderer).not.toContain("drawMoss");
    expect(renderer).not.toContain("mossStage");
    expect(renderer).not.toContain('isEditing ? "rgba(218,242,226,0.85)"');
    expect(renderer).not.toContain("if (isEditing || !isAtlasDecor)");
  });

  it("uses the rendered decor height so the editing outline can touch the tank bottom", () => {
    expect(appSource).toContain("const BOTTOM_OBJECT_EDGE_RATIO = 0.985");
    expect(appSource).toContain("object.renderBounds.visualH");
    expect(appSource).toContain(
      "BOTTOM_OBJECT_EDGE_RATIO - halfHeightRatio"
    );
    expect(appSource).toContain("visualH: dh");
    expect(appSource).not.toContain(
      'if (object.state === "bottom") object.y = clamp(object.y, 0.74, 0.84)'
    );
  });
});
