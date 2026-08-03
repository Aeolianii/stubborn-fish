import { describe, expect, it } from "vitest";

import "../js/object-segmentation.js";

const { refineObjectMask } = globalThis.ObjectSegmentation;

function makeImage(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3] ?? 255;
  }

  return { data, width, height };
}

function setPixel(image, x, y, color) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3] ?? 255;
}

function alphaAt(result, x, y) {
  return result.data[(y * result.width + x) * 4 + 3];
}

const grounding = {
  targetLabel: "蓝色方块",
  bbox: {
    xMin: 2 / 16,
    yMin: 1 / 16,
    xMax: 14 / 16,
    yMax: 15 / 16
  },
  center: { x: 8 / 16, y: 8 / 16 },
  polygon: [
    { x: 3 / 16, y: 2 / 16 },
    { x: 6 / 16, y: 2 / 16 },
    { x: 9 / 16, y: 2 / 16 },
    { x: 12 / 16, y: 2 / 16 },
    { x: 13 / 16, y: 3 / 16 },
    { x: 13 / 16, y: 6 / 16 },
    { x: 13 / 16, y: 10 / 16 },
    { x: 13 / 16, y: 13 / 16 },
    { x: 12 / 16, y: 14 / 16 },
    { x: 9 / 16, y: 14 / 16 },
    { x: 6 / 16, y: 14 / 16 },
    { x: 3 / 16, y: 14 / 16 },
    { x: 2 / 16, y: 13 / 16 },
    { x: 2 / 16, y: 10 / 16 },
    { x: 2 / 16, y: 6 / 16 },
    { x: 2 / 16, y: 3 / 16 }
  ],
  confidence: 0.9
};

describe("refineObjectMask", () => {
  it("keeps the AI polygon solid across internal color changes", () => {
    const image = makeImage(16, 16, [235, 235, 235, 255]);

    for (let y = 4; y <= 12; y += 1) {
      for (let x = 6; x <= 10; x += 1) {
        setPixel(image, x, y, [25, 85, 190, 255]);
      }
    }

    const result = refineObjectMask(image, grounding);

    expect(alphaAt(result, 8, 8)).toBe(255);
    expect(alphaAt(result, 6, 4)).toBeGreaterThan(0);
    expect(alphaAt(result, 4, 4)).toBe(255);
    expect(alphaAt(result, 12, 12)).toBe(255);
    expect(alphaAt(result, 0, 0)).toBe(0);

    for (let y = 4; y <= 11; y += 1) {
      for (let x = 4; x <= 11; x += 1) {
        expect(alphaAt(result, x, y)).toBe(255);
      }
    }

    const alphaValues = Array.from(
      { length: result.width * result.height },
      (_, index) => result.data[index * 4 + 3]
    );
    expect(alphaValues.some((alpha) => alpha > 0 && alpha < 255)).toBe(true);
  });

  it("rejects polygons outside the 16 to 32 point contract", () => {
    const image = makeImage(8, 8, [0, 0, 0, 255]);

    expect(() =>
      refineObjectMask(image, {
        ...grounding,
        polygon: grounding.polygon.slice(0, 15)
      })
    ).toThrow(/轮廓/);
  });

  it("rejects self-intersecting polygons before rasterization", () => {
    const image = makeImage(16, 16, [0, 0, 0, 255]);
    const crossingOrder = [
      0, 8, 4, 12, 1, 9, 5, 13,
      2, 10, 6, 14, 3, 11, 7, 15
    ];

    expect(() =>
      refineObjectMask(image, {
        ...grounding,
        polygon: crossingOrder.map((index) => grounding.polygon[index])
      })
    ).toThrow(/交叉/);
  });

  it("rejects invalid normalized grounding data", () => {
    const image = makeImage(8, 8, [0, 0, 0, 255]);

    expect(() =>
      refineObjectMask(image, {
        ...grounding,
        center: { x: 1.4, y: 0.5 }
      })
    ).toThrow(/物品位置/);
  });
});
