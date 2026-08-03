(function (root) {
  "use strict";

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_PROCESSING_DIMENSION = 720;
  const SUPPORTED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);
  const SUBJECT_TYPES = new Set([
    "person",
    "aquatic_animal",
    "land_animal",
    "plant",
    "other"
  ]);
  const PLACEMENTS = new Set(["fish", "bottom", "suspended", "surface"]);

  function validateFile(file) {
    if (!file || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
      throw new Error("请选择 JPEG、PNG 或 WebP 图片");
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Error("图片大小必须在 5 MB 以内");
    }
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function createCutoutSession() {
    const state = {
      stage: "capture",
      file: null,
      description: "",
      subjectType: "",
      name: "",
      placement: "fish",
      result: null,
      error: ""
    };

    function canGenerate() {
      return Boolean(
        state.stage === "capture"
        && state.file
        && SUBJECT_TYPES.has(state.subjectType)
      );
    }

    function snapshot() {
      return {
        stage: state.stage,
        file: state.file,
        description: state.description,
        subjectType: state.subjectType,
        name: state.name,
        placement: state.placement,
        result: state.result,
        error: state.error,
        canGenerate: canGenerate(),
        canConfirm: Boolean(
          state.stage === "result"
          && state.result
          && state.result.transparentBlob
          && !state.error
        )
      };
    }

    function update(changes) {
      const next = changes || {};
      if (Object.prototype.hasOwnProperty.call(next, "file")) {
        validateFile(next.file);
        state.file = next.file;
        state.result = null;
        state.error = "";
      }
      if (Object.prototype.hasOwnProperty.call(next, "description")) {
        state.description = normalizeText(next.description);
      }
      if (Object.prototype.hasOwnProperty.call(next, "subjectType")) {
        const subjectType = normalizeText(next.subjectType);
        if (subjectType && !SUBJECT_TYPES.has(subjectType)) {
          throw new Error(
            "图片种类只能是人类、水生动物、非水生动物、植物或其他"
          );
        }
        state.subjectType = subjectType;
      }
      if (Object.prototype.hasOwnProperty.call(next, "name")) {
        state.name = normalizeText(next.name);
      }
      if (Object.prototype.hasOwnProperty.call(next, "placement")) {
        if (!PLACEMENTS.has(next.placement)) {
          throw new Error("请选择物品进入鱼缸后的状态");
        }
        state.placement = next.placement;
      }
      return snapshot();
    }

    function beginGeneration() {
      if (!canGenerate()) {
        throw new Error("请先选择图片和图片种类");
      }
      state.stage = "processing";
      state.result = null;
      state.error = "";
      return snapshot();
    }

    function resolveGeneration(result) {
      if (!result || !result.transparentBlob) {
        throw new Error("透明物品结果不完整");
      }
      state.stage = "result";
      state.result = result;
      state.error = "";
      return snapshot();
    }

    function failGeneration(message) {
      state.stage = "result";
      state.result = null;
      state.error = normalizeText(message) || "这次没有生成成功";
      return snapshot();
    }

    function backToCapture() {
      state.stage = "capture";
      state.result = null;
      state.error = "";
      return snapshot();
    }

    function reset() {
      state.stage = "capture";
      state.file = null;
      state.description = "";
      state.subjectType = "";
      state.name = "";
      state.placement = "fish";
      state.result = null;
      state.error = "";
      return snapshot();
    }

    function createPlacementPayload() {
      const current = snapshot();
      if (!current.canConfirm) {
        throw new Error("请先生成透明物品");
      }
      return {
        transparentBlob: state.result.transparentBlob,
        name: state.name || state.result.targetLabel || "没有名字的东西",
        placement: state.placement,
        targetLabel: state.result.targetLabel || ""
      };
    }

    return {
      snapshot,
      update,
      beginGeneration,
      resolveGeneration,
      failGeneration,
      backToCapture,
      reset,
      createPlacementPayload
    };
  }

  async function readJsonResponse(response) {
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`AI 服务返回了无效响应（${response.status}）`);
    }
    if (!response.ok) {
      throw new Error(
        (payload.error && payload.error.message)
        || `请求失败（${response.status}）`
      );
    }
    return payload;
  }

  function waitForImage(image) {
    const width = Number(image && (image.naturalWidth || image.width));
    const height = Number(image && (image.naturalHeight || image.height));
    if (width > 0 && height > 0 && image.complete !== false) {
      return Promise.resolve();
    }
    if (!image || typeof image.addEventListener !== "function") {
      return Promise.reject(new Error("无法读取所选图片"));
    }
    return new Promise((resolve, reject) => {
      function cleanup() {
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
      }
      function handleLoad() {
        cleanup();
        resolve();
      }
      function handleError() {
        cleanup();
        reject(new Error("无法读取所选图片"));
      }
      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
    });
  }

  async function createProcessingFrame(image) {
    await waitForImage(image);
    const sourceWidth = Number(image.naturalWidth || image.width);
    const sourceHeight = Number(image.naturalHeight || image.height);
    if (!sourceWidth || !sourceHeight) {
      throw new Error("所选图片尺寸无效");
    }
    const scale = Math.min(
      1,
      MAX_PROCESSING_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("暂时无法处理这张图片");
    }
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  function cropTransparentResult(processed) {
    const bounds = processed.bounds;
    if (!bounds) {
      throw new Error("AI 没有识别出完整的物品，请换个描述重试");
    }
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = processed.width;
    sourceCanvas.height = processed.height;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) {
      throw new Error("暂时无法生成透明物品");
    }
    sourceContext.putImageData(
      new ImageData(processed.data, processed.width, processed.height),
      0,
      0
    );

    const padding = Math.max(
      4,
      Math.ceil(Math.max(bounds.width, bounds.height) * 0.04)
    );
    const sourceX = Math.max(0, bounds.x - padding);
    const sourceY = Math.max(0, bounds.y - padding);
    const sourceRight = Math.min(
      processed.width,
      bounds.x + bounds.width + padding
    );
    const sourceBottom = Math.min(
      processed.height,
      bounds.y + bounds.height + padding
    );
    const width = sourceRight - sourceX;
    const height = sourceBottom - sourceY;
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultContext = resultCanvas.getContext("2d");
    if (!resultContext) {
      throw new Error("暂时无法显示透明物品");
    }
    resultContext.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      width,
      height,
      0,
      0,
      width,
      height
    );
    return resultCanvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("透明图片导出失败"));
        }
      }, "image/png");
    });
  }

  async function blobToCanvas(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await waitForImage(image);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("暂时无法显示透明物品");
      context.drawImage(image, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function generateTransparentCutout(options) {
    const {
      file,
      description,
      subjectType,
      signal
    } = options;
    validateFile(file);
    if (!SUBJECT_TYPES.has(subjectType)) {
      throw new Error("请选择图片种类");
    }

    const form = new FormData();
    form.append("image", file);
    form.append("description", normalizeText(description));
    form.append("subjectType", subjectType);
    form.append("source", "album");

    const response = await fetch("/api/cutouts", {
      method: "POST",
      body: form,
      signal
    });
    const payload = await readJsonResponse(response);
    if (!payload.cutout || !payload.cutout.previewUrl) {
      throw new Error("AI 没有返回完整的透明主体");
    }
    const imageResponse = await fetch(payload.cutout.previewUrl, { signal });
    if (!imageResponse.ok) {
      throw new Error("无法读取 AI 生成的透明主体");
    }
    const transparentBlob = await imageResponse.blob();
    const canvas = await blobToCanvas(transparentBlob);
    return {
      canvas,
      transparentBlob,
      targetLabel: payload.cutout.description || ""
    };
  }

  root.AquariumCutoutFlow = {
    createCutoutSession,
    generateTransparentCutout,
    validateFile
  };
})(globalThis);
