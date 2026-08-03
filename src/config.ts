import { resolve } from "node:path";

export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  seedream: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  vision: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  story: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  storage: {
    directory: string;
    ttlMs: number;
  };
  upload: {
    maxBytes: number;
  };
}

function requireText(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback?: string
): string {
  const value = env[name]?.trim() || fallback;

  if (!value) {
    throw new Error(`缺少必需环境变量 ${name}`);
  }

  return value;
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

function normalizeBaseUrl(value: string, name: string): string {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} 必须使用 http 或 https 协议`);
  }

  return value.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey =
    env.ARK_API_KEY?.trim() || env.SEEDREAM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "缺少必需环境变量 ARK_API_KEY（兼容旧变量 SEEDREAM_API_KEY）"
    );
  }

  const ttlMinutes = positiveNumber(env, "TEMP_STORAGE_TTL_MINUTES", 30);
  const maxUploadMb = positiveNumber(env, "MAX_UPLOAD_MB", 5);

  return {
    server: {
      host: env.HOST?.trim() || "127.0.0.1",
      port: positiveNumber(env, "PORT", 3000)
    },
    seedream: {
      apiKey,
      baseUrl: normalizeBaseUrl(
        requireText(
          env,
          "SEEDREAM_BASE_URL",
          "https://ark.cn-beijing.volces.com/api/v3"
        ),
        "SEEDREAM_BASE_URL"
      ),
      model: requireText(
        env,
        "SEEDREAM_MODEL",
        "doubao-seedream-5-0-260128"
      ),
      timeoutMs: positiveNumber(env, "SEEDREAM_TIMEOUT_MS", 120_000)
    },
    vision: {
      apiKey,
      baseUrl: normalizeBaseUrl(
        requireText(
          env,
          "ARK_VISION_BASE_URL",
          "https://ark.cn-beijing.volces.com/api/v3"
        ),
        "ARK_VISION_BASE_URL"
      ),
      model: requireText(
        env,
        "ARK_VISION_MODEL",
        "doubao-seed-2-1-turbo-260628"
      ),
      timeoutMs: positiveNumber(
        env,
        "ARK_VISION_TIMEOUT_MS",
        120_000
      )
    },
    story: {
      apiKey,
      baseUrl: normalizeBaseUrl(
        requireText(
          env,
          "ARK_STORY_BASE_URL",
          "https://ark.cn-beijing.volces.com/api/v3"
        ),
        "ARK_STORY_BASE_URL"
      ),
      model: requireText(
        env,
        "ARK_STORY_MODEL",
        "doubao-seed-2-1-turbo-260628"
      ),
      timeoutMs: positiveNumber(
        env,
        "ARK_STORY_TIMEOUT_MS",
        12_000
      )
    },
    storage: {
      directory: resolve(env.TEMP_STORAGE_DIR?.trim() || "./data/tmp"),
      ttlMs: ttlMinutes * 60_000
    },
    upload: {
      maxBytes: Math.floor(maxUploadMb * 1024 * 1024)
    }
  };
}
