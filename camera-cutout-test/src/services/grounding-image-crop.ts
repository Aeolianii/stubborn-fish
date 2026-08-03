import sharp from "sharp";

import type {
  NormalizedBoundingBox,
  NormalizedPoint
} from "../domain/object-grounding.js";

const DEFAULT_PADDING_RATIO = 0.15;
const DEFAULT_TARGET_LONG_EDGE = 1_024;
const COORDINATE_SCALE = 1_000_000;

export interface PreparedGroundingCrop {
  image: Buffer;
  mimeType: "image/jpeg";
  region: NormalizedBoundingBox;
}

export interface GroundingCropOptions {
  paddingRatio?: number;
  targetLongEdge?: number;
}

export type GroundingImageCropper = (
  image: Buffer,
  bbox: NormalizedBoundingBox
) => Promise<PreparedGroundingCrop>;

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

function clampCoordinate(value: number): number {
  return roundCoordinate(Math.max(0, Math.min(1, value)));
}

export function expandBoundingBox(
  bbox: NormalizedBoundingBox,
  paddingRatio = DEFAULT_PADDING_RATIO
): NormalizedBoundingBox {
  const safePadding = Math.max(0, paddingRatio);
  const width = bbox.xMax - bbox.xMin;
  const height = bbox.yMax - bbox.yMin;

  return {
    xMin: clampCoordinate(bbox.xMin - width * safePadding),
    yMin: clampCoordinate(bbox.yMin - height * safePadding),
    xMax: clampCoordinate(bbox.xMax + width * safePadding),
    yMax: clampCoordinate(bbox.yMax + height * safePadding)
  };
}

export function mapPointFromCrop(
  point: NormalizedPoint,
  cropRegion: NormalizedBoundingBox
): NormalizedPoint {
  return {
    x: clampCoordinate(
      cropRegion.xMin +
        point.x * (cropRegion.xMax - cropRegion.xMin)
    ),
    y: clampCoordinate(
      cropRegion.yMin +
        point.y * (cropRegion.yMax - cropRegion.yMin)
    )
  };
}

export async function cropGroundingImage(
  image: Buffer,
  bbox: NormalizedBoundingBox,
  options: GroundingCropOptions = {}
): Promise<PreparedGroundingCrop> {
  const paddingRatio =
    options.paddingRatio ?? DEFAULT_PADDING_RATIO;
  const targetLongEdge = Math.max(
    64,
    Math.round(
      options.targetLongEdge ?? DEFAULT_TARGET_LONG_EDGE
    )
  );
  const expanded = expandBoundingBox(bbox, paddingRatio);
  const normalized = await sharp(image, {
    failOn: "error",
    limitInputPixels: 25_000_000
  })
    .autoOrient()
    .toColourspace("srgb")
    .png()
    .toBuffer({ resolveWithObject: true });

  const sourceWidth = normalized.info.width;
  const sourceHeight = normalized.info.height;
  const left = Math.max(
    0,
    Math.floor(expanded.xMin * sourceWidth)
  );
  const top = Math.max(
    0,
    Math.floor(expanded.yMin * sourceHeight)
  );
  const right = Math.min(
    sourceWidth,
    Math.ceil(expanded.xMax * sourceWidth)
  );
  const bottom = Math.min(
    sourceHeight,
    Math.ceil(expanded.yMax * sourceHeight)
  );
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const crop = await sharp(normalized.data)
    .extract({ left, top, width, height })
    .resize({
      width: targetLongEdge,
      height: targetLongEdge,
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return {
    image: crop,
    mimeType: "image/jpeg",
    region: {
      xMin: roundCoordinate(left / sourceWidth),
      yMin: roundCoordinate(top / sourceHeight),
      xMax: roundCoordinate(right / sourceWidth),
      yMax: roundCoordinate(bottom / sourceHeight)
    }
  };
}
