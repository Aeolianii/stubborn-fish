import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";

export interface GenerateCutoutInput {
  image: Buffer;
  mimeType: string;
  prompt: string;
}

type FetchImplementation = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

interface SeedreamResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
  };
}

export class SeedreamClient {
  constructor(
    private readonly config: AppConfig["seedream"],
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async generateCutout(input: GenerateCutoutInput): Promise<Buffer> {
    if (input.image.length === 0) {
      throw new Error("不能向 Seedream 发送空图片");
    }

    let response: Response;

    try {
      response = await this.fetchImplementation(
        `${this.config.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: this.config.model,
            prompt: input.prompt,
            image: [
              `data:${input.mimeType};base64,${input.image.toString("base64")}`
            ],
            sequential_image_generation: "disabled",
            response_format: "b64_json",
            size: "2K",
            stream: false,
            watermark: false
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AppError(
        timedOut ? 504 : 502,
        timedOut ? "SEEDREAM_TIMEOUT" : "SEEDREAM_UNAVAILABLE",
        timedOut
          ? "Seedream 抠图请求超时，请稍后重试"
          : "暂时无法连接 Seedream 抠图服务",
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
        "SEEDREAM_UPSTREAM_ERROR",
        `Seedream API 请求失败（${response.status}）：${safeMessage}`
      );
    }

    const base64 = payload.data?.[0]?.b64_json;

    if (!base64) {
      throw new AppError(
        502,
        "SEEDREAM_INVALID_RESPONSE",
        "Seedream API 未返回 Base64 图片；为遵守网络限制，不下载 URL 形式的结果"
      );
    }

    const image = Buffer.from(base64, "base64");

    if (image.length === 0) {
      throw new AppError(
        502,
        "SEEDREAM_INVALID_RESPONSE",
        "Seedream API 返回了空的 Base64 图片"
      );
    }

    return image;
  }

  private async readPayload(response: Response): Promise<SeedreamResponse> {
    try {
      return (await response.json()) as SeedreamResponse;
    } catch {
      if (!response.ok) {
        return { error: { message: "上游返回了非 JSON 错误响应" } };
      }

      throw new AppError(
        502,
        "SEEDREAM_INVALID_RESPONSE",
        "Seedream API 返回了无法解析的 JSON"
      );
    }
  }
}
