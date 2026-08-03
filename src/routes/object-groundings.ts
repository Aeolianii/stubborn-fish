import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  OBJECT_SUBJECT_TYPES,
  type ObjectSubjectType
} from "../domain/object-grounding.js";
import { AppError } from "../errors.js";
import type {
  ObjectGroundingServiceContract
} from "../services/object-grounding-service.js";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

interface GroundingRequestInput {
  image: Buffer;
  mimeType: string;
  description: string;
  subjectType: ObjectSubjectType;
}

async function parseGroundingRequest(
  request: FastifyRequest
): Promise<GroundingRequestInput> {
  if (!request.isMultipart()) {
    throw new AppError(
      415,
      "MULTIPART_REQUIRED",
      "请使用 multipart/form-data 上传图片"
    );
  }

  let image: Buffer | undefined;
  let mimeType: string | undefined;
  let description = "";
  let subjectType: ObjectSubjectType | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const file = part as MultipartFile;
      const contents = await file.toBuffer();

      if (file.fieldname !== "image") {
        continue;
      }
      if (image) {
        throw new AppError(400, "TOO_MANY_IMAGES", "每次只能上传一张图片");
      }
      if (!SUPPORTED_IMAGE_TYPES.has(file.mimetype)) {
        throw new AppError(
          415,
          "UNSUPPORTED_IMAGE_TYPE",
          "仅支持 JPEG、PNG 或 WebP 图片"
        );
      }

      image = contents;
      mimeType = file.mimetype;
      continue;
    }

    if (part.fieldname === "description") {
      description = String(part.value).trim();
    } else if (part.fieldname === "subjectType") {
      const value = String(part.value).trim();

      if (!value) {
        continue;
      }
      if (
        !OBJECT_SUBJECT_TYPES.includes(value as ObjectSubjectType)
      ) {
        throw new AppError(
          400,
          "INVALID_SUBJECT_TYPE",
          "图片种类只能是人物、动物、植物或其他"
        );
      }
      subjectType = value as ObjectSubjectType;
    }
  }

  if (!image || !mimeType) {
    throw new AppError(400, "IMAGE_REQUIRED", "必须上传一张图片");
  }
  if (!description || description.length > 200) {
    throw new AppError(
      400,
      "INVALID_DESCRIPTION",
      "目标描述不能为空且不能超过 200 个字符"
    );
  }
  if (!subjectType) {
    throw new AppError(
      400,
      "SUBJECT_TYPE_REQUIRED",
      "请选择图片种类"
    );
  }

  return { image, mimeType, description, subjectType };
}

export async function registerObjectGroundingRoutes(
  app: FastifyInstance,
  service: ObjectGroundingServiceContract
): Promise<void> {
  app.post("/api/object-groundings", async (request, reply) => {
    const input = await parseGroundingRequest(request);
    const grounding = await service.locate(input);
    return reply.send({ grounding });
  });
}
