export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  vision: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  upload: {
    maxBytes: number;
  };
}

function positiveNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number
): number {
  const raw = env[name]?.trim();
  const value = raw === undefined || raw === "" ? fallback : Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`环境变量 ${name} 必须是大于 0 的数字`);
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("ARK_VISION_BASE_URL 必须使用 http 或 https 协议");
  }

  return value.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = env.ARK_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("缺少必需环境变量 ARK_API_KEY");
  }

  const maxUploadMb = positiveNumber(env, "MAX_UPLOAD_MB", 5);

  return {
    server: {
      host: env.HOST?.trim() || "127.0.0.1",
      port: positiveNumber(env, "PORT", 3000)
    },
    vision: {
      apiKey,
      baseUrl: normalizeBaseUrl(
        env.ARK_VISION_BASE_URL?.trim() ||
          "https://ark.cn-beijing.volces.com/api/v3"
      ),
      model:
        env.ARK_VISION_MODEL?.trim() ||
        "doubao-seed-2-1-turbo-260628",
      timeoutMs: positiveNumber(
        env,
        "ARK_VISION_TIMEOUT_MS",
        120_000
      )
    },
    upload: {
      maxBytes: Math.floor(maxUploadMb * 1024 * 1024)
    }
  };
}
