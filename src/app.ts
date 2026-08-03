import fastifyMultipart from "@fastify/multipart";
import Fastify, {
  type FastifyError,
  type FastifyInstance
} from "fastify";

import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import { registerCutoutRoutes } from "./routes/cutouts.js";
import { registerGameRoutes } from "./routes/game.js";
import {
  registerObjectGroundingRoutes
} from "./routes/object-groundings.js";
import { registerRestTestRoutes } from "./routes/rest-test.js";
import {
  registerStoryGenerationRoutes
} from "./routes/story-generations.js";
import {
  CutoutService,
  type CutoutServiceContract
} from "./services/cutout-service.js";
import { CutoutStore } from "./services/cutout-store.js";
import { SeedreamClient } from "./services/seedream-client.js";
import { ArkVisionClient } from "./services/ark-vision-client.js";
import {
  ArkStoryClient,
  type StoryGenerationServiceContract
} from "./services/ark-story-client.js";
import {
  ObjectGroundingService,
  type ObjectGroundingServiceContract
} from "./services/object-grounding-service.js";

interface BuildAppOptions {
  config: AppConfig;
  service?: CutoutServiceContract;
  groundingService?: ObjectGroundingServiceContract;
  storyService?: StoryGenerationServiceContract;
  logger?: boolean;
}

export async function buildApp(
  options: BuildAppOptions
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.config.upload.maxBytes + 64 * 1024
  });

  await app.register(fastifyMultipart, {
    limits: {
      fields: 3,
      files: 1,
      parts: 4,
      fileSize: options.config.upload.maxBytes,
      fieldSize: 4 * 1024
    }
  });

  let service = options.service;

  if (!service) {
    const store = new CutoutStore(options.config.storage);
    await store.init();
    await store.cleanupExpired();
    service = new CutoutService(
      new SeedreamClient(options.config.seedream),
      store
    );
    const cleanupIntervalMs = Math.min(
      options.config.storage.ttlMs,
      60_000
    );
    const cleanupTimer = setInterval(() => {
      void store.cleanupExpired().catch((error: unknown) => {
        app.log.error(error, "清理过期抠图暂存失败");
      });
    }, cleanupIntervalMs);
    cleanupTimer.unref();
    app.addHook("onClose", async () => {
      clearInterval(cleanupTimer);
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        {
          errorCode: error.code,
          statusCode: error.statusCode
        },
        error.message
      );
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id
        }
      });
    }

    const fastifyError = error as FastifyError;

    if (fastifyError.validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求字段格式不正确",
          requestId: request.id
        }
      });
    }

    if (
      fastifyError.code === "FST_REQ_FILE_TOO_LARGE" ||
      fastifyError.code === "FST_FILES_LIMIT"
    ) {
      return reply.code(413).send({
        error: {
          code: "UPLOAD_TOO_LARGE",
          message: `图片不能超过 ${Math.floor(
            options.config.upload.maxBytes / 1024 / 1024
          )} MB`,
          requestId: request.id
        }
      });
    }

    if (
      fastifyError.code === "FST_FIELDS_LIMIT" ||
      fastifyError.code === "FST_PARTS_LIMIT"
    ) {
      return reply.code(413).send({
        error: {
          code: "MULTIPART_LIMIT_EXCEEDED",
          message: "上传表单包含过多字段或分段",
          requestId: request.id
        }
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "哎呀，出错了，请稍后重试",
        requestId: request.id
      }
    });
  });

  await registerCutoutRoutes(app, service);
  const groundingService =
    options.groundingService ??
    new ObjectGroundingService(
      new ArkVisionClient(options.config.vision)
    );
  await registerObjectGroundingRoutes(app, groundingService);
  const storyService =
    options.storyService ?? new ArkStoryClient(options.config.story);
  await registerStoryGenerationRoutes(app, storyService);
  await registerRestTestRoutes(app);
  await registerGameRoutes(app);
  await app.ready();
  return app;
}
