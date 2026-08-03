import { describe, expect, it } from "vitest";

import "./helpers/aquarium-test-runtime.js";

const event = {
  title: "一小块屋檐",
  body: "旧车票落进水里后，月白绕了两圈，最后安静地停在下面，像是找到了一小块刚好的屋檐。",
  posterLine: "有些走过的路，会在水里变成屋檐。",
  eventType: "first-meeting",
  promptGuide: "小鱼第一次见到旧车票。",
  participants: [
    { id: "fish-1", type: "fish", name: "月白" },
    { id: "object-1", type: "object", name: "旧车票" }
  ],
  context: {
    fishName: "月白",
    objectName: "旧车票",
    capturedAt: "",
    capturedPlace: ""
  }
};

describe("aquarium story agent", () => {
  it("uses the local Ark proxy when no explicit AI adapter is provided", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestBody = null;
    globalThis.fetch = async (url, options) => {
      requestUrl = String(url);
      requestBody = JSON.parse(String(options.body));
      return Response.json({
        data: JSON.stringify({
          title: "水下屋檐",
          body: "月白绕着旧车票慢慢游了两圈，最后停在它的下方。水面落下来的光一闪一闪，像给这段安静相遇留了一个小小记号。",
          posterLine: "走过的路，也能在水里留下屋檐。"
        })
      });
    };

    try {
      const agent = globalThis.AquariumStoryAgent.createStoryAgent({
        timeoutMs: 50
      });
      const result = await agent.generate(event, []);

      expect(requestUrl).toBe("/api/story-generations");
      expect(requestBody.prompt).toContain("first-meeting");
      expect(result).toMatchObject({
        status: "generated",
        title: "水下屋檐"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the fixed model and accepts a valid structured story", async () => {
    let request;
    const agent = globalThis.AquariumStoryAgent.createStoryAgent({
      timeoutMs: 50,
      callAI(options) {
        request = options;
        options.success({
          data: JSON.stringify({
            title: "水下屋檐",
            body: "月白绕着旧车票慢慢游了两圈，最后停在它的下方。水面落下来的光一闪一闪，像给这段安静相遇留了一个小小记号。",
            posterLine: "走过的路，也能在水里留下屋檐。"
          })
        });
      }
    });

    const result = await agent.generate(event, []);

    expect(request.model).toBe("doubao-seed-2-1-turbo-260628");
    expect(request.stream).toBe(false);
    expect(request.messages.map((message) => message.role))
      .toEqual(["system", "user"]);
    expect(result.status).toBe("generated");
  });

  it("falls back after invalid output or timeout without rejecting", async () => {
    const invalidAgent = globalThis.AquariumStoryAgent.createStoryAgent({
      timeoutMs: 50,
      callAI(options) {
        options.success({
          data: JSON.stringify({
            title: "短",
            body: "太短",
            posterLine: "也短"
          })
        });
      }
    });
    await expect(invalidAgent.generate(event, [])).resolves.toMatchObject({
      status: "fallback",
      reason: "INVALID_LENGTH",
      title: event.title
    });

    let aborted = false;
    const timeoutAgent = globalThis.AquariumStoryAgent.createStoryAgent({
      timeoutMs: 5,
      callAI() {
        return {
          abort() {
            aborted = true;
          }
        };
      }
    });
    await expect(timeoutAgent.generate(event, [])).resolves.toMatchObject({
      status: "fallback",
      reason: "AI_TIMEOUT"
    });
    expect(aborted).toBe(true);
  });
});
