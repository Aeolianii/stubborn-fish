import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ensureTransparentPng } from "../src/services/alpha-matte.js";

describe("ensureTransparentPng", () => {
  it("keeps an existing transparent PNG without applying the fallback", async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0 }
      }
    })
      .png()
      .toBuffer();

    const result = await ensureTransparentPng(source);
    const metadata = await sharp(result.buffer).metadata();

    expect(result.usedFallback).toBe(false);
    expect(result.transparencyRatio).toBe(1);
    expect(metadata.format).toBe("png");
    expect(metadata.hasAlpha).toBe(true);
  });

  it("removes an opaque border-connected magenta key background", async () => {
    const width = 7;
    const height = 7;
    const pixels = Buffer.alloc(width * height * 3);

    for (let offset = 0; offset < pixels.length; offset += 3) {
      pixels[offset] = 255;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 255;
    }

    for (let y = 1; y <= 5; y += 1) {
      for (let x = 1; x <= 5; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = 220;
        pixels[offset + 1] = 20;
        pixels[offset + 2] = 20;
      }
    }
    const whiteOffset = (3 * width + 3) * 3;
    pixels[whiteOffset] = 255;
    pixels[whiteOffset + 1] = 255;
    pixels[whiteOffset + 2] = 255;

    const source = await sharp(pixels, {
      raw: { width, height, channels: 3 }
    })
      .png()
      .toBuffer();

    const result = await ensureTransparentPng(source);
    const { data, info } = await sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cornerAlpha = data[3];
    const centerOffset = (3 * info.width + 3) * 4;
    const centerAlpha = data[centerOffset + 3];

    expect(result.usedFallback).toBe(true);
    expect(result.transparencyRatio).toBeGreaterThan(0.4);
    expect(cornerAlpha).toBe(0);
    expect(centerAlpha).toBe(255);
    expect([...data.subarray(centerOffset, centerOffset + 3)])
      .toEqual([255, 255, 255]);
  });

  it("removes a connected white background while preserving enclosed white foreground", async () => {
    const width = 9;
    const height = 9;
    const pixels = Buffer.alloc(width * height * 3, 255);

    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = 35;
        pixels[offset + 1] = 95;
        pixels[offset + 2] = 180;
      }
    }
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
      }
    }

    const source = await sharp(pixels, {
      raw: { width, height, channels: 3 }
    })
      .png()
      .toBuffer();

    const result = await ensureTransparentPng(source);
    const { data, info } = await sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centerOffset = (4 * info.width + 4) * 4;

    expect(result.usedFallback).toBe(true);
    expect(data[3]).toBe(0);
    expect([...data.subarray(centerOffset, centerOffset + 4)])
      .toEqual([255, 255, 255, 255]);
  });

  it("rejects data that is not a valid image", async () => {
    await expect(
      ensureTransparentPng(Buffer.from("not-an-image"))
    ).rejects.toThrow(/图片/);
  });
});
