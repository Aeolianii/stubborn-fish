const segmentationApi = globalThis.ObjectSegmentation;
if (
  !segmentationApi ||
  typeof segmentationApi.refineObjectMask !== "function"
) {
  throw new Error("物品裁剪功能加载失败，请刷新页面重试");
}
const refineMask = segmentationApi.refineObjectMask;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROCESSING_DIMENSION = 720;
const GENERATE_LABEL = "生成透明物品";
const RETRY_LABEL = "重新生成";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const elements = {
  imageInput: document.querySelector("#image-input"),
  description: document.querySelector("#subject-description"),
  subjectType: document.querySelector("#subject-type"),
  generateButton: document.querySelector("#generate-cutout"),
  cancelButton: document.querySelector("#cancel-task"),
  captureStatusDot: document.querySelector("#capture-status-dot"),
  captureStatusText: document.querySelector("#capture-status-text"),
  statusDot: document.querySelector("#status-dot"),
  statusText: document.querySelector("#status-text"),
  stepScreens: document.querySelectorAll(".step-screen"),
  resultTitle: document.querySelector("#result-title"),
  generationTag: document.querySelector("#generation-tag"),
  generatingState: document.querySelector("#generating-state"),
  resultContent: document.querySelector("#result-content"),
  backButton: document.querySelector("#back-to-capture"),
  restartButton: document.querySelector("#restart-flow"),
  sourcePreview: document.querySelector("#source-preview"),
  sourcePlaceholder: document.querySelector("#source-placeholder"),
  resultCanvas: document.querySelector("#cutout-result"),
  resultPlaceholder: document.querySelector("#result-placeholder"),
  aquariumButton: document.querySelector("#aquarium-preview"),
  aquariumCanvas: document.querySelector("#aquarium-canvas")
};

const state = {
  selectedFile: null,
  previewUrl: "",
  requestController: null,
  cutoutReady: false,
  aquariumRunning: false,
  aquariumFrame: 0
};

function errorMessage(error) {
  if (typeof error === "string") return error;
  if (!error) return "未知错误";
  return error.message || "未知错误";
}

function setStatus(message, kind = "idle") {
  elements.statusText.textContent = message;
  elements.statusDot.className = "status-dot";
  if (kind !== "idle") elements.statusDot.classList.add(kind);
}

function setCaptureStatus(message, kind = "idle") {
  elements.captureStatusText.textContent = message;
  elements.captureStatusDot.className = "status-dot";
  if (kind !== "idle") {
    elements.captureStatusDot.classList.add(kind);
  }
}

function showStep(step) {
  elements.stepScreens.forEach((screen) => {
    screen.hidden = Number(screen.dataset.step) !== step;
    if (!screen.hidden) screen.scrollTop = 0;
  });
  document.body.dataset.step = String(step);
}

function updateGenerateAvailability() {
  elements.generateButton.disabled = !(
    state.selectedFile &&
    elements.description.value.trim() &&
    elements.subjectType.value &&
    !state.requestController
  );
}

function clearCanvas(canvas) {
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function resetGeneratedResult() {
  state.cutoutReady = false;
  elements.aquariumButton.disabled = true;
  elements.resultTitle.textContent = "AI 正在生成透明物品";
  elements.generationTag.textContent = "正在施展透明魔法";
  elements.generatingState.hidden = false;
  elements.resultContent.hidden = true;
  elements.resultPlaceholder.hidden = false;
  clearCanvas(elements.resultCanvas);
}

function validateFile(file) {
  if (!file || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("请选择 JPEG、PNG 或 WebP 图片");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片大小必须在 5 MB 以内");
  }
}

function showSelectedImage(file) {
  validateFile(file);
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);

  state.selectedFile = file;
  state.previewUrl = URL.createObjectURL(file);
  elements.sourcePreview.src = state.previewUrl;
  elements.sourcePreview.hidden = false;
  elements.sourcePlaceholder.hidden = true;
  elements.generateButton.textContent = GENERATE_LABEL;
  resetGeneratedResult();
  updateGenerateAvailability();
  setCaptureStatus(
    "图片已准备好，请描述物品并选择图片种类。",
    "success"
  );
}

function handleImageChange() {
  const file =
    elements.imageInput.files && elements.imageInput.files[0];
  if (!file) return;

  try {
    showSelectedImage(file);
  } catch (error) {
    elements.imageInput.value = "";
    setCaptureStatus(errorMessage(error), "error");
  }
}

async function readJsonResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`AI 服务返回了无效响应（${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(
      (payload.error && payload.error.message) ||
        `请求失败（${response.status}）`
    );
  }
  return payload;
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
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

async function createProcessingFrame() {
  await waitForImage(elements.sourcePreview);

  const sourceWidth = elements.sourcePreview.naturalWidth;
  const sourceHeight = elements.sourcePreview.naturalHeight;
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
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });
  if (!context) {
    throw new Error("暂时无法处理这张图片");
  }

  context.drawImage(elements.sourcePreview, 0, 0, width, height);
  return {
    imageData: context.getImageData(0, 0, width, height)
  };
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
  const targetWidth = sourceRight - sourceX;
  const targetHeight = sourceBottom - sourceY;

  elements.resultCanvas.width = targetWidth;
  elements.resultCanvas.height = targetHeight;
  const resultContext = elements.resultCanvas.getContext("2d");
  if (!resultContext) {
    throw new Error("暂时无法显示透明物品");
  }

  resultContext.clearRect(0, 0, targetWidth, targetHeight);
  resultContext.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    targetWidth,
    targetHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );
  elements.resultPlaceholder.hidden = true;
}

async function locateAndCutout() {
  const description = elements.description.value.trim();
  const subjectType = elements.subjectType.value;
  if (!state.selectedFile || !description || !subjectType) return;

  const controller = new AbortController();
  state.requestController = controller;
  resetGeneratedResult();
  showStep(2);
  elements.generateButton.disabled = true;
  elements.generateButton.textContent = "AI 正在制作…";
  elements.cancelButton.hidden = false;
  setStatus("AI 正在识别你选择的物品…", "working");

  try {
    const form = new FormData();
    form.append("image", state.selectedFile);
    form.append("description", description);
    form.append("subjectType", subjectType);

    const response = await fetch("/api/object-groundings", {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);
    const grounding = payload.grounding;

    if (!grounding) {
      throw new Error("AI 暂时没有找到这个物品");
    }

    setStatus("AI 已找到物品，正在生成透明效果…", "working");

    const frame = await createProcessingFrame();
    const processed = refineMask(frame.imageData, grounding);
    cropTransparentResult(processed);
    state.cutoutReady = true;
    elements.resultTitle.textContent = "透明物品生成完成";
    elements.generationTag.textContent = "准备放入鱼缸";
    elements.generatingState.hidden = true;
    elements.resultContent.hidden = false;
    elements.aquariumButton.disabled = false;

    setStatus("制作完成！可以把它放进鱼缸看看。", "success");
  } catch (error) {
    elements.resultTitle.textContent = "这次没有生成成功";
    elements.generationTag.textContent = "可以返回修改";
    elements.generatingState.hidden = true;
    if (error && error.name === "AbortError") {
      setStatus("已取消本次制作。");
    } else {
      setStatus(`识别或裁剪失败：${errorMessage(error)}`, "error");
    }
  } finally {
    state.requestController = null;
    elements.cancelButton.hidden = true;
    elements.generateButton.textContent = state.cutoutReady
      ? RETRY_LABEL
      : GENERATE_LABEL;
    updateGenerateAvailability();
  }
}

function cancelProcessing() {
  if (state.requestController) {
    state.requestController.abort();
  }
}

function returnToCapture() {
  cancelProcessing();
  showStep(1);
  setCaptureStatus("可以修改图片或描述后重新生成。", "success");
}

function resizeAquarium() {
  const canvas = elements.aquariumCanvas;
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawAquariumFrame(time) {
  if (!state.aquariumRunning) return;
  resizeAquarium();

  const canvas = elements.aquariumCanvas;
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#9ce8e8");
  gradient.addColorStop(0.55, "#53b8c5");
  gradient.addColorStop(1, "#267995");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255,255,255,0.38)";
  for (let index = 0; index < 8; index += 1) {
    const bubbleX = (index * 137 + time * 0.02) % width;
    const bubbleY =
      height - ((index * 83 + time * 0.05) % height);
    const radius = 3 + (index % 4) * 2;
    context.beginPath();
    context.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2);
    context.fill();
  }

  if (state.cutoutReady) {
    const sprite = elements.resultCanvas;
    const maxSpriteWidth = width * 0.22;
    const maxSpriteHeight = height * 0.56;
    const spriteScale = Math.min(
      maxSpriteWidth / sprite.width,
      maxSpriteHeight / sprite.height,
      1.6
    );
    const drawWidth = sprite.width * spriteScale;
    const drawHeight = sprite.height * spriteScale;
    const travel = width + drawWidth;
    const x = (time * 0.06) % travel - drawWidth;
    const y =
      height * 0.48 +
      Math.sin(time * 0.0024) * height * 0.08 -
      drawHeight / 2;

    context.save();
    context.translate(x + drawWidth / 2, y + drawHeight / 2);
    context.rotate(Math.sin(time * 0.0016) * 0.05);
    context.drawImage(
      sprite,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );
    context.restore();
  }

  state.aquariumFrame =
    globalThis.requestAnimationFrame(drawAquariumFrame);
}

function startAquariumPreview() {
  if (!state.cutoutReady) return;
  showStep(3);
  state.aquariumRunning = true;
  resizeAquarium();
  if (!state.aquariumFrame) {
    state.aquariumFrame =
      globalThis.requestAnimationFrame(drawAquariumFrame);
  }
}

function stopAquariumPreview() {
  state.aquariumRunning = false;
  if (state.aquariumFrame) {
    globalThis.cancelAnimationFrame(state.aquariumFrame);
    state.aquariumFrame = 0;
  }
}

function restartFlow() {
  stopAquariumPreview();
  cancelProcessing();

  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }
  state.selectedFile = null;
  state.previewUrl = "";
  elements.imageInput.value = "";
  elements.description.value = "";
  elements.subjectType.value = "";
  elements.sourcePreview.removeAttribute("src");
  elements.sourcePreview.hidden = true;
  elements.sourcePlaceholder.hidden = false;
  elements.generateButton.textContent = GENERATE_LABEL;
  resetGeneratedResult();
  updateGenerateAvailability();
  setCaptureStatus("先拍摄或选择一张图片吧。");
  showStep(1);
}

function installGlobalFallback() {
  globalThis.addEventListener("error", (event) => {
    setStatus(`页面运行异常：${errorMessage(event.error)}`, "error");
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    setStatus(`异步处理异常：${errorMessage(event.reason)}`, "error");
  });
}

function initialize() {
  installGlobalFallback();
  elements.imageInput.addEventListener("change", handleImageChange);
  elements.description.addEventListener(
    "input",
    updateGenerateAvailability
  );
  elements.subjectType.addEventListener(
    "change",
    updateGenerateAvailability
  );
  elements.generateButton.addEventListener("click", locateAndCutout);
  elements.cancelButton.addEventListener("click", cancelProcessing);
  elements.backButton.addEventListener("click", returnToCapture);
  elements.restartButton.addEventListener("click", restartFlow);
  elements.aquariumButton.addEventListener(
    "click",
    startAquariumPreview
  );
  globalThis.addEventListener("resize", resizeAquarium);

  updateGenerateAvailability();
  resetGeneratedResult();
  showStep(1);
}

initialize();
