import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { validateInputImage } from "../src/services/input-image.js";

describe("validateInputImage", () => {
  it("accepts a decodable JPEG with matching MIME type", async () => {
    const image = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 10, g: 20, b: 30 }
      }
    })
      .jpeg()
      .toBuffer();

    await expect(
      validateInputImage(image, "image/jpeg")
    ).resolves.toBeUndefined();
  });

  it("rejects bytes that are not an image", async () => {
    await expect(
      validateInputImage(Buffer.from("not-image"), "image/png")
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_IMAGE"
    });
  });

  it("rejects images smaller than 64 by 64 pixels", async () => {
    const image = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 10, g: 20, b: 30 }
      }
    })
      .png()
      .toBuffer();

    await expect(
      validateInputImage(image, "image/png")
    ).rejects.toThrow(/64/);
  });

  it("rejects a MIME type that does not match the decoded format", async () => {
    const image = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 10, g: 20, b: 30 }
      }
    })
      .png()
      .toBuffer();

    await expect(
      validateInputImage(image, "image/jpeg")
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "IMAGE_TYPE_MISMATCH"
    });
  });
});
