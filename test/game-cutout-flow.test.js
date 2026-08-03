import { describe, expect, it } from "vitest";

import "../game/js/cutout-flow.js";

describe("aquarium cutout dialog flow", () => {
  it("moves from capture to processing to result and builds a placement payload", () => {
    const { createCutoutSession } = globalThis.AquariumCutoutFlow;
    const session = createCutoutSession();
    const file = {
      name: "red-fish.png",
      size: 12_000,
      type: "image/png"
    };
    const transparentBlob = { type: "image/png", size: 2_000 };

    expect(session.snapshot()).toMatchObject({
      stage: "capture",
      canGenerate: false,
      placement: "fish"
    });

    session.update({
      file,
      description: "画面中央的红色玩具鱼",
      subjectType: "land_animal",
      name: "小红",
      placement: "fish"
    });
    expect(session.snapshot().canGenerate).toBe(true);

    session.beginGeneration();
    expect(session.snapshot()).toMatchObject({
      stage: "processing",
      canGenerate: false
    });

    session.resolveGeneration({
      transparentBlob,
      targetLabel: "红色玩具鱼"
    });
    expect(session.snapshot()).toMatchObject({
      stage: "result",
      canConfirm: true
    });
    expect(session.createPlacementPayload()).toEqual({
      transparentBlob,
      name: "小红",
      placement: "fish",
      targetLabel: "红色玩具鱼"
    });
  });

  it("returns to capture after a failure without losing user input", () => {
    const { createCutoutSession } = globalThis.AquariumCutoutFlow;
    const session = createCutoutSession();
    const file = {
      name: "plant.webp",
      size: 8_000,
      type: "image/webp"
    };

    session.update({
      file,
      description: "右侧的绿色水草",
      subjectType: "plant",
      name: "",
      placement: "bottom"
    });
    session.beginGeneration();
    session.failGeneration("没有识别到完整目标");

    expect(session.snapshot()).toMatchObject({
      stage: "result",
      error: "没有识别到完整目标",
      canConfirm: false
    });

    session.backToCapture();
    expect(session.snapshot()).toMatchObject({
      stage: "capture",
      description: "右侧的绿色水草",
      subjectType: "plant",
      placement: "bottom",
      canGenerate: true
    });
  });

  it("rejects unsupported or oversized images before generation", () => {
    const { createCutoutSession } = globalThis.AquariumCutoutFlow;
    const session = createCutoutSession();

    expect(() =>
      session.update({
        file: { name: "note.txt", size: 10, type: "text/plain" }
      })
    ).toThrow(/JPEG、PNG 或 WebP/);

    expect(() =>
      session.update({
        file: {
          name: "huge.jpg",
          size: 5 * 1024 * 1024 + 1,
          type: "image/jpeg"
        }
      })
    ).toThrow(/5 MB/);
  });
});
