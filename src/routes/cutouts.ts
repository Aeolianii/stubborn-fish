import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  CUTOUT_CATEGORIES,
  type CutoutCategory,
  type CutoutRecord,
  type CutoutSource,
  type ImportedSubjectType
} from "../domain/cutout.js";
import { AppError } from "../errors.js";
import type {
  CreateCutoutInput,
  CutoutServiceContract
} from "../services/cutout-service.js";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const CATEGORY_OPTIONS = [
  { value: "animal", label: "动物", attributes: null },
  { value: "plant", label: "植物", attributes: null },
  { value: "natural_landscape", label: "自然景观", attributes: null },
  { value: "other", label: "其他类", attributes: null }
] as const;

interface IdParams {
  id: string;
}

interface UpdateBody {
  name: string;
  category: CutoutCategory;
}

function toDto(record: CutoutRecord): CutoutRecord & { previewUrl: string } {
  return {
    ...record,
    previewUrl: `/api/cutouts/${record.id}/image`
  };
}

async function parseCreateRequest(
  request: FastifyRequest
): Promise<CreateCutoutInput> {
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
  let subjectType: ImportedSubjectType | undefined;
  let source: CutoutSource = "album";

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

    const value = String(part.value);

    if (part.fieldname === "description") {
      description = value.trim();
    } else if (part.fieldname === "subjectType") {
      if (
        value !== "person"
        && value !== "aquatic_animal"
        && value !== "land_animal"
        && value !== "plant"
        && value !== "other"
      ) {
        throw new AppError(
          400,
          "INVALID_SUBJECT_TYPE",
          "导入类别只能是人类、鱼/水生动物、非水生动物、植物或其他"
        );
      }
      subjectType = value;
    } else if (part.fieldname === "source") {
      if (value !== "camera" && value !== "album") {
        throw new AppError(
          400,
          "INVALID_SOURCE",
          "图片来源只能是 camera 或 album"
        );
      }
      source = value;
    }
  }

  if (!image || !mimeType) {
    throw new AppError(400, "IMAGE_REQUIRED", "必须上传一张图片");
  }
  if (description.length > 500) {
    throw new AppError(
      400,
      "INVALID_DESCRIPTION",
      "物体描述不能超过 500 个字符"
    );
  }
  if (!subjectType) {
    throw new AppError(
      400,
      "SUBJECT_TYPE_REQUIRED",
      "请选择导入素材类别"
    );
  }

  return { image, mimeType, description, subjectType, source };
}

export async function registerCutoutRoutes(
  app: FastifyInstance,
  service: CutoutServiceContract
): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/cutout-categories", async () => ({
    categories: CATEGORY_OPTIONS
  }));

  app.post("/api/cutouts", async (request, reply) => {
    const input = await parseCreateRequest(request);
    const created = await service.create(input);
    return reply.code(201).send({ cutout: toDto(created) });
  });

  app.get<{ Params: IdParams }>("/api/cutouts/:id", async (request, reply) => {
    const record = await service.get(request.params.id);

    if (!record) {
      throw new AppError(404, "CUTOUT_NOT_FOUND", "抠图结果不存在或已过期");
    }

    return reply.send({ cutout: toDto(record) });
  });

  app.get<{ Params: IdParams }>(
    "/api/cutouts/:id/image",
    async (request, reply) => {
      const image = await service.getImage(request.params.id);

      if (!image) {
        throw new AppError(404, "CUTOUT_NOT_FOUND", "抠图结果不存在或已过期");
      }

      return reply
        .header("content-type", "image/png")
        .header("cache-control", "no-store")
        .send(image);
    }
  );

  app.patch<{ Params: IdParams; Body: UpdateBody }>(
    "/api/cutouts/:id",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "category"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 40 },
            category: {
              type: "string",
              enum: [...CUTOUT_CATEGORIES]
            }
          }
        }
      }
    },
    async (request, reply) => {
      const name = request.body.name.trim();

      if (!name) {
        throw new AppError(
          400,
          "INVALID_NAME",
          "物体名称不能为空且不能超过 40 个字符"
        );
      }

      const record = await service.update(request.params.id, {
        name,
        category: request.body.category
      });

      if (!record) {
        throw new AppError(404, "CUTOUT_NOT_FOUND", "抠图结果不存在或已过期");
      }

      return reply.send({ cutout: toDto(record) });
    }
  );

  app.delete<{ Params: IdParams }>(
    "/api/cutouts/:id",
    async (request, reply) => {
      const deleted = await service.delete(request.params.id);

      if (!deleted) {
        throw new AppError(404, "CUTOUT_NOT_FOUND", "抠图结果不存在或已过期");
      }

      return reply.code(204).send();
    }
  );
}
