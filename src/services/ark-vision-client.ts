import type { AppConfig } from "../config.js";
import type {
  NormalizedBoundingBox,
  NormalizedPoint,
  ObjectGrounding,
  ObjectSubjectType
} from "../domain/object-grounding.js";
import { AppError } from "../errors.js";
import {
  buildObjectBoundingBoxPrompt,
  buildObjectContourPrompt,
  buildObjectGroundingPrompt
} from "../prompts/object-grounding-prompt.js";
import {
  cropGroundingImage,
  mapPointFromCrop,
  type GroundingImageCropper,
  type PreparedGroundingCrop
} from "./grounding-image-crop.js";

export interface LocateObjectInput {
  image: Buffer;
  mimeType: string;
  description: string;
  subjectType: ObjectSubjectType;
}

export interface ObjectLocator {
  locateObject(input: LocateObjectInput): Promise<ObjectGrounding>;
}

type FetchImplementation = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

interface ArkChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface RawGrounding {
  target_found?: unknown;
  failure_reason?: unknown;
  target_label?: unknown;
  bbox?: unknown;
  center?: unknown;
  polygon?: unknown;
  confidence?: unknown;
}

interface DetectedObject {
  targetLabel: string;
  bbox: NormalizedBoundingBox;
  center: NormalizedPoint;
  confidence: number;
}

function invalidResponse(message: string, cause?: unknown): AppError {
  return new AppError(
    502,
    "ARK_VISION_INVALID_RESPONSE",
    message,
    cause === undefined ? undefined : { cause }
  );
}

function isNormalizedNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function parsePoint(value: unknown, label: string): NormalizedPoint {
  if (
    !value ||
    typeof value !== "object" ||
    !isNormalizedNumber((value as { x?: unknown }).x) ||
    !isNormalizedNumber((value as { y?: unknown }).y)
  ) {
    throw invalidResponse(`方舟返回的${label}坐标无效`);
  }

  return {
    x: (value as { x: number }).x,
    y: (value as { y: number }).y
  };
}

function parseBoundingBox(value: unknown): NormalizedBoundingBox {
  if (!value || typeof value !== "object") {
    throw invalidResponse("方舟返回的目标边框无效");
  }

  const raw = value as {
    x_min?: unknown;
    y_min?: unknown;
    x_max?: unknown;
    y_max?: unknown;
  };

  if (
    !isNormalizedNumber(raw.x_min) ||
    !isNormalizedNumber(raw.y_min) ||
    !isNormalizedNumber(raw.x_max) ||
    !isNormalizedNumber(raw.y_max) ||
    raw.x_min >= raw.x_max ||
    raw.y_min >= raw.y_max
  ) {
    throw invalidResponse("方舟返回的目标边框坐标无效");
  }

  return {
    xMin: raw.x_min,
    yMin: raw.y_min,
    xMax: raw.x_max,
    yMax: raw.y_max
  };
}

function samePoint(
  first: NormalizedPoint,
  second: NormalizedPoint
): boolean {
  return (
    Math.abs(first.x - second.x) < 0.000_001 &&
    Math.abs(first.y - second.y) < 0.000_001
  );
}

function polygonArea(points: NormalizedPoint[]): number {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function parsePolygon(value: unknown): NormalizedPoint[] {
  if (!Array.isArray(value)) {
    throw invalidResponse("方舟返回的粗轮廓格式无效");
  }

  const points = value.map((item, index) => {
    if (
      Array.isArray(item) &&
      item.length >= 2 &&
      isNormalizedNumber(item[0]) &&
      isNormalizedNumber(item[1])
    ) {
      return { x: item[0], y: item[1] };
    }

    return parsePoint(item, `粗轮廓第 ${index + 1} 个点`);
  });

  if (
    points.length > 1 &&
    samePoint(points[0]!, points[points.length - 1]!)
  ) {
    points.pop();
  }

  if (points.length < 16 || points.length > 32) {
    throw invalidResponse(
      `方舟返回的粗轮廓点数无效（收到 ${points.length} 个，要求 16 至 32 个）`
    );
  }
  if (Math.abs(polygonArea(points)) < 0.000_001) {
    throw invalidResponse("方舟返回的粗轮廓没有有效面积");
  }

  return points;
}

function pointInPolygon(
  point: NormalizedPoint,
  polygon: NormalizedPoint[]
): boolean {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const currentPoint = polygon[current]!;
    const previousPoint = polygon[previous]!;
    const crosses =
      (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) inside = !inside;
  }

  return inside;
}

function extractText(payload: ArkChatResponse): string {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text)
      .filter((value): value is string => typeof value === "string")
      .join("\n");
  }

  throw invalidResponse("方舟 API 未返回可解析的文本内容");
}

function parseJsonObject(text: string): RawGrounding {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw invalidResponse("方舟 API 未返回目标定位 JSON");
  }

  try {
    return JSON.parse(
      trimmed.slice(firstBrace, lastBrace + 1)
    ) as RawGrounding;
  } catch (error) {
    throw invalidResponse("方舟返回的目标定位 JSON 无法解析", error);
  }
}

function assertTargetFound(raw: RawGrounding): void {
  if (raw.target_found === false) {
    if (raw.failure_reason === "unsafe_content") {
      throw new AppError(422, "UNSAFE_IMAGE", "该图片不合规");
    }
    throw new AppError(
      422,
      "TARGET_NOT_FOUND",
      "没有在图片中找到你指定的目标，请换一种描述"
    );
  }
  if (raw.target_found !== true) {
    throw invalidResponse("方舟返回结果缺少 target_found");
  }
}

function parseTargetLabel(
  raw: RawGrounding,
  fallback = ""
): string {
  const targetLabel =
    typeof raw.target_label === "string"
      ? raw.target_label.trim()
      : fallback.trim();
  if (!targetLabel) {
    throw invalidResponse("方舟返回结果缺少目标名称");
  }

  return targetLabel;
}

function parseConfidence(value: unknown): number {
  return isNormalizedNumber(value) ? value : 0.5;
}

function normalizeDetection(raw: RawGrounding): DetectedObject {
  assertTargetFound(raw);
  const targetLabel = parseTargetLabel(raw);
  const bbox = parseBoundingBox(raw.bbox);
  const center = parsePoint(raw.center, "中心点");

  if (
    center.x < bbox.xMin ||
    center.x > bbox.xMax ||
    center.y < bbox.yMin ||
    center.y > bbox.yMax
  ) {
    throw invalidResponse("方舟返回的中心点不在目标边框内");
  }

  return {
    targetLabel,
    bbox,
    center,
    confidence: parseConfidence(raw.confidence)
  };
}

function polygonBounds(
  polygon: NormalizedPoint[]
): NormalizedBoundingBox {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);

  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys)
  };
}

function distanceToSegmentSquared(
  point: NormalizedPoint,
  start: NormalizedPoint,
  end: NormalizedPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            (
              (point.x - start.x) * dx +
              (point.y - start.y) * dy
            ) / lengthSquared
          )
        );
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  const offsetX = point.x - closestX;
  const offsetY = point.y - closestY;

  return offsetX * offsetX + offsetY * offsetY;
}

function findInteriorPoint(
  polygon: NormalizedPoint[],
  preferred: NormalizedPoint
): NormalizedPoint {
  if (pointInPolygon(preferred, polygon)) {
    return preferred;
  }

  const average = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length
    }),
    { x: 0, y: 0 }
  );
  if (pointInPolygon(average, polygon)) {
    return average;
  }

  const bounds = polygonBounds(polygon);
  let best: NormalizedPoint | undefined;
  let bestDistance = -1;

  for (let row = 1; row < 20; row += 1) {
    for (let column = 1; column < 20; column += 1) {
      const candidate = {
        x:
          bounds.xMin +
          (bounds.xMax - bounds.xMin) * column / 20,
        y:
          bounds.yMin +
          (bounds.yMax - bounds.yMin) * row / 20
      };
      if (!pointInPolygon(candidate, polygon)) {
        continue;
      }

      let minimumDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < polygon.length; index += 1) {
        minimumDistance = Math.min(
          minimumDistance,
          distanceToSegmentSquared(
            candidate,
            polygon[index]!,
            polygon[(index + 1) % polygon.length]!
          )
        );
      }
      if (minimumDistance > bestDistance) {
        best = candidate;
        bestDistance = minimumDistance;
      }
    }
  }

  if (!best) {
    throw invalidResponse("方舟返回的粗轮廓没有可靠内部区域");
  }

  return best;
}

function normalizeCroppedContour(
  raw: RawGrounding,
  crop: PreparedGroundingCrop,
  detection: DetectedObject
): ObjectGrounding {
  assertTargetFound(raw);
  const polygon = parsePolygon(raw.polygon).map((point) =>
    mapPointFromCrop(point, crop.region)
  );
  const bbox = polygonBounds(polygon);
  const center = findInteriorPoint(polygon, detection.center);

  return {
    targetLabel: parseTargetLabel(raw, detection.targetLabel),
    bbox,
    center,
    polygon,
    confidence: Math.min(
      detection.confidence,
      parseConfidence(raw.confidence)
    )
  };
}

function normalizeGrounding(raw: RawGrounding): ObjectGrounding {
  assertTargetFound(raw);
  const targetLabel = parseTargetLabel(raw);
  const bbox = parseBoundingBox(raw.bbox);
  const center = parsePoint(raw.center, "中心点");
  const polygon = parsePolygon(raw.polygon);

  if (
    center.x < bbox.xMin ||
    center.x > bbox.xMax ||
    center.y < bbox.yMin ||
    center.y > bbox.yMax
  ) {
    throw invalidResponse("方舟返回的中心点不在目标边框内");
  }

  for (const point of polygon) {
    if (
      point.x < bbox.xMin ||
      point.x > bbox.xMax ||
      point.y < bbox.yMin ||
      point.y > bbox.yMax
    ) {
      throw invalidResponse("方舟返回的粗轮廓超出目标边框");
    }
  }

  if (!pointInPolygon(center, polygon)) {
    throw invalidResponse("方舟返回的中心点不在粗轮廓内");
  }

  return {
    targetLabel,
    bbox,
    center,
    polygon,
    confidence: parseConfidence(raw.confidence)
  };
}

function shouldFallbackFromDetection(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "ARK_VISION_INVALID_RESPONSE"
  );
}

function shouldFallbackFromContour(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  return (
    error.code === "ARK_VISION_INVALID_RESPONSE" ||
    error.code === "TARGET_NOT_FOUND"
  );
}

export class ArkVisionClient implements ObjectLocator {
  constructor(
    private readonly config: AppConfig["vision"],
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly cropImage: GroundingImageCropper =
      cropGroundingImage
  ) {}

  async locateObject(input: LocateObjectInput): Promise<ObjectGrounding> {
    if (input.image.length === 0) {
      throw new Error("不能向方舟视觉模型发送空图片");
    }

    let detection: DetectedObject;

    try {
      detection = normalizeDetection(
        await this.requestVision(
          input.image,
          input.mimeType,
          buildObjectBoundingBoxPrompt(
            input.description,
            input.subjectType
          ),
          900
        )
      );
    } catch (error) {
      if (shouldFallbackFromDetection(error)) {
        return this.locateLegacy(input);
      }
      throw error;
    }

    try {
      const crop = await this.cropImage(
        input.image,
        detection.bbox
      );
      const contour = await this.requestVision(
        crop.image,
        crop.mimeType,
        buildObjectContourPrompt(
          input.description,
          input.subjectType,
          detection.targetLabel
        ),
        1_800
      );

      return normalizeCroppedContour(
        contour,
        crop,
        detection
      );
    } catch (error) {
      if (shouldFallbackFromContour(error)) {
        return this.locateLegacy(input);
      }
      throw error;
    }
  }

  private async locateLegacy(
    input: LocateObjectInput
  ): Promise<ObjectGrounding> {
    const raw = await this.requestVision(
      input.image,
      input.mimeType,
      buildObjectGroundingPrompt(
        input.description,
        input.subjectType
      ),
      2_500
    );

    return normalizeGrounding(raw);
  }

  private async requestVision(
    image: Buffer,
    mimeType: string,
    prompt: string,
    maxTokens: number
  ): Promise<RawGrounding> {
    let response: Response;

    try {
      response = await this.fetchImplementation(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url:
                        `data:${mimeType};base64,` +
                        image.toString("base64")
                    }
                  },
                  {
                    type: "text",
                    text: prompt
                  }
                ]
              }
            ],
            thinking: {
              type: "disabled"
            },
            temperature: 0,
            max_tokens: maxTokens
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
        timedOut ? "ARK_VISION_TIMEOUT" : "ARK_VISION_UNAVAILABLE",
        timedOut
          ? "目标定位请求超时，请稍后重试"
          : "暂时无法连接目标定位服务",
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
        "ARK_VISION_UPSTREAM_ERROR",
        `方舟视觉 API 请求失败（${response.status}）：${safeMessage}`
      );
    }

    return parseJsonObject(extractText(payload));
  }

  private async readPayload(response: Response): Promise<ArkChatResponse> {
    try {
      return (await response.json()) as ArkChatResponse;
    } catch (error) {
      throw invalidResponse("方舟视觉 API 返回了无法解析的 JSON", error);
    }
  }
}
