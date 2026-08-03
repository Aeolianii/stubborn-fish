import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";

export interface StoryGenerationInput {
  prompt: string;
}

export interface StoryGenerationServiceContract {
  generate(input: StoryGenerationInput): Promise<string>;
}

type FetchImplementation = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

interface ArkStoryResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{
        type?: string;
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const SYSTEM_PROMPT =
  "你是私人记忆生态缸的克制故事作者。你只写作，不修改任何玩法数值或状态。"
  + "只返回包含 title、body、posterLine 的 JSON 对象，不要返回 Markdown。";

function messageText(payload: ArkStoryResponse): string {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text!.trim())
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export class ArkStoryClient implements StoryGenerationServiceContract {
  constructor(
    private readonly config: AppConfig["story"],
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async generate(input: StoryGenerationInput): Promise<string> {
    const prompt = input.prompt.trim();

    if (!prompt) {
      throw new AppError(
        400,
        "STORY_PROMPT_REQUIRED",
        "故事提示不能为空"
      );
    }

    let response: Response;

    try {
      response = await this.fetchImplementation(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              {
                role: "user",
                content: prompt
              }
            ],
            stream: false,
            temperature: 0.7,
            max_tokens: 220,
            thinking: {
              type: "disabled"
            }
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );
    } catch (error) {
      const timedOut =
        error instanceof Error
        && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AppError(
        timedOut ? 504 : 502,
        timedOut ? "ARK_STORY_TIMEOUT" : "ARK_STORY_UNAVAILABLE",
        timedOut
          ? "故事生成超过 12 秒，已使用本地故事"
          : "暂时无法连接故事生成服务",
        { cause: error }
      );
    }

    const payload = await this.readPayload(response);

    if (!response.ok) {
      const upstreamMessage =
        payload.error?.message?.trim() || response.statusText || "未知错误";
      const safeMessage = upstreamMessage.replaceAll(
        this.config.apiKey,
        "[REDACTED]"
      );
      throw new AppError(
        502,
        "ARK_STORY_UPSTREAM_ERROR",
        `故事 API 请求失败（${response.status}）：${safeMessage}`
      );
    }

    const content = messageText(payload);

    if (!content) {
      throw new AppError(
        502,
        "ARK_STORY_INVALID_RESPONSE",
        "故事 API 未返回故事文本"
      );
    }

    return content;
  }

  private async readPayload(response: Response): Promise<ArkStoryResponse> {
    try {
      return (await response.json()) as ArkStoryResponse;
    } catch {
      if (!response.ok) {
        return { error: { message: "上游返回了非 JSON 错误响应" } };
      }
      throw new AppError(
        502,
        "ARK_STORY_INVALID_RESPONSE",
        "故事 API 返回了无法解析的 JSON"
      );
    }
  }
}
