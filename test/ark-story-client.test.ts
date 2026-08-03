import { describe, expect, it, vi } from "vitest";

import { ArkStoryClient } from "../src/services/ark-story-client.js";

const config = {
  apiKey: "story-secret-key",
  baseUrl: "https://ark.example.test/api/v3",
  model: "doubao-seed-2-1-turbo-260628",
  timeoutMs: 12_000
};

describe("ArkStoryClient", () => {
  it("sends a fixed-model chat completion request and returns its text", async () => {
    const content = JSON.stringify({
      title: "水下屋檐",
      body: "月白绕着旧车票慢慢游了两圈，最后停在它的下方。水面落下来的光一闪一闪，像给这段安静相遇留了一个小小记号。",
      posterLine: "走过的路，也能在水里留下屋檐。"
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [{ message: { role: "assistant", content } }]
      })
    );
    const client = new ArkStoryClient(config, fetchMock);

    await expect(client.generate({ prompt: "为这次相遇写故事" }))
      .resolves.toBe(content);

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(url).toBe("https://ark.example.test/api/v3/chat/completions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer story-secret-key",
      "content-type": "application/json"
    });
    expect(body).toMatchObject({
      model: "doubao-seed-2-1-turbo-260628",
      stream: false,
      temperature: 0.7,
      max_tokens: 220,
      thinking: {
        type: "disabled"
      },
      messages: [
        {
          role: "system",
          content: expect.any(String)
        },
        {
          role: "user",
          content: "为这次相遇写故事"
        }
      ]
    });
  });

  it("rejects malformed responses and redacts the API key from errors", async () => {
    const invalidClient = new ArkStoryClient(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ choices: [] })
      )
    );
    await expect(invalidClient.generate({ prompt: "写故事" }))
      .rejects.toThrow(/未返回故事文本/);

    const failedClient = new ArkStoryClient(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { message: `invalid token ${config.apiKey}` } },
          { status: 401 }
        )
      )
    );

    try {
      await failedClient.generate({ prompt: "写故事" });
    } catch (error) {
      expect(String(error)).not.toContain(config.apiKey);
      expect(String(error)).toContain("[REDACTED]");
    }
  });
});
