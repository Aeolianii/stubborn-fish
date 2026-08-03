import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  CutoutServiceContract
} from "../src/services/cutout-service.js";
import type {
  ObjectGroundingServiceContract
} from "../src/services/object-grounding-service.js";

const config: AppConfig = {
  server: { host: "127.0.0.1", port: 3000 },
  seedream: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seedream-5-0-pro-260628",
    timeoutMs: 5_000
  },
  vision: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 8_000
  },
  story: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 12_000
  },
  storage: {
    directory: "D:/test/object-groundings",
    ttlMs: 60_000
  },
  upload: { maxBytes: 1024 * 1024 }
};

const grounding = {
  targetLabel: "右上角的小鸟",
  bbox: { xMin: 0.7, yMin: 0.05, xMax: 0.95, yMax: 0.36 },
  center: { x: 0.82, y: 0.19 },
  polygon: [
    { x: 0.74, y: 0.08 },
    { x: 0.79, y: 0.06 },
    { x: 0.85, y: 0.06 },
    { x: 0.91, y: 0.08 },
    { x: 0.94, y: 0.12 },
    { x: 0.95, y: 0.18 },
    { x: 0.94, y: 0.25 },
    { x: 0.91, y: 0.31 },
    { x: 0.86, y: 0.35 },
    { x: 0.8, y: 0.35 },
    { x: 0.75, y: 0.32 },
    { x: 0.72, y: 0.28 },
    { x: 0.7, y: 0.22 },
    { x: 0.7, y: 0.16 },
    { x: 0.71, y: 0.12 },
    { x: 0.72, y: 0.09 }
  ],
  confidence: 0.91
};

function fakeCutoutService(): CutoutServiceContract {
  return {
    create: vi.fn(),
    get: vi.fn(),
    getImage: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
}

function multipartRequest(options: {
  image: Buffer;
  description?: string;
  subjectType?: string | null;
}): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----object-grounding-test-boundary";
  const fields = [
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="description"\r\n\r\n' +
        `${options.description ?? "图片右上角的小鸟"}\r\n`
    )
  ];

  if (options.subjectType !== null) {
    fields.push(
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="subjectType"\r\n\r\n' +
          `${options.subjectType ?? "animal"}\r\n`
      )
    );
  }

  const payload = Buffer.concat([
    ...fields,
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="image"; filename="bird.png"\r\n' +
        "Content-Type: image/png\r\n\r\n"
    ),
    options.image,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    }
  };
}

describe("object grounding route", () => {
  it("returns normalized bbox, center and polygon from the grounding service", async () => {
    const image = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: { r: 30, g: 80, b: 160 }
      }
    })
      .png()
      .toBuffer();
    const groundingService: ObjectGroundingServiceContract = {
      locate: vi.fn().mockResolvedValue(grounding)
    };
    const app = await buildApp({
      config,
      service: fakeCutoutService(),
      groundingService
    });
    const request = multipartRequest({
      image,
      subjectType: "animal"
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/object-groundings",
      ...request
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ grounding });
    expect(groundingService.locate).toHaveBeenCalledWith({
      image,
      mimeType: "image/png",
      description: "图片右上角的小鸟",
      subjectType: "animal"
    });

    await app.close();
  });

  it("rejects an empty target description before calling the service", async () => {
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
    const groundingService: ObjectGroundingServiceContract = {
      locate: vi.fn()
    };
    const app = await buildApp({
      config,
      service: fakeCutoutService(),
      groundingService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/object-groundings",
      ...multipartRequest({
        image,
        description: " ",
        subjectType: "animal"
      })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_DESCRIPTION");
    expect(groundingService.locate).not.toHaveBeenCalled();

    await app.close();
  });

  it.each([
    [null, "SUBJECT_TYPE_REQUIRED"],
    ["vehicle", "INVALID_SUBJECT_TYPE"]
  ])(
    "rejects subject type %s before calling the service",
    async (subjectType, expectedCode) => {
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
      const groundingService: ObjectGroundingServiceContract = {
        locate: vi.fn()
      };
      const app = await buildApp({
        config,
        service: fakeCutoutService(),
        groundingService
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/object-groundings",
        ...multipartRequest({ image, subjectType })
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe(expectedCode);
      expect(groundingService.locate).not.toHaveBeenCalled();

      await app.close();
    }
  );
});
