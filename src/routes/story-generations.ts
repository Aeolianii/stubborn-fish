import type { FastifyInstance } from "fastify";

import { AppError } from "../errors.js";
import type {
  StoryGenerationServiceContract
} from "../services/ark-story-client.js";

interface StoryGenerationBody {
  prompt?: unknown;
}

const MAX_STORY_PROMPT_LENGTH = 8_000;

export async function registerStoryGenerationRoutes(
  app: FastifyInstance,
  service: StoryGenerationServiceContract
): Promise<void> {
  app.post<{ Body: StoryGenerationBody }>(
    "/api/story-generations",
    async (request, reply) => {
      const prompt = typeof request.body?.prompt === "string"
        ? request.body.prompt.trim()
        : "";

      if (!prompt) {
        throw new AppError(
          400,
          "STORY_PROMPT_REQUIRED",
          "故事提示不能为空"
        );
      }
      if (prompt.length > MAX_STORY_PROMPT_LENGTH) {
        throw new AppError(
          400,
          "STORY_PROMPT_TOO_LONG",
          "故事提示不能超过 8000 个字符"
        );
      }

      const data = await service.generate({ prompt });
      return reply.send({ data });
    }
  );
}
