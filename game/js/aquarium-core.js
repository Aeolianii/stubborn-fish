(function (root) {
  "use strict";

  const DEFAULT_ERROR_MESSAGE = "哎呀，出错了，请重启试试。";
  const MISSING_ICON = "/game/assets/default-decor-atlas.png";
  const PLACEMENTS = new Set(["fish", "bottom", "suspended", "surface"]);
  const OBJECT_STATES = new Set(["bottom", "suspended", "surface"]);
  let configuredOptions = {};
  let singleton = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalizeScale(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, min, max) : null;
  }

  function midpointAnchor(pointA, pointB, sceneSize) {
    if (
      !pointA
      || !pointB
      || !Number.isFinite(Number(pointA.x))
      || !Number.isFinite(Number(pointA.y))
      || !Number.isFinite(Number(pointB.x))
      || !Number.isFinite(Number(pointB.y))
    ) {
      return { x: 0.5, y: 0.35 };
    }
    const width = Number(sceneSize && sceneSize.width);
    const height = Number(sceneSize && sceneSize.height);
    const usePixels = Number.isFinite(width) && width > 0
      && Number.isFinite(height) && height > 0;
    const x = (Number(pointA.x) + Number(pointB.x)) / 2;
    const y = (Number(pointA.y) + Number(pointB.y)) / 2;
    return {
      x: clamp(usePixels ? x / width : x, 0, 1),
      y: clamp(usePixels ? y / height : y, 0, 1)
    };
  }

  function publicFailure(code, message, data) {
    return { ok: false, code, message, ...(data ? { data } : {}) };
  }

  function ensureDependencies() {
    const required = [
      "AquariumStateStore",
      "AquariumEconomy",
      "AquariumRelationships",
      "AquariumGrowthJourney",
      "AquariumStoryTemplates",
      "AquariumEventDirector",
      "AquariumStoryAgent",
      "AquariumPosterRenderer"
    ];
    const missing = required.filter((name) => !root[name]);
    if (missing.length) {
      throw Object.assign(new Error(`玩法模块未加载：${missing.join(", ")}`), {
        code: "NOT_READY"
      });
    }
  }

  function createCore(options) {
    ensureDependencies();
    const config = { ...configuredOptions, ...(options || {}) };
    const now = typeof config.now === "function" ? config.now : Date.now;
    const setIntervalFn = config.setInterval || root.setInterval.bind(root);
    const clearIntervalFn = config.clearInterval || root.clearInterval.bind(root);
    const store = config.store || root.AquariumStateStore.createStateStore({
      storage: config.storage,
      indexedDB: config.indexedDB,
      now
    });
    const storyAgent = config.storyAgent || root.AquariumStoryAgent.createStoryAgent({
      callAI: config.callAI,
      timeoutMs: config.aiTimeoutMs
    });
    const posterRenderer = config.posterRenderer
      || root.AquariumPosterRenderer.createPosterRenderer({
        canvasFactory: config.canvasFactory,
        saveImage: config.saveImage,
        loadAsset: (key) => store.getAsset(key),
        loadImage: config.loadPosterImage,
        now
      });
    const listeners = new Set();
    let state = root.AquariumStateStore.createDefaultState(now());
    let initialized = false;
    let initPromise = null;
    let tickTimer = null;
    let adapters = {
      scene: config.sceneAdapter || null,
      cutout: config.cutoutAdapter || null
    };
    let cutoutSession = root.AquariumCutoutFlow
      && typeof root.AquariumCutoutFlow.createCutoutSession === "function"
      ? root.AquariumCutoutFlow.createCutoutSession()
      : null;
    let cutoutFile = null;
    let cutoutImage = null;
    let cutoutController = null;

    function resolveParticipant(id) {
      const fish = (state.fish || []).find((item) => item.id === id);
      if (fish) {
        return {
          id: fish.id,
          type: "fish",
          name: fish.name,
          iconUrl: fish.iconUrl || MISSING_ICON,
          missingAsset: !fish.iconUrl
        };
      }
      const object = (state.objects || []).find((item) => item.id === id);
      if (object) {
        return {
          id: object.id,
          type: "object",
          name: object.name,
          iconUrl: object.previewUrl || object.iconUrl || MISSING_ICON,
          imageKey: object.imageKey || null,
          missingAsset: !object.previewUrl && !object.iconUrl
        };
      }
      return {
        id,
        type: "object",
        name: "留在记忆里的邻居",
        iconUrl: MISSING_ICON,
        missingAsset: true
      };
    }

    function entityExists(entityId) {
      if (!entityId) return false;
      return (state.fish || []).some((item) => item.id === entityId)
        || (state.objects || []).some((item) => item.id === entityId);
    }

    function eventParticipantIds(event) {
      return [event && event.participantAId, event && event.participantBId]
        .filter((id) => typeof id === "string" && id);
    }

    function eventHasExistingParticipants(event) {
      const participantIds = eventParticipantIds(event);
      return participantIds.length === 2 && participantIds.every(entityExists);
    }

    function pruneOrphanedEntityReferences() {
      state.offlineEvents = (state.offlineEvents || [])
        .filter(eventHasExistingParticipants);
      state.stories = (state.stories || []).filter((story) => {
        const participantIds = eventParticipantIds(story);
        return !participantIds.length || participantIds.every(entityExists);
      });
      state.relationships = Object.fromEntries(
        Object.entries(state.relationships || {}).filter(([, relationship]) => (
          relationship
          && entityExists(relationship.participantAId)
          && entityExists(relationship.participantBId)
        ))
      );
      const activeStoryExists = (state.stories || []).some(
        (story) => story.id === state.activeStoryId
      ) || (state.offlineEvents || []).some(
        (event) => event.id === state.activeStoryId
      );
      if (!activeStoryExists) state.activeStoryId = null;
    }

    function memoryCapacityUsed() {
      const objectCount = (state.objects || [])
        .filter((item) => item.source !== "preset").length;
      const memoryFishCount = (state.fish || [])
        .filter((item) => item.source === "memory").length;
      return objectCount + memoryFishCount;
    }

    function latestStory() {
      const stories = Array.isArray(state.stories) ? state.stories : [];
      const active = state.activeStoryId
        ? stories.find((story) => story.id === state.activeStoryId)
        : null;
      return active || stories[stories.length - 1] || null;
    }

    function getViewModel() {
      const capacity = root.AquariumEconomy.capacityView(state);
      const income = root.AquariumEconomy.incomeRate(state);
      const unread = root.AquariumEventDirector.getUnreadOfflineEvents(state)
        .filter(eventHasExistingParticipants);
      const activeStory = latestStory();
      const snapshot = {
        ready: initialized && state.ready,
        feed: Math.max(0, Number(state.feed) || 0),
        capacity: {
          used: memoryCapacityUsed(),
          limit: capacity.limit,
          nextLimit: capacity.nextLimit,
          upgradeCost: capacity.upgradeCost
        },
        selected: clone(state.selected || {
          fishId: null,
          objectId: null,
          decorId: null
        }),
        fishCards: (state.fish || []).map((fish) => ({
          id: fish.id,
          name: fish.name,
          growth: fish.growth || 0,
          affection: fish.affection || 0,
          effectiveEventCount: fish.effectiveEventCount || 0,
          eventCount: fish.effectiveEventCount || 0,
          mature: Boolean(fish.mature),
          active: fish.active !== false,
          maturityChoice: fish.maturityChoice || null,
          canStartJourney: Boolean(
            fish.mature
            && fish.active !== false
            && fish.maturityChoice === "stay"
          ),
          maturityRewardClaimed: Boolean(fish.maturityRewardClaimed),
          iconUrl: fish.iconUrl || MISSING_ICON,
          sprite: Math.max(0, Math.min(3, Math.floor(Number(fish.sprite) || 0))),
          atlas: fish.atlas === "default" ? "default" : "original",
          assetKind: fish.assetKind || "atlas-fish",
          catalogId: fish.catalogId || null,
          artKey: fish.artKey || null
        })),
        income,
        latestStory: activeStory ? eventWithParticipants(activeStory) : null,
        offlineEventBubbles: unread.map((event) => ({
          id: event.id,
          source: event.source,
          eventType: event.eventType,
          title: event.title,
          participantA: resolveParticipant(event.participantAId),
          participantB: resolveParticipant(event.participantBId),
          anchor: {
            x: clamp(event.anchor && event.anchor.x, 0, 1),
            y: clamp(event.anchor && event.anchor.y, 0, 1)
          },
          read: false,
          status: event.status
        })),
        shop: root.AquariumEconomy.getShopView(state),
        cutout: clone(state.cutout),
        settings: clone(state.settings),
        journeys: clone(state.journeys || []),
        relationships: clone(state.relationships || {})
      };
      return deepFreeze(snapshot);
    }

    function emit(type, payload) {
      const event = {
        type,
        payload: clone(payload || {}),
        viewModel: getViewModel()
      };
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          if (root.console && typeof root.console.error === "function") {
            root.console.error("Aquarium listener failed", error);
          }
        }
      });
      return event;
    }

    function emitError(error, operation) {
      emit("core:error", {
        operation,
        code: error && error.code ? error.code : "UNEXPECTED_ERROR",
        message: error && error.message ? error.message : DEFAULT_ERROR_MESSAGE
      });
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function noop() {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function persist(immediate) {
      if (immediate) return store.save(state);
      store.scheduleSave(state, 100);
      return null;
    }

    function syncSettingsFromScene(snapshot) {
      if (!snapshot || typeof snapshot !== "object") return;
      if (snapshot.settings && typeof snapshot.settings === "object") {
        state.settings = {
          ...state.settings,
          viewing: Boolean(snapshot.settings.viewing),
          backgroundId: snapshot.settings.backgroundId === "classic"
            ? "classic"
            : "westlake",
          soundOn: Boolean(snapshot.settings.soundOn)
        };
      }
    }

    function mergeFishSnapshot(sceneFish) {
      if (!Array.isArray(sceneFish)) return;
      const previous = new Map((state.fish || []).map((fish) => [fish.id, fish]));
      const merged = sceneFish.map((fish, index) => {
        const current = previous.get(fish.id) || {};
        return root.AquariumGrowthJourney.normalizeFish({
          ...current,
          ...fish,
          id: fish.id || `fish-${index + 1}`,
          type: "fish",
          source: fish.source || current.source || (fish.custom ? "memory" : "preset"),
          active: current.active === false ? false : fish.active !== false
        });
      });
      (state.fish || []).forEach((fish) => {
        if (fish.active === false && !merged.some((item) => item.id === fish.id)) {
          merged.push(fish);
        }
      });
      state.fish = merged;
    }

    function mergeObjectSnapshot(sceneObjects) {
      if (!Array.isArray(sceneObjects)) return;
      const previous = new Map((state.objects || []).map((object) => [object.id, object]));
      state.objects = sceneObjects.map((object, index) => {
        const current = previous.get(object.id) || {};
        return {
          ...current,
          ...object,
          id: object.id || `memory-${index + 1}`,
          type: "object",
          source: object.source || current.source || (
            object.assetKind === "custom" ? "memory" : "preset"
          ),
          capturedAt: object.capturedAt || current.capturedAt || "",
          capturedPlace: object.capturedPlace || current.capturedPlace || "",
          entryEventId: current.entryEventId || object.entryEventId || null
        };
      });
    }

    function syncSceneSnapshot(snapshot, optionsValue) {
      if (!snapshot || typeof snapshot !== "object") return false;
      mergeFishSnapshot(snapshot.fish);
      mergeObjectSnapshot(snapshot.objects || snapshot.memoryObjects);
      if (Array.isArray(snapshot.decor)) state.decor = clone(snapshot.decor);
      if (snapshot.selected && typeof snapshot.selected === "object") {
        state.selected = {
          fishId: snapshot.selected.fishId || null,
          objectId: snapshot.selected.objectId || null,
          decorId: snapshot.selected.decorId || null
        };
      }
      syncSettingsFromScene(snapshot);
      state.scene = snapshot.scene && typeof snapshot.scene === "object"
        ? clone(snapshot.scene)
        : state.scene;
      pruneOrphanedEntityReferences();
      if (!(optionsValue && optionsValue.silent)) {
        persist(false);
        emit("state:changed", { reason: "scene:sync" });
      }
      return true;
    }

    function sceneSnapshot() {
      const sceneAdapter = adapters.scene;
      if (!sceneAdapter || typeof sceneAdapter.getSceneSnapshot !== "function") return null;
      try {
        return sceneAdapter.getSceneSnapshot();
      } catch (error) {
        emitError(error, "getSceneSnapshot");
        return null;
      }
    }

    function applyEffects(effects) {
      const list = Array.isArray(effects) ? effects : [];
      const sceneAdapter = adapters.scene;
      if (!sceneAdapter || typeof sceneAdapter.applyEffect !== "function") return list;
      list.forEach((effect) => {
        try {
          sceneAdapter.applyEffect(effect);
        } catch (error) {
          emitError(error, `effect:${effect.type}`);
        }
      });
      return list;
    }

    function eventWithParticipants(event) {
      return {
        ...clone(event),
        participantA: resolveParticipant(event.participantAId),
        participantB: resolveParticipant(event.participantBId)
      };
    }

    function resolveStoryInBackground(event) {
      if (!event || event.storyMode === "fixed") return;
      const storyInput = clone(event);
      storyAgent.generate(storyInput, state.recentFingerprints)
        .then((result) => {
          const resolved = root.AquariumEventDirector.resolveStory(
            state,
            event.id,
            result
          );
          if (!resolved) return;
          persist(true);
          emit("state:changed", { reason: "story:resolved", storyId: event.id });
          emit("story:resolved", clone(resolved));
        })
        .catch((error) => emitError(error, "story-agent"));
    }

    function settleOffline(nowValue) {
      const previousLastActiveAt = state.lastActiveAt;
      const result = root.AquariumEconomy.settleOfflineFeed(state, nowValue);
      const elapsedForEvents = result.valid
        ? Math.min(result.rawElapsedMs || 0, root.AquariumEconomy.OFFLINE_CAP_MS)
        : 0;
      const created = root.AquariumEventDirector.settleOfflineEvents(
        state,
        elapsedForEvents,
        nowValue
      );
      if (created.length || result.feedEarned) {
        emit("offline:settled", {
          feedEarned: result.feedEarned,
          eventsCreated: created.length,
          eventIds: created.map((event) => event.id),
          previousLastActiveAt,
          reason: result.reason || null
        });
      }
      created.forEach(resolveStoryInBackground);
      return { feedResult: result, events: created };
    }

    async function init() {
      if (initialized) return { ok: true, data: { initialized: false } };
      if (initPromise) return initPromise;
      initPromise = Promise.resolve().then(() => {
        const loaded = store.load();
        state = loaded.state;
        const snapshot = sceneSnapshot();
        if (snapshot && loaded.source === "default") {
          syncSceneSnapshot(snapshot, { silent: true });
        } else if (
          snapshot
          && loaded.source !== "default"
          && adapters.scene
          && typeof adapters.scene.hydrateScene === "function"
        ) {
          adapters.scene.hydrateScene(clone(state));
        }
        pruneOrphanedEntityReferences();
        state.ready = true;
        initialized = true;
        const initializedAt = now();
        const isReturningState = loaded.source === "primary" || loaded.source === "backup";
        if (!isReturningState) {
          state.lastActiveAt = initializedAt;
          state.lastOnlineFeedAt = initializedAt;
        } else {
          settleOffline(initializedAt);
        }
        persist(true);
        emit("state:changed", {
          reason: "init",
          recoveredFromBackup: loaded.source === "backup",
          source: loaded.source
        });
        if (config.autoTimers !== false) {
          tickTimer = setIntervalFn(() => {
            sceneTick(now());
          }, 30 * 1000);
        }
        return {
          ok: true,
          data: {
            initialized: true,
            recoveredFromBackup: loaded.source === "backup",
            source: loaded.source
          }
        };
      }).catch((error) => {
        initialized = false;
        state.ready = false;
        emitError(error, "init");
        return publicFailure(
          error && error.code ? error.code : "INIT_FAILED",
          error && error.message ? error.message : DEFAULT_ERROR_MESSAGE
        );
      });
      return initPromise;
    }

    function selectFish(fishId) {
      const candidates = (state.fish || []).filter((fish) => fish.active !== false);
      if (!candidates.length) return null;
      if (fishId) {
        const target = candidates.find((fish) => fish.id === fishId);
        if (target) return target;
      }
      if (state.selected && state.selected.fishId) {
        const selected = candidates.find((fish) => fish.id === state.selected.fishId);
        if (selected) return selected;
      }
      const story = latestStory();
      if (story) {
        const storyFish = candidates.find((fish) => (
          fish.id === story.participantAId || fish.id === story.participantBId
        ));
        if (storyFish) return storyFish;
      }
      return candidates.slice().sort((a, b) => (
        (Number(a.affection) || 0) - (Number(b.affection) || 0)
      ))[0];
    }

    async function feedFish(fishId) {
      const fish = selectFish(fishId);
      if (!fish) return publicFailure("FISH_NOT_FOUND", "鱼缸里暂时没有可以投喂的鱼。");
      if (!root.AquariumEconomy.spendFeed(state, root.AquariumEconomy.FEED_COST)) {
        return publicFailure("INSUFFICIENT_FEED", "藻币还不够，再等一小会儿吧。");
      }
      const wasMature = Boolean(fish.mature);
      const previousAffection = Number(fish.affection) || 0;
      root.AquariumGrowthJourney.applyFeedAffection(fish);
      const affectionGained = Math.max(0, fish.affection - previousAffection);
      const matured = !wasMature && Boolean(fish.mature);
      state.selected.fishId = fish.id;
      const effects = applyEffects([{
        type: "SPAWN_FOOD",
        fishId: fish.id,
        amount: 9
      }]);
      const event = root.AquariumEventDirector.createFeedEvent(state, fish.id, now());
      if (event) resolveStoryInBackground(event);
      persist(true);
      emit("state:changed", { reason: "feed", fishId: fish.id });
      if (matured) {
        emit("maturity:ready", {
          fishId: fish.id,
          growth: fish.growth,
          affection: fish.affection,
          effectiveEventCount: fish.effectiveEventCount
        });
      }
      return {
        ok: true,
        data: {
          fishId: fish.id,
          fishName: fish.name,
          spent: root.AquariumEconomy.FEED_COST,
          previousAffection,
          affectionGained,
          effectiveEventCount: fish.effectiveEventCount,
          growth: fish.growth,
          affection: fish.affection,
          mature: fish.mature,
          matured,
          event: event ? eventWithParticipants(event) : null,
          effects
        }
      };
    }

    async function openAddFlow() {
      const capacity = root.AquariumEconomy.capacityView(state);
      if (memoryCapacityUsed() >= capacity.limit) {
        return publicFailure("CAPACITY_FULL", "现实物品位置已经满了，先升级容量吧。");
      }
      state.cutout = {
        status: "capture",
        sourcePreviewUrl: "",
        resultPreviewUrl: "",
        message: ""
      };
      persist(false);
      emit("state:changed", { reason: "cutout:open" });
      return { ok: true, data: { capacity: getViewModel().capacity } };
    }

    function revokePreview(url) {
      if (
        url
        && root.URL
        && typeof root.URL.revokeObjectURL === "function"
        && String(url).startsWith("blob:")
      ) {
        root.URL.revokeObjectURL(url);
      }
    }

    async function selectInputImage(file) {
      if (!cutoutSession || !root.AquariumCutoutFlow) {
        return publicFailure("NOT_READY", "物品抠图功能还在准备中。");
      }
      try {
        root.AquariumCutoutFlow.validateFile(file);
        cutoutSession.backToCapture();
        cutoutSession.update({ file });
        cutoutFile = file;
        revokePreview(state.cutout.sourcePreviewUrl);
        const previewUrl = root.URL && typeof root.URL.createObjectURL === "function"
          ? root.URL.createObjectURL(file)
          : "";
        state.cutout = {
          status: "capture",
          sourcePreviewUrl: previewUrl,
          resultPreviewUrl: "",
          message: "图片已准备好，请描述要识别的物品。"
        };
        cutoutImage = null;
        persist(false);
        emit("state:changed", { reason: "cutout:image-selected" });
        return { ok: true, data: { sourcePreviewUrl: previewUrl } };
      } catch (error) {
        return publicFailure("INVALID_IMAGE", error.message || "请选择有效图片。");
      }
    }

    function loadCutoutImage() {
      if (cutoutImage) return Promise.resolve(cutoutImage);
      if (typeof config.createImage === "function") {
        return Promise.resolve(config.createImage(state.cutout.sourcePreviewUrl))
          .then((image) => {
            cutoutImage = image;
            return image;
          });
      }
      if (cutoutFile && typeof root.createImageBitmap === "function") {
        return root.createImageBitmap(cutoutFile).then((image) => {
          cutoutImage = image;
          return image;
        });
      }
      if (!root.Image || !state.cutout.sourcePreviewUrl) {
        return Promise.reject(new Error("当前环境暂时无法读取这张图片"));
      }
      return new Promise((resolve, reject) => {
        const image = new root.Image();
        image.addEventListener("load", () => {
          cutoutImage = image;
          resolve(image);
        }, { once: true });
        image.addEventListener("error", () => reject(new Error("无法读取所选图片")), {
          once: true
        });
        image.src = state.cutout.sourcePreviewUrl;
      });
    }

    async function generateCutout(input) {
      if (!cutoutSession || !cutoutFile) {
        return publicFailure("IMAGE_NOT_SELECTED", "请先选择一张图片。");
      }
      const optionsValue = input || {};
      try {
        cutoutSession.update({
          description: optionsValue.description,
          subjectType: optionsValue.subjectType,
          name: optionsValue.objectName
        });
        cutoutSession.beginGeneration();
      } catch (error) {
        return publicFailure("INVALID_CUTOUT_INPUT", error.message || "请补全物品描述。");
      }
      cutoutController = typeof root.AbortController === "function"
        ? new root.AbortController()
        : null;
      state.cutout.status = "processing";
      state.cutout.message = "AI 正在参考原图生成透明物品…";
      emit("state:changed", { reason: "cutout:processing" });
      try {
        const adapter = adapters.cutout;
        const result = adapter && typeof adapter.generate === "function"
          ? await adapter.generate({
            file: cutoutFile,
            description: optionsValue.description,
            subjectType: optionsValue.subjectType,
            objectName: optionsValue.objectName,
            signal: cutoutController && cutoutController.signal
          })
          : await root.AquariumCutoutFlow.generateTransparentCutout({
            file: cutoutFile,
            description: optionsValue.description,
            subjectType: optionsValue.subjectType,
            signal: cutoutController && cutoutController.signal
          });
        cutoutSession.resolveGeneration(result);
        revokePreview(state.cutout.resultPreviewUrl);
        const resultPreviewUrl = result.transparentBlob
          && root.URL
          && typeof root.URL.createObjectURL === "function"
          ? root.URL.createObjectURL(result.transparentBlob)
          : result.canvas && typeof result.canvas.toDataURL === "function"
            ? result.canvas.toDataURL("image/png")
            : "";
        state.cutout = {
          ...state.cutout,
          status: "ready",
          resultPreviewUrl,
          message: "透明物品已经准备好了。"
        };
        persist(false);
        emit("state:changed", { reason: "cutout:ready" });
        return {
          ok: true,
          data: {
            targetLabel: result.targetLabel || "",
            resultPreviewUrl
          }
        };
      } catch (error) {
        const aborted = error && error.name === "AbortError";
        const message = aborted
          ? "已取消本次制作，可以返回修改后重试。"
          : `这次没有生成成功：${error && error.message ? error.message : "请稍后重试"}`;
        cutoutSession.failGeneration(message);
        state.cutout.status = "error";
        state.cutout.message = message;
        emit("state:changed", { reason: "cutout:error" });
        return publicFailure(aborted ? "CUTOUT_CANCELLED" : "CUTOUT_FAILED", message);
      } finally {
        cutoutController = null;
      }
    }

    async function cancelCutout() {
      if (cutoutController && typeof cutoutController.abort === "function") {
        cutoutController.abort();
      }
      if (cutoutSession) cutoutSession.backToCapture();
      state.cutout.status = "capture";
      state.cutout.message = "可以修改图片或描述后重新生成。";
      emit("state:changed", { reason: "cutout:cancelled" });
      return { ok: true, data: { cancelled: true } };
    }

    function resetCutoutState() {
      revokePreview(state.cutout.sourcePreviewUrl);
      revokePreview(state.cutout.resultPreviewUrl);
      if (cutoutSession) cutoutSession.reset();
      cutoutFile = null;
      cutoutImage = null;
      state.cutout = {
        status: "idle",
        sourcePreviewUrl: "",
        resultPreviewUrl: "",
        message: ""
      };
    }

    async function confirmAddObject(input) {
      if (!cutoutSession) return publicFailure("NOT_READY", "物品抠图功能还在准备中。");
      const optionsValue = input || {};
      if (!PLACEMENTS.has(optionsValue.placement)) {
        return publicFailure("INVALID_PLACEMENT", "请选择物品进入鱼缸后的状态。");
      }
      const capacity = root.AquariumEconomy.capacityView(state);
      if (memoryCapacityUsed() >= capacity.limit) {
        return publicFailure("CAPACITY_FULL", "现实物品位置已经满了，先升级容量吧。");
      }
      let payload;
      try {
        cutoutSession.update({
          name: optionsValue.name,
          placement: optionsValue.placement
        });
        payload = cutoutSession.createPlacementPayload();
      } catch (error) {
        return publicFailure("CUTOUT_NOT_READY", error.message || "请先生成透明物品。");
      }
      const timestamp = now();
      const suffix = `${timestamp}-${Math.floor(Math.random() * 10000)}`;
      const imageKey = `memory-image-${suffix}`;
      await store.putAsset(imageKey, payload.transparentBlob);
      let entity;
      let effects;
      if (payload.placement === "fish") {
        entity = root.AquariumGrowthJourney.normalizeFish({
          id: `custom-fish-${suffix}`,
          type: "fish",
          name: payload.name,
          x: 0.5,
          y: 0.46,
          size: 0.112,
          source: "memory",
          imageKey,
          iconUrl: state.cutout.resultPreviewUrl || MISSING_ICON,
          targetLabel: payload.targetLabel || "",
          active: true
        });
        state.fish.push(entity);
        effects = [{
          type: "ADD_FISH_TO_SCENE",
          fish: clone(entity),
          transparentBlob: payload.transparentBlob
        }];
      } else {
        entity = {
          id: `memory-${suffix}`,
          type: "object",
          name: payload.name,
          state: payload.placement,
          x: 0.5,
          y: -0.1,
          scale: 1,
          source: "memory",
          imageKey,
          previewUrl: state.cutout.resultPreviewUrl || "",
          targetLabel: payload.targetLabel || "",
          capturedAt: typeof optionsValue.capturedAt === "string"
            ? optionsValue.capturedAt.trim()
            : "",
          capturedPlace: typeof optionsValue.capturedPlace === "string"
            ? optionsValue.capturedPlace.trim()
            : "",
          createdAt: timestamp,
          entryEventId: null,
          settling: true
        };
        state.objects.push(entity);
        effects = [{
          type: "ADD_OBJECT_TO_SCENE",
          object: clone(entity),
          transparentBlob: payload.transparentBlob
        }];
      }
      if (!state.firstObjectRewarded && payload.placement === "fish") {
        root.AquariumEconomy.addFeed(state, 10);
        state.firstObjectRewarded = true;
      }
      resetCutoutState();
      applyEffects(effects);
      persist(true);
      emit("state:changed", { reason: "memory:add", entityId: entity.id });
      return { ok: true, data: { entity: clone(entity), effects } };
    }

    async function setViewing(enabled) {
      state.settings.viewing = Boolean(enabled);
      const effects = applyEffects([{
        type: "SET_VIEWING",
        enabled: state.settings.viewing
      }]);
      persist(true);
      emit("state:changed", { reason: "viewing" });
      return { ok: true, data: { enabled: state.settings.viewing, effects } };
    }

    async function toggleBackground() {
      state.settings.backgroundId = state.settings.backgroundId === "classic"
        ? "westlake"
        : "classic";
      const effects = applyEffects([{
        type: "SET_BACKGROUND",
        backgroundId: state.settings.backgroundId
      }]);
      persist(true);
      emit("state:changed", { reason: "background" });
      return {
        ok: true,
        data: { backgroundId: state.settings.backgroundId, effects }
      };
    }

    async function toggleSound() {
      state.settings.soundOn = !state.settings.soundOn;
      const effects = applyEffects([{
        type: "SET_SOUND",
        enabled: state.settings.soundOn
      }]);
      persist(true);
      emit("state:changed", { reason: "sound" });
      return { ok: true, data: { enabled: state.settings.soundOn, effects } };
    }

    function findObject(id) {
      return (state.objects || []).find((item) => item.id === id) || null;
    }

    function findFish(id) {
      return (state.fish || []).find((item) => item.id === id) || null;
    }

    function findDecor(id) {
      return (state.decor || []).find((item) => item.id === id) || null;
    }

    async function setObjectState(objectId, nextState) {
      const object = findObject(objectId);
      if (!object) return publicFailure("OBJECT_NOT_FOUND", "没有找到这件物品。");
      if (!OBJECT_STATES.has(nextState)) {
        return publicFailure("INVALID_OBJECT_STATE", "请选择沉底、悬浮或水面状态。");
      }
      object.state = nextState;
      object.y = nextState === "bottom" ? 0.83 : nextState === "surface" ? 0.18 : 0.52;
      const effects = applyEffects([{
        type: "UPDATE_OBJECT",
        objectId,
        changes: { state: object.state, y: object.y }
      }]);
      persist(true);
      emit("state:changed", { reason: "object:state", objectId });
      return { ok: true, data: { object: clone(object), effects } };
    }

    async function setObjectScale(objectId, scaleValue) {
      const object = findObject(objectId);
      if (!object) return publicFailure("OBJECT_NOT_FOUND", "没有找到这件物品。");
      const scale = normalizeScale(scaleValue, 0.5, 2);
      if (scale === null) return publicFailure("INVALID_SCALE", "缩放数值无效。");
      object.scale = scale;
      const effects = applyEffects([{
        type: "UPDATE_OBJECT",
        objectId,
        changes: { scale }
      }]);
      persist(true);
      emit("state:changed", { reason: "object:scale", objectId });
      return { ok: true, data: { objectId, scale, effects } };
    }

    async function removeObject(objectId) {
      const object = findObject(objectId);
      if (!object) return publicFailure("OBJECT_NOT_FOUND", "没有找到这件物品。");
      state.objects = state.objects.filter((item) => item.id !== objectId);
      pruneOrphanedEntityReferences();
      if (object.imageKey) await store.deleteAsset(object.imageKey);
      state.selected.objectId = state.selected.objectId === objectId
        ? null
        : state.selected.objectId;
      const effects = applyEffects([{ type: "REMOVE_OBJECT_FROM_SCENE", objectId }]);
      persist(true);
      emit("state:changed", { reason: "object:remove", objectId });
      return { ok: true, data: { objectId, effects } };
    }

    async function setFishScale(fishId, scaleValue) {
      const fish = findFish(fishId);
      if (!fish) return publicFailure("FISH_NOT_FOUND", "没有找到这条鱼。");
      const scale = normalizeScale(scaleValue, 0.075, 0.17);
      if (scale === null) return publicFailure("INVALID_SCALE", "缩放数值无效。");
      fish.size = scale;
      const effects = applyEffects([{
        type: "UPDATE_FISH",
        fishId,
        changes: { size: scale }
      }]);
      persist(true);
      emit("state:changed", { reason: "fish:scale", fishId });
      return { ok: true, data: { fishId, scale, effects } };
    }

    async function removeFish(fishId) {
      const fish = findFish(fishId);
      if (!fish) return publicFailure("FISH_NOT_FOUND", "没有找到这条鱼。");
      state.fish = state.fish.filter((item) => item.id !== fishId);
      pruneOrphanedEntityReferences();
      if (fish.imageKey) await store.deleteAsset(fish.imageKey);
      state.selected.fishId = state.selected.fishId === fishId
        ? null
        : state.selected.fishId;
      const effects = applyEffects([{ type: "REMOVE_FISH_FROM_SCENE", fishId }]);
      persist(true);
      emit("state:changed", { reason: "fish:remove", fishId });
      return { ok: true, data: { fishId, effects } };
    }

    async function setDecorScale(decorId, scaleValue) {
      const decor = findDecor(decorId);
      if (!decor) return publicFailure("DECOR_NOT_FOUND", "没有找到这个装饰。");
      const scale = normalizeScale(scaleValue, 0.6, 1.6);
      if (scale === null) return publicFailure("INVALID_SCALE", "缩放数值无效。");
      decor.scale = scale;
      const effects = applyEffects([{
        type: "UPDATE_DECOR",
        decorId,
        changes: { scale }
      }]);
      persist(true);
      emit("state:changed", { reason: "decor:scale", decorId });
      return { ok: true, data: { decorId, scale, effects } };
    }

    async function removeDecor(decorId) {
      const decor = findDecor(decorId);
      if (!decor) return publicFailure("DECOR_NOT_FOUND", "没有找到这个装饰。");
      state.decor = state.decor.filter((item) => item.id !== decorId);
      state.selected.decorId = state.selected.decorId === decorId
        ? null
        : state.selected.decorId;
      const effects = applyEffects([{ type: "REMOVE_DECOR_FROM_SCENE", decorId }]);
      persist(true);
      emit("state:changed", { reason: "decor:remove", decorId });
      return { ok: true, data: { decorId, effects } };
    }

    async function upgradeCapacity() {
      const result = root.AquariumEconomy.upgradeCapacity(state);
      if (!result.ok) return result;
      persist(true);
      emit("state:changed", { reason: "capacity:upgrade" });
      return result;
    }

    async function purchaseUnlock(kind, unlockId) {
      const result = root.AquariumEconomy.purchaseUnlock(state, kind, unlockId);
      if (!result.ok) return result;
      persist(true);
      emit("state:changed", { reason: "shop:purchase", kind, unlockId });
      return result;
    }

    async function consumeOwnedCatalogItem(kind, unlockId) {
      const result = root.AquariumEconomy.consumeOwnedCatalogItem(
        state,
        kind,
        unlockId
      );
      if (!result.ok) return result;
      persist(true);
      emit("state:changed", { reason: "catalog:consume", kind, unlockId });
      return result;
    }

    function createMaturityStory(fish, choice, timestamp) {
      const closestObjectId = root.AquariumGrowthJourney.closestObjectId(fish, state);
      const object = findObject(closestObjectId) || {
        id: "aquarium-home",
        type: "object",
        name: "这只生态缸"
      };
      const templateId = choice === "journey"
        ? "maturity-choice-journey-01"
        : "maturity-choice-stay-01";
      const template = root.AquariumStoryTemplates.getById(templateId)
        || root.AquariumStoryTemplates.select({
          eventType: "maturity-choice",
          participants: ["fish", "object"]
        });
      const context = {
        fishName: fish.name,
        secondFishName: "",
        objectName: object.name,
        secondObjectName: "",
        capturedAt: object.capturedAt || "",
        capturedPlace: object.capturedPlace || ""
      };
      const id = `maturity-story-${fish.id}-${timestamp}`;
      const event = {
        id,
        source: "maturity",
        eventType: "maturity-choice",
        templateId: template.id,
        participantAId: fish.id,
        participantBId: object.id,
        participants: [
          { id: fish.id, type: "fish", name: fish.name },
          { id: object.id, type: "object", name: object.name }
        ],
        title: root.AquariumStoryTemplates.renderPattern(template.fallbackTitle, context),
        body: root.AquariumStoryTemplates.renderPattern(template.fallbackBody, context),
        posterLine: root.AquariumStoryTemplates.renderPattern(
          template.fallbackPosterLine,
          context
        ),
        immediateText: root.AquariumStoryTemplates.renderPattern(
          template.immediatePattern,
          context
        ),
        promptGuide: template.promptGuide,
        context,
        status: "pending",
        occurredAt: timestamp,
        readAt: timestamp,
        anchor: { x: 0.5, y: 0.35 },
        relationshipStage: "特别的陪伴"
      };
      state.stories.push(event);
      state.stories = state.stories.slice(-100);
      state.activeStoryId = event.id;
      resolveStoryInBackground(event);
      return event;
    }

    async function chooseMaturity(fishId, choice) {
      const result = root.AquariumGrowthJourney.chooseMaturity(
        state,
        fishId,
        choice,
        now()
      );
      if (!result.ok) return result;
      if (result.data.alreadyResolved) return result;
      const fish = findFish(fishId);
      const story = createMaturityStory(fish, choice, now());
      const effects = [];
      if (choice === "journey") {
        effects.push({ type: "REMOVE_FISH_FROM_SCENE", fishId });
        if (state.selected.fishId === fishId) state.selected.fishId = null;
      }
      applyEffects(effects);
      persist(true);
      emit("state:changed", { reason: "maturity:choice", fishId, choice });
      emit("maturity:resolved", {
        ...result.data,
        story: clone(story)
      });
      if (choice === "journey") {
        emit("journey:started", {
          fishId,
          journey: clone(result.data.journey)
        });
      }
      return {
        ok: true,
        data: { ...result.data, story: clone(story), effects }
      };
    }

    async function startJourney(fishId) {
      const fishBefore = findFish(fishId);
      const previousChoice = fishBefore && fishBefore.maturityChoice;
      const result = root.AquariumGrowthJourney.startJourney(state, fishId, now());
      if (!result.ok) return result;
      const effects = result.data.alreadyStarted
        ? []
        : [{ type: "REMOVE_FISH_FROM_SCENE", fishId }];
      if (!result.data.alreadyStarted && state.selected.fishId === fishId) {
        state.selected.fishId = null;
      }
      applyEffects(effects);
      let story = null;
      if (!result.data.alreadyStarted && previousChoice !== "journey") {
        story = createMaturityStory(findFish(fishId), "journey", now());
      }
      persist(true);
      emit("state:changed", { reason: "journey:start", fishId });
      if (!result.data.alreadyStarted) {
        emit("journey:started", {
          fishId,
          journey: clone(result.data.journey),
          story: story ? clone(story) : null
        });
      }
      return {
        ok: true,
        data: { ...result.data, story: story ? clone(story) : null, effects }
      };
    }

    async function notifyObjectSettled(objectId) {
      const result = root.AquariumEventDirector.createPlacementEvent(
        state,
        objectId,
        now()
      );
      if (!result.ok) return result;
      if (result.data.duplicate) return result;
      const event = result.data.event;
      const effects = [
        {
          type: "FOCUS_FISH_ON_OBJECT",
          fishId: event.participantAId,
          objectId: event.participantBId
        }
      ];
      applyEffects(effects);
      persist(true);
      emit("state:changed", { reason: "story:placement", storyId: event.id });
      emit("story:immediate", {
        id: event.id,
        text: event.immediateText,
        title: event.title,
        body: event.body,
        status: event.status
      });
      resolveStoryInBackground(event);
      return { ok: true, data: { event: clone(event), effects } };
    }

    async function notifyFishAdded(fishId) {
      const result = root.AquariumEventDirector.createFishArrivalEvent(
        state,
        fishId,
        now()
      );
      if (!result.ok || result.data.duplicate) return result;
      const event = result.data.event;
      persist(true);
      emit("state:changed", { reason: "story:fish-arrival", storyId: event.id });
      emit("story:immediate", {
        id: event.id,
        text: event.immediateText,
        title: event.title,
        body: event.body,
        status: event.status
      });
      resolveStoryInBackground(event);
      return { ok: true, data: { event: clone(event), effects: [] } };
    }

    async function openOfflineEvent(eventId) {
      pruneOrphanedEntityReferences();
      const result = root.AquariumEventDirector.openOfflineEvent(
        state,
        eventId,
        now()
      );
      if (!result.ok) return result;
      persist(true);
      emit("state:changed", { reason: "offline-event:read", eventId });
      return {
        ok: true,
        data: {
          event: eventWithParticipants(result.data.event)
        }
      };
    }

    async function resolveEventChoice(eventId, choiceId) {
      pruneOrphanedEntityReferences();
      const result = root.AquariumEventDirector.resolveEventChoice(
        state,
        eventId,
        choiceId,
        now()
      );
      if (!result.ok) return result;
      persist(true);
      emit("state:changed", { reason: "event:choice", eventId, choiceId });
      emit("event:choice", {
        eventId,
        choice: result.data.choice,
        duplicate: result.data.duplicate
      });
      return {
        ok: true,
        data: {
          ...result.data,
          event: eventWithParticipants(result.data.event)
        }
      };
    }

    function getSceneCanvas() {
      return adapters.scene && typeof adapters.scene.getCanvas === "function"
        ? adapters.scene.getCanvas()
        : null;
    }

    function getParticipantImage(entityId, participant) {
      return adapters.scene && typeof adapters.scene.getEntityImage === "function"
        ? adapters.scene.getEntityImage(entityId, participant)
        : null;
    }

    async function createEventPoster(eventId) {
      try {
        const poster = await posterRenderer.createEventPoster(
          eventId,
          state,
          getSceneCanvas(),
          getParticipantImage
        );
        emit("poster:ready", {
          kind: "event",
          eventId,
          width: poster.width,
          height: poster.height,
          previewUrl: poster.previewUrl
        });
        return {
          ok: true,
          data: {
            width: poster.width,
            height: poster.height,
            previewUrl: poster.previewUrl,
            blob: poster.blob,
            layout: clone(poster.layout)
          }
        };
      } catch (error) {
        return publicFailure(
          error.code || "POSTER_FAILED",
          error.message || "这次海报没有生成成功，请再试一次。"
        );
      }
    }

    async function createPoster() {
      try {
        const poster = await posterRenderer.createPoster(state, getSceneCanvas());
        emit("poster:ready", {
          kind: "aquarium",
          storyId: poster.layout.storyId,
          width: poster.width,
          height: poster.height,
          previewUrl: poster.previewUrl
        });
        return {
          ok: true,
          data: {
            width: poster.width,
            height: poster.height,
            previewUrl: poster.previewUrl,
            blob: poster.blob,
            layout: clone(poster.layout)
          }
        };
      } catch (error) {
        return publicFailure(
          "POSTER_FAILED",
          error.message || "这次海报没有生成成功，请再试一次。"
        );
      }
    }

    function savePoster() {
      return posterRenderer.savePoster();
    }

    async function saveNow() {
      const snapshot = sceneSnapshot();
      if (snapshot) syncSceneSnapshot(snapshot, { silent: true });
      const saved = persist(true);
      return {
        ok: true,
        data: {
          savedAt: saved.savedAt,
          stateId: saved.stateId
        }
      };
    }

    function updateOfflineEventAnchors(positionProvider, sceneSize) {
      const getPosition = typeof positionProvider === "function"
        ? positionProvider
        : adapters.scene && typeof adapters.scene.getEntityPosition === "function"
          ? adapters.scene.getEntityPosition.bind(adapters.scene)
          : null;
      if (!getPosition) return false;
      let changed = false;
      root.AquariumEventDirector.getUnreadOfflineEvents(state).forEach((event) => {
        const anchor = midpointAnchor(
          getPosition(event.participantAId),
          getPosition(event.participantBId),
          sceneSize || (
            adapters.scene && typeof adapters.scene.getSceneSize === "function"
              ? adapters.scene.getSceneSize()
              : null
          )
        );
        changed = root.AquariumEventDirector.updateEventAnchor(
          state,
          event.id,
          anchor
        ) || changed;
      });
      if (changed) {
        persist(false);
        emit("state:changed", { reason: "offline-event:anchors" });
      }
      return changed;
    }

    function sceneTick(nowValue) {
      if (!initialized) return { feedEarned: 0, event: null, effects: [] };
      const timestamp = Number(nowValue) || now();
      const feedEarned = root.AquariumEconomy.settleOnlineFeed(state, timestamp);
      let event = null;
      if (
        state.nextOnlineEventAt
        && timestamp >= state.nextOnlineEventAt
      ) {
        event = root.AquariumEventDirector.createOnlineEvent(state, timestamp);
        if (event) {
          emit("story:immediate", {
            id: event.id,
            text: event.immediateText,
            title: event.title,
            body: event.body,
            status: event.status
          });
          resolveStoryInBackground(event);
        }
      }
      const effects = root.AquariumRelationships.buildSoftBindingEffects(state);
      applyEffects(effects);
      updateOfflineEventAnchors();
      if (feedEarned || event) {
        persist(true);
        emit("state:changed", {
          reason: "scene:tick",
          feedEarned,
          storyId: event ? event.id : null
        });
      }
      return { feedEarned, event, effects };
    }

    function setAdapters(next) {
      const value = next || {};
      if (value.sceneAdapter) {
        adapters.scene = value.sceneAdapter;
        if (initialized && typeof adapters.scene.hydrateScene === "function") {
          adapters.scene.hydrateScene(clone(state));
        }
      }
      if (value.cutoutAdapter) adapters.cutout = value.cutoutAdapter;
      return true;
    }

    function getStateForTesting() {
      return state;
    }

    function destroy() {
      if (tickTimer !== null) clearIntervalFn(tickTimer);
      tickTimer = null;
      store.dispose();
      listeners.clear();
    }

    return {
      init,
      getViewModel,
      subscribe,
      feedFish,
      openAddFlow,
      selectInputImage,
      generateCutout,
      cancelCutout,
      confirmAddObject,
      setViewing,
      toggleBackground,
      toggleSound,
      setObjectState,
      setObjectScale,
      removeObject,
      setFishScale,
      removeFish,
      setDecorScale,
      removeDecor,
      upgradeCapacity,
      purchaseUnlock,
      consumeOwnedCatalogItem,
      chooseMaturity,
      startJourney,
      openOfflineEvent,
      resolveEventChoice,
      createEventPoster,
      createPoster,
      savePoster,
      saveNow,
      notifyObjectSettled,
      notifyFishAdded,
      updateOfflineEventAnchors,
      syncSceneSnapshot,
      sceneTick,
      setAdapters,
      getStateForTesting,
      destroy
    };
  }

  function configure(options) {
    configuredOptions = { ...configuredOptions, ...(options || {}) };
    if (singleton) {
      singleton.setAdapters({
        sceneAdapter: configuredOptions.sceneAdapter,
        cutoutAdapter: configuredOptions.cutoutAdapter
      });
    }
    return configuredOptions;
  }

  function getInstance(options) {
    if (!singleton) singleton = createCore({ ...configuredOptions, ...(options || {}) });
    return singleton;
  }

  function resetForTests() {
    if (singleton) singleton.destroy();
    singleton = null;
    configuredOptions = {};
  }

  root.AquariumCore = {
    createCore,
    configure,
    getInstance,
    resetForTests,
    midpointAnchor
  };
})(globalThis);
