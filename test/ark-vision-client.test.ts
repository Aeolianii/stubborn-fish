import { describe, expect, it, vi } from "vitest";

import { ArkVisionClient } from "../src/services/ark-vision-client.js";

const config = {
  apiKey: "vision-secret-key",
  baseUrl: "https://ark.example.test/api/v3",
  model: "doubao-seed-2-1-turbo-260628",
  timeoutMs: 8_000
};

function makePolygon(pointCount: number): number[][] {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / pointCount;
    return [
      0.825 + Math.cos(angle) * 0.1,
      0.205 + Math.sin(angle) * 0.13
    ];
  });
}

function makeCropPolygon(pointCount: number): number[][] {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / pointCount;
    return [
      0.5 + Math.cos(angle) * 0.3,
      0.5 + Math.sin(angle) * 0.35
    ];
  });
}

const validGrounding = {
  target_found: true,
  target_label: "右上角的小鸟",
  bbox: {
    x_min: 0.7,
    y_min: 0.05,
    x_max: 0.95,
    y_max: 0.36
  },
  center: { x: 0.82, y: 0.19 },
  polygon: makePolygon(16),
  confidence: 0.91
};

const validDetection = {
  target_found: true,
  target_label: "右上角的小鸟",
  bbox: validGrounding.bbox,
  center: validGrounding.center,
  confidence: 0.94
};

const validContour = {
  target_found: true,
  target_label: "右上角的小鸟",
  polygon: makeCropPolygon(24),
  confidence: 0.91
};

const preparedCrop = {
  image: Buffer.from("cropped-image"),
  mimeType: "image/jpeg",
  region: {
    xMin: 0.65,
    yMin: 0.02,
    xMax: 0.98,
    yMax: 0.4
  }
};

describe("ArkVisionClient", () => {
  it("detects a bbox, traces the enlarged crop and maps it to the full image", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(validDetection)}\n\`\`\``
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify(validContour)
              }
            }
          ]
        })
      );
    const cropper = vi.fn().mockResolvedValue(preparedCrop);
    const client = new ArkVisionClient(config, fetchMock, cropper);

    const result = await client.locateObject({
      image: Buffer.from("source-image"),
      mimeType: "image/jpeg",
      description: "图片右上角的小鸟",
      subjectType: "animal"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cropper).toHaveBeenCalledWith(
      Buffer.from("source-image"),
      {
        xMin: 0.7,
        yMin: 0.05,
        xMax: 0.95,
        yMax: 0.36
      }
    );
    expect(result).toMatchObject({
      targetLabel: "右上角的小鸟",
      center: { x: 0.82, y: 0.19 },
      confidence: 0.91
    });
    expect(result.polygon).toHaveLength(24);
    expect(result.polygon[0]?.x).toBeCloseTo(0.914);
    expect(result.polygon[0]?.y).toBeCloseTo(0.21);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0]!;
    const firstBody = JSON.parse(String(firstInit?.body)) as {
      model: string;
      thinking: { type: string };
      messages: Array<{
        content: Array<Record<string, unknown>>;
      }>;
    };
    const [, secondInit] = fetchMock.mock.calls[1]!;
    const secondBody = JSON.parse(String(secondInit?.body)) as {
      messages: Array<{
        content: Array<{
          type: string;
          image_url?: { url: string };
          text?: string;
        }>;
      }>;
    };

    expect(firstUrl).toBe("https://ark.example.test/api/v3/chat/completions");
    expect(firstInit?.headers).toMatchObject({
      authorization: "Bearer vision-secret-key",
      "content-type": "application/json"
    });
    expect(firstBody.model).toBe("doubao-seed-2-1-turbo-260628");
    expect(firstBody.thinking).toEqual({ type: "disabled" });
    expect(firstBody.messages[0]?.content[0]).toEqual({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${Buffer.from("source-image").toString("base64")}`
      }
    });
    expect(firstBody.messages[0]?.content[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining("第一阶段")
    });
    expect(secondBody.messages[0]?.content[0]).toEqual({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${Buffer.from("cropped-image").toString("base64")}`
      }
    });
    expect(secondBody.messages[0]?.content[1]?.text).toContain("第二阶段");
  });

  it("falls back to the full-image contour when cropped tracing is invalid", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify(validDetection)
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...validContour,
                  polygon: makeCropPolygon(15)
                })
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
        choices: [
          {
            message: {
                content: JSON.stringify(validGrounding)
            }
          }
        ]
        })
      );
    const client = new ArkVisionClient(
      config,
      fetchMock,
      vi.fn().mockResolvedValue(preparedCrop)
    );

    const result = await client.locateObject({
      image: Buffer.from("source-image"),
      mimeType: "image/jpeg",
      description: "图片右上角的小鸟",
      subjectType: "animal"
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.polygon).toHaveLength(16);
    const thirdBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body)
    ) as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    expect(thirdBody.messages[0]?.content[1]?.text).toContain(
      "最终实心剪纸边界"
    );
  });

  it("rejects target-not-found and malformed coordinates", async () => {
    const notFoundFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                target_found: false,
                target_label: null,
                bbox: null,
                center: null,
                polygon: [],
                confidence: 0
              })
            }
          }
        ]
      })
    );
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...validGrounding,
                bbox: {
                  x_min: 0.9,
                  y_min: 0.1,
                  x_max: 0.4,
                  y_max: 0.3
                }
              })
            }
          }
        ]
      })
    );

    await expect(
      new ArkVisionClient(config, notFoundFetch).locateObject({
        image: Buffer.from("image"),
        mimeType: "image/png",
        description: "不存在的小鸟",
        subjectType: "animal"
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "TARGET_NOT_FOUND"
    });

    await expect(
      new ArkVisionClient(config, malformedFetch).locateObject({
        image: Buffer.from("image"),
        mimeType: "image/png",
        description: "小鸟",
        subjectType: "animal"
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "ARK_VISION_INVALID_RESPONSE"
    });
  });

  it.each([15, 33])(
    "rejects coarse polygons with %i points",
    async (pointCount) => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...validGrounding,
                  polygon: makePolygon(pointCount)
                })
              }
            }
          ]
          })
      );

      await expect(
        new ArkVisionClient(
          config,
          fetchMock,
          vi.fn().mockResolvedValue(preparedCrop)
        ).locateObject({
          image: Buffer.from("image"),
          mimeType: "image/png",
          description: "小鸟",
          subjectType: "animal"
        })
      ).rejects.toMatchObject({
        statusCode: 502,
        code: "ARK_VISION_INVALID_RESPONSE",
        message: expect.stringContaining("点数")
      });
    }
  );

  it("returns a compliance error for unsafe image content", async () => {
    const unsafeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                target_found: false,
                failure_reason: "unsafe_content",
                target_label: null,
                bbox: null,
                center: null,
                polygon: [],
                confidence: 0
              })
            }
          }
        ]
      })
    );

    await expect(
      new ArkVisionClient(config, unsafeFetch).locateObject({
        image: Buffer.from("image"),
        mimeType: "image/png",
        description: "目标",
        subjectType: "other"
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "UNSAFE_IMAGE",
      message: "该图片不合规"
    });
  });

  it("redacts the API key from upstream failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: `invalid token ${config.apiKey}` }
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" }
        }
      )
    );
    const client = new ArkVisionClient(config, fetchMock);

    try {
      await client.locateObject({
        image: Buffer.from("image"),
        mimeType: "image/webp",
        description: "小鸟",
        subjectType: "animal"
      });
      throw new Error("expected request to fail");
    } catch (error) {
      expect(String(error)).toContain("[REDACTED]");
      expect(String(error)).not.toContain(config.apiKey);
    }
  });
});
