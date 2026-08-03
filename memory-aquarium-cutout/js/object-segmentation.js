// Rasterizes the AI outer polygon as a solid paper-cut silhouette.
const EDGE_SAMPLE_OFFSETS = [0.25, 0.75];
const GEOMETRY_EPSILON = 1e-9;

function isNormalized(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateImage(image) {
  const width = Number(image && image.width);
  const height = Number(image && image.height);
  const data = image && image.data;

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !data ||
    data.length !== width * height * 4
  ) {
    throw new Error("无效的 RGBA 图片数据");
  }
}

function validPoint(point) {
  return (
    point &&
    isNormalized(point.x) &&
    isNormalized(point.y)
  );
}

function orientation(first, second, third) {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function pointOnSegment(point, start, end) {
  return (
    Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON &&
    point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(start.y, end.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(start.y, end.y) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstSideStart = orientation(
    firstStart,
    firstEnd,
    secondStart
  );
  const firstSideEnd = orientation(
    firstStart,
    firstEnd,
    secondEnd
  );
  const secondSideStart = orientation(
    secondStart,
    secondEnd,
    firstStart
  );
  const secondSideEnd = orientation(
    secondStart,
    secondEnd,
    firstEnd
  );

  if (
    (
      firstSideStart > GEOMETRY_EPSILON &&
      firstSideEnd < -GEOMETRY_EPSILON
    ) ||
    (
      firstSideStart < -GEOMETRY_EPSILON &&
      firstSideEnd > GEOMETRY_EPSILON
    )
  ) {
    return (
      (
        secondSideStart > GEOMETRY_EPSILON &&
        secondSideEnd < -GEOMETRY_EPSILON
      ) ||
      (
        secondSideStart < -GEOMETRY_EPSILON &&
        secondSideEnd > GEOMETRY_EPSILON
      )
    );
  }

  return (
    pointOnSegment(secondStart, firstStart, firstEnd) ||
    pointOnSegment(secondEnd, firstStart, firstEnd) ||
    pointOnSegment(firstStart, secondStart, secondEnd) ||
    pointOnSegment(firstEnd, secondStart, secondEnd)
  );
}

function polygonSelfIntersects(polygon) {
  for (let first = 0; first < polygon.length; first += 1) {
    const firstNext = (first + 1) % polygon.length;

    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondNext = (second + 1) % polygon.length;
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first;

      if (adjacent) continue;

      if (
        segmentsIntersect(
          polygon[first],
          polygon[firstNext],
          polygon[second],
          polygon[secondNext]
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function validateGrounding(grounding) {
  const bbox = grounding && grounding.bbox;
  const center = grounding && grounding.center;
  const polygon = grounding && grounding.polygon;

  if (
    !bbox ||
    !isNormalized(bbox.xMin) ||
    !isNormalized(bbox.yMin) ||
    !isNormalized(bbox.xMax) ||
    !isNormalized(bbox.yMax) ||
    bbox.xMin >= bbox.xMax ||
    bbox.yMin >= bbox.yMax
  ) {
    throw new Error("AI 没有识别出有效的物品区域");
  }

  if (
    !center ||
    !isNormalized(center.x) ||
    !isNormalized(center.y) ||
    center.x < bbox.xMin ||
    center.x > bbox.xMax ||
    center.y < bbox.yMin ||
    center.y > bbox.yMax
  ) {
    throw new Error("AI 暂时无法确认物品位置");
  }

  if (
    !Array.isArray(polygon) ||
    polygon.length < 16 ||
    polygon.length > 32 ||
    polygon.some((point) => !validPoint(point))
  ) {
    throw new Error("AI 没有识别出有效的粗轮廓");
  }

  if (polygonSelfIntersects(polygon)) {
    throw new Error("AI 返回的粗轮廓发生交叉，请重新生成");
  }
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crosses =
      (currentPoint.y > y) !== (previousPoint.y > y) &&
      x <
        (
          (previousPoint.x - currentPoint.x) *
          (y - currentPoint.y)
        ) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) inside = !inside;
  }

  return inside;
}

function polygonCoverage(x, y, width, height, polygon) {
  let insideSamples = 0;

  for (const offsetY of EDGE_SAMPLE_OFFSETS) {
    for (const offsetX of EDGE_SAMPLE_OFFSETS) {
      if (
        pointInPolygon(
          (x + offsetX) / width,
          (y + offsetY) / height,
          polygon
        )
      ) {
        insideSamples += 1;
      }
    }
  }

  return Math.round(
    insideSamples * 255 /
    (EDGE_SAMPLE_OFFSETS.length * EDGE_SAMPLE_OFFSETS.length)
  );
}

function findBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function clampPixel(value, size) {
  return Math.max(0, Math.min(size - 1, value));
}

function refineObjectMask(image, grounding) {
  validateImage(image);
  validateGrounding(grounding);

  const width = Number(image.width);
  const height = Number(image.height);
  const data = new Uint8ClampedArray(image.data);
  const bbox = grounding.bbox;
  const polygon = grounding.polygon;
  const left = clampPixel(Math.floor(bbox.xMin * width) - 1, width);
  const top = clampPixel(Math.floor(bbox.yMin * height) - 1, height);
  const right = clampPixel(Math.ceil(bbox.xMax * width) + 1, width);
  const bottom = clampPixel(Math.ceil(bbox.yMax * height) + 1, height);
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    data[index * 4 + 3] = 0;
  }

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      const alpha = polygonCoverage(x, y, width, height, polygon);

      if (alpha === 0) continue;
      mask[index] = alpha;
      data[index * 4 + 3] = alpha;
    }
  }

  return {
    data,
    width,
    height,
    bounds: findBounds(mask, width, height)
  };
}

globalThis.ObjectSegmentation = Object.freeze({
  refineObjectMask
});
