(function () {
  "use strict";

  const cutoutApi = globalThis.AquariumCutoutFlow;
  const webglFishApi = globalThis.AquariumWebGLFishMesh;
  const aquariumCoreModule = globalThis.AquariumCore;
  const aquariumApi = globalThis.AquariumAPI;
  const tutorialModule = globalThis.AquariumTutorial;
  if (
    !cutoutApi
    || typeof cutoutApi.createCutoutSession !== "function"
    || typeof cutoutApi.generateTransparentCutout !== "function"
  ) {
    throw new Error("物品裁剪功能加载失败，请刷新页面重试");
  }
  const cutoutSession = cutoutApi.createCutoutSession();
  const webglFishRenderer = webglFishApi
    && typeof webglFishApi.createRenderer === "function"
    ? webglFishApi.createRenderer()
    : {
      available: false,
      render() {
        return false;
      }
    };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const soundManager = globalThis.SoundManager;
  const STORAGE_KEY = "quiet-aquarium-state-v2";
  const DB_NAME = "quiet-aquarium-assets-v2";
  const OBJECT_IMAGE_KEY = "memory-object";
  const WATERLINE_RATIO = 0.18;
  const BOTTOM_OBJECT_EDGE_RATIO = 0.985;
  const CATCH_DURATION_MS = 60000;
  const CATCH_TARGET_SCORE = 10;
  const CATCH_NPC_PENALTY = 5;
  const CATCH_HIDE_COOLDOWN_MS = 30000;
  const FRESH_START_KEYS = [
    STORAGE_KEY,
    "stubborn_fish_state_v1",
    "stubborn_fish_state_backup_v1",
    "stubborn_fish_tutorial_v1"
  ];
  const REDUCED_MOTION = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function resetForFreshGuideIfRequested() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fresh") !== "1") return false;
    try {
      FRESH_START_KEYS.forEach((key) => localStorage.removeItem(key));
      params.delete("fresh");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      );
      return true;
    } catch (error) {
      console.warn("无法清理本地引导存档", error);
      return false;
    }
  }

  resetForFreshGuideIfRequested();

  const presetDecor = (id, name, state) => ({
    id,
    type: "decor",
    name,
    state,
    rule: state === "surface" ? "固定水面" : "固定沉底",
    assetKind: "preset-image-decor",
    artKey: `presetDecor:${id}`,
    imageUrl: `/game/assets/preset-decor/${id}.png`,
    aspectRatio: 1
  });

  const DEFAULT_CATALOG = [
    { id: "betta", type: "fish", name: "铜蓝斗鱼", sprite: 0, rule: "鱼类" },
    { id: "guppy", type: "fish", name: "金尾孔雀鱼", sprite: 1, rule: "鱼类" },
    { id: "butterfly-koi", type: "fish", name: "蝶尾锦鲤", sprite: 2, rule: "鱼类" },
    { id: "angelfish", type: "fish", name: "金纹神仙鱼", sprite: 3, rule: "鱼类" },
    {
      id: "big-dog-fish",
      type: "fish",
      name: "大狗鱼",
      rule: "鱼类",
      assetKind: "preset-image-fish",
      artKey: "presetBigDogFish",
      imageUrl: "/game/assets/preset-fish/big-dog-fish.png",
      aspectRatio: 605 / 792,
      defaultSize: 0.13,
      motionProfile: "sway"
    },
    {
      id: "cat-fish",
      type: "fish",
      name: "猫鱼",
      rule: "鱼类",
      assetKind: "preset-image-fish",
      artKey: "presetCatFish",
      imageUrl: "/game/assets/preset-fish/cat-fish.png",
      aspectRatio: 584 / 792,
      defaultSize: 0.13,
      motionProfile: "sway"
    },
    {
      id: "milk-cat-fish",
      type: "fish",
      name: "奶猫鱼",
      rule: "鱼类",
      assetKind: "preset-image-fish",
      artKey: "presetMilkCatFish",
      imageUrl: "/game/assets/preset-fish/milk-cat-fish.png",
      aspectRatio: 792 / 341,
      defaultSize: 0.12,
      motionProfile: "tail"
    },
    {
      id: "milk-fish",
      type: "fish",
      name: "奶鱼",
      rule: "鱼类",
      assetKind: "preset-image-fish",
      artKey: "presetMilkFish",
      imageUrl: "/game/assets/preset-fish/milk-fish.png",
      aspectRatio: 792 / 705,
      defaultSize: 0.12,
      motionProfile: "tail"
    },
    {
      id: "tingquan-fish",
      type: "fish",
      name: "听泉鱼",
      rule: "鱼类",
      assetKind: "preset-image-fish",
      artKey: "presetTingquanFish",
      imageUrl: "/game/assets/preset-fish/tingquan-fish.png",
      aspectRatio: 792 / 651,
      defaultSize: 0.12,
      motionProfile: "tail"
    },
    presetDecor("stone-cave", "石洞", "bottom"),
    presetDecor("driftwood", "沉木", "bottom"),
    presetDecor("amphora", "旧陶罐", "bottom"),
    presetDecor("rooted-grass", "扎根水草", "bottom"),
    presetDecor("coral", "浅色珊瑚", "bottom"),
    presetDecor("ribbon-grass", "带状水草", "bottom"),
    presetDecor("feather-grass", "羽叶水草", "bottom"),
    presetDecor("moss-bush", "团簇水草", "bottom"),
    presetDecor("river-stones", "河滩卵石", "bottom"),
    presetDecor("slate-rocks", "青岩石柱", "bottom"),
    presetDecor("pebble-cluster", "小卵石群", "bottom"),
    presetDecor("water-lily", "睡莲", "surface"),
    presetDecor("duckweed", "浮萍", "surface"),
    presetDecor("water-lettuce", "水鳖", "surface"),
    presetDecor("water-hyacinth", "水葫芦", "surface"),
    presetDecor("floating-heart", "荇菜", "surface"),
    presetDecor("floating-fern", "槐叶萍", "surface"),
    presetDecor("lotus-pair", "小莲花", "surface")
  ];

  const appRoot = $("#app");
  const canvas = $("#tank");
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.dataset.customFishRenderer = webglFishRenderer.available
    ? "webgl-ready"
    : "canvas-fallback";
  const dock = $("#dock");
  const sheet = $("#addSheet");
  const fileInput = $("#fileInput");
  const imagePreview = $("#imagePreview");
  const pickerEmpty = $("#pickerEmpty");
  const replaceImageHint = $("#replaceImageHint");
  const subjectDescription = $("#subjectDescription");
  const subjectType = $("#subjectType");
  const objectNameInput = $("#objectName");
  const generateCutoutButton = $("#generateCutoutButton");
  const confirmAddButton = $("#confirmAddButton");
  const captureView = $('[data-cutout-view="capture"]');
  const resultView = $('[data-cutout-view="result"]');
  const processingState = $("#processingState");
  const resultContent = $("#resultContent");
  const resultError = $("#resultError");
  const sourcePreview = $("#sourcePreview");
  const cutoutResult = $("#cutoutResult");
  const resultSummary = $("#resultSummary");
  const captureStatus = $("#captureStatus");
  const sheetStatus = $("#sheetStatus");
  const editor = $("#objectEditor");
  const scaleRange = $("#scaleRange");

  const state = {
    canvasWidth: 0,
    canvasHeight: 0,
    width: 0,
    height: 0,
    tankRect: { x: 0, y: 0, width: 0, height: 0, radius: 18 },
    dpr: 1,
    lastFrame: performance.now(),
    time: 0,
    soundOn: false,
    backgroundId: "westlake",
    viewing: false,
    editing: false,
    pointer: null,
    selectedFile: null,
    selectedState: "fish",
    selectedFileUrl: "",
    requestController: null,
    memoryImages: new Map(),
    memoryObjects: [],
    memoryObject: null,
    ripples: [],
    foods: [],
    bubbles: [],
    sandPuffs: [],
    catchSplashes: [],
    fish: [],
    plants: [],
    sceneDecor: [],
    art: {
      background: null,
      backgroundWestlake: null,
      fish: null,
      defaultFish: null,
      defaultDecor: null,
      surfacePlants: null,
      plants: null,
      rocks: null,
      catchClaw: null,
      fallbackFish: null,
      fallbackObject: null,
      presetBigDogFish: null,
      presetCatFish: null,
      presetMilkCatFish: null,
      presetMilkFish: null,
      presetTingquanFish: null
    },
    artReady: false,
    storyTimer: 0,
    feedEventTimer: 0,
    selectedFishId: null,
    selectedDecorId: null,
    deletedBaseFishIds: [],
    deletedSceneDecorIds: [],
    longPressTimer: 0,
    longPressStart: null,
    catchGame: {
      running: false,
      phase: "aiming",
      startedAt: 0,
      endsAt: 0,
      score: 0,
      caughtTargets: 0,
      caughtNpcs: 0,
      selectedTargetIds: new Set(),
      targetIds: new Set(),
      caughtTargetIds: new Set(),
      snapshot: new Map(),
      surfaceSnapshot: new Map(),
      feedbackTimer: 0,
      scoreFlashTimer: 0,
      musicMuted: false,
      surfaceObstacles: [],
      claw: {
        x: 0.5,
        y: 0.085,
        phaseStartedAt: 0,
        grabbedFishId: null,
        waterlineChecked: false,
        blocked: false
      }
    },
    catchAudio: {
      context: null,
      musicElement: null
    },
    db: null,
    aquariumCore: null,
    coreUnsubscribe: null,
    coreSceneTimer: null,
    eventPausedFishIds: new Set(),
    shopView: { decor: [], fish: [] },
    coreViewModel: null,
    tutorial: null,
    pendingMaturityFishId: null
  };

  function sceneSnapshotForCore() {
    return {
      fish: state.fish.map((fish) => ({
        id: fish.id,
        name: fish.name,
        x: fish.x,
        y: fish.y,
        baseY: fish.baseY,
        size: fish.size,
        dir: fish.dir,
        sprite: fish.sprite,
        atlas: fish.atlas || "original",
        assetKind: fish.assetKind || "atlas-fish",
        catalogId: fish.catalogId || null,
        artKey: fish.artKey || null,
        imageKey: fish.imageKey || null,
        iconUrl: fish.iconUrl || "",
        aspectRatio: fish.aspectRatio || null,
        motionProfile: fish.motionProfile || null,
        personality: fish.personality || null,
        speed: fish.speed,
        phase: fish.phase,
        source: fish.source || (fish.custom ? "memory" : "preset"),
        custom: Boolean(fish.custom),
        active: fish.active !== false
      })),
      objects: state.memoryObjects.map((object) => ({
        id: object.id,
        name: object.name,
        x: object.x,
        y: object.y,
        scale: object.scale,
        state: object.state,
        source: object.assetKind === "custom" ? "memory" : "preset",
        assetKind: object.assetKind,
        imageKey: object.imageKey || null,
        previewUrl: object.previewUrl || "",
        capturedAt: object.capturedAt || "",
        capturedPlace: object.capturedPlace || "",
        targetLabel: Array.isArray(object.tags) ? object.tags[1] || "" : "",
        aspectRatio: object.aspectRatio || null,
        motionProfile: object.motionProfile || null
      })),
      decor: state.sceneDecor.map((decor) => ({
        id: decor.id,
        name: decor.name,
        kind: decor.kind,
        x: decor.x,
        y: decor.y,
        scale: decor.scale
      })),
      settings: {
        viewing: state.viewing,
        backgroundId: state.backgroundId,
        soundOn: state.soundOn
      },
      selected: {
        fishId: state.selectedFishId || null,
        objectId: state.memoryObject ? state.memoryObject.id : null,
        decorId: state.selectedDecorId || null
      },
      scene: {
        width: state.canvasWidth,
        height: state.canvasHeight
      }
    };
  }

  function coreEntityPosition(entityId) {
    const fish = state.fish.find((item) => item.id === entityId);
    if (fish) return { x: fish.x, y: fish.y };
    const object = state.memoryObjects.find((item) => item.id === entityId);
    if (object) return { x: object.x, y: object.y };
    return null;
  }

  function awaitOrIgnore(promise) {
    Promise.resolve(promise).catch((error) => {
      showError(error && error.message);
    });
  }

  function syncCanvasSelection() {
    if (!state.aquariumCore) return;
    state.aquariumCore.syncSceneSnapshot(sceneSnapshotForCore());
  }

  function syncSceneEditingMode() {
    const isEditingScene = Boolean(
      state.editing || state.selectedFishId || state.selectedDecorId
    );
    const blockingOverlay = document.querySelector(
      ".sheet:not(.is-hidden), .ui-sheet:not(.is-hidden), #catchPanel:not(.is-hidden)"
    );
    const shouldHideDock = Boolean(
      state.viewing || isEditingScene || state.catchGame.running || blockingOverlay
    );
    appRoot.classList.toggle("is-scene-editing", isEditingScene);
    dock.classList.toggle("is-hidden", shouldHideDock);
    $("#exitViewButton").classList.toggle("is-hidden", !state.viewing);
  }

  async function reloadEntityImage(entity, kind) {
    if (!entity || !entity.imageKey) return false;
    const fallback = kind === "fish"
      ? state.art.fallbackFish
      : state.art.fallbackObject;
    const existing = state.memoryImages.get(entity.imageKey);
    if (existing && existing !== state.art.fallbackFish && existing !== state.art.fallbackObject) {
      return true;
    }
    try {
      const blob = await getImageBlob(entity.imageKey);
      if (!blob) {
        if (fallback) state.memoryImages.set(entity.imageKey, fallback);
        return false;
      }
      const image = await blobToImage(blob);
      if (!image) return false;
      state.memoryImages.set(entity.imageKey, image);
      Object.assign(entity, analyzeImageMotion(image));
      return true;
    } catch (error) {
      if (fallback) state.memoryImages.set(entity.imageKey, fallback);
      console.warn("Stored aquarium image unavailable", error);
      return false;
    }
  }

  function hydrateFishFromCore(source) {
    if (!source || !source.id || source.active === false) return null;
    const isMemoryFish = source.source === "memory"
      || source.assetKind === "custom-fish"
      || source.custom === true;
    const assetKind = isMemoryFish
      ? "custom-fish"
      : source.assetKind || "atlas-fish";
    const payload = {
      ...source,
      custom: isMemoryFish,
      assetKind
    };
    let fish = state.fish.find((item) => item.id === source.id);
    if (!fish) {
      fish = createPlaceholderFish(payload);
      state.fish.push(fish);
    } else {
      const restored = createPlaceholderFish({ ...fish, ...payload });
      Object.assign(fish, restored, source);
    }
    fish.custom = isMemoryFish;
    fish.assetKind = assetKind;
    fish.active = true;
    fish.x = clamp(Number.isFinite(Number(fish.x)) ? Number(fish.x) : 0.5, 0.08, 0.92);
    fish.y = clamp(Number.isFinite(Number(fish.y)) ? Number(fish.y) : 0.46, 0.15, 0.82);
    fish.baseY = clamp(
      Number.isFinite(Number(fish.baseY)) ? Number(fish.baseY) : fish.y,
      0.15,
      0.82
    );
    fish.size = clamp(Number.isFinite(Number(fish.size)) ? Number(fish.size) : 0.112, 0.075, 0.17);
    fish.dir = Number(fish.dir) === -1 ? -1 : 1;
    fish.sprite = clamp(
      Number.isFinite(Number(fish.sprite)) ? Math.floor(Number(fish.sprite)) : 0,
      0,
      3
    );
    fish.atlas = fish.atlas === "default" ? "default" : "original";
    fish.speed = Number.isFinite(Number(fish.speed)) && Number(fish.speed) > 0
      ? Number(fish.speed)
      : 0.029;
    fish.currentSpeed = Number.isFinite(Number(fish.currentSpeed)) && Number(fish.currentSpeed) > 0
      ? Number(fish.currentSpeed)
      : fish.speed;
    fish.bobFrequency = Number.isFinite(Number(fish.bobFrequency))
      ? Number(fish.bobFrequency)
      : 0.001;
    fish.bobAmplitude = Number.isFinite(Number(fish.bobAmplitude))
      ? Number(fish.bobAmplitude)
      : 0.00022;
    fish.phase = Number.isFinite(Number(fish.phase)) ? Number(fish.phase) : 0;
    if (isMemoryFish && fish.imageKey) {
      awaitOrIgnore(reloadEntityImage(fish, "fish"));
    }
    return fish;
  }

  function hydrateObjectFromCore(source) {
    if (!source || !source.id) return null;
    const isRealityObject = source.source === "memory" || source.assetKind === "custom";
    const assetKind = source.assetKind || (isRealityObject ? "custom" : "default-decor");
    let object = state.memoryObjects.find((item) => item.id === source.id);
    const restored = {
      ...(object || {}),
      ...source,
      id: source.id,
      name: source.name || (object && object.name) || "没有名字的东西",
      x: Number.isFinite(Number(source.x)) ? Number(source.x) : 0.5,
      y: Number.isFinite(Number(source.y)) ? Number(source.y) : 0.52,
      scale: clamp(Number(source.scale || 1), 0.5, 2),
      state: ["bottom", "suspended", "surface"].includes(source.state)
        ? source.state
        : "suspended",
      assetKind,
      imageKey: source.imageKey || (object && object.imageKey) || null,
      aspectRatio: source.aspectRatio || (object && object.aspectRatio) || null,
      motionProfile: source.motionProfile || (object && object.motionProfile) || null,
      tags: Array.isArray(source.tags)
        ? source.tags
        : ["现实物品", source.targetLabel].filter(Boolean),
      entry: null,
      entryOffsetX: 0,
      entryTilt: 0
    };
    if (object) Object.assign(object, restored);
    else {
      object = restored;
      state.memoryObjects.push(object);
    }
    constrainObjectToState(object);
    if (isRealityObject && object.imageKey) {
      awaitOrIgnore(reloadEntityImage(object, "object"));
    }
    return object;
  }

  function hydrateSceneFromCore(coreState) {
    if (!coreState || typeof coreState !== "object") return;
    const settings = coreState.settings || {};
    state.soundOn = Boolean(settings.soundOn);
    if (soundManager) soundManager.setEnabled(state.soundOn);
    state.backgroundId = settings.backgroundId === "classic" ? "classic" : "westlake";
    state.viewing = Boolean(settings.viewing);
    const storedFish = Array.isArray(coreState.fish) ? coreState.fish : [];
    const inactiveFishIds = new Set(
      storedFish.filter((fish) => fish.active === false).map((fish) => fish.id)
    );
    state.fish = state.fish.filter((fish) => !inactiveFishIds.has(fish.id));
    storedFish.forEach(hydrateFishFromCore);

    const storedObjects = Array.isArray(coreState.objects) ? coreState.objects : [];
    storedObjects.forEach(hydrateObjectFromCore);

    const storedDecor = Array.isArray(coreState.decor) ? coreState.decor : [];
    storedDecor.forEach((savedDecor) => {
      const decor = state.sceneDecor.find((item) => item.id === savedDecor.id);
      if (!decor) return;
      if (Number.isFinite(Number(savedDecor.x))) decor.x = Number(savedDecor.x);
      if (Number.isFinite(Number(savedDecor.y))) decor.y = Number(savedDecor.y);
      if (Number.isFinite(Number(savedDecor.scale))) {
        decor.scale = clamp(Number(savedDecor.scale), 0.6, 1.6);
      }
      constrainSceneDecor(decor);
    });
    const selected = coreState.selected || {};
    const fishEditorOpen = !$("#fishEditor").classList.contains("is-hidden");
    const decorEditorOpen = !$("#decorEditor").classList.contains("is-hidden");
    state.selectedFishId = fishEditorOpen
      && state.fish.some((fish) => fish.id === selected.fishId)
      ? selected.fishId
      : null;
    state.selectedDecorId = decorEditorOpen
      && state.sceneDecor.some((decor) => decor.id === selected.decorId)
      ? selected.decorId
      : null;
    const selectedObject = state.memoryObjects.find(
      (object) => object.id === selected.objectId
    );
    state.memoryObject = selectedObject
      || state.memoryObject
      || state.memoryObjects[state.memoryObjects.length - 1]
      || null;
    updateSoundButton();
    updateBackgroundButton();
    syncSceneEditingMode();
  }

  function addCoreFishToScene(effect) {
    const source = effect && effect.fish;
    if (!source || state.fish.some((fish) => fish.id === source.id)) return;
    const fish = createPlaceholderFish({
      ...source,
      custom: true,
      assetKind: "custom-fish"
    });
    state.fish.push(fish);
    if (effect.transparentBlob && fish.imageKey) {
      putImageBlob(effect.transparentBlob, fish.imageKey)
        .then(() => blobToImage(effect.transparentBlob))
        .then((image) => {
          state.memoryImages.set(fish.imageKey, image);
          Object.assign(fish, analyzeImageMotion(image));
        })
        .catch(() => showError("透明鱼图片暂时无法长期保存。"));
    }
  }

  function addCoreObjectToScene(effect) {
    const source = effect && effect.object;
    if (!source || state.memoryObjects.some((object) => object.id === source.id)) return;
    const object = {
      ...source,
      y: -0.1,
      assetKind: "custom",
      tags: ["现实物品", source.targetLabel].filter(Boolean),
      entry: createEntryForState(source.state),
      entryOffsetX: 0,
      entryTilt: 0
    };
    state.memoryObjects.push(object);
    state.memoryObject = object;
    if (effect.transparentBlob && object.imageKey) {
      putImageBlob(effect.transparentBlob, object.imageKey)
        .then(() => blobToImage(effect.transparentBlob))
        .then((image) => {
          state.memoryImages.set(object.imageKey, image);
          Object.assign(object, analyzeImageMotion(image));
        })
        .catch(() => showError("透明物品图片暂时无法长期保存。"));
    }
  }

  function applyCoreEffect(effect) {
    if (!effect || !effect.type) return;
    if (effect.type === "SPAWN_FOOD") spawnFoodEffect();
    if (effect.type === "ADD_FISH_TO_SCENE") addCoreFishToScene(effect);
    if (effect.type === "ADD_OBJECT_TO_SCENE") addCoreObjectToScene(effect);
    if (effect.type === "REMOVE_FISH_FROM_SCENE") {
      state.fish = state.fish.filter((fish) => fish.id !== effect.fishId);
      if (state.selectedFishId === effect.fishId) {
        state.selectedFishId = null;
        $("#fishEditor").classList.add("is-hidden");
        if (!state.viewing && !state.editing && !state.selectedDecorId) {
          dock.classList.remove("is-hidden");
        }
      }
    }
    if (effect.type === "REMOVE_OBJECT_FROM_SCENE") {
      state.memoryObjects = state.memoryObjects.filter(
        (object) => object.id !== effect.objectId
      );
    }
    if (effect.type === "REMOVE_DECOR_FROM_SCENE") {
      state.sceneDecor = state.sceneDecor.filter((decor) => decor.id !== effect.decorId);
    }
    if (effect.type === "UPDATE_FISH") {
      const fish = state.fish.find((item) => item.id === effect.fishId);
      if (fish) Object.assign(fish, effect.changes || {});
    }
    if (effect.type === "UPDATE_OBJECT") {
      const object = state.memoryObjects.find((item) => item.id === effect.objectId);
      if (object) {
        Object.assign(object, effect.changes || {});
        constrainObjectToState(object);
      }
    }
    if (effect.type === "UPDATE_DECOR") {
      const decor = state.sceneDecor.find((item) => item.id === effect.decorId);
      if (decor) {
        Object.assign(decor, effect.changes || {});
        constrainSceneDecor(decor);
      }
    }
    if (effect.type === "FOCUS_FISH_ON_OBJECT" || effect.type === "BIND_FISH_TO_OBJECT") {
      const fish = state.fish.find((item) => item.id === effect.fishId);
      const object = state.memoryObjects.find((item) => item.id === effect.objectId);
      if (fish && object) {
        fish.curiousUntil = performance.now() + 6500;
        fish.wanderTarget = {
          x: clamp(object.x + (Math.random() - 0.5) * 0.16, 0.08, 0.92),
          y: clamp(object.y + (Math.random() - 0.5) * 0.12, 0.18, 0.8)
        };
      }
    }
    if (effect.type === "BIND_FISH_TO_FISH") {
      const fishA = state.fish.find((item) => item.id === effect.fishAId);
      const fishB = state.fish.find((item) => item.id === effect.fishBId);
      if (fishA && fishB) {
        const target = {
          x: clamp((fishA.x + fishB.x) / 2, 0.12, 0.88),
          y: clamp((fishA.y + fishB.y) / 2, 0.2, 0.78)
        };
        fishA.wanderTarget = { ...target };
        fishB.wanderTarget = { ...target };
      }
    }
    if (effect.type === "BIND_OBJECT_TO_OBJECT") {
      const objectA = state.memoryObjects.find((item) => item.id === effect.objectAId);
      const objectB = state.memoryObjects.find((item) => item.id === effect.objectBId);
      if (
        objectA
        && objectB
        && objectA.state === "suspended"
        && objectB.state === "suspended"
      ) {
        const midpoint = (objectA.x + objectB.x) / 2;
        const strength = clamp(effect.strength, 0, 0.18);
        objectA.x += (midpoint - objectA.x) * strength;
        objectB.x += (midpoint - objectB.x) * strength;
      }
    }
    if (effect.type === "SET_VIEWING") {
      state.viewing = Boolean(effect.enabled);
      $(".topbar").classList.remove("is-hidden");
      syncSceneEditingMode();
    }
    if (effect.type === "SET_BACKGROUND") {
      state.backgroundId = effect.backgroundId === "classic" ? "classic" : "westlake";
      updateBackgroundButton();
    }
    if (effect.type === "SET_SOUND") {
      state.soundOn = Boolean(effect.enabled);
      updateSoundButton();
      if (soundManager) soundManager.setEnabled(state.soundOn);
      if (state.soundOn) playTone(520, 0.1);
    }
  }

  async function configureAquariumCore() {
    if (!aquariumCoreModule || !aquariumApi) return;
    aquariumCoreModule.configure({
      sceneAdapter: {
        getSceneSnapshot: sceneSnapshotForCore,
        hydrateScene: hydrateSceneFromCore,
        applyEffect: applyCoreEffect,
        getEntityPosition: coreEntityPosition,
        getSceneSize() {
          return { width: 1, height: 1 };
        },
        getCanvas() {
          return canvas;
        },
        getEntityImage(entityId) {
          const entity = state.fish.find((fish) => fish.id === entityId)
            || state.memoryObjects.find((object) => object.id === entityId);
          return entity && entity.imageKey
            ? state.memoryImages.get(entity.imageKey) || null
            : null;
        }
      }
    });
    state.aquariumCore = aquariumCoreModule.getInstance();
    state.aquariumCore.syncSceneSnapshot(sceneSnapshotForCore(), { silent: true });
    state.coreUnsubscribe = state.aquariumCore.subscribe((event) => {
      renderCoreViewModel(event.viewModel);
      if (event.type === "state:changed" && state.tutorial) {
        const reason = event.payload && event.payload.reason;
        const kind = event.payload && event.payload.kind;
        const itemId = event.payload && event.payload.unlockId;
        if (reason === "shop:purchase" && (kind === "decor" || kind === "fish")) {
          const advanced = state.tutorial.signal(
            kind === "decor" ? "purchaseDecor" : "purchaseFish",
            { itemId }
          );
          if (advanced && kind === "fish") {
            closeShop();
            openSheet();
            selectAddSource("collection");
          }
        }
        if (reason === "catalog:consume" && (kind === "decor" || kind === "fish")) {
          state.tutorial.signal(
            kind === "decor" ? "placeDecor" : "placeFish",
            { itemId }
          );
        }
      }
      if (event.type === "story:immediate") {
        showStory(event.payload.text || event.payload.body);
      }
      if (event.type === "story:resolved") {
        showStory(event.payload.body);
      }
      if (event.type === "core:error") {
        showError(event.payload.message || "哎呀，出错了，请重启试试吧。");
      }
      if (event.type === "maturity:ready") {
        if (state.tutorial) {
          state.tutorial.signal("maturityReady", { fishId: event.payload.fishId });
        }
        openMaturityChoice(event.payload.fishId);
      }
      if (event.type === "maturity:resolved" && state.tutorial) {
        state.tutorial.signal("maturityResolved", { fishId: event.payload.fishId });
      }
    });
    const initResult = await aquariumApi.init();
    renderCoreViewModel(initResult.viewModel || aquariumApi.getViewModel());
    state.coreSceneTimer = window.setInterval(() => {
      if (!state.aquariumCore) return;
      state.aquariumCore.updateOfflineEventAnchors();
    }, 2000);
  }

  function personalityValue(id, salt) {
    const text = `${id}:${salt}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function createFishPersonality(id, existing = null, position = {}) {
    if (existing && typeof existing === "object" && existing.version === 3) return {
      version: 3,
      activity: clamp(Number(existing.activity || 1), 0.58, 1.5),
      restChance: clamp(Number(existing.restChance || 0.18), 0.06, 0.42),
      burstChance: clamp(Number(existing.burstChance || 0.12), 0.05, 0.24),
      sociality: clamp(Number(existing.sociality || 0.25), 0.05, 0.68),
      homeX: clamp(Number(existing.homeX ?? position.x ?? 0.5), 0.1, 0.9),
      preferredDepth: clamp(
        Number(existing.preferredDepth ?? position.y ?? 0.5),
        WATERLINE_RATIO + 0.06,
        0.8
      ),
      roamRadius: clamp(Number(existing.roamRadius || 0.28), 0.16, 0.46),
      coverAffinity: clamp(Number(existing.coverAffinity || 0.2), 0.04, 0.9)
    };
    return {
      version: 3,
      activity: 0.6 + personalityValue(id, "activity") * 0.86,
      restChance: 0.07 + personalityValue(id, "rest") * 0.34,
      burstChance: 0.06 + personalityValue(id, "burst") * 0.17,
      sociality: 0.06 + personalityValue(id, "social") * 0.52,
      homeX: 0.1 + personalityValue(id, "home") * 0.8,
      preferredDepth: clamp(
        WATERLINE_RATIO + 0.09 + personalityValue(id, "depth") * 0.52,
        WATERLINE_RATIO + 0.06,
        0.8
      ),
      roamRadius: 0.17 + personalityValue(id, "roam") * 0.27,
      coverAffinity: 0.04 + personalityValue(id, "cover") * 0.86
    };
  }

  function seedScene() {
    const fishSpecs = [
      [0.34, 0.42, 0.112, 1, 0]
    ];

    const fishNames = ["月白"];
    state.fish = fishSpecs.map((f, index) => {
      const id = `fish-${index + 1}`;
      return {
        id,
      name: fishNames[index],
      x: f[0],
      y: f[1],
      baseY: f[1],
      size: f[2],
      dir: f[3],
      sprite: f[4],
      speed: 0.025 + index * 0.0028,
      currentSpeed: 0.025 + index * 0.0028,
      phase: index * 1.37,
      bobFrequency: 0.00072 + Math.random() * 0.00078,
      bobAmplitude: 0.00014 + Math.random() * 0.00028,
      behavior: "cruise",
      behaviorUntil: performance.now() + 800 + Math.random() * 4200,
      wanderTarget: {
        x: 0.12 + Math.random() * 0.76,
        y: clamp(f[1] + (Math.random() - 0.5) * 0.16, 0.16, 0.82)
      },
      target: null,
      targetFoodId: null,
      lastTurnAt: 0,
      eatingUntil: 0,
      curiousUntil: 0,
      fearUntil: 0,
      fearTarget: null,
      fearVector: null,
      nextBehaviorHint: null,
      personality: createFishPersonality(id, null, { x: f[0], y: f[1] })
    };
    });

    state.plants = [
      { x: 0.08, height: 0.28, width: 0.045, phase: 0.2, color: "#477f65" },
      { x: 0.90, height: 0.33, width: 0.047, phase: 3.1, color: "#477a62" }
    ];

    state.sceneDecor = [
      { id: "plant-1", kind: "plant", name: "左侧水草", sprite: 0, x: 0.015, y: 0.54, width: 0.18, height: 0.41, scale: 1 },
      { id: "plant-4", kind: "plant", name: "右侧水草", sprite: 0, x: 0.87, y: 0.58, width: 0.14, height: 0.37, scale: 1 },
      { id: "rock-2", kind: "rock", name: "右侧石组", crop: [0.44, 0.10, 0.29, 0.72], x: 0.69, y: 0.64, width: 0.16, height: 0.32, scale: 1 }
    ];

    state.bubbles = Array.from({ length: 17 }, (_, index) => ({
      x: 0.08 + Math.random() * 0.84,
      y: Math.random(),
      r: 1 + Math.random() * 2.4,
      speed: 0.018 + Math.random() * 0.028,
      phase: index
    }));
  }

  function createPlaceholderFish(data = {}) {
    const baseY = clamp(Number(data.baseY ?? data.y ?? 0.46), 0.16, 0.78);
    const baseSpeed = Number.isFinite(Number(data.speed)) ? Number(data.speed) : 0.029;
    const id = data.id || `custom-fish-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const aspectRatio = Number.isFinite(Number(data.aspectRatio))
      ? Number(data.aspectRatio)
      : null;
    const assetKind = data.assetKind === "custom-fish"
      ? "custom-fish"
      : data.assetKind === "preset-image-fish"
        ? "preset-image-fish"
        : "atlas-fish";
    return {
      id,
      name: data.name || "新来的鱼",
      x: clamp(Number(data.x ?? 0.5), 0.08, 0.92),
      y: clamp(Number(data.y ?? baseY), 0.15, 0.82),
      baseY,
      size: clamp(Number(data.size ?? 0.112), 0.075, 0.17),
      dir: Number(data.dir) === -1 ? -1 : 1,
      sprite: clamp(Math.floor(Number(data.sprite ?? Math.random() * 4)), 0, 3),
      atlas: data.atlas === "default" ? "default" : "original",
      catalogId: data.catalogId || null,
      speed: baseSpeed,
      currentSpeed: baseSpeed,
      phase: Number.isFinite(Number(data.phase)) ? Number(data.phase) : Math.random() * Math.PI * 2,
      bobFrequency: 0.00072 + Math.random() * 0.00078,
      bobAmplitude: 0.00014 + Math.random() * 0.00028,
      behavior: "cruise",
      behaviorUntil: performance.now() + 900 + Math.random() * 3500,
      wanderTarget: {
        x: 0.12 + Math.random() * 0.76,
        y: clamp(baseY + (Math.random() - 0.5) * 0.16, 0.16, 0.8)
      },
      target: null,
      targetFoodId: null,
      lastTurnAt: 0,
      eatingUntil: 0,
      curiousUntil: 0,
      fearUntil: 0,
      fearTarget: null,
      fearVector: null,
      nextBehaviorHint: null,
      personality: createFishPersonality(id, data.personality, {
        x: Number(data.x ?? 0.5),
        y: baseY
      }),
      assetKind,
      artKey: data.artKey || null,
      imageKey: data.imageKey || null,
      iconUrl: data.iconUrl || "",
      aspectRatio,
      motionProfile: data.motionProfile === "sway" || data.motionProfile === "tail"
        ? data.motionProfile
        : aspectRatio && aspectRatio < 1
          ? "sway"
          : "tail",
      source: data.source || (data.custom ? "memory" : "preset"),
      custom: data.custom === undefined
        ? assetKind === "custom-fish"
        : Boolean(data.custom)
    };
  }

  function loadArt() {
    const manifest = {
      background: "/game/assets/aquarium-background.png",
      backgroundWestlake: "/game/assets/aquarium-background-westlake-v2.png",
      fish: "/game/assets/fish-atlas.png",
      defaultFish: "/game/assets/default-fish-atlas.png",
      defaultDecor: "/game/assets/default-decor-atlas.png",
      surfacePlants: "/game/assets/surface-plants-atlas.png",
      plants: "/game/assets/plants.png",
      rocks: "/game/assets/rocks.png",
      catchClaw: "/game/assets/catch-claw.webp",
      fallbackFish: "/game/assets/ui/fish-fallback.svg",
      fallbackObject: "/game/assets/ui/object-fallback.svg",
      presetBigDogFish: "/game/assets/preset-fish/big-dog-fish.png",
      presetCatFish: "/game/assets/preset-fish/cat-fish.png",
      presetMilkCatFish: "/game/assets/preset-fish/milk-cat-fish.png",
      presetMilkFish: "/game/assets/preset-fish/milk-fish.png",
      presetTingquanFish: "/game/assets/preset-fish/tingquan-fish.png"
    };
    const optionalArt = new Set([
      "presetBigDogFish",
      "presetCatFish",
      "presetMilkCatFish",
      "presetMilkFish",
      "presetTingquanFish"
    ]);
    DEFAULT_CATALOG
      .filter((item) => item.assetKind === "preset-image-decor")
      .forEach((item) => {
        manifest[item.artKey] = item.imageUrl;
      });

    return Promise.all(Object.entries(manifest).map(([key, src]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        state.art[key] = image;
        resolve();
      };
      image.onerror = () => {
        if (optionalArt.has(key)) {
          console.warn(`optional asset failed: ${src}`);
          resolve();
          return;
        }
        reject(new Error(`asset failed: ${src}`));
      };
      image.src = src;
    }))).then(() => {
      state.artReady = true;
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.canvasWidth = Math.max(1, rect.width);
    state.canvasHeight = Math.max(1, rect.height);
    canvas.width = Math.round(state.canvasWidth * state.dpr);
    canvas.height = Math.round(state.canvasHeight * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.tankRect = {
      x: 0,
      y: 0,
      width: state.canvasWidth,
      height: state.canvasHeight,
      radius: 0
    };
    state.width = state.canvasWidth;
    state.height = state.canvasHeight;
  }

  function loadStoredState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const storedObjects = saved && Array.isArray(saved.memoryObjects)
        ? saved.memoryObjects
        : saved && saved.memoryObject
          ? [saved.memoryObject]
          : [];
      if (storedObjects.length) {
        state.memoryObjects = storedObjects.map((storedObject, index) => {
          const hadUnfinishedEntry = storedObject.entry
            && storedObject.entry.phase === "falling";
          const object = {
            ...storedObject,
            id: storedObject.id || `memory-${index + 1}`,
            imageKey: storedObject.imageKey || OBJECT_IMAGE_KEY,
            assetKind: storedObject.assetKind || "custom",
            x: clamp(storedObject.x || 0.5, 0.1, 0.9),
          y: hadUnfinishedEntry
              ? (storedObject.state === "bottom"
              ? 0.83
                : storedObject.state === "surface"
                ? WATERLINE_RATIO
                : 0.52)
              : clamp(storedObject.y || 0.62, 0.16, 0.9),
            entry: null
          };
          object.motionProfile = object.motionProfile === "sway" || object.motionProfile === "tail"
            ? object.motionProfile
            : Number(object.aspectRatio) < 1
              ? "sway"
              : "tail";
          delete object.bottomSince;
          delete object.mossStage;
          constrainObjectToState(object);
          return object;
        });
        state.memoryObject = state.memoryObjects[state.memoryObjects.length - 1];
      }
      if (saved && Array.isArray(saved.deletedBaseFishIds)) {
        state.deletedBaseFishIds = saved.deletedBaseFishIds;
        state.fish = state.fish.filter((fish) => !state.deletedBaseFishIds.includes(fish.id));
      }
      if (saved && Array.isArray(saved.deletedSceneDecorIds)) {
        state.deletedSceneDecorIds = saved.deletedSceneDecorIds;
        state.sceneDecor = state.sceneDecor.filter((decor) => !state.deletedSceneDecorIds.includes(decor.id));
      }
      if (saved && Array.isArray(saved.customFish)) {
        saved.customFish.forEach((fish) => state.fish.push(createPlaceholderFish(fish)));
      }
      if (saved && saved.decorLayout) {
        state.sceneDecor.forEach((decor) => {
          const layout = saved.decorLayout[decor.id];
          if (!layout) return;
          decor.x = Number.isFinite(Number(layout.x)) ? Number(layout.x) : decor.x;
          decor.y = Number.isFinite(Number(layout.y)) ? Number(layout.y) : decor.y;
          decor.scale = clamp(Number(layout.scale || 1), 0.6, 1.6);
          constrainSceneDecor(decor);
        });
      }
      if (saved && saved.fishSizes) {
        state.fish.forEach((fish) => {
          const storedSize = Number(saved.fishSizes[fish.id]);
          if (Number.isFinite(storedSize)) fish.size = clamp(storedSize, 0.075, 0.17);
        });
      }
      state.soundOn = Boolean(saved && saved.soundOn);
      state.catchGame.musicMuted = Boolean(saved && saved.catchMusicMuted);
      state.backgroundId = saved && saved.backgroundId === "classic" ? "classic" : "westlake";
      updateSoundButton();
      updateCatchMusicButton();
      updateBackgroundButton();
    } catch (error) {
      showError("本地存档读取失败，已为你打开一只新鱼缸。");
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        soundOn: state.soundOn,
        catchMusicMuted: state.catchGame.musicMuted,
        backgroundId: state.backgroundId,
        deletedBaseFishIds: state.deletedBaseFishIds,
        deletedSceneDecorIds: state.deletedSceneDecorIds,
        memoryObjects: state.memoryObjects.map((object) => {
          const { renderBounds, entryOffsetX, entryTilt, ...storedObject } = object;
          return storedObject;
        }),
        customFish: state.fish.filter((fish) => fish.custom).map((fish) => ({
          id: fish.id,
          name: fish.name,
          x: fish.x,
          y: fish.y,
          baseY: fish.baseY,
          size: fish.size,
          dir: fish.dir,
          sprite: fish.sprite,
          atlas: fish.atlas || "original",
          assetKind: fish.assetKind || "atlas-fish",
          imageKey: fish.imageKey || null,
          aspectRatio: fish.aspectRatio || null,
          motionProfile: fish.motionProfile || null,
          catalogId: fish.catalogId || null,
          speed: fish.speed,
          phase: fish.phase,
          personality: fish.personality || null
        })),
        decorLayout: Object.fromEntries(state.sceneDecor.map((decor) => [
          decor.id,
          { x: decor.x, y: decor.y, scale: decor.scale }
        ])),
        fishSizes: Object.fromEntries(state.fish.map((fish) => [fish.id, fish.size]))
      }));
      if (state.aquariumCore) {
        state.aquariumCore.syncSceneSnapshot(sceneSnapshotForCore(), { silent: true });
      }
    } catch (error) {
      showError("这次布置暂时没能保存，请检查设备存储空间。");
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("images")) {
          request.result.createObjectStore("images");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function putImageBlob(blob, key = OBJECT_IMAGE_KEY) {
    return new Promise((resolve, reject) => {
      if (!state.db) {
        resolve();
        return;
      }
      const request = state.db.transaction("images", "readwrite")
        .objectStore("images")
        .put(blob, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function getImageBlob(key = OBJECT_IMAGE_KEY) {
    return new Promise((resolve, reject) => {
      if (!state.db) {
        resolve(null);
        return;
      }
      const request = state.db.transaction("images", "readonly")
        .objectStore("images")
        .get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function deleteImageBlob(key) {
    return new Promise((resolve) => {
      if (!state.db || !key) {
        resolve();
        return;
      }
      const request = state.db.transaction("images", "readwrite")
        .objectStore("images")
        .delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image decode failed"));
      };
      image.src = url;
    });
  }

  function drawBackground() {
    const w = state.width;
    const h = state.height;
    const selectedBackground = state.backgroundId === "westlake"
      ? state.art.backgroundWestlake
      : state.art.background;
    if (selectedBackground) {
      const image = selectedBackground;
      if (state.backgroundId === "westlake") {
        ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, w, h);
      } else {
        const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (image.naturalWidth - sw) / 2;
        const sy = (image.naturalHeight - sh) / 2;
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
      }
      const depth = ctx.createLinearGradient(0, 0, 0, h);
      depth.addColorStop(0, "rgba(4,35,44,0.08)");
      depth.addColorStop(0.62, "rgba(3,30,38,0.04)");
      depth.addColorStop(1, "rgba(2,20,26,0.28)");
      ctx.fillStyle = depth;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#0a3342");
    gradient.addColorStop(0.52, "#0b3a46");
    gradient.addColorStop(1, "#09262d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const light = ctx.createRadialGradient(w * 0.26, h * 0.06, 0, w * 0.26, h * 0.06, h * 0.8);
    light.addColorStop(0, "rgba(184,225,213,0.22)");
    light.addColorStop(0.32, "rgba(116,181,171,0.08)");
    light.addColorStop(1, "rgba(4,17,23,0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.075;
    ctx.fillStyle = "#d9f3e9";
    for (let i = -2; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * (0.05 + i * 0.27), 0);
      ctx.lineTo(w * (0.24 + i * 0.27), 0);
      ctx.lineTo(w * (0.45 + i * 0.27), h);
      ctx.lineTo(w * (0.31 + i * 0.27), h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

  }

  function drawOuterSpace() {
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const gradient = ctx.createRadialGradient(w * 0.42, h * 0.4, 0, w * 0.42, h * 0.4, Math.max(w, h) * 0.8);
    gradient.addColorStop(0, "#12343a");
    gradient.addColorStop(0.62, "#0a272e");
    gradient.addColorStop(1, "#061d24");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = "#c7e1d7";
    ctx.lineWidth = 0.8;
    for (let x = -h; x < w + h; x += 52) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tankClipPath() {
    const { width, height, radius } = state.tankRect;
    roundedRectPath(ctx, 0, 0, width, height, radius);
  }

  function drawTankFrame() {
    const tank = state.tankRect;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    ctx.shadowColor = "rgba(1, 11, 15, 0.28)";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(218, 239, 231, 0.46)";
    tankClipPath();
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(234, 247, 241, 0.23)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tank.radius + 9, 5);
    ctx.lineTo(tank.width - tank.radius - 9, 5);
    ctx.stroke();

    ctx.strokeStyle = "rgba(5, 23, 28, 0.36)";
    ctx.beginPath();
    ctx.moveTo(tank.radius + 9, tank.height - 4);
    ctx.lineTo(tank.width - tank.radius - 9, tank.height - 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawWaterSurface() {
    const w = state.width;
    const y = state.height * WATERLINE_RATIO;
    ctx.save();
    const surfaceGlow = ctx.createLinearGradient(0, y - 8, 0, y + 12);
    surfaceGlow.addColorStop(0, "rgba(221, 244, 235, 0)");
    surfaceGlow.addColorStop(0.52, "rgba(193, 232, 222, 0.10)");
    surfaceGlow.addColorStop(1, "rgba(92, 163, 159, 0)");
    ctx.fillStyle = surfaceGlow;
    ctx.fillRect(0, y - 8, w, 20);

    for (let layer = 0; layer < 2; layer += 1) {
      ctx.strokeStyle = layer === 0
        ? "rgba(222, 245, 236, 0.34)"
        : "rgba(92, 171, 167, 0.26)";
      ctx.lineWidth = layer === 0 ? 1.25 : 0.8;
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 4) {
        const wave = Math.sin(x * 0.021 + state.time * 0.00135 + layer * 1.8) * 1.8
          + Math.sin(x * 0.047 - state.time * 0.0008) * 0.65;
        const py = y + wave + layer * 3;
        if (x === -20) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAirLayer() {
    const waterY = state.height * WATERLINE_RATIO;
    const hasIntegratedAirLayer = state.backgroundId === "westlake";
    if (!hasIntegratedAirLayer) {
      const air = ctx.createLinearGradient(0, 0, 0, waterY);
      air.addColorStop(0, "rgba(238, 246, 225, 1)");
      air.addColorStop(0.52, "rgba(203, 232, 216, 1)");
      air.addColorStop(1, "rgba(126, 192, 184, 0.98)");
      ctx.fillStyle = air;
      ctx.fillRect(0, 0, state.width, waterY + 4);
    }

    ctx.save();
    ctx.globalAlpha = hasIntegratedAirLayer ? 0.22 : 1;
    const topLight = ctx.createRadialGradient(
      state.width * 0.42,
      -waterY * 0.25,
      0,
      state.width * 0.42,
      0,
      state.width * 0.72
    );
    topLight.addColorStop(0, "rgba(255, 253, 229, 0.92)");
    topLight.addColorStop(0.38, "rgba(250, 252, 231, 0.44)");
    topLight.addColorStop(1, "rgba(235, 248, 235, 0)");
    ctx.fillStyle = topLight;
    ctx.fillRect(0, 0, state.width, waterY + 4);
    ctx.restore();

    const underwaterLight = ctx.createLinearGradient(0, waterY, 0, waterY + state.height * 0.34);
    underwaterLight.addColorStop(0, "rgba(202, 238, 220, 0.22)");
    underwaterLight.addColorStop(0.45, "rgba(147, 211, 199, 0.075)");
    underwaterLight.addColorStop(1, "rgba(95, 178, 174, 0)");
    ctx.fillStyle = underwaterLight;
    ctx.fillRect(0, waterY, state.width, state.height * 0.34);

    ctx.fillStyle = "rgba(255, 255, 239, 0.32)";
    ctx.fillRect(0, waterY * 0.28, state.width, 1);
  }

  function drawSubstrate() {
    const w = state.width;
    const h = state.height;
    const top = h * 0.87;
    const gradient = ctx.createLinearGradient(0, top, 0, h);
    gradient.addColorStop(0, "#496051");
    gradient.addColorStop(1, "#253d38");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, top + 4);
    for (let x = 0; x <= w; x += 18) {
      ctx.lineTo(x, top + Math.sin(x * 0.032) * 5 + Math.sin(x * 0.11) * 2);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(200,205,176,0.16)";
    for (let i = 0; i < 56; i += 1) {
      const x = (i * 61.7) % w;
      const y = top + 8 + ((i * 37.3) % Math.max(15, h - top - 8));
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    drawRocks();
  }

  function drawRocks() {
    const rocks = [
      [0.28, 0.89, 0.16, 0.075],
      [0.68, 0.90, 0.13, 0.06],
      [0.48, 0.91, 0.09, 0.045]
    ];
    rocks.forEach((rock, index) => {
      const x = state.width * rock[0];
      const y = state.height * rock[1];
      const rw = state.width * rock[2];
      const rh = state.height * rock[3];
      ctx.fillStyle = index === 1 ? "#3d554d" : "#43584e";
      ctx.beginPath();
      ctx.moveTo(x - rw * 0.5, y + rh * 0.45);
      ctx.quadraticCurveTo(x - rw * 0.45, y - rh * 0.45, x, y - rh * 0.5);
      ctx.quadraticCurveTo(x + rw * 0.5, y - rh * 0.35, x + rw * 0.52, y + rh * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(194,220,203,0.08)";
      ctx.stroke();
    });
  }

  function drawPlants() {
    if (state.art.plants) {
      const image = state.art.plants;
      const sourceWidth = image.naturalWidth / 3;
      state.sceneDecor.filter((decor) => decor.kind === "plant").forEach((decor, index) => {
        const width = decor.width * decor.scale;
        const height = decor.height * decor.scale;
        const sway = decor.id === state.selectedDecorId
          ? 0
          : Math.sin(state.time * 0.0008 + index) * state.width * 0.004;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.translate(sway, 0);
        ctx.drawImage(
          image,
          decor.sprite * sourceWidth, 0, sourceWidth, image.naturalHeight,
          decor.x * state.width, decor.y * state.height, width * state.width, height * state.height
        );
        ctx.restore();
        decor.renderBounds = {
          x: (decor.x + width / 2) * state.width,
          y: (decor.y + height / 2) * state.height,
          w: width * state.width,
          h: height * state.height
        };
        drawSelectedDecorMarker(decor);
      });
      return;
    }
    const bottom = state.height * 0.9;
    state.plants.forEach((plant) => {
      const x = plant.x * state.width;
      const height = plant.height * state.height;
      const sway = Math.sin(state.time * 0.001 + plant.phase) * state.width * 0.018;
      ctx.save();
      ctx.strokeStyle = plant.color;
      ctx.fillStyle = plant.color;
      ctx.lineWidth = Math.max(2, plant.width * state.width * 0.11);
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i += 1) {
        const offset = (i - 1.5) * plant.width * state.width * 0.26;
        const stemHeight = height * (0.7 + i * 0.085);
        ctx.beginPath();
        ctx.moveTo(x + offset, bottom);
        ctx.quadraticCurveTo(x + offset + sway * 0.15, bottom - stemHeight * 0.55, x + offset + sway, bottom - stemHeight);
        ctx.stroke();
        for (let j = 1; j < 4; j += 1) {
          const t = j / 4;
          const lx = lerp(x + offset, x + offset + sway, t);
          const ly = bottom - stemHeight * t;
          ctx.beginPath();
          ctx.ellipse(lx + (j % 2 ? -5 : 5), ly, 7, 2.6, j % 2 ? -0.5 : 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }

  function drawGeneratedRocks() {
    if (!state.art.rocks) return;
    const image = state.art.rocks;
    state.sceneDecor.filter((decor) => decor.kind === "rock").forEach((decor) => {
      const [sx, sy, sw, sh] = decor.crop;
      const width = decor.width * decor.scale;
      const height = decor.height * decor.scale;
      ctx.drawImage(
        image,
        sx * image.naturalWidth,
        sy * image.naturalHeight,
        sw * image.naturalWidth,
        sh * image.naturalHeight,
        decor.x * state.width, decor.y * state.height, width * state.width, height * state.height
      );
      decor.renderBounds = {
        x: (decor.x + width / 2) * state.width,
        y: (decor.y + height / 2) * state.height,
        w: width * state.width,
        h: height * state.height
      };
      drawSelectedDecorMarker(decor);
    });
  }

  function drawSelectedDecorMarker(decor) {
    const decorEditor = $("#decorEditor");
    if (
      decor.id !== state.selectedDecorId
      || !decor.renderBounds
      || !decorEditor
      || decorEditor.classList.contains("is-hidden")
    ) return;
    const bounds = decor.renderBounds;
    const left = bounds.x - bounds.w / 2;
    const top = bounds.y - bounds.h / 2;
    const right = left + bounds.w;
    const bottom = top + bounds.h;
    const corner = clamp(Math.min(bounds.w, bounds.h) * 0.14, 9, 18);
    ctx.save();
    ctx.strokeStyle = "rgba(220, 243, 229, 0.86)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, top + corner);
    ctx.lineTo(left, top);
    ctx.lineTo(left + corner, top);
    ctx.moveTo(right - corner, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + corner);
    ctx.moveTo(right, bottom - corner);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right - corner, bottom);
    ctx.moveTo(left + corner, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - corner);
    ctx.stroke();
    ctx.restore();
  }

  function isCatchTarget(fish) {
    return state.catchGame.targetIds.has(fish.id);
  }

  function isFishHidden(fish, now = performance.now()) {
    return Boolean(
      state.catchGame.running
      && fish.hiddenUntil
      && fish.hiddenUntil > now
    );
  }

  function isFishBehindDecor(fish, now = performance.now()) {
    return Boolean(
      !state.catchGame.running
      && fish.behindCoverUntil
      && fish.behindCoverUntil > now
    );
  }

  function showCatchFeedback(text, isNegative = false) {
    const feedback = $("#catchFeedback");
    feedback.textContent = text;
    feedback.classList.toggle("is-negative", isNegative);
    feedback.classList.remove("is-hidden");
    feedback.style.animation = "none";
    void feedback.offsetWidth;
    feedback.style.animation = "";
    window.clearTimeout(state.catchGame.feedbackTimer);
    state.catchGame.feedbackTimer = window.setTimeout(() => {
      feedback.classList.add("is-hidden");
    }, 850);
  }

  function showCatchScoreFlash(value, label, isNegative = false) {
    const flash = $("#catchScoreFlash");
    $("#catchScoreFlashValue").textContent = `${isNegative ? "－" : "＋"}${Math.abs(value)}`;
    $("#catchScoreFlashLabel").textContent = label;
    flash.classList.toggle("is-negative", isNegative);
    flash.classList.remove("is-hidden");
    flash.style.animation = "none";
    void flash.offsetWidth;
    flash.style.animation = "";
    window.clearTimeout(state.catchGame.scoreFlashTimer);
    state.catchGame.scoreFlashTimer = window.setTimeout(() => {
      flash.classList.add("is-hidden");
    }, 1050);
  }

  function updateCatchHud() {
    const game = state.catchGame;
    const remainingMs = Math.max(0, game.endsAt - performance.now());
    $("#catchScore").textContent = String(game.score);
    $("#catchTimer").textContent = String(Math.ceil(remainingMs / 1000));
    $("#catchCount").textContent = String(game.caughtTargets);
    $("#catchTargetTotal").textContent = String(game.targetIds.size);
  }

  function selectCatchTargets() {
    return state.fish.filter((fish) => (
      state.catchGame.selectedTargetIds.has(fish.id)
    )).slice(0, 3);
  }

  function catchTargetThumbnail(fish) {
    const thumb = document.createElement("span");
    thumb.className = "catch-target-art";
    const imageFish = fish.assetKind === "custom-fish"
      || fish.assetKind === "preset-image-fish";
    if (imageFish) {
      const source = fish.assetKind === "custom-fish"
        ? state.memoryImages.get(fish.imageKey)
        : resolvePresetFishImage(fish);
      if (source && source.src) {
        const image = document.createElement("img");
        image.src = source.src;
        image.alt = "";
        thumb.append(image);
        return thumb;
      }
    }

    const atlas = fish.atlas === "default"
      ? state.art.defaultFish
      : state.art.fish;
    const sprite = clamp(Math.floor(Number(fish.sprite || 0)), 0, 3);
    thumb.style.backgroundImage = `url("${atlas && atlas.src
      ? atlas.src
      : fish.atlas === "default"
        ? "/game/assets/default-fish-atlas.png"
        : "/game/assets/fish-atlas.png"}")`;
    thumb.style.backgroundSize = "200% 200%";
    thumb.style.backgroundPosition = `${sprite % 2 === 0 ? 0 : 100}% ${
      sprite < 2 ? 0 : 100
    }%`;
    return thumb;
  }

  function renderCatchTargetPicker(message = "") {
    const game = state.catchGame;
    const picker = $("#catchTargetPicker");
    const validIds = new Set(state.fish.map((fish) => fish.id));
    game.selectedTargetIds = new Set(
      [...game.selectedTargetIds].filter((id) => validIds.has(id)).slice(0, 3)
    );
    picker.textContent = "";

    state.fish.forEach((fish) => {
      const selected = game.selectedTargetIds.has(fish.id);
      const button = document.createElement("button");
      button.className = "catch-target-option";
      button.classList.toggle("is-selected", selected);
      button.type = "button";
      button.dataset.catchTargetId = fish.id;
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", `${selected ? "取消选择" : "选择"}${fish.name}`);
      const name = document.createElement("span");
      name.className = "catch-target-name";
      name.textContent = fish.name;
      const mark = document.createElement("span");
      mark.className = "catch-target-mark";
      mark.textContent = "✓";
      mark.setAttribute("aria-hidden", "true");
      button.append(catchTargetThumbnail(fish), name, mark);
      button.addEventListener("click", () => toggleCatchTarget(fish.id));
      picker.append(button);
    });

    const count = game.selectedTargetIds.size;
    $("#catchTargetSelectionCount").textContent = `${count} / 3`;
    $("#startCatchButton").disabled = count === 0;
    $("#catchTargetHint").textContent = message || (
      state.fish.length === 0
        ? "鱼缸里还没有鱼，先从素材库或相册放入一条。"
        : count === 0
          ? "点选 1–3 条；没有被选中的鱼会成为无辜鱼。"
          : `已选 ${count} 条，其余鱼本局属于无辜鱼。`
    );
  }

  function toggleCatchTarget(fishId) {
    const selected = state.catchGame.selectedTargetIds;
    if (selected.has(fishId)) {
      selected.delete(fishId);
      renderCatchTargetPicker();
      return;
    }
    if (selected.size >= 3) {
      renderCatchTargetPicker("最多选择 3 条目标鱼。");
      return;
    }
    selected.add(fishId);
    renderCatchTargetPicker();
  }

  function createCatchSurfaceObstacles() {
    return state.memoryObjects
      .filter((object) => object.state === "surface")
      .map((object, index) => {
        const renderedWidth = object.renderBounds
          ? object.renderBounds.w / Math.max(1, state.width)
          : 0.17 * clamp(Number(object.scale || 1), 0.6, 1.8);
        const width = clamp(renderedWidth, 0.08, 0.24);
        const halfWidth = width * 0.5;
        const baseX = clamp(Number(object.x || 0.5), halfWidth, 1 - halfWidth);
        const travel = Math.min(0.12, Math.max(0.045, (1 - width) * 0.16));
        return {
          id: `surface-${object.id}`,
          objectId: object.id,
          x: baseX,
          baseX,
          width,
          dir: index % 2 === 0 ? 1 : -1,
          speed: 0.012 + (index % 3) * 0.004,
          minX: Math.max(halfWidth, baseX - travel),
          maxX: Math.min(1 - halfWidth, baseX + travel)
        };
      });
  }

  function restoreCatchSurfaceLayout() {
    const game = state.catchGame;
    game.surfaceSnapshot.forEach((x, objectId) => {
      const object = state.memoryObjects.find((item) => item.id === objectId);
      if (object) object.x = x;
    });
    game.surfaceSnapshot = new Map();
    game.surfaceObstacles = [];
  }

  function setCatchSceneActive(active) {
    appRoot.classList.toggle("is-catching", active);
    $(".topbar").classList.toggle("is-hidden", Boolean(active));
    syncSceneEditingMode();
    window.dispatchEvent(new CustomEvent("aquarium:modechange", {
      detail: { mode: active ? "catch" : "aquarium" }
    }));
  }

  function prepareCatchFishLayout(now) {
    const catchFish = state.fish;
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(catchFish.length * 1.65))));
    const rows = Math.max(1, Math.ceil(catchFish.length / columns));
    state.eventPausedFishIds = new Set();

    catchFish.forEach((fish, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = columns === 1 ? 0.5 : 0.14 + column * (0.72 / (columns - 1));
      const y = rows === 1 ? 0.5 : 0.34 + row * (0.4 / (rows - 1));
      delete fish.eventPauseAnchor;
      fish.x = clamp(x + (row % 2 ? 0.025 : -0.025), 0.1, 0.9);
      fish.y = clamp(y, WATERLINE_RATIO + 0.1, 0.78);
      fish.baseY = fish.y;
      fish.dir = index % 2 === 0 ? 1 : -1;
      fish.size = clamp(
        Number.isFinite(Number(fish.size)) ? Number(fish.size) : 0.112,
        0.075,
        0.17
      );
      fish.sprite = clamp(
        Number.isFinite(Number(fish.sprite)) ? Math.floor(Number(fish.sprite)) : index % 4,
        0,
        3
      );
      fish.atlas = fish.atlas === "default" ? "default" : "original";
      fish.speed = Number.isFinite(Number(fish.speed)) && Number(fish.speed) > 0
        ? Number(fish.speed)
        : 0.029;
      fish.currentSpeed = fish.speed;
      fish.bobFrequency = Number.isFinite(Number(fish.bobFrequency))
        ? Number(fish.bobFrequency)
        : 0.001;
      fish.bobAmplitude = Number.isFinite(Number(fish.bobAmplitude))
        ? Number(fish.bobAmplitude)
        : 0.00022;
      fish.phase = Number.isFinite(Number(fish.phase)) ? Number(fish.phase) : index;
      fish.personality = createFishPersonality(fish.id, fish.personality, {
        x: fish.x,
        y: fish.y
      });
      fish.renderBounds = null;
      fish.behaviorUntil = now;
      fish.wanderTarget = {
        x: clamp(fish.x + (fish.dir > 0 ? 0.16 : -0.16), 0.08, 0.92),
        y: fish.y
      };
    });
  }

  function openCatchPanel() {
    if (state.catchGame.running) return;
    if (state.editing) finishEditing();
    finishFishEditing(false);
    finishDecorEditing(false);

    $("#catchPanelTitle").textContent = "捞走那条固执的鱼";
    const surfaceCount = state.memoryObjects.filter((object) => object.state === "surface").length;
    $("#catchPanelDescription").textContent = surfaceCount > 0
      ? `先选择目标鱼。当前鱼缸里的 ${surfaceCount} 件水面布景会原样进入挑战，并左右漂动阻挡夹子。`
      : "先选择目标鱼。当前没有水面布景，因此本局不会凭空生成水草或睡莲。";
    $("#catchResult").classList.add("is-hidden");
    $("#catchOutcome").classList.add("is-hidden");
    $("#catchPanel").classList.remove("is-result", "is-victory", "is-regret");
    $("#closeCatchPanelButton").textContent = "先不玩";
    $("#startCatchButton").textContent = "开始 60 秒";
    renderCatchTargetPicker();
    $("#catchPanel").classList.remove("is-hidden");
    syncSceneEditingMode();
  }

  function closeCatchPanel() {
    if (state.catchGame.running) return;
    $("#catchPanel").classList.add("is-hidden");
    setCatchSceneActive(false);
    syncSceneEditingMode();
  }

  function startCatchRound() {
    const game = state.catchGame;
    $("#catchPanel").classList.remove("is-result", "is-victory", "is-regret");
    $("#catchOutcome").classList.add("is-hidden");
    const targets = selectCatchTargets();
    if (!targets.length) {
      renderCatchTargetPicker("请先点选至少一条目标鱼。");
      return;
    }

    game.snapshot = new Map(state.fish.map((fish) => [fish.id, {
      x: fish.x,
      y: fish.y,
      baseY: fish.baseY,
      dir: fish.dir,
      behavior: fish.behavior,
      currentSpeed: fish.currentSpeed,
      behindCoverUntil: fish.behindCoverUntil || 0,
      normalCoverId: fish.normalCoverId || null,
      wanderTarget: fish.wanderTarget ? { ...fish.wanderTarget } : null
    }]));
    game.targetIds = new Set(targets.map((fish) => fish.id));
    game.caughtTargetIds = new Set();
    game.score = 0;
    game.caughtTargets = 0;
    game.caughtNpcs = 0;
    game.running = true;
    game.phase = "aiming";
    game.startedAt = performance.now();
    game.endsAt = game.startedAt + CATCH_DURATION_MS;
    game.surfaceSnapshot = new Map(
      state.memoryObjects
        .filter((object) => object.state === "surface")
        .map((object) => [object.id, object.x])
    );
    game.surfaceObstacles = createCatchSurfaceObstacles();
    game.claw = {
      x: 0.5,
      y: 0.085,
      phaseStartedAt: game.startedAt,
      grabbedFishId: null,
      waterlineChecked: false,
      blocked: false
    };

    prepareCatchFishLayout(game.startedAt);

    state.fish.forEach((fish, index) => {
      fish.caughtInGame = false;
      fish.caughtByClaw = false;
      fish.hiddenUntil = 0;
      fish.hideCooldownUntil = 0;
      fish.nextHideCheckAt = 0;
      fish.coverMode = "none";
      fish.coverTarget = null;
      fish.coverApproachUntil = 0;
      fish.coverEnterProgress = 0;
      fish.escapeUntil = 0;
      fish.escapeTarget = null;
      fish.escapeSequence = 0;
      fish.lastDodgeDropAt = 0;
      fish.nextEscapeRefreshAt = 0;
      fish.behindCoverUntil = 0;
      fish.normalCoverId = null;
      fish.reservedCellKey = null;
      fish.catchDodgeStyle = ["sidestep", "dive", "arc", "turn"][
        (index + Math.floor(Math.random() * 4)) % 4
      ];
      fish.behavior = "cruise";
      fish.behaviorUntil = game.startedAt;
      fish.currentSpeed = fish.speed * (0.9 + Math.random() * 0.35);
    });

    $("#catchPanel").classList.add("is-hidden");
    $("#catchHud").classList.remove("is-hidden");
    setCatchSceneActive(true);
    syncSceneEditingMode();
    updateCatchHud();
    startCatchMusic();
    showCatchFeedback("拖动夹子，松手下爪");
    playTone(520, 0.08);
  }

  function restoreFishAfterCatchRound() {
    const game = state.catchGame;
    state.fish.forEach((fish) => {
      const snapshot = game.snapshot.get(fish.id);
      if (snapshot) Object.assign(fish, snapshot);
      fish.caughtInGame = false;
      fish.caughtByClaw = false;
      fish.hiddenUntil = 0;
      fish.hideCooldownUntil = 0;
      clearFishCoverManeuver(fish);
      fish.escapeUntil = 0;
      fish.escapeTarget = null;
      fish.escapeSequence = 0;
      fish.lastDodgeDropAt = 0;
      fish.nextEscapeRefreshAt = 0;
      fish.catchDodgeStyle = null;
      fish.blockedByFishUntil = 0;
      fish.blockedByFishId = null;
    });
    restoreCatchSurfaceLayout();
  }

  function endCatchRound() {
    const game = state.catchGame;
    if (!game.running) return;
    game.running = false;
    setCatchSceneActive(false);
    stopCatchMusic();
    restoreFishAfterCatchRound();
    $("#catchHud").classList.add("is-hidden");
    $("#catchFinalScore").textContent = String(game.score);
    $("#catchFinalTargets").textContent = String(game.caughtTargets);
    $("#catchFinalNpcs").textContent = String(game.caughtNpcs);
    $("#catchResult").classList.remove("is-hidden");
    const caughtAllTargets = game.caughtTargets === game.targetIds.size;
    const caughtSomeTargets = game.caughtTargets > 0;
    const panel = $("#catchPanel");
    panel.classList.add("is-result");
    panel.classList.toggle("is-victory", caughtAllTargets);
    panel.classList.toggle("is-regret", !caughtAllTargets);
    $("#catchOutcome").classList.remove("is-hidden");
    $("#catchOutcomeKicker").textContent = caughtAllTargets ? "漂亮收网" : "本局回声";
    $("#catchOutcomeMark").textContent = caughtAllTargets
      ? "大获全胜"
      : caughtSomeTargets
        ? "差一点点"
        : "本轮落空";
    $("#catchPanelTitle").textContent = caughtAllTargets
      ? "恭喜，固执的鱼都被你捞到了"
      : caughtSomeTargets
        ? "水花落下，还差最后几尾"
        : "遗憾，这次鱼比夹子更固执";
    $("#catchPanelDescription").textContent = game.caughtNpcs > 0
      ? `收获 ${game.caughtTargets} 条目标鱼，但也惊扰了 ${game.caughtNpcs} 条路过的小鱼。下一网，稳一点。`
      : caughtAllTargets
        ? "一网不漏，也没有惊扰无辜的小鱼。今天的鱼缸冠军就是你。"
        : `你捞到了 ${game.caughtTargets} 条目标鱼，而且没有误伤。节奏已经找到了，再试一次。`;
    $("#closeCatchPanelButton").textContent = "返回鱼缸";
    $("#startCatchButton").textContent = "再玩一次";
    $("#catchPanel").classList.remove("is-hidden");
    syncSceneEditingMode();
    const best = Math.max(
      Number(localStorage.getItem("quiet-aquarium-catch-best") || 0),
      game.score
    );
    localStorage.setItem("quiet-aquarium-catch-best", String(best));
    playTone(game.score >= 20 ? 660 : 360, 0.12);
  }

  function moveCatchClaw(x) {
    if (!state.catchGame.running || state.catchGame.phase !== "aiming") return;
    state.catchGame.claw.x = clamp(x, 0.075, 0.925);
  }

  function releaseCatchClaw() {
    const game = state.catchGame;
    if (!game.running || game.phase !== "aiming") return;
    game.phase = "dropping";
    game.claw.phaseStartedAt = performance.now();
    game.claw.grabbedFishId = null;
    game.claw.waterlineChecked = false;
    game.claw.blocked = false;
    playTone(310, 0.05);
  }

  function nearestFishCover(fish) {
    const covers = [
      ...state.sceneDecor.map((decor) => ({
        id: decor.id,
        x: decor.x + decor.width * decor.scale / 2,
        y: decor.y + decor.height * decor.scale / 2,
        radiusX: decor.width * decor.scale * 0.42,
        radiusY: decor.height * decor.scale * 0.42
      })),
      ...state.memoryObjects
        .filter((object) => object.state !== "surface")
        .map((object) => ({
          id: object.id,
          x: object.x,
          y: object.y,
          radiusX: object.renderBounds
            ? object.renderBounds.w / state.width * 0.42
            : 0.06,
          radiusY: object.renderBounds
            ? object.renderBounds.h / state.height * 0.42
            : 0.06
        }))
    ];
    return covers.reduce((nearest, cover) => {
      const outlineDistance = fishCoverOutlineDistance(fish, cover);
      const centerDistance = Math.hypot(cover.x - fish.x, cover.y - fish.y);
      return !nearest || outlineDistance < nearest.outlineDistance
        ? { ...cover, outlineDistance, centerDistance }
        : nearest;
    }, null);
  }

  function fishCoverOutlineDistance(fish, cover) {
    const reachX = cover.radiusX + (fish.collisionRadiusX || 0.035);
    const reachY = cover.radiusY + (fish.collisionRadiusY || 0.025);
    return Math.hypot(
      (cover.x - fish.x) / Math.max(0.001, reachX),
      (cover.y - fish.y) / Math.max(0.001, reachY)
    );
  }

  function nearestAvailableFishCover(fish) {
    const occupiedCoverIds = new Set(
      state.fish
        .filter((other) => (
          other !== fish
          && other.normalCoverId
          && (
            other.behavior === "shelter"
            || (other.behindCoverUntil || 0) > performance.now()
          )
        ))
        .map((other) => other.normalCoverId)
    );
    const covers = [
      ...state.sceneDecor.map((decor) => ({
        id: decor.id,
        x: decor.x + decor.width * decor.scale / 2,
        y: decor.y + decor.height * decor.scale / 2,
        radiusX: decor.width * decor.scale * 0.42,
        radiusY: decor.height * decor.scale * 0.42
      })),
      ...state.memoryObjects
        .filter((object) => object.state !== "surface")
        .map((object) => ({
          id: object.id,
          x: object.x,
          y: object.y,
          radiusX: object.renderBounds
            ? object.renderBounds.w / state.width * 0.42
            : 0.06,
          radiusY: object.renderBounds
            ? object.renderBounds.h / state.height * 0.42
            : 0.06
        }))
    ].filter((cover) => !occupiedCoverIds.has(cover.id));
    return covers.reduce((nearest, cover) => {
      const outlineDistance = fishCoverOutlineDistance(fish, cover);
      return !nearest || outlineDistance < nearest.outlineDistance
        ? { ...cover, outlineDistance }
        : nearest;
    }, null);
  }

  function finishFishEnteringCover(fish, cover, now) {
    const exitDirection = fish.x >= cover.x ? 1 : -1;
    fish.hiddenUntil = now + 1000;
    fish.hideCooldownUntil = now + CATCH_HIDE_COOLDOWN_MS;
    clearFishCoverManeuver(fish);
    fish.escapeTarget = {
      x: clamp(fish.x + exitDirection * 0.14, 0.08, 0.92),
      y: clamp(fish.y + (Math.random() - 0.5) * 0.06, WATERLINE_RATIO + 0.07, 0.8)
    };
    fish.escapeUntil = fish.hiddenUntil + 620;
    fish.behavior = "rest";
    fish.currentSpeed = fish.speed * 0.1;
  }

  function clearFishCoverManeuver(fish) {
    fish.coverMode = "none";
    fish.coverTarget = null;
    fish.coverApproachUntil = 0;
    fish.coverEnterProgress = 0;
    fish.coverEnterFrom = null;
    fish.coverEnterTarget = null;
  }

  function beginFishEnteringCover(fish, cover, now) {
    const targetX = clamp(lerp(fish.x, cover.x, 0.52), 0.08, 0.92);
    const targetY = clamp(
      lerp(fish.y, cover.y, 0.52),
      WATERLINE_RATIO + 0.07,
      0.8
    );
    fish.coverMode = "entering";
    fish.coverEnterStartedAt = now;
    fish.coverEnterDuration = 460;
    fish.coverEnterProgress = 0;
    fish.coverEnterFrom = { x: fish.x, y: fish.y };
    fish.coverEnterTarget = { x: targetX, y: targetY };
    fish.coverTarget = cover;
    fish.escapeTarget = null;
    fish.escapeUntil = 0;
    fish.dir = targetX >= fish.x ? 1 : -1;
  }

  function updateFishEnteringCover(fish, now) {
    if (fish.coverMode !== "entering" || !fish.coverTarget) return false;
    const progress = clamp(
      (now - fish.coverEnterStartedAt) / fish.coverEnterDuration,
      0,
      1
    );
    const eased = 1 - Math.pow(1 - progress, 2);
    fish.coverEnterProgress = progress;
    fish.x = lerp(fish.coverEnterFrom.x, fish.coverEnterTarget.x, eased);
    fish.y = lerp(fish.coverEnterFrom.y, fish.coverEnterTarget.y, eased)
      + Math.sin(progress * Math.PI) * 0.008;
    fish.behavior = "dart";
    fish.currentSpeed = fish.speed * 2.2;
    if (progress >= 1) {
      finishFishEnteringCover(fish, fish.coverTarget, now);
    }
    return true;
  }

  function continueFishCoverApproach(fish, now) {
    const cover = fish.coverTarget;
    if (fish.coverMode !== "approaching" || !cover) return false;
    if (now > fish.coverApproachUntil) {
      clearFishCoverManeuver(fish);
      return false;
    }

    if (fishCoverOutlineDistance(fish, cover) <= 1.02) {
      beginFishEnteringCover(fish, cover, now);
      return true;
    }

    fish.behavior = "dart";
    fish.currentSpeed = fish.speed * 3.25;
    return true;
  }

  function beginFishCoverApproach(fish, cover, now) {
    fish.coverMode = "approaching";
    fish.coverTarget = cover;
    fish.coverApproachUntil = now + 1800;
    fish.escapeTarget = null;
    fish.escapeUntil = 0;
    fish.behavior = "dart";
    fish.currentSpeed = fish.speed * 3.25;
    fish.dir = cover.x >= fish.x ? 1 : -1;
  }

  function chooseFishEscapeManeuver(fish, claw, now) {
    const styles = ["sidestep", "dive", "arc", "turn"];
    fish.escapeSequence = (fish.escapeSequence || 0) + 1;
    const baseIndex = styles.indexOf(fish.catchDodgeStyle);
    const style = styles[
      ((baseIndex < 0 ? fish.sprite || 0 : baseIndex) + fish.escapeSequence - 1)
      % styles.length
    ];
    const canEscapeRight = fish.x < 0.72;
    const canEscapeLeft = fish.x > 0.28;
    const awayDirection = !canEscapeRight
      ? -1
      : !canEscapeLeft
        ? 1
        : fish.x >= claw.x
          ? 1
          : -1;
    const verticalAway = fish.y >= claw.y ? 1 : -1;

    if (style === "dive") {
      const diveDirection = fish.y > 0.69 ? -1 : 1;
      fish.escapeTarget = {
        x: clamp(fish.x + awayDirection * 0.18, 0.08, 0.92),
        y: clamp(fish.y + diveDirection * 0.24, WATERLINE_RATIO + 0.07, 0.8)
      };
    } else if (style === "arc") {
      fish.escapeTarget = {
        x: clamp(fish.x + awayDirection * 0.27, 0.08, 0.92),
        y: clamp(
          fish.y + verticalAway * 0.16,
          WATERLINE_RATIO + 0.07,
          0.8
        )
      };
    } else if (style === "turn") {
      const turnDirection = canEscapeRight && canEscapeLeft ? -fish.dir : awayDirection;
      fish.escapeTarget = {
        x: clamp(fish.x + turnDirection * 0.3, 0.08, 0.92),
        y: clamp(fish.y + (Math.random() - 0.5) * 0.13, WATERLINE_RATIO + 0.07, 0.8)
      };
      fish.dir = turnDirection;
    } else {
      fish.escapeTarget = {
        x: clamp(fish.x + awayDirection * 0.31, 0.08, 0.92),
        y: clamp(fish.y + (Math.random() - 0.5) * 0.11, WATERLINE_RATIO + 0.07, 0.8)
      };
    }

    fish.escapeUntil = now + (style === "dive" ? 1380 : 1120);
    fish.behavior = "dart";
    fish.currentSpeed = fish.speed * (style === "dive" ? 3.35 : 3.65);
    fish.nextEscapeRefreshAt = now + 620;
    fish.lastDodgeDropAt = claw.phaseStartedAt;
  }

  function maybeTriggerCatchEvasion(fish, now) {
    const game = state.catchGame;
    if (
      !game.running
      || !isCatchTarget(fish)
      || fish.caughtInGame
      || fish.caughtByClaw
      || isFishHidden(fish, now)
    ) return;
    const canHide = now >= (fish.hideCooldownUntil || 0);
    if (!canHide) {
      if (fish.coverMode !== "none") clearFishCoverManeuver(fish);
    } else if (updateFishEnteringCover(fish, now)) {
      return;
    }
    if (game.phase !== "dropping") {
      if (fish.coverMode === "approaching") clearFishCoverManeuver(fish);
      return;
    }
    if (canHide && continueFishCoverApproach(fish, now)) return;

    const claw = game.claw;
    const distance = Math.hypot((fish.x - claw.x) * 1.18, fish.y - claw.y);
    if (distance > 0.34) return;

    if (canHide && now >= (fish.nextHideCheckAt || 0)) {
      fish.nextHideCheckAt = now + 320;
      const cover = nearestFishCover(fish);
      if (
        cover
        && cover.outlineDistance <= 2.35
        && cover.centerDistance <= 0.24
      ) {
        beginFishCoverApproach(fish, cover, now);
        return;
      }
    }

    const dropId = claw.phaseStartedAt;
    if (
      fish.lastDodgeDropAt !== dropId
      || now >= (fish.nextEscapeRefreshAt || 0)
      || now >= (fish.escapeUntil || 0)
    ) {
      chooseFishEscapeManeuver(fish, claw, now);
    }
  }

  function beginClawClosing(fish, now) {
    const game = state.catchGame;
    game.phase = "closing";
    game.claw.phaseStartedAt = now;
    game.claw.grabbedFishId = fish ? fish.id : null;
    if (fish) {
      fish.caughtByClaw = true;
      fish.hiddenUntil = 0;
      clearFishCoverManeuver(fish);
      fish.escapeTarget = null;
      fish.escapeUntil = 0;
    }
  }

  function releaseNpcAfterCatch(fish, now) {
    const snapshot = state.catchGame.snapshot.get(fish.id);
    if (snapshot) {
      fish.x = snapshot.x;
      fish.y = snapshot.y;
      fish.baseY = snapshot.baseY;
      fish.dir = snapshot.dir;
      fish.behavior = snapshot.behavior;
      fish.currentSpeed = snapshot.currentSpeed;
      fish.behindCoverUntil = snapshot.behindCoverUntil || 0;
      fish.normalCoverId = snapshot.normalCoverId || null;
      fish.wanderTarget = snapshot.wanderTarget ? { ...snapshot.wanderTarget } : null;
    }
    fish.caughtInGame = false;
    fish.hiddenUntil = 0;
    fish.hideCooldownUntil = now + 700;
    fish.nextHideCheckAt = now + 700;
    fish.targetFoodId = null;
    fish.fearUntil = 0;
    fish.fearTarget = null;
    clearFishCoverManeuver(fish);
    fish.escapeSequence = 0;
    fish.lastDodgeDropAt = 0;
    fish.nextEscapeRefreshAt = 0;
    fish.escapeTarget = {
      x: clamp(fish.x + (Math.random() - 0.5) * 0.18, 0.08, 0.92),
      y: clamp(fish.y + 0.08 + Math.random() * 0.08, WATERLINE_RATIO + 0.08, 0.8)
    };
    fish.escapeUntil = now + 900;
    fish.behavior = "dart";
    fish.behaviorUntil = fish.escapeUntil + 140;
    fish.currentSpeed = fish.speed * 2.6;
    fish.nextBehaviorHint = "coast";
    fish.blockedByFishUntil = 0;
    fish.blockedByFishId = null;
  }

  function finishClawCatch(now) {
    const game = state.catchGame;
    const fish = state.fish.find((item) => item.id === game.claw.grabbedFishId);
    if (!fish) {
      showCatchFeedback(game.claw.blocked ? "被水面植物挡住了" : "抓空了");
    } else {
      fish.caughtByClaw = false;
      if (isCatchTarget(fish)) {
        fish.caughtInGame = true;
        game.score += CATCH_TARGET_SCORE;
        game.caughtTargets += 1;
        game.caughtTargetIds.add(fish.id);
        showCatchScoreFlash(CATCH_TARGET_SCORE, `抓到目标 · ${fish.name}`);
        playCatchAccent(false);
        playTone(620, 0.08);
      } else {
        releaseNpcAfterCatch(fish, now);
        game.score -= CATCH_NPC_PENALTY;
        game.caughtNpcs += 1;
        showCatchScoreFlash(CATCH_NPC_PENALTY, `误捞了 ${fish.name}`, true);
        playCatchAccent(true);
        playTone(190, 0.11);
      }
    }

    game.phase = "aiming";
    game.claw.y = 0.085;
    game.claw.phaseStartedAt = now;
    game.claw.grabbedFishId = null;
    game.claw.waterlineChecked = false;
    game.claw.blocked = false;
    updateCatchHud();
    if (game.caughtTargets >= game.targetIds.size) endCatchRound();
  }

  function findFishIntersectingClaw(previousY, currentY, now) {
    const game = state.catchGame;
    const image = state.art.catchClaw;
    const minDimension = Math.min(state.width, state.height);
    const clawHeightPx = minDimension * 0.19;
    const clawWidthPx = image
      ? clawHeightPx * (image.naturalWidth / image.naturalHeight)
      : clawHeightPx * 0.88;
    const mouthOffsetY = clawHeightPx / state.height * 0.12;
    const clawRadiusX = clawWidthPx / state.width * 0.34;
    const clawRadiusY = clawHeightPx / state.height * 0.32;
    const previousMouthY = previousY + mouthOffsetY;
    const currentMouthY = currentY + mouthOffsetY;
    const sweepTop = Math.min(previousMouthY, currentMouthY);
    const sweepBottom = Math.max(previousMouthY, currentMouthY);

    return state.fish
      .filter((fish) => (
        !fish.caughtInGame
        && !fish.caughtByClaw
        && !isFishPausedForEvent(fish)
        && !isFishHidden(fish, now)
      ))
      .map((fish) => {
        const fishRadiusX = fish.collisionRadiusX || 0.035;
        const fishRadiusY = fish.collisionRadiusY || 0.025;
        const reachX = clawRadiusX + fishRadiusX * 0.58;
        const reachY = clawRadiusY + fishRadiusY * 0.62;
        const closestSweepY = clamp(fish.y, sweepTop, sweepBottom);
        const normalizedDistance = Math.hypot(
          (fish.x - game.claw.x) / Math.max(0.001, reachX),
          (fish.y - closestSweepY) / Math.max(0.001, reachY)
        );
        return {
          fish,
          blocked: (fish.blockedByFishUntil || 0) > now,
          normalizedDistance
        };
      })
      .filter((item) => item.normalizedDistance <= 1)
      .sort((a, b) => (
        Number(b.blocked) - Number(a.blocked)
        || a.normalizedDistance - b.normalizedDistance
      ))[0] || null;
  }

  function updateCatchGame(dt, now) {
    const game = state.catchGame;
    if (!game.running) return;
    if (now >= game.endsAt) {
      endCatchRound();
      return;
    }

    game.surfaceObstacles.forEach((obstacle) => {
      obstacle.x += obstacle.dir * obstacle.speed * dt;
      if (obstacle.x > obstacle.maxX) {
        obstacle.x = obstacle.maxX;
        obstacle.dir = -1;
      } else if (obstacle.x < obstacle.minX) {
        obstacle.x = obstacle.minX;
        obstacle.dir = 1;
      }
      const object = state.memoryObjects.find((item) => item.id === obstacle.objectId);
      if (object) object.x = obstacle.x;
    });

    const claw = game.claw;
    if (game.phase === "dropping") {
      const previousClawY = claw.y;
      const previousTip = claw.y + 0.085;
      claw.y = Math.min(0.83, claw.y + 0.55 * dt);
      const currentTip = claw.y + 0.085;
      if (
        !claw.waterlineChecked
        && previousTip < WATERLINE_RATIO + 0.02
        && currentTip >= WATERLINE_RATIO + 0.02
      ) {
        claw.waterlineChecked = true;
        spawnClawSplash(claw.x);
        const blocker = game.surfaceObstacles.find((obstacle) => (
          Math.abs(obstacle.x - claw.x) < obstacle.width * 0.48
        ));
        if (blocker) {
          claw.blocked = true;
          claw.x = clamp(claw.x + blocker.dir * 0.025, 0.075, 0.925);
          game.phase = "rising";
          claw.phaseStartedAt = now;
          showCatchFeedback("水面植物挡住了夹子");
        }
      }

      if (game.phase === "dropping" && claw.y > WATERLINE_RATIO + 0.04) {
        const candidate = findFishIntersectingClaw(previousClawY, claw.y, now);
        if (candidate) beginClawClosing(candidate.fish, now);
      }

      if (game.phase === "dropping" && claw.y >= 0.83) {
        beginClawClosing(null, now);
      }
    } else if (game.phase === "closing") {
      const fish = state.fish.find((item) => item.id === claw.grabbedFishId);
      if (fish) {
        fish.x = claw.x;
        fish.y = claw.y + 0.055;
      }
      if (now - claw.phaseStartedAt >= 280) {
        game.phase = "rising";
        claw.phaseStartedAt = now;
      }
    } else if (game.phase === "rising") {
      claw.y = Math.max(0.085, claw.y - 0.66 * dt);
      const fish = state.fish.find((item) => item.id === claw.grabbedFishId);
      if (fish) {
        fish.x = claw.x;
        fish.y = claw.y + 0.055;
      }
      if (claw.y <= 0.085) finishClawCatch(now);
    }

    updateCatchHud();
  }

  function updateFish(dt) {
    const now = performance.now();
    state.fish.forEach((fish) => {
      if (fish.caughtInGame || fish.caughtByClaw) return;
      if (isFishPausedForEvent(fish)) {
        holdFishAtEventAnchor(fish);
        return;
      }
      if (isFishHidden(fish, now)) return;
      if (fish.id === state.selectedFishId) return;
      if (fish.eatingUntil > now) return;
      maybeTriggerCatchEvasion(fish, now);
      if (isFishHidden(fish, now) || fish.coverMode === "entering") return;
      let target = null;
      let targetKind = "none";
      if (fish.coverMode === "approaching" && fish.coverTarget) {
        target = {
          x: clamp(fish.coverTarget.x, 0.08, 0.92),
          y: clamp(fish.coverTarget.y, WATERLINE_RATIO + 0.07, 0.8)
        };
        targetKind = "dart";
      } else if (fish.escapeUntil > now && fish.escapeTarget) {
        target = fish.escapeTarget;
        targetKind = "dart";
      } else if (!state.catchGame.running && fish.fearUntil > now && fish.fearTarget) {
        target = fish.fearTarget;
        targetKind = "fear";
      } else if (state.foods.length) {
        let lockedFood = state.foods.find((food) => (
          food.id === fish.targetFoodId && !food.eaten
        ));
        if (!lockedFood) {
          const claimedFoodIds = new Set(
            state.fish
              .filter((other) => other !== fish && other.targetFoodId)
              .map((other) => other.targetFoodId)
          );
          lockedFood = state.foods
            .filter((food) => !food.eaten && !claimedFoodIds.has(food.id))
            .reduce((closest, food) => {
              const distance = Math.hypot(food.x - fish.x, food.y - fish.y);
              return !closest || distance < closest.distance ? { food, distance } : closest;
            }, null)?.food || null;
          fish.targetFoodId = lockedFood ? lockedFood.id : null;
        }

        if (lockedFood) {
          const distance = Math.hypot(lockedFood.x - fish.x, lockedFood.y - fish.y);
          if (distance < 0.032) {
            lockedFood.eaten = true;
            fish.targetFoodId = null;
            fish.eatingUntil = now + 420;
          } else {
            target = {
              x: lockedFood.x,
              y: lockedFood.y,
              distance
            };
            targetKind = "food";
          }
        }
      } else if (state.memoryObject && fish.curiousUntil > now) {
        const angle = (fish.curiousSlot || 0) * Math.PI + now * 0.00022;
        target = {
          x: state.memoryObject.x + Math.cos(angle) * 0.17,
          y: state.memoryObject.y + Math.sin(angle) * 0.09
        };
        targetKind = "curious";
      } else {
        const reachedWanderTarget = fish.wanderTarget
          && Math.hypot(fish.wanderTarget.x - fish.x, fish.wanderTarget.y - fish.y) < 0.035;
        if (fish.behavior === "shelter" && reachedWanderTarget) {
          fish.behavior = "rest";
          fish.behaviorUntil = now + 2200 + Math.random() * 3800;
          fish.behindCoverUntil = fish.behaviorUntil;
          fish.wanderTarget = null;
        } else if (now >= fish.behaviorUntil || reachedWanderTarget) {
          chooseNextFishBehavior(fish, now);
        }
        if (fish.behavior !== "rest") {
          target = fish.wanderTarget;
          targetKind = fish.behavior;
        }
      }

      let speed = Number(fish.currentSpeed);
      if (!Number.isFinite(speed) || speed <= 0) {
        speed = Number(fish.speed);
      }
      if (!Number.isFinite(speed) || speed <= 0) {
        speed = 0.029;
        fish.speed = speed;
        fish.currentSpeed = speed;
      }
      if (state.catchGame.running) {
        speed *= isCatchTarget(fish) ? 1.62 : 1.28;
      }
      if ((fish.blockedByFishUntil || 0) > now) speed *= 0.7;
      if (target) {
        let dx = target.x - fish.x;
        let dy = target.y - fish.y;
        const avoidance = fishAvoidanceVector(fish, now);
        const avoidanceStrength = targetKind === "fear" ? 0.06 : 0.14;
        dx += avoidance.x * avoidanceStrength;
        dy += avoidance.y * avoidanceStrength * 0.72;
        const desiredDirection = dx > 0.04 ? 1 : dx < -0.04 ? -1 : fish.dir;
        if (desiredDirection !== fish.dir && now - fish.lastTurnAt > 360) {
          fish.dir = desiredDirection;
          fish.lastTurnAt = now;
        }
        const pursuitMultiplier = targetKind === "food"
          ? 1.7
          : targetKind === "curious"
            ? 1.16
            : targetKind === "fear"
              ? 2.75
            : targetKind === "dart"
              ? 1.9
              : 0.92;
        const maxStepX = speed * pursuitMultiplier * dt;
        const maxStepY = speed * (
          targetKind === "food"
            ? 0.9
            : targetKind === "fear"
              ? 1.55
              : 0.62
        ) * dt;
        fish.x += clamp(dx, -maxStepX, maxStepX);
        fish.y += clamp(dy, -maxStepY, maxStepY);
      } else if (fish.behavior === "rest") {
        fish.y += Math.sin(now * fish.bobFrequency + fish.phase) * fish.bobAmplitude * dt * 16;
      } else {
        fish.x += fish.dir * speed * dt;
        fish.y += Math.sin(now * fish.bobFrequency + fish.phase) * fish.bobAmplitude * dt * 60;
      }

      const defaultAspects = [1.18, 1.72, 1.48, 1.02];
      const defaultHeights = [1.38, 1.02, 1.16, 1.5];
      const hasImageBounds = (
        fish.assetKind === "custom-fish"
        || fish.assetKind === "preset-image-fish"
      ) && fish.renderBounds;
      const fishPixelHeight = hasImageBounds
        ? fish.renderBounds.h
        : fish.size * Math.min(state.width, state.height)
          * (fish.atlas === "default" ? defaultHeights[fish.sprite] : 1);
      const fishPixelWidth = hasImageBounds
        ? fish.renderBounds.w
        : fish.atlas === "default"
          ? fishPixelHeight * defaultAspects[fish.sprite]
          : fish.size * Math.min(state.width, state.height) * 2.15;
      const horizontalPadding = fishPixelWidth / state.width / 2 + 0.012;
      const verticalPadding = fishPixelHeight / state.height / 2 + 0.018;
      fish.collisionRadiusX = Math.max(
        0.024,
        fishPixelWidth / state.width * 0.38
      );
      fish.collisionRadiusY = Math.max(
        0.018,
        fishPixelHeight / state.height * 0.34
      );
      const minX = horizontalPadding;
      const maxX = 1 - horizontalPadding;
      const minY = Math.max(WATERLINE_RATIO + verticalPadding + 0.012, verticalPadding);
      const maxY = Math.min(0.84, 1 - verticalPadding);

      fish.y = clamp(fish.y, minY, maxY);
      if (fish.x >= maxX) {
        fish.x = maxX;
        fish.dir = -1;
        fish.target = null;
      } else if (fish.x <= minX) {
        fish.x = minX;
        fish.dir = 1;
        fish.target = null;
      }
    });
    applyNaturalFishSpacing(dt, now);
    resolveFishCollisions(now);
  }

  function applyNaturalFishSpacing(dt, now) {
    if (state.catchGame.running) return;
    const activeFish = state.fish.filter((fish) => (
      !fish.caughtInGame
      && !fish.caughtByClaw
      && !isFishHidden(fish, now)
      && fish.id !== state.selectedFishId
    ));
    for (let index = 0; index < activeFish.length; index += 1) {
      const a = activeFish[index];
      for (let otherIndex = index + 1; otherIndex < activeFish.length; otherIndex += 1) {
        const b = activeFish[otherIndex];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (Math.hypot(dx, dy) < 0.001) {
          const angle = (a.phase - b.phase) || 1;
          dx = Math.cos(angle) * 0.001;
          dy = Math.sin(angle) * 0.001;
        }
        const sociality = (
          (a.personality?.sociality || 0.25)
          + (b.personality?.sociality || 0.25)
        ) / 2;
        const hasEventPriority = isFishPausedForEvent(a) || isFishPausedForEvent(b);
        const reachX = (a.collisionRadiusX || 0.035)
          + (b.collisionRadiusX || 0.035)
          + (hasEventPriority ? 0.15 : 0.078)
          - sociality * 0.026;
        const reachY = (a.collisionRadiusY || 0.025)
          + (b.collisionRadiusY || 0.025)
          + (hasEventPriority ? 0.105 : 0.056)
          - sociality * 0.018;
        const scaledDistance = Math.hypot(dx / reachX, dy / reachY);
        if (scaledDistance >= 1) continue;
        const pressure = (1 - Math.max(0.01, scaledDistance))
          * (hasEventPriority ? 0.48 : 0.16)
          * dt;
        const unitX = dx / reachX / Math.max(0.01, scaledDistance);
        const unitY = dy / reachY / Math.max(0.01, scaledDistance);
        const mobilityA = isFishPausedForEvent(a)
          ? 0
          : a.behavior === "rest" ? 0.36 : 1;
        const mobilityB = isFishPausedForEvent(b)
          ? 0
          : b.behavior === "rest" ? 0.36 : 1;
        a.x -= unitX * pressure * mobilityA;
        a.y -= unitY * pressure * mobilityA * 0.78;
        b.x += unitX * pressure * mobilityB;
        b.y += unitY * pressure * mobilityB * 0.78;
      }
    }
  }

  function resolveFishCollisions(now) {
    const activeFish = state.fish.filter((fish) => (
      !fish.caughtInGame
      && !fish.caughtByClaw
      && !isFishHidden(fish, now)
      && fish.coverMode !== "entering"
    ));

    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 0; index < activeFish.length; index += 1) {
        const a = activeFish[index];
        for (let otherIndex = index + 1; otherIndex < activeFish.length; otherIndex += 1) {
          const b = activeFish[otherIndex];
          const radiusX = (a.collisionRadiusX || 0.035) + (b.collisionRadiusX || 0.035);
          const radiusY = (a.collisionRadiusY || 0.025) + (b.collisionRadiusY || 0.025);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const scaledDistance = Math.hypot(dx / radiusX, dy / radiusY);
          if (scaledDistance >= 1) continue;

          const overlap = 1 - Math.max(0.001, scaledDistance);
          const pausedA = isFishPausedForEvent(a);
          const pausedB = isFishPausedForEvent(b);
          if (pausedA && pausedB) continue;
          if (pausedA !== pausedB) {
            const pausedFish = pausedA ? a : b;
            const movingFish = pausedA ? b : a;
            const awayX = movingFish.x - pausedFish.x;
            const awayY = movingFish.y - pausedFish.y;
            const sideX = awayX === 0
              ? (movingFish.phase > pausedFish.phase ? 1 : -1)
              : Math.sign(awayX);
            const sideY = awayY === 0
              ? (movingFish.phase > pausedFish.phase ? 1 : -1)
              : Math.sign(awayY);
            movingFish.x += sideX * radiusX * overlap * 0.86;
            movingFish.y += sideY * radiusY * overlap * 0.34;
            movingFish.blockedByFishUntil = now + 190;
            movingFish.blockedByFishId = pausedFish.id;
            continue;
          }
          if (a.dir === b.dir) {
            const direction = a.dir;
            const front = direction === 1
              ? (a.x >= b.x ? a : b)
              : (a.x <= b.x ? a : b);
            const rear = front === a ? b : a;
            const side = rear.y === front.y
              ? (rear.phase > front.phase ? 1 : -1)
              : Math.sign(rear.y - front.y);

            if (!isFishPausedForEvent(rear)) {
              rear.x -= direction * radiusX * overlap * 0.72;
              rear.y += side * radiusY * overlap * 0.22;
              rear.blockedByFishUntil = now + 130;
              rear.blockedByFishId = front.id;
            }
            if (!isFishPausedForEvent(front)) {
              front.x += direction * radiusX * overlap * 0.12;
            }
          } else {
            const sideX = dx === 0
              ? (a.phase > b.phase ? 1 : -1)
              : Math.sign(dx);
            const sideY = dy === 0
              ? (a.phase > b.phase ? 1 : -1)
              : Math.sign(dy);
            const horizontalPush = radiusX * overlap * 0.34;
            const verticalPush = radiusY * overlap * 0.2;
            if (!isFishPausedForEvent(a)) {
              a.x -= sideX * horizontalPush;
              a.y -= sideY * verticalPush;
            }
            if (!isFishPausedForEvent(b)) {
              b.x += sideX * horizontalPush;
              b.y += sideY * verticalPush;
            }
          }
        }
      }
    }

    activeFish.forEach((fish) => {
      if (isFishPausedForEvent(fish)) return;
      const radiusX = fish.collisionRadiusX || 0.035;
      const radiusY = fish.collisionRadiusY || 0.025;
      fish.x = clamp(fish.x, radiusX + 0.012, 1 - radiusX - 0.012);
      fish.y = clamp(
        fish.y,
        WATERLINE_RATIO + radiusY + 0.015,
        Math.min(0.84, 1 - radiusY - 0.015)
      );
    });
  }

  function reserveFishDestination(fish, preferredX, preferredY) {
    const columns = 6;
    const rows = 3;
    const minX = 0.09;
    const maxX = 0.91;
    const minY = WATERLINE_RATIO + 0.1;
    const maxY = 0.77;
    const occupied = new Set(
      state.fish
        .filter((other) => other !== fish && other.reservedCellKey)
        .map((other) => other.reservedCellKey)
    );
    const candidates = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const key = `${column}:${row}`;
        const x = lerp(minX, maxX, (column + 0.5) / columns);
        const y = lerp(minY, maxY, (row + 0.5) / rows);
        const nearestFishDistance = state.fish
          .filter((other) => other !== fish && !other.caughtInGame)
          .reduce((nearest, other) => (
            Math.min(nearest, Math.hypot((other.x - x) * 0.8, other.y - y))
          ), Infinity);
        const preferenceDistance = Math.hypot((preferredX - x) * 0.72, preferredY - y);
        const score = preferenceDistance
          + (occupied.has(key) ? 10 : 0)
          + Math.max(0, 0.18 - nearestFishDistance) * 2.2;
        candidates.push({ key, x, y, score });
      }
    }
    const selected = candidates.sort((a, b) => a.score - b.score)[0];
    fish.reservedCellKey = selected.key;
    return {
      x: clamp(selected.x + (personalityValue(fish.id, `${selected.key}:x`) - 0.5) * 0.045, 0.07, 0.93),
      y: clamp(selected.y + (personalityValue(fish.id, `${selected.key}:y`) - 0.5) * 0.035, minY, maxY)
    };
  }

  function fishAvoidanceVector(fish, now) {
    if (state.catchGame.running) return { x: 0, y: 0 };
    let avoidanceX = 0;
    let avoidanceY = 0;
    state.fish.forEach((other) => {
      if (
        other === fish
        || other.caughtInGame
        || other.caughtByClaw
        || isFishHidden(other, now)
      ) return;
      const dx = fish.x - other.x;
      const dy = fish.y - other.y;
      const eventPriority = isFishPausedForEvent(other);
      const reachX = (fish.collisionRadiusX || 0.035)
        + (other.collisionRadiusX || 0.035)
        + (eventPriority ? 0.18 : 0.09);
      const reachY = (fish.collisionRadiusY || 0.025)
        + (other.collisionRadiusY || 0.025)
        + (eventPriority ? 0.12 : 0.065);
      const scaledDistance = Math.hypot(dx / reachX, dy / reachY);
      if (scaledDistance >= 1 || scaledDistance < 0.001) return;
      const urgency = Math.pow(1 - scaledDistance, 1.35) * (eventPriority ? 2.6 : 1);
      avoidanceX += dx / reachX / scaledDistance * urgency;
      avoidanceY += dy / reachY / scaledDistance * urgency;
    });
    return { x: avoidanceX, y: avoidanceY };
  }

  function chooseNextFishBehavior(fish, now) {
    const personality = fish.personality || createFishPersonality(fish.id, null, {
      x: fish.x,
      y: fish.baseY
    });
    fish.personality = personality;
    if ((fish.behindCoverUntil || 0) <= now && fish.behavior !== "shelter") {
      fish.normalCoverId = null;
    }
    const catchMode = state.catchGame.running;
    if (fish.nextBehaviorHint === "coast") {
      fish.nextBehaviorHint = null;
      fish.behavior = "coast";
      fish.behaviorUntil = now + (catchMode ? 340 : 700) + Math.random() * (catchMode ? 430 : 1100);
      fish.currentSpeed = fish.speed * personality.activity * (0.28 + Math.random() * 0.22);
      return;
    }

    const roll = Math.random();
    const restChance = catchMode ? 0.045 : personality.restChance;
    if (
      !catchMode
      && personality.coverAffinity > 0.42
      && roll < 0.07 + personality.coverAffinity * 0.12
    ) {
      const cover = nearestAvailableFishCover(fish);
      if (cover) {
        const approachSide = fish.x <= cover.x ? -1 : 1;
        fish.behavior = "shelter";
        fish.behaviorUntil = now + 4500 + Math.random() * 4500;
        fish.normalCoverId = cover.id;
        fish.reservedCellKey = null;
        fish.behindCoverUntil = 0;
        fish.wanderTarget = {
          x: clamp(
            cover.x + approachSide * Math.min(cover.radiusX * 0.16, 0.018),
            0.07,
            0.93
          ),
          y: clamp(cover.y, WATERLINE_RATIO + 0.07, 0.8)
        };
        fish.currentSpeed = fish.speed * personality.activity * (0.58 + Math.random() * 0.28);
        return;
      }
    }
    if (roll < restChance) {
      fish.behavior = "rest";
      const restScale = 0.75 + personality.restChance * 2.4;
      fish.behaviorUntil = now + (1200 + Math.random() * 3500) * restScale / personality.activity;
      fish.currentSpeed = fish.speed * 0.08;
      fish.wanderTarget = null;
      reserveFishDestination(fish, fish.x, fish.y);
      return;
    }

    const isDart = roll > 1 - (catchMode ? 0.31 : personality.burstChance);
    fish.behavior = isDart ? "dart" : roll < 0.46 ? "drift" : "cruise";
    fish.behaviorUntil = now + (
      isDart
        ? (catchMode ? 480 : 320) + Math.random() * (catchMode ? 620 : 520)
        : (2200 + Math.random() * 4700) / personality.activity
    );
    if (isDart) fish.nextBehaviorHint = "coast";
    const verticalRange = fish.sprite === 3 ? 0.08 : 0.12 + personality.roamRadius * 0.22;
    const targetX = catchMode
      ? 0.07 + Math.random() * 0.86
      : personality.homeX + (Math.random() - 0.5) * personality.roamRadius * 2;
    const preferredY = clamp(
      personality.preferredDepth + (Math.random() - 0.5) * verticalRange,
      fish.sprite === 3 ? 0.62 : WATERLINE_RATIO + 0.06,
      fish.sprite === 3 ? 0.82 : 0.78
    );
    fish.wanderTarget = catchMode
      ? { x: clamp(targetX, 0.07, 0.93), y: preferredY }
      : reserveFishDestination(fish, clamp(targetX, 0.07, 0.93), preferredY);
    const speedFactor = isDart
      ? 1.85 + Math.random() * 0.75
      : fish.behavior === "drift"
        ? 0.26 + Math.random() * 0.28
        : 0.64 + Math.random() * 0.58;
    fish.currentSpeed = fish.speed * speedFactor * personality.activity;
  }

  function drawDeformedFishSprite(image, source, destination, fish) {
    const { sx, sy, sw, sh } = source;
    const { width, height } = destination;
    const isSelected = fish.id === state.selectedFishId;
    if (isSelected || REDUCED_MOTION) {
      ctx.drawImage(image, sx, sy, sw, sh, -width / 2, -height / 2, width, height);
      return;
    }

    const speedRatio = clamp((fish.currentSpeed || fish.speed) / Math.max(fish.speed, 0.001), 0.3, 2.2);
    const behaviorStrength = fish.behavior === "rest"
      ? 0.25
      : fish.behavior === "coast"
        ? 0.34
      : fish.behavior === "dart"
        ? 1.08
        : fish.eatingUntil > state.time
          ? 0.18
          : 0.62 + speedRatio * 0.16;
    const frequency = (0.0042 + (Math.abs(Math.sin(fish.phase)) * 0.0015))
      * (0.82 + speedRatio * 0.16);
    const tailWave = Math.sin(state.time * frequency + fish.phase);
    const ornamentalTailFractions = [0.49, 0.5, 0.45, 0.37];
    const tailFraction = fish.atlas === "default"
      ? ornamentalTailFractions[fish.sprite]
      : 0.34;
    const tailSourceWidth = sw * tailFraction;
    const bodySourceX = sx + tailSourceWidth;
    const bodySourceWidth = sw - tailSourceWidth;
    const stableTailWidth = width * tailFraction;
    const bodyWidth = width - stableTailWidth;
    const joinX = -width / 2 + stableTailWidth;
    const compression = (0.055 + speedRatio * 0.018) * behaviorStrength;
    const tailScaleX = 1 - compression * (0.5 + 0.5 * tailWave);
    const tailScaleY = 1 - compression * 0.2 * Math.abs(tailWave);
    const animatedTailWidth = stableTailWidth * tailScaleX;
    const seamOverlap = 1;

    ctx.drawImage(
      image,
      sx,
      sy,
      tailSourceWidth + seamOverlap,
      sh,
      joinX - animatedTailWidth,
      -height * tailScaleY / 2,
      animatedTailWidth + seamOverlap,
      height * tailScaleY
    );
    ctx.drawImage(
      image,
      bodySourceX,
      sy,
      bodySourceWidth,
      sh,
      joinX,
      -height / 2,
      bodyWidth,
      height
    );
  }

  function analyzeImageMotion(image) {
    const fallbackRatio = image.naturalWidth / image.naturalHeight || 1;
    try {
      const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const sample = document.createElement("canvas");
      sample.width = width;
      sample.height = height;
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      sampleContext.drawImage(image, 0, 0, width, height);
      const pixels = sampleContext.getImageData(0, 0, width, height).data;
      let minX = width;
      let maxX = -1;
      let minY = height;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] < 24) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      const outlineWidth = maxX >= minX ? maxX - minX + 1 : width;
      const outlineHeight = maxY >= minY ? maxY - minY + 1 : height;
      const aspectRatio = outlineWidth / Math.max(1, outlineHeight);
      return { aspectRatio, motionProfile: aspectRatio < 1 ? "sway" : "tail" };
    } catch (error) {
      return {
        aspectRatio: fallbackRatio,
        motionProfile: fallbackRatio < 1 ? "sway" : "tail"
      };
    }
  }

  function drawMotionSprite(image, width, height, profile, phase = 0, still = false) {
    if (still || REDUCED_MOTION) {
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      return;
    }

    if (profile === "sway") {
      const slices = 18;
      const sourceSlice = image.naturalHeight / slices;
      const drawSlice = height / slices;
      const wave = state.time * 0.0032 + phase;
      for (let index = 0; index < slices; index += 1) {
        const vertical = index / Math.max(1, slices - 1);
        const flexibility = 0.38 + (1 - vertical) * 0.62;
        const swayAmplitude = Math.max(width * 0.15, height * 0.06);
        const offsetX = Math.sin(wave + vertical * 0.72)
          * swayAmplitude
          * flexibility;
        ctx.drawImage(
          image,
          0,
          index * sourceSlice,
          image.naturalWidth,
          sourceSlice + 1,
          -width / 2 + offsetX,
          -height / 2 + index * drawSlice,
          width,
          drawSlice + 1
        );
      }
      return;
    }

    const slices = 20;
    const sourceSlice = image.naturalWidth / slices;
    const drawSlice = width / slices;
    const wave = state.time * 0.006 + phase;
    for (let index = 0; index < slices; index += 1) {
      const horizontal = index / Math.max(1, slices - 1);
      const tailWeight = Math.pow(1 - horizontal, 1.7);
      const offsetY = Math.sin(wave + horizontal * 0.8) * height * 0.12 * tailWeight;
      const scaleY = 1 - Math.abs(Math.sin(wave)) * 0.025 * tailWeight;
      ctx.drawImage(
        image,
        index * sourceSlice,
        0,
        sourceSlice + 1,
        image.naturalHeight,
        -width / 2 + index * drawSlice,
        -height * scaleY / 2 + offsetY,
        drawSlice + 1,
        height * scaleY
      );
    }
  }

  function resolvePresetFishImage(fish) {
    const catalogItem = DEFAULT_CATALOG.find((item) => (
      item.type === "fish" && item.id === fish.catalogId
    ));
    const artKey = fish.artKey || (catalogItem && catalogItem.artKey);
    return artKey ? state.art[artKey] : null;
  }

  function drawFish(fish) {
    if (fish.caughtInGame) return;
    const normalizedX = clamp(Number.isFinite(Number(fish.x)) ? Number(fish.x) : 0.5, 0.06, 0.94);
    const normalizedY = clamp(
      Number.isFinite(Number(fish.y)) ? Number(fish.y) : 0.46,
      WATERLINE_RATIO + 0.04,
      0.86
    );
    const normalizedSize = clamp(
      Number.isFinite(Number(fish.size)) ? Number(fish.size) : 0.112,
      0.075,
      0.17
    );
    const x = normalizedX * state.width;
    const y = normalizedY * state.height;
    const coverProgress = fish.coverMode === "entering"
      ? clamp(Number(fish.coverEnterProgress || 0), 0, 1)
      : 0;
    const entryScale = 1 - coverProgress * 0.24;
    const entryAlpha = 1 - coverProgress * 0.52;
    const size = normalizedSize * Math.min(state.width, state.height) * entryScale;
    const flip = Number(fish.dir) === -1 ? -1 : 1;

    const isCustomImageFish = fish.assetKind === "custom-fish" && fish.imageKey;
    const isPresetImageFish = fish.assetKind === "preset-image-fish";
    if (isCustomImageFish || isPresetImageFish) {
      const image = isCustomImageFish
        ? state.memoryImages.get(fish.imageKey) || state.art.fallbackFish
        : resolvePresetFishImage(fish) || state.art.fallbackFish;
      if (image) {
        const naturalRatio = image.naturalWidth / image.naturalHeight;
        const fallbackRatio = Number.isFinite(naturalRatio) && naturalRatio > 0
          ? naturalRatio
          : 1;
        const motion = webglFishApi
          && typeof webglFishApi.resolveCustomFishMotion === "function"
          ? webglFishApi.resolveCustomFishMotion(
            fish.aspectRatio,
            image.naturalWidth,
            image.naturalHeight
          )
          : {
            aspectRatio: fallbackRatio,
            motionMode: fallbackRatio < 1 ? "seaweed" : "fish"
          };
        const ratio = motion.aspectRatio;
        const motionMode = motion.motionMode;
        const maxWidth = size * 2.35;
        const maxHeight = size * 1.45;
        let drawWidth = maxWidth;
        let drawHeight = drawWidth / ratio;
        if (drawHeight > maxHeight) {
          drawHeight = maxHeight;
          drawWidth = drawHeight * ratio;
        }
        const motionProfile = fish.motionProfile
          || (ratio < 1 ? "sway" : "tail");
        const meshFrame = motionProfile === "tail" && (
          fish.id !== state.selectedFishId
        )
          ? webglFishRenderer.render(image, {
            speed: fish.speed,
            currentSpeed: fish.currentSpeed,
            behavior: fish.behavior,
            eatingUntil: fish.eatingUntil,
            phase: fish.phase,
            time: state.time,
            reducedMotion: REDUCED_MOTION,
            motionMode
          })
          : false;
        if (meshFrame) {
          canvas.dataset.customFishRenderer = "webgl-active";
        } else if (!webglFishRenderer.available) {
          canvas.dataset.customFishRenderer = "canvas-fallback";
        }
        const renderSource = meshFrame ? meshFrame.canvas : image;
        const frameWidth = meshFrame
          ? drawWidth / meshFrame.contentScaleX
          : drawWidth;
        const frameHeight = meshFrame
          ? drawHeight / meshFrame.contentScaleY
          : drawHeight;
        const sourceFacing = webglFishApi
          && typeof webglFishApi.resolveSourceFacing === "function"
          ? webglFishApi.resolveSourceFacing(motionMode, meshFrame)
          : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip * sourceFacing, 1);
        ctx.globalAlpha = entryAlpha;
        if (motionProfile === "sway" && !meshFrame) {
          drawMotionSprite(
            image,
            drawWidth,
            drawHeight,
            "sway",
            fish.phase,
            fish.id === state.selectedFishId
          );
        } else {
          ctx.drawImage(
            renderSource,
            -frameWidth / 2,
            -frameHeight / 2,
            frameWidth,
            frameHeight
          );
        }
        ctx.restore();
        fish.renderBounds = {
          x,
          y,
          w: Math.max(drawWidth, 48),
          h: Math.max(drawHeight, 36)
        };
        if (fish.id === state.selectedFishId) {
          drawSelectedFishMarker(fish, x, y, drawWidth, drawHeight);
        }
        drawCatchTargetMarker(fish, x, y, drawWidth, drawHeight);
        return;
      }
    }

    const fishAtlas = fish.atlas === "default" ? state.art.defaultFish : state.art.fish;
    if (fishAtlas) {
      const image = fishAtlas;
      const sourceWidth = image.naturalWidth / 2;
      const sourceHeight = image.naturalHeight / 2;
      const spriteX = fish.sprite % 2;
      const spriteY = Math.floor(fish.sprite / 2);
      const ornamentalAspects = [1.18, 1.72, 1.48, 1.02];
      const ornamentalHeights = [1.38, 1.02, 1.16, 1.5];
      const drawHeight = fish.atlas === "default"
        ? size * ornamentalHeights[fish.sprite]
        : size;
      const drawWidth = fish.atlas === "default"
        ? drawHeight * ornamentalAspects[fish.sprite]
        : size * 2.15;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip, 1);
      ctx.globalAlpha = entryAlpha;
      drawDeformedFishSprite(
        image,
        {
          sx: spriteX * sourceWidth,
          sy: spriteY * sourceHeight,
          sw: sourceWidth,
          sh: sourceHeight
        },
        { width: drawWidth, height: drawHeight },
        fish
      );
      ctx.restore();
      fish.renderBounds = { x, y, w: drawWidth, h: drawHeight };
      if (fish.id === state.selectedFishId) drawSelectedFishMarker(fish, x, y, drawWidth, drawHeight);
      drawCatchTargetMarker(fish, x, y, drawWidth, drawHeight);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip, 1);
    ctx.globalAlpha = 0.94 * entryAlpha;

    ctx.fillStyle = "#6f604c";
    ctx.beginPath();
    ctx.moveTo(-size * 0.82, 0);
    ctx.lineTo(-size * 1.35, -size * 0.55);
    ctx.lineTo(-size * 1.2, size * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d3b47e";
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.53, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(size * 0.12, -size * 0.18, size * 0.48, size * 0.10, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#172d2f";
    ctx.beginPath();
    ctx.arc(size * 0.55, -size * 0.13, Math.max(1.1, size * 0.065), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#6f604c";
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(size * 0.12, size * 0.47);
    ctx.quadraticCurveTo(-size * 0.15, size * 0.8, -size * 0.42, size * 0.46);
    ctx.stroke();
    ctx.restore();
    fish.renderBounds = { x, y, w: size * 2, h: size };
    if (fish.id === state.selectedFishId) drawSelectedFishMarker(fish, x, y, size * 2, size);
    drawCatchTargetMarker(fish, x, y, size * 2, size);
  }

  function drawCatchTargetMarker(fish, x, y, width, height) {
    if (
      !state.catchGame.running
      || !isCatchTarget(fish)
      || fish.caughtInGame
      || fish.caughtByClaw
      || isFishHidden(fish, state.time)
    ) return;
    const label = "目标 +10";
    ctx.save();
    ctx.font = '700 9px "PingFang SC", sans-serif';
    const labelWidth = ctx.measureText(label).width + 16;
    const labelY = y - height * 0.68 - 17;
    ctx.fillStyle = "rgba(235, 244, 213, 0.9)";
    roundedRectPath(ctx, x - labelWidth / 2, labelY, labelWidth, 18, 9);
    ctx.fill();
    ctx.strokeStyle = "rgba(67, 116, 98, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#35685e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, labelY + 9);
    ctx.restore();
  }

  function drawSelectedFishMarker(fish, x, y, width, height) {
    ctx.save();
    ctx.strokeStyle = "rgba(227, 244, 235, 0.72)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y, width * 0.58, height * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10px "PingFang SC", sans-serif';
    const textWidth = ctx.measureText(fish.name).width;
    const pillWidth = textWidth + 18;
    const pillY = y - height * 0.72 - 22;
    ctx.fillStyle = "rgba(5, 27, 33, 0.76)";
    roundedRectPath(ctx, x - pillWidth / 2, pillY, pillWidth, 19, 9);
    ctx.fill();
    ctx.fillStyle = "rgba(239, 248, 243, 0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fish.name, x, pillY + 9.5);
    ctx.restore();
  }

  function updateAndDrawBubbles(dt) {
    state.bubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(state.time * 0.001 + bubble.phase) * 0.00012 * dt * 60;
      if (bubble.y < WATERLINE_RATIO + 0.01) {
        bubble.y = 0.94 + Math.random() * 0.08;
        bubble.x = 0.05 + Math.random() * 0.9;
      }
      if (bubble.y <= WATERLINE_RATIO) return;
      ctx.strokeStyle = "rgba(211,239,230,0.22)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(bubble.x * state.width, bubble.y * state.height, bubble.r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function updateFoods(dt) {
    state.foods.forEach((food) => {
      if (food.eaten) return;
      food.y += food.speed * dt;
      food.x += Math.sin(state.time * 0.002 + food.phase) * 0.00015 * dt * 60;
      food.life -= dt;
    });
    state.foods = state.foods.filter((food) => !food.eaten && food.life > 0 && food.y < 0.88);
  }

  function drawFoods() {
    ctx.fillStyle = "#d5a868";
    state.foods.forEach((food) => {
      ctx.beginPath();
      ctx.arc(food.x * state.width, food.y * state.height, food.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function updateRipples(dt) {
    state.ripples.forEach((ripple) => {
      ripple.radius += dt * 42;
      ripple.alpha -= dt * 0.55;
    });
    state.ripples = state.ripples.filter((ripple) => ripple.alpha > 0);
  }

  function drawRipples() {
    state.ripples.forEach((ripple) => {
      ctx.strokeStyle = `rgba(218,242,234,${ripple.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ripple.x * state.width, ripple.y * state.height, ripple.radius, ripple.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function constrainObjectToState(object) {
    object.x = clamp(object.x, 0.08, 0.92);
    if (object.state === "bottom") {
      const visualHeight = Number(object.renderBounds && object.renderBounds.visualH);
      const halfHeightRatio = Number.isFinite(visualHeight) && state.height > 0
        ? visualHeight / state.height / 2
        : 0.145;
      const lowestCenter = Math.max(0.7, BOTTOM_OBJECT_EDGE_RATIO - halfHeightRatio);
      object.y = clamp(object.y, Math.min(0.74, lowestCenter), lowestCenter);
    }
    else if (object.state === "surface") object.y = WATERLINE_RATIO;
    else object.y = clamp(object.y, WATERLINE_RATIO + 0.08, 0.78);
  }

  function spawnSandPuff(x, y) {
    for (let index = 0; index < 34; index += 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const life = 0.7 + Math.random() * 0.85;
      state.sandPuffs.push({
        x: x + (Math.random() - 0.5) * 0.035,
        y: y + Math.random() * 0.012,
        vx: side * (0.018 + Math.random() * 0.07),
        vy: -(0.012 + Math.random() * 0.055),
        radius: 2 + Math.random() * 6,
        life,
        maxLife: life
      });
    }
  }

  function updateMemoryObject(object) {
    if (!object || !object.entry || object.entry.phase !== "falling") return;
    const entry = object.entry;
    const progress = clamp((performance.now() - entry.startedAt) / entry.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (object.state === "surface") {
      if (progress < 0.68) {
        const sinkProgress = progress / 0.68;
        object.y = lerp(entry.fromY, 0.29, 1 - Math.pow(1 - sinkProgress, 3));
      } else {
        const floatProgress = (progress - 0.68) / 0.32;
        object.y = lerp(0.29, entry.targetY, 1 - Math.pow(1 - floatProgress, 2));
      }
    } else {
      object.y = lerp(entry.fromY, entry.targetY, eased);
    }
    object.entryOffsetX = Math.sin(progress * Math.PI * 7.5) * (1 - progress) * 0.025;
    object.entryTilt = Math.sin(progress * Math.PI * 8) * (1 - progress) * 0.16;

    if (progress < 1) return;
    object.y = entry.targetY;
    object.entry = null;
    object.entryOffsetX = 0;
    object.entryTilt = 0;
    if (object.state === "bottom") {
      spawnSandPuff(object.x, 0.84);
    }
    if (state.aquariumCore && object.assetKind === "custom") {
      state.aquariumCore.syncSceneSnapshot(sceneSnapshotForCore(), { silent: true });
      awaitOrIgnore(state.aquariumCore.notifyObjectSettled(object.id));
      reactToMemory(object, false);
    } else {
      if (object.state === "bottom") {
        showStory(`${object.name}轻轻撞进沙地，扬起了一小团浮沙。长按它可以调整位置。`);
      } else if (object.state === "surface") {
        showStory(`${object.name}浮到了水面，正随着水波轻轻摇晃。长按它可以调整位置。`);
      } else {
        showStory(`${object.name}停在了水中，开始随着水流轻轻悬浮。长按它可以调整位置。`);
      }
      reactToMemory(object, true);
    }
    saveState();
  }

  function updateAndDrawSand(dt) {
    state.sandPuffs.forEach((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.2, dt);
      particle.vy += 0.032 * dt;

      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = `rgba(205, 188, 137, ${alpha * 0.38})`;
      ctx.beginPath();
      ctx.ellipse(
        particle.x * state.width,
        particle.y * state.height,
        particle.radius * (1.35 - alpha * 0.35),
        particle.radius * 0.58,
        particle.vx * 5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
    state.sandPuffs = state.sandPuffs.filter((particle) => particle.life > 0);
  }

  function spawnClawSplash(x) {
    const count = REDUCED_MOTION ? 7 : 16;
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      state.catchSplashes.push({
        x: x + (Math.random() - 0.5) * 0.014,
        y: WATERLINE_RATIO + 0.012,
        vx: side * (0.018 + Math.random() * 0.07),
        vy: -(0.09 + Math.random() * 0.17),
        radius: 1.5 + Math.random() * 3.2,
        life: 0.42 + Math.random() * 0.24,
        maxLife: 0.66
      });
    }
    state.ripples.push({
      x,
      y: WATERLINE_RATIO + 0.012,
      radius: 4,
      alpha: 0.72
    });
    playCatchSplashSound();
  }

  function updateAndDrawCatchSplashes(dt) {
    state.catchSplashes.forEach((drop) => {
      drop.life -= dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.vy += 0.42 * dt;
      drop.vx *= Math.pow(0.52, dt);
      const alpha = clamp(drop.life / drop.maxLife, 0, 1);
      ctx.fillStyle = `rgba(223, 250, 240, ${alpha * 0.88})`;
      ctx.beginPath();
      ctx.ellipse(
        drop.x * state.width,
        drop.y * state.height,
        drop.radius * (0.65 + alpha * 0.35),
        drop.radius * 1.45,
        drop.vx * 7,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
    state.catchSplashes = state.catchSplashes.filter((drop) => drop.life > 0);
  }

  function drawMemoryObject(object) {
    if (!object) return;
    const isAtlasDecor = object.assetKind === "default-decor"
      || object.assetKind === "surface-plant";
    const isPresetImageDecor = object.assetKind === "preset-image-decor";
    const image = isPresetImageDecor
      ? state.art[object.artKey]
      : object.assetKind === "surface-plant"
      ? state.art.surfacePlants
      : isAtlasDecor
        ? state.art.defaultDecor
      : state.memoryImages.get(object.imageKey) || state.art.fallbackObject;
    if (!image) return;
    const isEditing = state.editing && state.memoryObject && state.memoryObject.id === object.id;

    const drift = !isEditing && object.state === "suspended"
      ? Math.sin(state.time * 0.0014) * state.height * 0.007
      : !isEditing && object.state === "surface"
        ? Math.sin(state.time * 0.001) * state.width * 0.012
        : 0;
    const x = (object.x + (object.entryOffsetX || 0)) * state.width
      + (object.state === "surface" ? drift : 0);
    const y = object.y * state.height + (object.state === "suspended" ? drift : 0);
    const baseSize = Math.min(state.width, state.height) * 0.17 * object.scale;
    const ratio = isAtlasDecor
      ? 1
      : image.naturalWidth / image.naturalHeight || 1;
    let dw = baseSize;
    let dh = baseSize;
    if (ratio > 1) dh /= ratio;
    else dw *= ratio;

    object.renderBounds = {
      x,
      y,
      w: Math.max(dw, 54),
      h: Math.max(dh, 54),
      visualW: dw,
      visualH: dh
    };

    ctx.save();
    ctx.translate(x, y);
    const tilt = object.entry
      ? object.entryTilt || 0
      : !isEditing && object.state === "surface"
        ? Math.sin(state.time * 0.0012) * 0.035
        : 0;
    ctx.rotate(tilt);
    ctx.shadowColor = "rgba(1,11,16,0.36)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 7;
    if (!isAtlasDecor && !isPresetImageDecor) {
      roundedRectPath(ctx, -dw / 2, -dh / 2, dw, dh, Math.min(14, dw * 0.15));
      ctx.clip();
    }
    if (isAtlasDecor) {
      const sourceWidth = image.naturalWidth / 3;
      const sourceHeight = image.naturalHeight / 2;
      const spriteX = object.sprite % 3;
      const spriteY = Math.floor(object.sprite / 3);
      ctx.drawImage(
        image,
        spriteX * sourceWidth,
        spriteY * sourceHeight,
        sourceWidth,
        sourceHeight,
        -dw / 2,
        -dh / 2,
        dw,
        dh
      );
    } else if (isPresetImageDecor) {
      ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    } else {
      drawMotionSprite(
        image,
        dw,
        dh,
        object.motionProfile || (ratio < 1 ? "sway" : "tail"),
        Number(object.createdAt || 0) * 0.0001,
        isEditing || Boolean(object.entry)
      );
    }
    if (!isAtlasDecor && !isPresetImageDecor && object.state === "surface" && !object.entry) {
      ctx.fillStyle = "rgba(43,103,111,0.05)";
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.fillStyle = "rgba(35,111,121,0.28)";
      ctx.fillRect(-dw / 2, 0, dw, dh / 2);
    } else if (!isAtlasDecor && !isPresetImageDecor) {
      ctx.fillStyle = "rgba(43,103,111,0.16)";
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }

    ctx.restore();

    if (isEditing) {
      ctx.save();
      ctx.strokeStyle = "rgba(218,242,226,0.85)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      roundedRectPath(ctx, x - dw / 2, y - dh / 2, dw, dh, Math.min(14, dw * 0.15));
      ctx.stroke();
      ctx.restore();
    }

  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawCatchClaw() {
    const game = state.catchGame;
    const image = state.art.catchClaw;
    if (!game.running || !image) return;
    const claw = game.claw;
    const x = claw.x * state.width;
    const y = claw.y * state.height;
    const size = Math.min(state.width, state.height);
    const drawHeight = size * 0.19;
    const drawWidth = drawHeight * (image.naturalWidth / image.naturalHeight);
    const railY = Math.max(8, state.height * 0.025);
    const topOfClaw = y - drawHeight * 0.46;

    ctx.save();
    ctx.strokeStyle = "rgba(72, 118, 110, 0.42)";
    ctx.lineWidth = Math.max(2, size * 0.006);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(state.width * 0.08, railY);
    ctx.lineTo(state.width * 0.92, railY);
    ctx.stroke();

    ctx.fillStyle = "rgba(229, 240, 219, 0.88)";
    ctx.strokeStyle = "rgba(72, 118, 110, 0.38)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, x - 15, railY - 6, 30, 13, 6);
    ctx.fill();
    ctx.stroke();

    if (game.phase === "aiming") {
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(230, 244, 223, 0.26)";
      ctx.beginPath();
      ctx.moveTo(x, y + drawHeight * 0.45);
      ctx.lineTo(x, state.height * 0.86);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(75, 114, 106, 0.56)";
    ctx.lineWidth = Math.max(1.4, size * 0.0035);
    ctx.beginPath();
    ctx.moveTo(x, railY + 6);
    ctx.quadraticCurveTo(
      x + Math.sin(state.time * 0.004) * 3,
      (railY + topOfClaw) / 2,
      x,
      topOfClaw + 2
    );
    ctx.stroke();

    const closingProgress = game.phase === "closing"
      ? clamp((state.time - claw.phaseStartedAt) / 280, 0, 1)
      : game.phase === "rising" && claw.grabbedFishId
        ? 1
        : 0;
    const squeeze = 1 - closingProgress * 0.28;
    const moving = game.phase === "dropping" || game.phase === "rising";
    const sway = moving
      ? Math.sin((state.time - claw.phaseStartedAt) * 0.012) * (claw.blocked ? 0.09 : 0.022)
      : 0;
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.scale(squeeze, 1);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min((now - state.lastFrame) / 1000, 0.033);
    state.lastFrame = now;
    state.time = now;

    drawBackground();
    drawAirLayer();
    updateAndDrawBubbles(dt);
    updateCatchGame(dt, now);
    updateFoods(dt);
    updateFish(dt);
    state.memoryObjects.forEach(updateMemoryObject);
    state.fish
      .filter((fish) => isFishHidden(fish, now) || isFishBehindDecor(fish, now))
      .sort((a, b) => a.y - b.y)
      .forEach(drawFish);
    drawGeneratedRocks();
    drawPlants();
    drawWaterSurface();
    updateAndDrawCatchSplashes(dt);
    state.memoryObjects
      .filter((object) => !state.catchGame.running || object.state !== "surface")
      .forEach(drawMemoryObject);
    updateAndDrawSand(dt);
    state.fish
      .filter((fish) => !isFishHidden(fish, now) && !isFishBehindDecor(fish, now))
      .sort((a, b) => a.y - b.y)
      .forEach(drawFish);
    drawFoods();
    updateRipples(dt);
    drawRipples();
    drawCatchClaw();
    if (state.catchGame.running) {
      state.memoryObjects
        .filter((object) => object.state === "surface")
        .forEach(drawMemoryObject);
    }

    requestAnimationFrame(frame);
  }

  function spawnFoodEffect() {
    state.fish.forEach((fish) => {
      fish.behindCoverUntil = 0;
      fish.normalCoverId = null;
    });
    for (let i = 0; i < 9; i += 1) {
      state.foods.push({
        id: `food-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        x: 0.16 + Math.random() * 0.68,
        y: 0.14 + Math.random() * 0.025,
        speed: 0.025 + Math.random() * 0.025,
        phase: i,
        life: 14,
        r: 1.4 + Math.random() * 1.4
      });
    }
    showStory("细小的食物落下来，原本固执的鱼突然达成了一致。");
    playTone(420, 0.08);
    if (soundManager) soundManager.play("feed");
  }

  async function feedFish() {
    if (aquariumApi) {
      window.clearTimeout(state.feedEventTimer);
      state.feedEventTimer = 0;
      const tutorialStep = state.tutorial && state.tutorial.getState().step;
      const fishId = tutorialStep === "feed" ? "fish-1" : state.selectedFishId || undefined;
      const result = await aquariumApi.feedFish(fishId);
      if (!result.ok) {
        showError(result.message);
        return;
      }
      renderCoreViewModel(result.viewModel);
      const data = result.data || {};
      if (
        tutorialStep === "feed"
        && state.tutorial
        && state.tutorial.getState().step === "feed"
      ) {
        continueTutorialForMatureCompanion(result.viewModel);
      }
      if (!data.mature) {
        showStory(`${data.fishName || "这条鱼"}吃得很开心，亲密度提升了。`);
      }
      if (data.event && data.event.immediateText) {
        state.feedEventTimer = window.setTimeout(() => {
          state.feedEventTimer = 0;
          showStory(data.event.immediateText);
        }, 1800);
      }
      return;
    }
    spawnFoodEffect();
  }

  function disturbFish(x, y) {
    state.ripples.push({ x, y, radius: 4, alpha: 0.42 });
    const now = performance.now();
    state.fish.forEach((fish) => {
      const dx = fish.x - x;
      const dy = fish.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 0.36) return;

      const fallbackX = fish.dir === 1 ? 1 : -1;
      const unitX = distance > 0.008 ? dx / distance : fallbackX;
      const unitY = distance > 0.008 ? dy / distance : (Math.random() - 0.5) * 0.5;
      const previous = fish.fearUntil > now && fish.fearVector
        ? fish.fearVector
        : { x: unitX, y: unitY };
      const blendedX = previous.x * 0.28 + unitX * 0.72;
      const blendedY = previous.y * 0.28 + unitY * 0.72;
      const blendedLength = Math.max(0.001, Math.hypot(blendedX, blendedY));
      const fearVector = {
        x: blendedX / blendedLength,
        y: blendedY / blendedLength
      };
      const influence = 1 - distance / 0.36;
      const escapeDistance = 0.2 + influence * 0.18;
      fish.behindCoverUntil = 0;
      fish.normalCoverId = null;
      fish.fearVector = fearVector;
      fish.fearTarget = {
        x: clamp(fish.x + fearVector.x * escapeDistance, 0.07, 0.93),
        y: clamp(
          fish.y + fearVector.y * escapeDistance * 0.62,
          WATERLINE_RATIO + 0.06,
          0.82
        )
      };
      fish.fearUntil = now + 920 + influence * 380;
      fish.behavior = "dart";
      fish.behaviorUntil = fish.fearUntil + 120;
      fish.currentSpeed = Math.max(fish.currentSpeed || 0, fish.speed * (1.75 + influence * 0.75));
      if (Math.abs(fearVector.x) > 0.12) fish.dir = fearVector.x > 0 ? 1 : -1;
    });
    playTone(250, 0.06);
    if (soundManager) soundManager.play("fish-swim");
  }

  function reactToMemory(object = state.memoryObject, showMessage = true) {
    const until = performance.now() + 6500;
    const visitors = [...state.fish]
      .sort((a, b) => (
        Math.hypot(a.x - object.x, a.y - object.y)
        - Math.hypot(b.x - object.x, b.y - object.y)
      ))
      .slice(0, 2);
    state.fish.forEach((fish) => {
      fish.curiousUntil = 0;
      fish.curiousSlot = null;
    });
    visitors.forEach((fish, index) => {
      fish.curiousUntil = until + index * 220;
      fish.curiousSlot = index;
    });
    if (!showMessage) return;
    const name = object && object.name;
    showStory(name
      ? `它们围着“${name}”看了很久，像是在商量该由谁先打招呼。`
      : "鱼群围了过来，水下世界多了一位来历不明的新邻居。");
  }

  function showStory(text, durationMs = 4300) {
    $("#storyText").textContent = text;
    $("#storyCard").classList.remove("is-hidden");
    window.clearTimeout(state.storyTimer);
    state.storyTimer = window.setTimeout(
      () => $("#storyCard").classList.add("is-hidden"),
      Math.max(1200, Number(durationMs) || 4300)
    );
  }

  function showError(message) {
    const toast = $("#errorToast");
    toast.textContent = message || "哎呀，出错了，请重启试试吧。";
    toast.classList.remove("is-hidden");
    window.setTimeout(() => toast.classList.add("is-hidden"), 4200);
  }

  function renderCoreViewModel(viewModel) {
    if (!viewModel || typeof viewModel !== "object") return;
    state.coreViewModel = viewModel;
    const settings = viewModel.settings || {};
    state.viewing = Boolean(settings.viewing);
    state.soundOn = Boolean(settings.soundOn);
    state.backgroundId = settings.backgroundId === "classic" ? "classic" : "westlake";
    const feed = Math.max(0, Math.floor(Number(viewModel.feed) || 0));
    $("#feedBalance").textContent = String(feed);
    $("#dockFeedBalance").textContent = String(feed);
    $("#shopFeedBalance").textContent = String(feed);
    updateSoundButton();
    updateBackgroundButton();
    syncSceneEditingMode();
    if (!$("#shopSheet").classList.contains("is-hidden")) renderShopCatalog();
  }

  function catalogItem(kind, itemId) {
    return DEFAULT_CATALOG.find((item) => item.type === kind && item.id === itemId) || null;
  }

  function createCatalogThumb(item) {
    const thumb = document.createElement("span");
    thumb.className = `default-thumb ${item.type === "fish" ? "is-fish" : "is-decor"}`;
    if (item.type === "fish") {
      const x = item.sprite % 2 === 0 ? 0 : 100;
      const y = item.sprite < 2 ? 0 : 100;
      thumb.style.backgroundPosition = `${x}% ${y}%`;
    } else {
      const column = item.sprite % 3;
      const row = Math.floor(item.sprite / 3);
      thumb.style.backgroundPosition = `${column * 50}% ${row * 100}%`;
    }
    return thumb;
  }

  function isShopItemPlaced(kind, itemId) {
    if (kind === "fish") return state.fish.some((fish) => fish.catalogId === itemId);
    return state.memoryObjects.some((object) => object.catalogId === itemId);
  }

  function renderShopCatalog() {
    const catalog = $("#shopCatalog");
    if (!catalog) return;
    catalog.textContent = "";
    const shop = state.coreViewModel && state.coreViewModel.shop;
    if (!shop) return;
    ["decor", "fish"].forEach((kind) => {
      (shop[kind] || []).forEach((shopItem) => {
        const visual = catalogItem(kind, shopItem.id);
        if (!visual) return;
        const card = document.createElement("article");
        card.className = "shop-card";
        card.appendChild(createCatalogThumb(visual));

        const copy = document.createElement("div");
        copy.className = "shop-card-copy";
        const name = document.createElement("strong");
        name.textContent = shopItem.name;
        const type = document.createElement("small");
        type.textContent = kind === "fish" ? "预设鱼" : "鱼缸装饰";
        const price = document.createElement("span");
        price.className = "shop-price";
        const currentPrice = document.createElement("b");
        currentPrice.textContent = `${shopItem.price} 藻币`;
        price.appendChild(currentPrice);
        if (shopItem.newPlayerDiscount) {
          const original = document.createElement("del");
          original.textContent = String(shopItem.originalPrice);
          price.appendChild(original);
        }
        copy.append(name, type, price);

        const action = document.createElement("button");
        action.type = "button";
        action.className = "shop-action";
        action.dataset.shopAction = `${kind}:${shopItem.id}`;
        const placed = isShopItemPlaced(kind, shopItem.id);
        if (!shopItem.owned) {
          action.textContent = shopItem.affordable ? "购买" : "藻币不足";
          action.disabled = !shopItem.affordable;
        } else if (placed) {
          action.textContent = "已放入";
          action.disabled = true;
        } else {
          action.textContent = "放入鱼缸";
        }
        action.addEventListener("click", () => handleShopAction(kind, shopItem.id));
        card.append(copy, action);
        catalog.appendChild(card);
      });
    });
  }

  async function handleShopAction(kind, itemId) {
    if (!aquariumApi) return;
    const shop = state.coreViewModel && state.coreViewModel.shop;
    const item = shop && (shop[kind] || []).find((entry) => entry.id === itemId);
    if (!item) return;
    if (!item.owned) {
      const result = await aquariumApi.purchaseUnlock(kind, itemId);
      if (!result.ok) {
        showError(result.message);
        return;
      }
      renderCoreViewModel(result.viewModel);
      renderShopCatalog();
      if (state.tutorial) {
        state.tutorial.signal(kind === "decor" ? "purchaseDecor" : "purchaseFish", {
          itemId
        });
      }
      showStory(`${item.name}已经进入“已拥有”，现在把它放进鱼缸吧。`);
      return;
    }
    const visual = catalogItem(kind, itemId);
    if (!visual || isShopItemPlaced(kind, itemId)) return;
    await addDefaultAsset(visual, { fromShop: true });
    closeShop();
    if (state.tutorial) {
      state.tutorial.signal(kind === "decor" ? "placeDecor" : "placeFish", { itemId });
    }
    if (aquariumApi) {
      if (kind === "fish") {
        const newcomer = state.fish.find((fish) => fish.catalogId === itemId);
        if (newcomer && state.aquariumCore) {
          await state.aquariumCore.notifyFishAdded(newcomer.id);
        }
      }
      const saved = await aquariumApi.saveNow();
      renderCoreViewModel(saved.viewModel || aquariumApi.getViewModel());
    }
    if (kind === "fish") {
      const companion = state.fish.find((fish) => fish.id === "fish-1");
      const newcomer = state.fish.find((fish) => fish.catalogId === itemId);
      if (companion && newcomer) {
        const midpoint = {
          x: clamp((companion.x + newcomer.x) / 2, 0.18, 0.82),
          y: clamp((companion.y + newcomer.y) / 2, 0.22, 0.72)
        };
        companion.wanderTarget = { ...midpoint };
        newcomer.wanderTarget = { ...midpoint };
        companion.curiousUntil = performance.now() + 6500;
        newcomer.curiousUntil = performance.now() + 6500;
      }
    }
  }

  function selectShopTab(tab) {
    const selectedTab = ["decor", "fish", "capacity"].includes(tab)
      ? tab
      : "decor";
    $$('[data-shop-tab]').forEach((button) => {
      const selected = button.dataset.shopTab === selectedTab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    ["decor", "fish", "capacity"].forEach((name) => {
      const panel = $(`#shop${name[0].toUpperCase()}${name.slice(1)}Panel`);
      if (panel) panel.classList.toggle("is-hidden", name !== selectedTab);
    });
  }

  function openShop() {
    if (state.selectedFishId) finishFishEditing(false);
    if (state.selectedDecorId) finishDecorEditing(false);
    if (!sheet.classList.contains("is-hidden")) closeSheet();
    $("#shopSheet").classList.remove("is-hidden");
    dock.classList.add("is-hidden");
    if ($("#shopCatalog")) renderShopCatalog();
    if (state.tutorial) state.tutorial.signal("openShop");
    const tutorialStep = state.tutorial && state.tutorial.getState().step;
    selectShopTab(tutorialStep === "buy-fish" ? "fish" : "decor");
    renderTutorialStep();
  }

  function closeShop() {
    $("#shopSheet").classList.add("is-hidden");
    if (!state.viewing && $("#maturityChoiceSheet").classList.contains("is-hidden")) {
      dock.classList.remove("is-hidden");
    }
    if (state.tutorial) state.tutorial.signal("closeShop");
    renderTutorialStep();
  }

  function clearTutorialFocus() {
    $$(".tutorial-focus").forEach((element) => element.classList.remove("tutorial-focus"));
  }

  function focusTutorialTarget(selector) {
    clearTutorialFocus();
    if (!selector) return;
    const target = $(selector);
    if (target) target.classList.add("tutorial-focus");
  }

  function tutorialPresentation(step) {
    const shopOpen = !$("#shopSheet").classList.contains("is-hidden");
    const entries = {
      welcome: {
        progress: "1 / 10",
        title: "欢迎来到你的鱼缸",
        body: "先送你 200 枚启动藻币。在线时会持续积累，离开以后也会挂机获得，最多结算 8 小时。",
        stats: "鱼越多、亲密度越高，藻币赚得越多",
        primary: "开始布置",
        action: "continue",
        target: "#resourcePill"
      },
      "shop-decor": {
        progress: "2 / 10",
        title: "先添一件装饰",
        body: "鱼缸现在还很空。点击右上角商店，看看为新住客准备的折扣商品。",
        target: "#shopButton"
      },
      "buy-decor": {
        progress: "3 / 10",
        title: "购买新手折扣石洞",
        body: shopOpen ? "石洞从 20 枚降到 10 枚藻币。点击购买，它会先进入“已拥有”。" : "重新打开商店，继续购买新手折扣石洞。",
        target: shopOpen ? '[data-unlock-kind="decor"][data-unlock-id="stone-cave"]' : "#shopButton"
      },
      "close-decor-shop": {
        progress: "3 / 10",
        title: "先关闭商店",
        body: "石洞已经进入收藏。点击右上角的关闭按钮，回到鱼缸。",
        target: "#shopCloseButton"
      },
      "open-decor-add": {
        progress: "3 / 10",
        title: "打开放入面板",
        body: "现在点击右侧的“放入”，去找刚买到的石洞。",
        target: "#addButton"
      },
      "open-decor-collection": {
        progress: "3 / 10",
        title: "打开已有收藏",
        body: "在放入面板顶部点击“已有收藏”，就能看到买到的物品。",
        target: 'button[data-add-source="collection"]'
      },
      "place-decor": {
        progress: "3 / 10",
        title: "把石洞放进鱼缸",
        body: "石洞已经进入收藏。请在“已有收藏”里点击石洞，把它放进鱼缸。",
        target: '[data-default-id="stone-cave"]'
      },
      "select-decor": {
        progress: "4 / 10",
        title: "长按选中石洞",
        body: "等石洞沉到水底停稳后，长按石洞，就能打开布置工具。",
        target: "#tank"
      },
      "adjust-decor": {
        progress: "4 / 10",
        title: "调整大小和位置",
        body: "拖动石洞可以移动位置，拖动“大小”滑杆可以放大或缩小。调整好后点击完成。",
        target: "#objectEditor"
      },
      "shop-fish": {
        progress: "5 / 10",
        title: "再迎接一条新鱼",
        body: "装饰已经在下沉了。再次打开商店，为月白找一位新邻居。",
        target: "#shopButton"
      },
      "buy-fish": {
        progress: "6 / 10",
        title: "购买铜蓝斗鱼",
        body: shopOpen ? "铜蓝斗鱼享受新手折扣，只需要 30 枚藻币。" : "重新打开商店，继续购买铜蓝斗鱼。",
        target: shopOpen ? '[data-unlock-kind="fish"][data-unlock-id="betta"]' : "#shopButton"
      },
      "place-fish": {
        progress: "6 / 10",
        title: "让新邻居入缸",
        body: "铜蓝斗鱼已经进入收藏。请在“已有收藏”里点击它，让新邻居正式入缸。",
        target: '[data-default-id="betta"]'
      },
      event: {
        progress: "7 / 10",
        title: "一次新的相遇",
        body: "鱼或物品进入鱼缸时，可能触发不同的关系事件。刚才，铜蓝斗鱼已经记住了月白。",
        primary: "看看月白",
        action: "continue"
      },
      feed: {
        progress: "8 / 10",
        title: "投喂月白一次",
        body: "亲密度越高、活跃鱼越多，在线和离线挂机越快。现在投喂月白一次，每次投喂需要 4 枚藻币。",
        target: "#feedButton"
      },
      photo: {
        progress: "10 / 10",
        title: "把现实里的东西也带进来",
        body: "最后试试自由拍照。你可以拍摄或从相册选择一件真实物品，抠图后让它成为鱼或水下摆件。",
        primary: "以后再拍",
        action: "skipPhoto",
        target: "#addButton"
      }
    };
    return entries[step] || null;
  }

  function renderTutorialStep() {
    if (!state.tutorial) return;
    const tutorialState = state.tutorial.getState();
    const entryScreen = $("#entryScreen");
    const layer = $("#tutorialLayer");
    const isEntry = tutorialState.step === "entry";
    const isHidden = tutorialState.complete || tutorialState.step === "maturity";
    entryScreen.classList.toggle("is-hidden", !isEntry);
    entryScreen.setAttribute("aria-hidden", String(!isEntry));
    layer.classList.toggle("is-hidden", isEntry || isHidden);
    layer.setAttribute("aria-hidden", String(isEntry || isHidden));
    clearTutorialFocus();
    if (isEntry || isHidden) return;
    const view = tutorialPresentation(tutorialState.step);
    if (!view) return;
    $("#tutorialProgress").textContent = view.progress;
    $("#tutorialTitle").textContent = view.title;
    $("#tutorialBody").textContent = view.body;
    const stats = $("#tutorialStats");
    stats.textContent = view.stats || "";
    stats.classList.toggle("is-hidden", !view.stats);
    const primary = $("#tutorialPrimaryButton");
    primary.textContent = view.primary || "继续";
    primary.dataset.tutorialAction = view.action || "";
    primary.classList.toggle("is-hidden", !view.primary);
    $("#tutorialSkipButton").textContent = tutorialState.step === "photo"
      ? "结束引导"
      : "跳过引导";
    window.requestAnimationFrame(() => focusTutorialTarget(view.target));
  }

  function setupTutorial() {
    if (!tutorialModule || typeof tutorialModule.createTutorial !== "function") return;
    state.tutorial = tutorialModule.createTutorial({
      onChange: renderTutorialStep
    });
    renderTutorialStep();
  }

  function continueTutorialForMatureCompanion(viewModel = state.coreViewModel) {
    if (!state.tutorial) return false;
    const step = state.tutorial.getState().step;
    if (!["feed", "maturity"].includes(step)) return false;
    const companion = viewModel && (viewModel.fishCards || [])
      .find((fish) => fish.id === "fish-1");
    if (!companion || !companion.mature) return false;
    if (step === "feed") {
      state.tutorial.signal("maturityReady", { fishId: "fish-1" });
    }
    if (companion.maturityChoice) {
      state.tutorial.signal("maturityResolved", { fishId: "fish-1" });
      renderTutorialStep();
      return true;
    }
    openMaturityChoice("fish-1");
    return true;
  }

  function resumeTutorialAfterInit() {
    if (!state.tutorial) return;
    const step = state.tutorial.getState().step;
    if (["buy-decor", "buy-fish"].includes(step)) {
      openShop();
      return;
    }
    if (step === "close-decor-shop") {
      openShop();
      return;
    }
    if (step === "open-decor-collection") {
      openSheet();
      return;
    }
    if (["place-decor", "place-fish"].includes(step)) {
      openSheet();
      selectAddSource("collection");
      return;
    }
    if (step === "adjust-decor") {
      state.tutorial.setStep("select-decor");
      return;
    }
    if (["feed", "maturity"].includes(step)) {
      continueTutorialForMatureCompanion();
    }
    renderTutorialStep();
  }

  function paintMaturityFish(canvas, image, sprite = null) {
    const context = canvas.getContext("2d");
    if (!context || !image) return;
    const sourceWidth = sprite === null ? image.naturalWidth : image.naturalWidth / 2;
    const sourceHeight = sprite === null ? image.naturalHeight : image.naturalHeight / 2;
    const sourceX = sprite === null ? 0 : (sprite % 2) * sourceWidth;
    const sourceY = sprite === null ? 0 : (sprite < 2 ? 0 : sourceHeight);
    const padding = 12;
    const scale = Math.min(
      (canvas.width - padding * 2) / sourceWidth,
      (canvas.height - padding * 2) / sourceHeight
    );
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      (canvas.width - drawWidth) / 2,
      (canvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }

  function renderMaturityFish(fishCard) {
    const canvas = $("#maturityFishImage");
    const sceneFish = state.fish.find((fish) => fish.id === fishCard?.id);
    const fish = sceneFish || fishCard || {};
    let image = null;
    let sprite = null;

    if (fish.assetKind === "custom-fish" && fish.imageKey) {
      image = state.memoryImages.get(fish.imageKey) || state.art.fallbackFish;
    } else if (fish.assetKind === "preset-image-fish") {
      image = resolvePresetFishImage(fish) || state.art.fallbackFish;
    } else {
      image = fish.atlas === "default" ? state.art.defaultFish : state.art.fish;
      sprite = clamp(Math.floor(Number(fish.sprite) || 0), 0, 3);
    }

    canvas.setAttribute("aria-label", `${fishCard?.name || fish.name || "这条鱼"}的图片`);
    if (!image) return;
    if (image.complete && image.naturalWidth) {
      paintMaturityFish(canvas, image, sprite);
      return;
    }
    image.addEventListener("load", () => paintMaturityFish(canvas, image, sprite), {
      once: true
    });
  }

  function openMaturityChoice(fishId) {
    const fish = state.coreViewModel && (state.coreViewModel.fishCards || [])
      .find((item) => item.id === fishId);
    state.pendingMaturityFishId = fishId;
    const fishName = fish && fish.name || "月白";
    $("#maturityFishName").textContent = fishName;
    renderMaturityFish(fish);
    $("#maturityChoiceSheet").classList.remove("is-hidden");
    syncSceneEditingMode();
    renderTutorialStep();
  }

  async function resolveMaturityChoice(choice) {
    const fishId = state.pendingMaturityFishId || "fish-1";
    $("#stayButton").disabled = true;
    $("#journeyButton").disabled = true;
    const result = await aquariumApi.chooseMaturity(fishId, choice);
    $("#stayButton").disabled = false;
    $("#journeyButton").disabled = false;
    if (!result.ok) {
      showError(result.message);
      return;
    }
    renderCoreViewModel(result.viewModel);
    $("#maturityChoiceSheet").classList.add("is-hidden");
    state.pendingMaturityFishId = null;
    syncSceneEditingMode();
    if (state.tutorial) state.tutorial.signal("maturityResolved", { fishId });
    showStory(choice === "journey"
      ? "月白向熟悉的水光摆了摆尾，带着这里的故事开始远游。"
      : "月白选择留下。它绕着鱼缸慢慢游了一圈，又回到了你身边。");
    renderTutorialStep();
  }

  function renderDefaultCatalog() {
    const catalog = $("#defaultCatalog");
    catalog.textContent = "";
    const shopItems = [
      ...(state.shopView.fish || []).map((item) => ({ ...item, type: "fish" })),
      ...(state.shopView.decor || []).map((item) => ({ ...item, type: "decor" }))
    ];
    const shopByKey = new Map(
      shopItems.map((item) => [`${item.type}:${item.id}`, item])
    );
    DEFAULT_CATALOG.filter((item) => shopByKey.has(`${item.type}:${item.id}`))
      .forEach((item) => {
      const shopItem = shopByKey.get(`${item.type}:${item.id}`);
      const quantity = Math.max(
        0,
        Math.floor(Number(
          shopItem.quantity == null && shopItem.owned ? 1 : shopItem.quantity
        ) || 0)
      );
      const presetImageMissing = item.assetKind === "preset-image-fish"
        && state.artReady
        && !state.art[item.artKey];
      const presetDecorMissing = item.assetKind === "preset-image-decor"
        && state.artReady
        && !state.art[item.artKey];
      const button = document.createElement("button");
      button.className = "default-card";
      button.type = "button";
      button.dataset.defaultId = item.id;
      button.dataset.ownedQuantity = String(quantity);
      button.disabled = quantity <= 0 || presetImageMissing || presetDecorMissing;
      button.style.position = "relative";
      button.setAttribute(
        "aria-label",
        presetImageMissing || presetDecorMissing
          ? `${item.name}，素材加载失败，请重启试试`
          : `${item.name}，拥有 ${quantity} 个${quantity > 0 ? "，点击放入" : "，请先在商店购买"}`
      );

      const thumb = document.createElement("span");
      thumb.className = `default-thumb ${
        item.type === "fish"
          ? item.assetKind === "preset-image-fish"
            ? "is-fish is-image-fish"
            : "is-fish"
          : item.atlas === "surface-plants"
            ? "is-surface-plant"
            : "is-decor"
      }`;
      if (item.assetKind === "preset-image-fish" || item.assetKind === "preset-image-decor") {
        thumb.style.backgroundImage = `url("${item.imageUrl}")`;
        thumb.style.backgroundPosition = "center";
        thumb.style.backgroundSize = "contain";
        if (presetImageMissing || presetDecorMissing) {
          thumb.classList.add("is-missing");
          thumb.textContent = "素材加载失败";
          Object.assign(thumb.style, {
            display: "flex",
            padding: "5px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            backgroundImage: "none",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            color: "rgba(232, 243, 236, 0.58)",
            fontSize: "8px",
            lineHeight: "1.35",
            textAlign: "center"
          });
        }
      } else if (item.type === "fish") {
        const x = item.sprite % 2 === 0 ? 0 : 100;
        const y = item.sprite < 2 ? 0 : 100;
        thumb.style.backgroundPosition = `${x}% ${y}%`;
      } else {
        const column = item.sprite % 3;
        const row = Math.floor(item.sprite / 3);
        thumb.style.backgroundPosition = `${column * 50}% ${row * 100}%`;
      }

      const name = document.createElement("strong");
      name.textContent = item.name;
      const count = document.createElement("span");
      count.className = "catalog-count-badge";
      count.textContent = String(quantity);
      count.setAttribute("aria-hidden", "true");
      Object.assign(count.style, {
        position: "absolute",
        right: "6px",
        bottom: "5px",
        minWidth: "18px",
        height: "18px",
        padding: "0 5px",
        borderRadius: "9px",
        background: quantity > 0 ? "rgba(20, 55, 48, 0.9)" : "rgba(55, 61, 60, 0.7)",
        color: "#fff",
        fontSize: "11px",
        lineHeight: "18px",
        textAlign: "center",
        pointerEvents: "none"
      });
      button.append(thumb, name, count);
      button.addEventListener("click", () => awaitOrIgnore(addDefaultAsset(item)));
      catalog.append(button);
    });
  }

  function createEntryForState(objectState) {
    const isBottom = objectState === "bottom";
    const isSurface = objectState === "surface";
    return {
      phase: "falling",
      startedAt: performance.now(),
      fromY: -0.1,
      targetY: isBottom ? 0.83 : isSurface ? WATERLINE_RATIO : 0.52,
      duration: isBottom ? 1900 : isSurface ? 1350 : 1550
    };
  }

  async function addDefaultAsset(item, options = {}) {
    const fromShop = Boolean(options.fromShop);
    if (!state.aquariumCore) {
      showError("鱼缸还在准备中，请稍后再试。");
      return;
    }
    if (
      (item.assetKind === "preset-image-fish" || item.assetKind === "preset-image-decor")
      && !state.art[item.artKey]
    ) {
      showError("素材加载失败，请重启试试。");
      return;
    }
    const consumed = await state.aquariumCore.consumeOwnedCatalogItem(item.type, item.id);
    if (!consumed.ok) {
      showError(consumed.message);
      renderDefaultCatalog();
      return;
    }
    if (item.type === "fish") {
      const sizes = [0.135, 0.11, 0.132, 0.122];
      const isImagePreset = item.assetKind === "preset-image-fish";
      const fish = createPlaceholderFish({
        id: `preset-fish-${item.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: item.name,
        x: 0.48,
        y: 0.42 + Math.random() * 0.12,
        baseY: 0.46,
        size: item.defaultSize || sizes[item.sprite] || 0.115,
        dir: Math.random() < 0.5 ? -1 : 1,
        sprite: Number.isFinite(Number(item.sprite)) ? item.sprite : 0,
        atlas: isImagePreset ? "original" : "default",
        assetKind: isImagePreset ? "preset-image-fish" : "atlas-fish",
        catalogId: item.id,
        artKey: item.artKey || null,
        iconUrl: item.imageUrl || "",
        aspectRatio: item.aspectRatio || null,
        motionProfile: item.motionProfile || null,
        source: "preset",
        custom: false
      });
      fish.custom = false;
      fish.source = "preset";
      state.fish.push(fish);
      saveState();
      await state.aquariumCore.saveNow();
      if (fromShop) return fish;
      await state.aquariumCore.notifyFishAdded(fish.id);
      closeSheet();
      resetSheetForm();
      showStory(`${fish.name}游进了鱼缸。`);
      if (soundManager) soundManager.play("splash");
      return fish;
    }

    const object = {
      id: `default-object-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: item.name,
      x: 0.5,
      y: -0.1,
      scale: item.state === "surface" ? 1.45 : 1.35,
      state: item.state,
      lockedState: item.state,
      assetKind: item.assetKind === "preset-image-decor"
        ? "preset-image-decor"
        : item.atlas === "surface-plants"
          ? "surface-plant"
          : "default-decor",
      artKey: item.artKey || null,
      iconUrl: item.imageUrl || "",
      aspectRatio: item.aspectRatio || null,
      sprite: item.sprite,
      catalogId: item.id,
      tags: ["默认素材", item.rule],
      createdAt: Date.now(),
      entry: createEntryForState(item.state),
      entryOffsetX: 0,
      entryTilt: 0
    };
    state.memoryObjects.push(object);
    state.memoryObject = object;
    saveState();
    await state.aquariumCore.saveNow();
    if (fromShop) return object;
    closeSheet();
    resetSheetForm();
    showStory(item.state === "surface"
      ? `${item.name}落入水中，正在慢慢浮向水面……`
      : `${item.name}正从鱼缸顶部缓缓沉下……`);
    return object;
  }

  function eventAnchorForParticipants(participantIds) {
    const positions = (Array.isArray(participantIds) ? participantIds : [])
      .map(coreEntityPosition)
      .filter(Boolean);
    if (!positions.length) return { x: 0.5, y: 0.35 };
    const total = positions.reduce((sum, position) => ({
      x: sum.x + position.x,
      y: sum.y + position.y
    }), { x: 0, y: 0 });
    return {
      x: clamp(total.x / positions.length, 0.08, 0.92),
      y: clamp(total.y / positions.length, 0.16, 0.84)
    };
  }

  function eventFocusForParticipants(participantIds) {
    return (Array.isArray(participantIds) ? participantIds : []).map((entityId) => {
      const entity = state.fish.find((fish) => fish.id === entityId)
        || state.memoryObjects.find((object) => object.id === entityId);
      const position = coreEntityPosition(entityId) || { x: 0.5, y: 0.5 };
      const bounds = entity && entity.renderBounds;
      return {
        id: entityId,
        x: clamp(position.x, 0.02, 0.98),
        y: clamp(position.y, 0.04, 0.96),
        width: clamp(bounds && bounds.w / Math.max(1, state.width), 0.065, 0.34),
        height: clamp(bounds && bounds.h / Math.max(1, state.height), 0.08, 0.42)
      };
    });
  }

  function isFishPausedForEvent(fish) {
    return Boolean(fish && state.eventPausedFishIds.has(fish.id));
  }

  function holdFishAtEventAnchor(fish) {
    if (!fish.eventPauseAnchor) {
      fish.eventPauseAnchor = { x: fish.x, y: fish.y };
    }
    fish.x = fish.eventPauseAnchor.x;
    fish.y = fish.eventPauseAnchor.y;
  }

  function setEventPausedFishIds(fishIds) {
    const nextIds = new Set(
      (Array.isArray(fishIds) ? fishIds : []).filter(Boolean)
    );
    const now = performance.now();
    state.eventPausedFishIds = nextIds;
    state.fish.forEach((fish) => {
      if (nextIds.has(fish.id)) {
        if (!fish.eventPauseAnchor) {
          fish.eventPauseAnchor = { x: fish.x, y: fish.y };
          fish.targetFoodId = null;
          fish.hiddenUntil = 0;
          fish.behindCoverUntil = 0;
          fish.escapeUntil = 0;
          fish.escapeTarget = null;
          fish.fearUntil = 0;
          fish.fearTarget = null;
          clearFishCoverManeuver(fish);
        }
        holdFishAtEventAnchor(fish);
        return;
      }
      if (!fish.eventPauseAnchor) return;
      delete fish.eventPauseAnchor;
      fish.behaviorUntil = 0;
      fish.nextBehaviorHint = "coast";
      chooseNextFishBehavior(fish, now);
    });
  }

  globalThis.MemoryAquariumCanvas = {
    setShopView(shop) {
      state.shopView = shop && typeof shop === "object"
        ? shop
        : { decor: [], fish: [] };
      renderDefaultCatalog();
    },
    setEventPausedFishIds,
    getEventFocus: eventFocusForParticipants,
    getEventAnchor: eventAnchorForParticipants
  };

  function openSheet() {
    if (state.selectedFishId) finishFishEditing(false);
    if (state.selectedDecorId) finishDecorEditing(false);
    resetSheetForm();
    selectAddSource("album");
    sheet.classList.remove("is-hidden");
    $(".sheet-panel").scrollTop = 0;
    dock.classList.add("is-hidden");
    state.editing = false;
    editor.classList.add("is-hidden");
    if (state.tutorial) state.tutorial.signal("openAdd");
    renderTutorialStep();
  }

  function closeSheet() {
    cancelCutoutProcessing(true);
    sheet.classList.add("is-hidden");
    if (!state.viewing) dock.classList.remove("is-hidden");
    resetSheetForm();
  }

  function setCutoutView(view) {
    const showResult = view === "result";
    captureView.classList.toggle("is-hidden", showResult);
    resultView.classList.toggle("is-hidden", !showResult);
    $("#sheetTitle").textContent = showResult
      ? "制作透明物品"
      : "放入一件现实中的东西";
    $(".sheet-panel").scrollTop = 0;
  }

  function effectiveCutoutDescription() {
    const explicitDescription = subjectDescription.value.trim();
    if (explicitDescription) return explicitDescription;
    const objectName = objectNameInput.value.trim();
    if (objectName) return objectName;
    return {
      person: "图片中的人物",
      animal: "图片中的动物",
      plant: "图片中的植物",
      other: "图片中的主体"
    }[subjectType.value] || "";
  }

  function updateGenerateButtonState() {
    cutoutSession.update({
      description: effectiveCutoutDescription(),
      subjectType: subjectType.value,
      name: objectNameInput.value,
      placement: state.selectedState
    });
    generateCutoutButton.disabled = !cutoutSession.snapshot().canGenerate;
  }

  function selectNewState(value) {
    state.selectedState = value;
    cutoutSession.update({ placement: value });
    $$("[data-new-state]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.newState === value);
    });
    updateGenerateButtonState();
  }

  function selectAddSource(source) {
    const selectedSource = source === "collection" ? "collection" : "album";
    captureView.dataset.addSource = selectedSource;
    $$("[data-add-source]").forEach((button) => {
      const selected = button.dataset.addSource === selectedSource;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const details = $(".memory-details");
    if (selectedSource === "album" && details) details.open = false;
    if (selectedSource === "collection" && state.tutorial) {
      state.tutorial.signal("openCollection");
      renderTutorialStep();
    }
  }

  function copyCutoutCanvas(source) {
    cutoutResult.width = source.width;
    cutoutResult.height = source.height;
    const context = cutoutResult.getContext("2d");
    if (!context) throw new Error("暂时无法显示透明物品");
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(source, 0, 0);
  }

  async function generateCutout() {
    updateGenerateButtonState();
    if (!cutoutSession.snapshot().canGenerate) return;

    const controller = new AbortController();
    state.requestController = controller;
    cutoutSession.beginGeneration();
    setCutoutView("result");
    processingState.classList.remove("is-hidden");
    resultContent.classList.add("is-hidden");
    resultError.classList.add("is-hidden");
    $("#backToCaptureButton").disabled = true;
    $("#cancelCutoutButton").classList.remove("is-hidden");
    confirmAddButton.disabled = true;
    sheetStatus.textContent = "AI 正在参考原图生成透明物品…";
    sourcePreview.src = state.selectedFileUrl;

    try {
      const result = await cutoutApi.generateTransparentCutout({
        file: state.selectedFile,
        description: effectiveCutoutDescription(),
        subjectType: subjectType.value,
        signal: controller.signal
      });
      if (state.requestController !== controller) return;
      copyCutoutCanvas(result.canvas);
      cutoutSession.resolveGeneration(result);
      processingState.classList.add("is-hidden");
      resultContent.classList.remove("is-hidden");
      resultSummary.textContent = `${
        objectNameInput.value.trim() || result.targetLabel || "没有名字的东西"
      } · ${
        {
          fish: "一条鱼",
          bottom: "沉底摆件",
          suspended: "悬浮摆件",
          surface: "漂浮摆件"
        }[state.selectedState]
      }`;
      sheetStatus.textContent = "透明物品已经准备好了。";
      confirmAddButton.disabled = false;
    } catch (error) {
      if (state.requestController !== controller) return;
      const message = error && error.name === "AbortError"
        ? "已取消本次制作，可以返回修改后重试。"
        : `这次没有生成成功：${error && error.message ? error.message : "请稍后重试"}`;
      cutoutSession.failGeneration(message);
      processingState.classList.add("is-hidden");
      resultContent.classList.add("is-hidden");
      resultError.textContent = message;
      resultError.classList.remove("is-hidden");
      sheetStatus.textContent = "";
    } finally {
      if (state.requestController === controller) {
        state.requestController = null;
        $("#backToCaptureButton").disabled = false;
        $("#cancelCutoutButton").classList.add("is-hidden");
      }
    }
  }

  function cancelCutoutProcessing(discard = false) {
    if (state.requestController) {
      state.requestController.abort();
      if (discard) state.requestController = null;
    }
  }

  function backToCapture() {
    cancelCutoutProcessing(true);
    cutoutSession.backToCapture();
    setCutoutView("capture");
    captureStatus.textContent = "可以修改图片或描述后重新生成。";
    updateGenerateButtonState();
  }

  async function addSelectedObject() {
    let payload;
    try {
      payload = cutoutSession.createPlacementPayload();
    } catch (error) {
      showError(error.message);
      return;
    }

    confirmAddButton.disabled = true;
    sheetStatus.textContent = "正在把透明物品放进鱼缸…";

    try {
      const objectId = `memory-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const imageKey = `memory-image-${objectId}`;
      await putImageBlob(payload.transparentBlob, imageKey);
      const image = await blobToImage(payload.transparentBlob);
      state.memoryImages.set(imageKey, image);
      const motion = analyzeImageMotion(image);

      if (payload.placement === "fish") {
        const fish = createPlaceholderFish({
          id: `custom-fish-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: payload.name,
          x: 0.5,
          y: 0.46,
          baseY: 0.46,
          dir: Math.random() < 0.5 ? -1 : 1,
          assetKind: "custom-fish",
          imageKey,
          aspectRatio: motion.aspectRatio,
          motionProfile: motion.motionProfile
        });
        state.fish.push(fish);
        saveState();
        closeSheet();
        showStory(`${fish.name}游进了鱼缸。`);
        if (soundManager) soundManager.play("splash");
        return;
      }

      const isBottomObject = payload.placement === "bottom";
      const isSurfaceObject = payload.placement === "surface";
      const object = {
        id: objectId,
        name: payload.name,
        x: 0.5,
        y: -0.1,
        scale: 1,
        state: payload.placement,
        assetKind: "custom",
        imageKey,
        aspectRatio: motion.aspectRatio,
        motionProfile: motion.motionProfile,
        tags: ["现实物品", payload.targetLabel].filter(Boolean),
        createdAt: Date.now(),
        entry: createEntryForState(payload.placement),
        entryOffsetX: 0,
        entryTilt: 0
      };
      state.memoryObjects.push(object);
      state.memoryObject = object;
      saveState();
      closeSheet();
      showStory(isBottomObject
        ? `${object.name}从水面落了下来……`
        : isSurfaceObject
          ? `${object.name}落进水面，随后浮了起来……`
          : `${object.name}慢慢进入水中……`);
      if (soundManager) soundManager.play("splash");
    } catch (error) {
      console.error(error);
      sheetStatus.textContent = "";
      showError("这张图片暂时没能进入鱼缸，请换一张再试试。");
      confirmAddButton.disabled = false;
    }
  }

  function resetSheetForm() {
    cutoutSession.reset();
    state.selectedFile = null;
    if (state.selectedFileUrl) {
      URL.revokeObjectURL(state.selectedFileUrl);
      state.selectedFileUrl = "";
    }
    fileInput.value = "";
    imagePreview.removeAttribute("src");
    imagePreview.classList.add("is-hidden");
    pickerEmpty.classList.remove("is-hidden");
    replaceImageHint.classList.add("is-hidden");
    sourcePreview.removeAttribute("src");
    subjectDescription.value = "";
    subjectType.value = "";
    objectNameInput.value = "";
    cutoutResult.width = 1;
    cutoutResult.height = 1;
    processingState.classList.remove("is-hidden");
    resultContent.classList.add("is-hidden");
    resultError.classList.add("is-hidden");
    resultError.textContent = "";
    captureStatus.textContent = "先拍摄或选择一张图片吧。";
    sheetStatus.textContent = "";
    confirmAddButton.disabled = true;
    $("#cancelCutoutButton").classList.add("is-hidden");
    setCutoutView("capture");
    selectNewState("fish");
  }

  function startEditing(object = state.memoryObject) {
    if (!object) return;
    if (object.entry && object.entry.phase === "falling") {
      showStory("等它先在水里停稳，再长按调整位置。");
      return;
    }
    state.memoryObject = object;
    if (state.selectedFishId) finishFishEditing(false);
    if (state.selectedDecorId) finishDecorEditing(false);
    state.editing = true;
    syncSceneEditingMode();
    editor.classList.remove("is-hidden");
    dock.classList.add("is-hidden");
    scaleRange.value = String(state.memoryObject.scale);
    updateEditorState();
    syncCanvasSelection();
    if (state.tutorial) {
      state.tutorial.signal("selectDecor", { itemId: object.catalogId });
      renderTutorialStep();
    }
  }

  function fishAtPoint(point) {
    const px = point.x * state.width;
    const py = point.y * state.height;
    const candidates = state.fish.filter((fish) => {
      const bounds = fish.renderBounds;
      return bounds
        && Math.abs(px - bounds.x) <= bounds.w * 0.58
        && Math.abs(py - bounds.y) <= bounds.h * 0.68;
    });
    if (!candidates.length) return null;
    return candidates.reduce((closest, fish) => {
      const distance = Math.hypot(px - fish.renderBounds.x, py - fish.renderBounds.y);
      return !closest || distance < closest.distance ? { fish, distance } : closest;
    }, null).fish;
  }

  function decorAtPoint(point) {
    const px = point.x * state.width;
    const py = point.y * state.height;
    const candidates = state.sceneDecor.filter((decor) => {
      const bounds = decor.renderBounds;
      return bounds
        && Math.abs(px - bounds.x) <= bounds.w * 0.56
        && Math.abs(py - bounds.y) <= bounds.h * 0.56;
    });
    if (!candidates.length) return null;
    return candidates.reduce((closest, decor) => {
      const distance = Math.hypot(px - decor.renderBounds.x, py - decor.renderBounds.y);
      return !closest || distance < closest.distance ? { decor, distance } : closest;
    }, null).decor;
  }

  function constrainSceneDecor(decor) {
    const width = decor.width * decor.scale;
    const height = decor.height * decor.scale;
    decor.x = clamp(decor.x, 0, Math.max(0, 1 - width));
    decor.y = clamp(decor.y, 0.34, Math.max(0.34, 0.96 - height));
  }

  function openDecorEditor(decor) {
    if (!decor) return;
    if (state.editing) {
      state.editing = false;
      editor.classList.add("is-hidden");
    }
    if (state.selectedFishId) finishFishEditing(false);
    state.selectedDecorId = decor.id;
    syncSceneEditingMode();
    $("#selectedDecorName").textContent = decor.name;
    $("#decorScaleRange").value = String(decor.scale);
    $("#decorEditor").classList.remove("is-hidden");
    dock.classList.add("is-hidden");
    showStory(`${decor.name}已经选中，拖动它就能重新布置鱼缸。`);
    syncCanvasSelection();
  }

  function finishDecorEditing(showMessage = true) {
    if (!state.selectedDecorId) return;
    const decor = state.sceneDecor.find((item) => item.id === state.selectedDecorId);
    cancelLongPress();
    if (state.pointer && state.pointer.kind === "decor") state.pointer = null;
    state.selectedDecorId = null;
    $("#decorEditor").classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing && !state.editing && !state.selectedFishId) dock.classList.remove("is-hidden");
    saveState();
    syncCanvasSelection();
    if (showMessage && decor) showStory(`${decor.name}已经放在新的位置。`);
  }

  function openFishEditor(fish) {
    if (!fish) return;
    if (state.editing) {
      state.editing = false;
      editor.classList.add("is-hidden");
      saveState();
    }
    if (state.selectedDecorId) finishDecorEditing(false);
    if (state.selectedFishId && state.selectedFishId !== fish.id) finishFishEditing(false);
    state.selectedFishId = fish.id;
    syncSceneEditingMode();
    $("#selectedFishName").textContent = fish.name;
    $("#fishScaleRange").value = String(fish.size);
    $("#fishEditor").classList.remove("is-hidden");
    dock.classList.add("is-hidden");
    showStory(`${fish.name}停了下来，正耐心等你帮它调整体型。`);
    syncCanvasSelection();
  }

  function finishFishEditing(showMessage = true) {
    if (!state.selectedFishId) return;
    const fish = state.fish.find((item) => item.id === state.selectedFishId);
    state.selectedFishId = null;
    $("#fishEditor").classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing && !state.editing) dock.classList.remove("is-hidden");
    saveState();
    syncCanvasSelection();
    if (showMessage && fish) showStory(`${fish.name}摆了摆尾巴，又游回了水里。`);
  }

  async function deleteSelectedFish() {
    const fish = state.fish.find((item) => item.id === state.selectedFishId);
    if (!fish) return;
    const deleteButton = $("#deleteFishButton");
    deleteButton.disabled = true;
    if (aquariumApi) {
      const result = await aquariumApi.removeFish(fish.id);
      if (!result.ok) {
        deleteButton.disabled = false;
        showError(result.message);
        return;
      }
      renderCoreViewModel(result.viewModel);
    } else {
      state.fish = state.fish.filter((item) => item.id !== fish.id);
    }
    if (!fish.custom && !state.deletedBaseFishIds.includes(fish.id)) {
      state.deletedBaseFishIds.push(fish.id);
    }
    if (fish.imageKey) {
      state.memoryImages.delete(fish.imageKey);
      deleteImageBlob(fish.imageKey);
    }
    state.selectedFishId = null;
    $("#fishEditor").classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing && !state.editing && !state.selectedDecorId) dock.classList.remove("is-hidden");
    saveState();
    deleteButton.disabled = false;
    showStory(`${fish.name}已经从这个鱼缸中移除。`);
  }

  async function deleteSelectedObject() {
    const object = state.memoryObject;
    if (!object || !state.editing) return;
    const deleteButton = $("#deleteObjectButton");
    deleteButton.disabled = true;
    if (aquariumApi) {
      const result = await aquariumApi.removeObject(object.id);
      if (!result.ok) {
        deleteButton.disabled = false;
        showError(result.message);
        return;
      }
      renderCoreViewModel(result.viewModel);
    } else {
      state.memoryObjects = state.memoryObjects.filter((item) => item.id !== object.id);
    }
    if (object.imageKey) {
      state.memoryImages.delete(object.imageKey);
      deleteImageBlob(object.imageKey);
    }
    state.memoryObject = state.memoryObjects[state.memoryObjects.length - 1] || null;
    state.editing = false;
    editor.classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing) dock.classList.remove("is-hidden");
    saveState();
    deleteButton.disabled = false;
    showStory(`${object.name}已经从鱼缸中移除。`);
  }

  async function deleteSelectedDecor() {
    const decor = state.sceneDecor.find((item) => item.id === state.selectedDecorId);
    if (!decor) return;
    const deleteButton = $("#deleteDecorButton");
    deleteButton.disabled = true;
    if (aquariumApi) {
      const result = await aquariumApi.removeDecor(decor.id);
      if (!result.ok) {
        deleteButton.disabled = false;
        showError(result.message);
        return;
      }
      renderCoreViewModel(result.viewModel);
    } else {
      state.sceneDecor = state.sceneDecor.filter((item) => item.id !== decor.id);
    }
    if (!state.deletedSceneDecorIds.includes(decor.id)) {
      state.deletedSceneDecorIds.push(decor.id);
    }
    state.selectedDecorId = null;
    $("#decorEditor").classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing && !state.editing && !state.selectedFishId) dock.classList.remove("is-hidden");
    saveState();
    deleteButton.disabled = false;
    showStory(`${decor.name}已经从布景中移除。`);
  }

  function cancelLongPress() {
    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
    state.longPressStart = null;
  }

  function beginLongPress(event, point, kind, target) {
    cancelLongPress();
    state.longPressStart = {
      x: event.clientX,
      y: event.clientY,
      point,
      kind,
      target
    };
    state.longPressTimer = window.setTimeout(() => {
      const pending = state.longPressStart;
      cancelLongPress();
      if (!pending) return;
      if (pending.kind === "object") startEditing(pending.target);
      if (pending.kind === "fish") openFishEditor(pending.target);
      if (pending.kind === "decor") openDecorEditor(pending.target);
    }, 520);
  }

  function finishEditing() {
    state.editing = false;
    editor.classList.add("is-hidden");
    syncSceneEditingMode();
    if (!state.viewing) dock.classList.remove("is-hidden");
    saveState();
    if (state.tutorial) {
      state.tutorial.signal("finishDecor");
      renderTutorialStep();
    }
    showStory("放好了。接下来，它会按照自己的方式留在这里。");
  }

  function updateEditorState() {
    $$("[data-state]").forEach((button) => {
      button.classList.toggle("is-selected", state.memoryObject && button.dataset.state === state.memoryObject.state);
      button.disabled = Boolean(
        state.memoryObject
        && state.memoryObject.lockedState
        && button.dataset.state !== state.memoryObject.lockedState
      );
    });
    const lockedState = state.memoryObject && state.memoryObject.lockedState;
    $("#objectRuleHint").textContent = lockedState
      ? `固定属性：${lockedState === "surface" ? "水面漂浮" : "沉底"}`
      : "可切换状态";
  }

  function setObjectState(nextState) {
    if (!state.memoryObject) return;
    if (state.memoryObject.lockedState && nextState !== state.memoryObject.lockedState) return;
    const wasBottom = state.memoryObject.state === "bottom";
    const previousState = state.memoryObject.state;
    state.memoryObject.state = nextState;
    if (nextState === "bottom" && !wasBottom) {
      state.memoryObject.y = 0.83;
    } else if (nextState === "suspended" && previousState !== "suspended") {
      state.memoryObject.y = 0.52;
    } else if (nextState === "surface" && previousState !== "surface") {
      state.memoryObject.y = WATERLINE_RATIO;
    }
    constrainObjectToState(state.memoryObject);
    updateEditorState();
    saveState();
  }

  function toggleViewing() {
    state.viewing = !state.viewing;
    $(".topbar").classList.remove("is-hidden");
    syncSceneEditingMode();
    if (state.viewing) showStory("现在什么都不用做，只要看一会儿鱼。");
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    updateSoundButton();
    saveState();
    if (soundManager) soundManager.setEnabled(state.soundOn);
    if (state.soundOn) playTone(520, 0.1);
  }

  function toggleBackground() {
    state.backgroundId = state.backgroundId === "westlake" ? "classic" : "westlake";
    updateBackgroundButton();
    saveState();
  }

  function updateBackgroundButton() {
    const button = $("#backgroundButton");
    const isWestlake = state.backgroundId === "westlake";
    button.style.opacity = isWestlake ? "1" : "0.62";
    button.setAttribute(
      "aria-label",
      isWestlake ? "当前为西湖远景，点击切换经典背景" : "当前为经典背景，点击切换西湖远景"
    );
    button.title = isWestlake ? "西湖远景" : "经典水景";
  }

  function updateSoundButton() {
    $("#soundButton").style.opacity = state.soundOn ? "1" : "0.5";
    $("#soundButton").setAttribute("aria-label", state.soundOn ? "关闭声音" : "开启声音");
  }

  function updateCatchMusicButton() {
    const button = $("#catchMusicButton");
    if (!button) return;
    button.classList.toggle("is-muted", state.catchGame.musicMuted);
    button.textContent = state.catchGame.musicMuted ? "♩" : "♪";
    button.setAttribute(
      "aria-label",
      state.catchGame.musicMuted ? "开启捕鱼配乐" : "关闭捕鱼配乐"
    );
  }

  function getCatchAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!state.catchAudio.context) {
      state.catchAudio.context = new AudioContextClass();
    }
    if (state.catchAudio.context.state === "suspended") {
      state.catchAudio.context.resume().catch(() => {});
    }
    return state.catchAudio.context;
  }

  function startCatchMusic() {
    stopCatchMusic();
    updateCatchMusicButton();
    if (state.catchGame.musicMuted) return;
    const music = new Audio("/game/assets/music/upbeat-loop.mp3");
    music.loop = true;
    music.preload = "auto";
    music.volume = 0.3;
    state.catchAudio.musicElement = music;
    music.play().catch((error) => {
      console.warn("Catch music unavailable", error);
    });
  }

  function stopCatchMusic() {
    const music = state.catchAudio.musicElement;
    if (music) {
      music.pause();
      music.currentTime = 0;
    }
    state.catchAudio.musicElement = null;
  }

  function toggleCatchMusic() {
    state.catchGame.musicMuted = !state.catchGame.musicMuted;
    updateCatchMusicButton();
    saveState();
    if (!state.catchGame.running) return;
    if (state.catchGame.musicMuted) stopCatchMusic();
    else startCatchMusic();
  }

  function playCatchAccent(isNegative) {
    if (state.catchGame.musicMuted) return;
    const context = getCatchAudioContext();
    if (!context) return;
    const frequencies = isNegative ? [220, 174.61] : [523.25, 659.25, 783.99];
    frequencies.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.055;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = isNegative ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });
  }

  function playCatchSplashSound() {
    if (state.catchGame.musicMuted) return;
    const context = getCatchAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(430, now);
    oscillator.frequency.exponentialRampToValueAtTime(150, now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  function playTone(frequency, duration) {
    if (!state.soundOn || !window.AudioContext) return;
    try {
      const audio = playTone.context || (playTone.context = new AudioContext());
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration + 0.02);
    } catch (error) {
      console.warn("Audio unavailable", error);
    }
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left - state.tankRect.x;
    const localY = event.clientY - rect.top - state.tankRect.y;
    return {
      x: clamp(localX / state.tankRect.width, 0, 1),
      y: clamp(localY / state.tankRect.height, 0, 1),
      inside: localX >= 0
        && localY >= 0
        && localX <= state.tankRect.width
        && localY <= state.tankRect.height
    };
  }

  function hitMemoryObject(point, object = state.memoryObject) {
    const bounds = object && object.renderBounds;
    if (!bounds) return false;
    const px = point.x * state.width;
    const py = point.y * state.height;
    return Math.abs(px - bounds.x) <= bounds.w * 0.65 && Math.abs(py - bounds.y) <= bounds.h * 0.7;
  }

  function memoryObjectAtPoint(point) {
    for (let index = state.memoryObjects.length - 1; index >= 0; index -= 1) {
      const object = state.memoryObjects[index];
      if (hitMemoryObject(point, object)) return object;
    }
    return null;
  }

  function bindEvents() {
    window.addEventListener("resize", resize, { passive: true });
    $("#feedButton").addEventListener("click", feedFish);
    $("#addButton").addEventListener("click", openPhotoFlow);
    $("#viewButton").addEventListener("click", toggleViewing);
    $("#exitViewButton").addEventListener("click", toggleViewing);
    $("#backgroundButton").addEventListener("click", toggleBackground);
    $("#soundButton").addEventListener("click", toggleSound);
    $("#finishEditButton").addEventListener("click", finishEditing);
    $("#finishFishEditButton").addEventListener("click", () => finishFishEditing(true));
    $("#finishDecorEditButton").addEventListener("click", () => finishDecorEditing(true));
    $("#deleteObjectButton").addEventListener("click", deleteSelectedObject);
    $("#deleteFishButton").addEventListener("click", deleteSelectedFish);
    $("#deleteDecorButton").addEventListener("click", deleteSelectedDecor);
    $("#imagePicker").addEventListener("click", () => fileInput.click());
    generateCutoutButton.addEventListener("click", generateCutout);
    $("#backToCaptureButton").addEventListener("click", backToCapture);
    $("#cancelCutoutButton").addEventListener("click", () => {
      cancelCutoutProcessing(false);
    });
    confirmAddButton.addEventListener("click", addSelectedObject);
    $$("[data-close-sheet]").forEach((button) => button.addEventListener("click", closeSheet));
    $$("[data-new-state]").forEach((button) => {
      button.addEventListener("click", () => selectNewState(button.dataset.newState));
    });
    $$("[data-state]").forEach((button) => {
      button.addEventListener("click", () => setObjectState(button.dataset.state));
    });

    scaleRange.addEventListener("input", () => {
      if (state.memoryObject) {
        state.memoryObject.scale = Number(scaleRange.value);
        saveState();
      }
    });

    $("#fishScaleRange").addEventListener("input", (event) => {
      const fish = state.fish.find((item) => item.id === state.selectedFishId);
      if (!fish) return;
      fish.size = clamp(Number(event.target.value), 0.075, 0.17);
      saveState();
    });

    $("#decorScaleRange").addEventListener("input", (event) => {
      const decor = state.sceneDecor.find((item) => item.id === state.selectedDecorId);
      if (!decor) return;
      decor.scale = clamp(Number(event.target.value), 0.6, 1.6);
      constrainSceneDecor(decor);
      saveState();
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        cutoutApi.validateFile(file);
      } catch (error) {
        showError(error.message);
        fileInput.value = "";
        return;
      }
      if (state.selectedFileUrl) {
        URL.revokeObjectURL(state.selectedFileUrl);
      }
      state.selectedFile = file;
      state.selectedFileUrl = URL.createObjectURL(file);
      imagePreview.src = state.selectedFileUrl;
      sourcePreview.src = state.selectedFileUrl;
      imagePreview.classList.remove("is-hidden");
      pickerEmpty.classList.add("is-hidden");
      replaceImageHint.classList.remove("is-hidden");
      cutoutSession.backToCapture();
      cutoutSession.update({ file });
      setCutoutView("capture");
      resultError.classList.add("is-hidden");
      resultError.textContent = "";
      captureStatus.textContent = "图片已准备好，请描述要识别的物品。";
      updateGenerateButtonState();
    });
    subjectDescription.addEventListener("input", updateGenerateButtonState);
    subjectType.addEventListener("change", updateGenerateButtonState);
    objectNameInput.addEventListener("input", updateGenerateButtonState);

    $("#shopButton").addEventListener("click", openShop);
    $$('[data-close-shop]').forEach((button) => button.addEventListener("click", closeShop));
    $("#enterTankButton").addEventListener("click", () => {
      if (state.tutorial) state.tutorial.signal("enter");
    });
    $("#tutorialPrimaryButton").addEventListener("click", (event) => {
      if (!state.tutorial) return;
      const action = event.currentTarget.dataset.tutorialAction;
      if (action) state.tutorial.signal(action);
    });
    $("#tutorialSkipButton").addEventListener("click", () => {
      if (!state.tutorial) return;
      state.tutorial.signal("skip");
      closeShop();
    });
    $("#stayButton").addEventListener("click", () => resolveMaturityChoice("stay"));
    $("#journeyButton").addEventListener("click", () => resolveMaturityChoice("journey"));

    $$("[data-add-source]").forEach((button) => {
      button.addEventListener("click", () => selectAddSource(button.dataset.addSource));
    });

    $("#catchButton").addEventListener("click", openCatchPanel);
    $("#startCatchButton").addEventListener("click", startCatchRound);
    $("#closeCatchPanelButton").addEventListener("click", closeCatchPanel);
    $("#catchPanelCloseButton").addEventListener("click", closeCatchPanel);
    $("#catchPanelBackdrop").addEventListener("click", closeCatchPanel);
    $("#quitCatchButton").addEventListener("click", endCatchRound);
    $("#catchMusicButton").addEventListener("click", toggleCatchMusic);

    canvas.addEventListener("pointerdown", (event) => {
      const point = pointFromEvent(event);
      if (!point.inside) return;
      if (state.catchGame.running) {
        if (event.button === 0 && state.catchGame.phase === "aiming") {
          moveCatchClaw(point.x);
          state.pointer = { ...point, dragging: true, kind: "catch-aim" };
          canvas.setPointerCapture(event.pointerId);
        }
        return;
      }
      if (state.editing && hitMemoryObject(point, state.memoryObject) && event.button === 0) {
        state.pointer = { ...point, dragging: true, kind: "memory" };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      const selectedDecor = state.sceneDecor.find((decor) => decor.id === state.selectedDecorId);
      if (selectedDecor && decorAtPoint(point) === selectedDecor && event.button === 0) {
        state.pointer = { ...point, dragging: true, kind: "decor", targetId: selectedDecor.id };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      const memoryObject = !state.editing ? memoryObjectAtPoint(point) : null;
      if (memoryObject) {
        if (event.button === 0) beginLongPress(event, point, "object", memoryObject);
        return;
      }
      const fish = fishAtPoint(point);
      if (fish && event.button === 2) return;
      if (fish && event.button === 0) {
        beginLongPress(event, point, "fish", fish);
        return;
      }
      const decor = decorAtPoint(point);
      if (decor && event.button === 2) return;
      if (decor && event.button === 0) {
        beginLongPress(event, point, "decor", decor);
        return;
      }
      disturbFish(point.x, point.y);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (state.pointer && state.pointer.kind === "catch-aim") {
        const point = pointFromEvent(event);
        if (point.inside) moveCatchClaw(point.x);
        return;
      }
      if (state.longPressStart) {
        const moved = Math.hypot(
          event.clientX - state.longPressStart.x,
          event.clientY - state.longPressStart.y
        );
        if (moved > 9) cancelLongPress();
      }
      if (!state.pointer || !state.pointer.dragging) return;
      const point = pointFromEvent(event);
      if (!point.inside) return;
      if (state.pointer.kind === "memory" && state.memoryObject) {
        state.memoryObject.x = point.x;
        state.memoryObject.y = point.y;
        constrainObjectToState(state.memoryObject);
      }
      if (state.pointer.kind === "decor") {
        const decor = state.sceneDecor.find((item) => item.id === state.pointer.targetId);
        if (!decor) return;
        const width = decor.width * decor.scale;
        const height = decor.height * decor.scale;
        decor.x = point.x - width / 2;
        decor.y = point.y - height / 2;
        constrainSceneDecor(decor);
      }
    });

    const finishPointer = () => {
      if (state.pointer && state.pointer.kind === "catch-aim") {
        state.pointer = null;
        releaseCatchClaw();
        return;
      }
      cancelLongPress();
      if (state.pointer && state.pointer.dragging) saveState();
      state.pointer = null;
    };
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (state.catchGame.running) return;
      const point = pointFromEvent(event);
      if (!point.inside) return;
      const memoryObject = memoryObjectAtPoint(point);
      if (memoryObject) {
        startEditing(memoryObject);
        return;
      }
      const fish = fishAtPoint(point);
      if (fish) {
        openFishEditor(fish);
        return;
      }
      const decor = decorAtPoint(point);
      if (decor) openDecorEditor(decor);
    });

    window.addEventListener("keydown", (event) => {
      if (!state.catchGame.running || state.catchGame.phase !== "aiming") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveCatchClaw(state.catchGame.claw.x - 0.035);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveCatchClaw(state.catchGame.claw.x + 0.035);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        releaseCatchClaw();
      }
    });

    window.addEventListener("error", (event) => {
      console.error(event.error || event.message);
      showError("哎呀，出错了，请重启试试吧。");
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error(event.reason);
      showError("刚才的操作没有完成，请再试一次。");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && aquariumApi) {
        aquariumApi.saveNow();
      }
    });
    window.addEventListener("pagehide", () => {
      if (state.coreSceneTimer) window.clearInterval(state.coreSceneTimer);
    }, { once: true });
  }

  function openPhotoFlow() {
    if (state.tutorial && state.tutorial.getState().step === "photo") {
      state.tutorial.signal("openPhoto");
    }
    openSheet();
  }

  async function init() {
    try {
      resize();
      seedScene();
      await loadArt();
      loadStoredState();
      if (soundManager) soundManager.init({ enabled: state.soundOn });
      renderDefaultCatalog();
      setupTutorial();
      bindEvents();
      state.db = await openDatabase();
      for (const object of state.memoryObjects) {
        if (
          object.assetKind === "default-decor"
          || object.assetKind === "surface-plant"
          || !object.imageKey
        ) continue;
        await reloadEntityImage(object, "object");
      }
      for (const fish of state.fish) {
        if (fish.assetKind !== "custom-fish" || !fish.imageKey) continue;
        await reloadEntityImage(fish, "fish");
      }
      state.fish.forEach((fish) => {
        fish.reservedCellKey = null;
        fish.targetFoodId = null;
        fish.behaviorUntil = 0;
      });
      saveState();
      await configureAquariumCore();
      resumeTutorialAfterInit();
      requestAnimationFrame(frame);
      if (!state.tutorial || state.tutorial.getState().complete) {
        window.setTimeout(() => {
          showStory("水很安静。它们已经在这里生活了一小会儿。");
        }, 900);
      }
    } catch (error) {
      console.error(error);
      showError("鱼缸启动时遇到问题，请重启试试吧。");
    }
  }

  globalThis.MemoryAquariumAppReady = init().then(() => {
    if (globalThis.MemoryAquariumUI && typeof globalThis.MemoryAquariumUI.mount === "function") {
      return globalThis.MemoryAquariumUI.mount();
    }
    return null;
  });
})();
