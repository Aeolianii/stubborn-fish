import { describe, expect, it, vi } from "vitest";

import type { CutoutRecord } from "../src/domain/cutout.js";
import { CutoutService } from "../src/services/cutout-service.js";

const record: CutoutRecord = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  status: "ready",
  description: "保留蓝色杯子",
  source: "camera",
  name: null,
  category: null,
  attributes: null,
  mimeType: "image/png",
  usedFallback: true,
  transparencyRatio: 0.7,
  createdAt: "2026-07-29T00:00:00.000Z",
  expiresAt: "2026-07-29T00:30:00.000Z"
};

describe("CutoutService", () => {
  it("builds an image-to-image prompt, invokes Seedream, ensures transparency and stores the result", async () => {
    const generateCutout = vi
      .fn()
      .mockResolvedValue(Buffer.from("seedream-result"));
    const create = vi.fn().mockResolvedValue(record);
    const makeTransparent = vi.fn().mockResolvedValue({
      buffer: Buffer.from("transparent-result"),
      usedFallback: true,
      transparencyRatio: 0.7
    });
    const validateImage = vi.fn().mockResolvedValue(undefined);
    const service = new CutoutService(
      { generateCutout },
      {
        create,
        get: vi.fn(),
        getImage: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      makeTransparent,
      validateImage
    );

    const result = await service.create({
      image: Buffer.from("uploaded-image"),
      mimeType: "image/jpeg",
      description: "保留蓝色杯子",
      subjectType: "other",
      source: "camera"
    });

    expect(result).toEqual(record);
    expect(validateImage).toHaveBeenCalledWith(
      Buffer.from("uploaded-image"),
      "image/jpeg"
    );
    expect(generateCutout).toHaveBeenCalledWith({
      image: Buffer.from("uploaded-image"),
      mimeType: "image/jpeg",
      prompt: expect.stringContaining("直接参考输入图片进行图生图编辑")
    });
    expect(makeTransparent).toHaveBeenCalledWith(
      Buffer.from("seedream-result")
    );
    expect(create).toHaveBeenCalledWith({
      image: Buffer.from("transparent-result"),
      description: "保留蓝色杯子",
      source: "camera",
      usedFallback: true,
      transparencyRatio: 0.7
    });
  });
});
