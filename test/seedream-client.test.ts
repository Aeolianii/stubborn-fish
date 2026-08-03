import { describe, expect, it, vi } from "vitest";

import { SeedreamClient } from "../src/services/seedream-client.js";

const config = {
  apiKey: "secret-key",
  baseUrl: "https://ark.example.test/api/v3",
  model: "doubao-seedream-5-0-260128",
  timeoutMs: 5_000
};

describe("SeedreamClient", () => {
  it("sends the source image for image-to-image generation and decodes the Base64 PNG response", async () => {
    const expected = Buffer.from("png-result");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: expected.toString("base64") }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    const client = new SeedreamClient(config, fetchMock);

    const result = await client.generateCutout({
      image: Buffer.from("source-image"),
      mimeType: "image/jpeg",
      prompt: "只保留蓝色杯子"
    });

    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(url).toBe("https://ark.example.test/api/v3/images/generations");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer secret-key",
      "content-type": "application/json"
    });
    expect(body).toMatchObject({
      model: "doubao-seedream-5-0-260128",
      prompt: "只保留蓝色杯子",
      image: [
        `data:image/jpeg;base64,${Buffer.from("source-image").toString("base64")}`
      ],
      sequential_image_generation: "disabled",
      response_format: "b64_json",
      size: "2K",
      stream: false,
      watermark: false
    });
    expect(body).not.toHaveProperty("output_format");
  });

  it("surfaces a safe upstream error without exposing the API key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "model unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      })
    );
    const client = new SeedreamClient(config, fetchMock);

    await expect(
      client.generateCutout({
        image: Buffer.from("source-image"),
        mimeType: "image/png",
        prompt: "保留主体"
      })
    ).rejects.toThrow(/503.*model unavailable/);

    try {
      await client.generateCutout({
        image: Buffer.from("source-image"),
        mimeType: "image/png",
        prompt: "保留主体"
      });
    } catch (error) {
      expect(String(error)).not.toContain(config.apiKey);
    }
  });

  it("rejects URL-only responses to avoid a second non-API network request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [{ url: "https://remote.example.test/result.png" }]
      })
    );
    const client = new SeedreamClient(config, fetchMock);

    await expect(
      client.generateCutout({
        image: Buffer.from("source-image"),
        mimeType: "image/png",
        prompt: "保留主体"
      })
    ).rejects.toThrow(/Base64/);
  });
});
