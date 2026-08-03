import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  cropGroundingImage,
  expandBoundingBox,
  mapPointFromCrop
} from "../src/services/grounding-image-crop.js";

describe("grounding image crop", () => {
  it("expands a detected bbox by 15 percent per side and clamps edges", () => {
    expect(
      expandBoundingBox({
        xMin: 0.2,
        yMin: 0.25,
        xMax: 0.6,
        yMax: 0.75
      })
    ).toEqual({
      xMin: 0.14,
      yMin: 0.175,
      xMax: 0.66,
      yMax: 0.825
    });

    expect(
      expandBoundingBox({
        xMin: 0.01,
        yMin: 0.02,
        xMax: 0.31,
        yMax: 0.42
      })
    ).toEqual({
      xMin: 0,
      yMin: 0,
      xMax: 0.355,
      yMax: 0.48
    });
  });

  it("maps crop-relative points back to the full image", () => {
    expect(
      mapPointFromCrop(
        { x: 0.25, y: 0.75 },
        { xMin: 0.2, yMin: 0.1, xMax: 0.8, yMax: 0.5 }
      )
    ).toEqual({
      x: 0.35,
      y: 0.4
    });
  });

  it("crops and enlarges the detected region for the second vision call", async () => {
    const source = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 40, g: 120, b: 200 }
      }
    })
      .png()
      .toBuffer();

    const crop = await cropGroundingImage(
      source,
      {
        xMin: 0.25,
        yMin: 0.2,
        xMax: 0.75,
        yMax: 0.8
      },
      {
        paddingRatio: 0,
        targetLongEdge: 100
      }
    );
    const metadata = await sharp(crop.image).metadata();

    expect(crop.mimeType).toBe("image/jpeg");
    expect(crop.region).toEqual({
      xMin: 0.25,
      yMin: 0.2,
      xMax: 0.75,
      yMax: 0.8
    });
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(60);
  });
});
