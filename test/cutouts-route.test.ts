import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { CutoutRecord } from "../src/domain/cutout.js";
import type { CutoutServiceContract } from "../src/services/cutout-service.js";

const id = "123e4567-e89b-42d3-a456-426614174000";
const readyRecord: CutoutRecord = {
  id,
  status: "ready",
  description: "保留蓝色杯子",
  source: "camera",
  name: null,
  category: null,
  attributes: null,
  mimeType: "image/png",
  usedFallback: false,
  transparencyRatio: 0.8,
  createdAt: "2026-07-29T00:00:00.000Z",
  expiresAt: "2026-07-29T00:30:00.000Z"
};

const config: AppConfig = {
  server: { host: "127.0.0.1", port: 3000 },
  seedream: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "ep-test",
    timeoutMs: 5_000
  },
  vision: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 5_000
  },
  story: {
    apiKey: "test-key",
    baseUrl: "https://ark.example.test/api/v3",
    model: "doubao-seed-2-1-turbo-260628",
    timeoutMs: 12_000
  },
  storage: {
    directory: "./data/test",
    ttlMs: 30 * 60_000
  },
  upload: {
    maxBytes: 1024 * 1024
  }
};

function fakeService(
  overrides: Partial<CutoutServiceContract> = {}
): CutoutServiceContract {
  return {
    create: vi.fn().mockResolvedValue(readyRecord),
    get: vi.fn().mockResolvedValue(readyRecord),
    getImage: vi.fn().mockResolvedValue(Buffer.from("png-image")),
    update: vi.fn().mockResolvedValue({
      ...readyRecord,
      name: "小蓝",
      category: "other"
    }),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

function multipartRequest(options: {
  description?: string;
  subjectType?: string;
  source?: string;
  mimeType?: string;
  image?: Buffer;
  extraFields?: Array<readonly [string, string]>;
}): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----cutout-test-boundary";
  const chunks: Buffer[] = [];
  const addField = (name: string, value: string): void => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`
      )
    );
  };

  if (options.description !== undefined) {
    addField("description", options.description);
  }
  if (options.subjectType !== undefined) {
    addField("subjectType", options.subjectType);
  }
  if (options.source !== undefined) {
    addField("source", options.source);
  }
  for (const [name, value] of options.extraFields ?? []) {
    addField(name, value);
  }

  if (options.image !== undefined) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="image"; filename="input.jpg"\r\n' +
          `Content-Type: ${options.mimeType ?? "image/jpeg"}\r\n\r\n`
      ),
      options.image,
      Buffer.from("\r\n")
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(chunks),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    }
  };
}

describe("cutout routes", () => {
  it("reports health and the four placeholder categories", async () => {
    const app = await buildApp({ config, service: fakeService() });

    const health = await app.inject({ method: "GET", url: "/health" });
    const categories = await app.inject({
      method: "GET",
      url: "/api/cutout-categories"
    });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(categories.statusCode).toBe(200);
    expect(categories.json()).toEqual({
      categories: [
        { value: "animal", label: "动物", attributes: null },
        { value: "plant", label: "植物", attributes: null },
        { value: "natural_landscape", label: "自然景观", attributes: null },
        { value: "other", label: "其他类", attributes: null }
      ]
    });

    await app.close();
  });

  it("accepts a camera image and returns a temporary preview URL", async () => {
    const service = fakeService();
    const app = await buildApp({ config, service });
    const request = multipartRequest({
      description: "保留蓝色杯子",
      subjectType: "other",
      source: "camera",
      mimeType: "image/jpeg",
      image: Buffer.from("jpeg-image")
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cutouts",
      ...request
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      cutout: {
        id,
        previewUrl: `/api/cutouts/${id}/image`,
        attributes: null
      }
    });
    expect(service.create).toHaveBeenCalledWith({
      image: Buffer.from("jpeg-image"),
      mimeType: "image/jpeg",
      description: "保留蓝色杯子",
      subjectType: "other",
      source: "camera"
    });

    await app.close();
  });

  it("allows an empty optional description and rejects unsupported file type", async () => {
    const service = fakeService();
    const app = await buildApp({ config, service });
    const emptyDescription = multipartRequest({
      description: "",
      subjectType: "plant",
      image: Buffer.from("image")
    });
    const unsupported = multipartRequest({
      description: "保留主体",
      subjectType: "other",
      mimeType: "image/gif",
      image: Buffer.from("gif")
    });

    const emptyResponse = await app.inject({
      method: "POST",
      url: "/api/cutouts",
      ...emptyDescription
    });
    const unsupportedResponse = await app.inject({
      method: "POST",
      url: "/api/cutouts",
      ...unsupported
    });

    expect(emptyResponse.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith({
      image: Buffer.from("image"),
      mimeType: "image/jpeg",
      description: "",
      subjectType: "plant",
      source: "album"
    });
    expect(unsupportedResponse.statusCode).toBe(415);
    expect(unsupportedResponse.json().error.code).toBe(
      "UNSUPPORTED_IMAGE_TYPE"
    );

    await app.close();
  });

  it("returns 413 when multipart field or part limits are exceeded", async () => {
    const app = await buildApp({ config, service: fakeService() });
    const request = multipartRequest({
      description: "保留主体",
      subjectType: "other",
      source: "album",
      image: Buffer.from("image"),
      extraFields: [["unexpected", "value"]]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cutouts",
      ...request
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("MULTIPART_LIMIT_EXCEEDED");

    await app.close();
  });

  it("returns the PNG and supports metadata confirmation", async () => {
    const service = fakeService();
    const app = await buildApp({ config, service });

    const image = await app.inject({
      method: "GET",
      url: `/api/cutouts/${id}/image`
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/api/cutouts/${id}`,
      payload: {
        name: "小蓝",
        category: "other"
      }
    });

    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload).toEqual(Buffer.from("png-image"));
    expect(update.statusCode).toBe(200);
    expect(update.json().cutout).toMatchObject({
      name: "小蓝",
      category: "other",
      attributes: null
    });
    expect(service.update).toHaveBeenCalledWith(id, {
      name: "小蓝",
      category: "other"
    });

    await app.close();
  });

  it("rejects invalid categories and returns friendly 404 errors", async () => {
    const service = fakeService({
      get: vi.fn().mockResolvedValue(null),
      getImage: vi.fn().mockResolvedValue(null)
    });
    const app = await buildApp({ config, service });

    const invalidCategory = await app.inject({
      method: "PATCH",
      url: `/api/cutouts/${id}`,
      payload: {
        name: "小蓝",
        category: "vehicle"
      }
    });
    const missing = await app.inject({
      method: "GET",
      url: `/api/cutouts/${id}`
    });

    expect(invalidCategory.statusCode).toBe(400);
    expect(invalidCategory.json().error.code).toBe("VALIDATION_ERROR");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("CUTOUT_NOT_FOUND");

    await app.close();
  });
});
