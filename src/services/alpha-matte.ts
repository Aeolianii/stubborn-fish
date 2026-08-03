import sharp from "sharp";

export interface TransparentPngResult {
  buffer: Buffer;
  usedFallback: boolean;
  transparencyRatio: number;
}

const MAGENTA_HARD_DISTANCE = 28;
const MAGENTA_SOFT_DISTANCE = 58;
const NATURAL_HARD_DISTANCE = 12;
const NATURAL_SOFT_DISTANCE = 34;

function isMagentaKey(
  background: readonly [number, number, number]
): boolean {
  const [red, green, blue] = background;
  return red >= 200 && blue >= 200 && green <= 80;
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  background: readonly [number, number, number]
): number {
  return Math.sqrt(
    (red - background[0]) ** 2 +
      (green - background[1]) ** 2 +
      (blue - background[2]) ** 2
  );
}

function perimeterIndices(width: number, height: number): number[] {
  const indices: number[] = [];

  for (let x = 0; x < width; x += 1) {
    indices.push(x, (height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    indices.push(y * width, y * width + width - 1);
  }

  return indices;
}

function estimateBackground(
  pixels: Buffer,
  indices: readonly number[]
): readonly [number, number, number] {
  const buckets = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >();

  for (const index of indices) {
    const offset = index * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
    const bucket = buckets.get(key) ?? {
      count: 0,
      red: 0,
      green: 0,
      blue: 0
    };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort(
    (left, right) => right.count - left.count
  )[0];

  if (!dominant) {
    return [255, 255, 255];
  }

  return [
    Math.round(dominant.red / dominant.count),
    Math.round(dominant.green / dominant.count),
    Math.round(dominant.blue / dominant.count)
  ];
}

function existingTransparencyRatio(pixels: Buffer): number {
  let transparent = 0;
  const pixelCount = pixels.length / 4;

  for (let offset = 3; offset < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 255) < 250) {
      transparent += 1;
    }
  }

  return transparent / pixelCount;
}

function removeConnectedBackground(
  pixels: Buffer,
  width: number,
  height: number
): number {
  const border = perimeterIndices(width, height);
  const background = estimateBackground(pixels, border);
  const hardDistance = isMagentaKey(background)
    ? MAGENTA_HARD_DISTANCE
    : NATURAL_HARD_DISTANCE;
  const softDistance = isMagentaKey(background)
    ? MAGENTA_SOFT_DISTANCE
    : NATURAL_SOFT_DISTANCE;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  let transparent = 0;

  const enqueue = (index: number): void => {
    if (visited[index] === 1) {
      return;
    }

    const offset = index * 4;
    const distance = colorDistance(
      pixels[offset] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset + 2] ?? 0,
      background
    );

    if (distance > softDistance) {
      return;
    }

    visited[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  for (const index of border) {
    enqueue(index);
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart]!;
    queueStart += 1;
    const offset = index * 4;
    const distance = colorDistance(
      pixels[offset] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset + 2] ?? 0,
      background
    );
    const alpha =
      distance <= hardDistance
        ? 0
        : Math.round(
            ((distance - hardDistance) / (softDistance - hardDistance)) * 255
          );
    pixels[offset + 3] = Math.min(pixels[offset + 3] ?? 255, alpha);

    if (alpha < 250) {
      transparent += 1;
    }

    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return transparent / pixelCount;
}

export async function ensureTransparentPng(
  input: Buffer
): Promise<TransparentPngResult> {
  try {
    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels: 25_000_000
    })
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const currentRatio = existingTransparencyRatio(data);

    if (currentRatio > 0.001) {
      return {
        buffer: await sharp(data, {
          raw: {
            width: info.width,
            height: info.height,
            channels: 4
          }
        })
          .png({ compressionLevel: 9 })
          .toBuffer(),
        usedFallback: false,
        transparencyRatio: currentRatio
      };
    }

    const fallbackRatio = removeConnectedBackground(
      data,
      info.width,
      info.height
    );

    if (fallbackRatio <= 0.001) {
      throw new Error("AI 结果没有透明背景，且无法安全识别边缘背景");
    }

    return {
      buffer: await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: 4
        }
      })
        .png({ compressionLevel: 9 })
        .toBuffer(),
      usedFallback: true,
      transparencyRatio: fallbackRatio
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("AI 结果没有透明背景")
    ) {
      throw error;
    }

    throw new Error("AI 返回的图片数据无效，无法生成透明 PNG", {
      cause: error
    });
  }
}
