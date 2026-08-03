(function (root) {
  "use strict";

  const MODEL = "doubao-seed-2-1-turbo-260628";
  const TIMEOUT_MS = 12 * 1000;
  const UNSAFE_PATTERN = /(https?:\/\/|二维码|微信|QQ|加群|关注|下载|购买|博彩|色情|恐怖袭击)/i;

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function stripCodeFence(value) {
    return cleanText(value)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/^data:\s*/i, "");
  }

  function parseStory(value) {
    if (value && typeof value === "object") return value;
    const text = stripCodeFence(value);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_secondError) {
        return null;
      }
    }
  }

  function validateStory(value) {
    const story = parseStory(value);
    if (!story || typeof story !== "object") {
      return { valid: false, reason: "INVALID_JSON", story: null };
    }
    const normalized = {
      title: cleanText(story.title),
      body: cleanText(story.body),
      posterLine: cleanText(story.posterLine)
    };
    if (
      normalized.title.length < 2
      || normalized.title.length > 20
      || normalized.body.length < 40
      || normalized.body.length > 80
      || normalized.posterLine.length < 6
      || normalized.posterLine.length > 40
    ) {
      return { valid: false, reason: "INVALID_LENGTH", story: normalized };
    }
    if (
      UNSAFE_PATTERN.test(normalized.title)
      || UNSAFE_PATTERN.test(normalized.body)
      || UNSAFE_PATTERN.test(normalized.posterLine)
    ) {
      return { valid: false, reason: "UNSAFE_CONTENT", story: normalized };
    }
    return { valid: true, reason: "", story: normalized };
  }

  function buildPrompt(event, recentFingerprints) {
    const context = event.context || {};
    const facts = {
      eventType: event.eventType,
      promptGuide: event.promptGuide,
      participants: event.participants || [],
      relationshipStage: event.relationshipStage || "陌生"
    };
    if (context.capturedAt) facts.capturedAt = context.capturedAt;
    if (context.capturedPlace) facts.capturedPlace = context.capturedPlace;
    return [
      "请为私人记忆生态缸写一段短故事。",
      "只使用输入中明确提供的事实，不虚构时间、地点、私人经历或人物关系。",
      "正文严格为40到80个中文字符；风格轻盈、克制、有画面感，不堆砌形容词。",
      "不得包含营销、联系方式、站外引导、二维码、侵权角色或不安全内容。",
      "只返回JSON对象，字段必须是title、body、posterLine，不要返回Markdown。",
      `事件资料：${JSON.stringify(facts)}`,
      `近期指纹（避免重复隐喻）：${JSON.stringify((recentFingerprints || []).slice(-20))}`
    ].join("\n");
  }

  function fallbackResult(event, reason) {
    return {
      title: cleanText(event.title) || "水下新故事",
      body: cleanText(event.body) || "鱼群在水光里慢慢游过，一段没有被催促的相遇，就这样安静地留在了今天的生态缸里。",
      posterLine: cleanText(event.posterLine) || "让每一段相遇，在水里慢慢长成记忆。",
      status: "fallback",
      reason: reason || "AI_UNAVAILABLE",
      resolvedAt: Date.now()
    };
  }

  function createBackendCaller(endpoint) {
    if (typeof root.fetch !== "function") return null;
    const url = cleanText(endpoint) || "/api/story-generations";

    return function callBackend(options) {
      const controller = typeof root.AbortController === "function"
        ? new root.AbortController()
        : null;
      const userMessage = (options.messages || []).find(
        (message) => message && message.role === "user"
      );

      root.fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          prompt: cleanText(userMessage && userMessage.content)
        }),
        signal: controller ? controller.signal : undefined
      })
        .then(async (response) => {
          let payload = null;
          try {
            payload = await response.json();
          } catch (_error) {
            payload = null;
          }
          if (!response.ok || !payload || typeof payload.data !== "string") {
            const apiError = payload && payload.error;
            throw {
              errorType: apiError && apiError.code
                ? apiError.code
                : `HTTP_${response.status}`
            };
          }
          options.success({ data: payload.data });
        })
        .catch((error) => {
          options.fail({
            errorType: error && (
              error.errorType
              || error.name
              || error.code
            ) || "ARK_PROXY_FAILED"
          });
        });

      return {
        abort() {
          if (controller) controller.abort();
        }
      };
    };
  }

  function createStoryAgent(options) {
    const config = options || {};
    const timeoutMs = Number.isFinite(Number(config.timeoutMs))
      ? Math.max(1, Number(config.timeoutMs))
      : TIMEOUT_MS;
    const callAI = typeof config.callAI === "function"
      ? config.callAI
      : createBackendCaller(config.endpoint);

    function generate(event, recentFingerprints) {
      if (!callAI) return Promise.resolve(fallbackResult(event, "AI_UNAVAILABLE"));
      return new Promise((resolve) => {
        let finished = false;
        let task = null;
        const settle = (result) => {
          if (finished) return;
          finished = true;
          root.clearTimeout(timer);
          resolve(result);
        };
        const timer = root.setTimeout(() => {
          if (task && typeof task.abort === "function") {
            try {
              task.abort();
            } catch (_error) {
              // The local fallback is already sufficient.
            }
          }
          settle(fallbackResult(event, "AI_TIMEOUT"));
        }, timeoutMs);

        try {
          task = callAI({
            type: "text",
            stream: false,
            model: MODEL,
            messages: [
              {
                role: "system",
                content: "你是私人记忆生态缸的克制故事作者。你只写作，不修改任何玩法数值或状态。"
              },
              {
                role: "user",
                content: buildPrompt(event, recentFingerprints)
              }
            ],
            temperature: 0.7,
            maxTokens: 220,
            success(response) {
              const validation = validateStory(response && response.data);
              if (!validation.valid) {
                settle(fallbackResult(event, validation.reason));
                return;
              }
              settle({
                ...validation.story,
                status: "generated",
                resolvedAt: Date.now()
              });
            },
            fail(error) {
              const reason = error && (
                error.errorCode
                || error.errCode
                || error.errNo
                || error.errorType
              );
              settle(fallbackResult(event, reason ? `AI_${reason}` : "AI_FAILED"));
            }
          });
        } catch (_error) {
          settle(fallbackResult(event, "AI_FAILED"));
        }
      });
    }

    return { generate };
  }

  root.AquariumStoryAgent = {
    MODEL,
    TIMEOUT_MS,
    parseStory,
    validateStory,
    buildPrompt,
    fallbackResult,
    createBackendCaller,
    createStoryAgent
  };
})(globalThis);
