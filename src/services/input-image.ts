import sharp from "sharp";

import { AppError } from "../errors.js";

const FORMAT_TO_MIME: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

export async function validateInputImage(
  image: Buffer,
  declaredMimeType: string
): Promise<void> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

  try {
    metadata = await sharp(image, {
      failOn: "error",
      limitInputPixels: 25_000_000
    }).metadata();
  } catch (error) {
    throw new AppError(
      400,
      "INVALID_IMAGE",
      "上传的文件不是有效图片或图片已损坏",
      { cause: error }
    );
  }

  const actualMimeType = metadata.format
    ? FORMAT_TO_MIME[metadata.format]
    : undefined;

  if (!actualMimeType) {
    throw new AppError(
      415,
      "UNSUPPORTED_IMAGE_TYPE",
      "仅支持 JPEG、PNG 或 WebP 图片"
    );
  }

  if (actualMimeType !== declaredMimeType) {
    throw new AppError(
      400,
      "IMAGE_TYPE_MISMATCH",
      "图片实际格式与上传时声明的格式不一致"
    );
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 64 ||
    metadata.height < 64
  ) {
    throw new AppError(
      400,
      "IMAGE_TOO_SMALL",
      "图片宽度和高度都必须至少为 64 像素"
    );
  }

  if ((metadata.pages ?? 1) > 1) {
    throw new AppError(
      400,
      "ANIMATED_IMAGE_UNSUPPORTED",
      "不支持动画图片，请上传单帧照片"
    );
  }
}
