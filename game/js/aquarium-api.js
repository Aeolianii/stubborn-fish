(function (root) {
  "use strict";

  /*
   * Frontend merge load order (keep game/index.html unchanged during parallel work):
   * cutout-flow, webgl-fish-mesh, story-template-catalog,
   * story-template-registry, state-store, economy-system, relationship-system,
   * growth-journey, event-director, story-agent, poster-renderer, aquarium-core,
   * aquarium-api, ui-shell, app.
   */
  const NOT_READY = {
    ok: false,
    code: "NOT_READY",
    message: "这个功能还在准备中。"
  };
  const listeners = new Set();
  let core = null;
  let unsubscribeCore = null;

  function fallbackViewModel() {
    return {
      ready: false,
      feed: 200,
      income: {
        multiplier: 1,
        activeFishCount: 0,
        onlineIntervalMs: 45 * 1000,
        offlineIntervalMs: 4 * 60 * 1000,
        offlineCapMs: 8 * 60 * 60 * 1000,
        offlineMaxFeed: 120
      },
      capacity: {
        used: 0,
        limit: 3,
        nextLimit: 5,
        upgradeCost: 60
      },
      selected: {
        fishId: null,
        objectId: null,
        decorId: null
      },
      fishCards: [],
      latestStory: null,
      offlineEventBubbles: [],
      shop: {
        decor: [],
        fish: [],
        capacity: {
          current: 3,
          next: 5,
          price: 60,
          affordable: false
        }
      },
      cutout: {
        status: "idle",
        sourcePreviewUrl: "",
        resultPreviewUrl: "",
        message: ""
      },
      settings: {
        viewing: false,
        backgroundId: "westlake",
        soundOn: false
      },
      journeys: [],
      relationships: {}
    };
  }

  function forwardEvent(event) {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        if (root.console && typeof root.console.error === "function") {
          root.console.error("AquariumAPI listener failed", error);
        }
      }
    });
  }

  function ensureCore() {
    if (!root.AquariumCore || typeof root.AquariumCore.getInstance !== "function") {
      return null;
    }
    const current = root.AquariumCore.getInstance();
    if (core === current) return core;
    if (unsubscribeCore) unsubscribeCore();
    core = current;
    unsubscribeCore = core.subscribe(forwardEvent);
    return core;
  }

  function getViewModel() {
    const instance = ensureCore();
    if (!instance || typeof instance.getViewModel !== "function") {
      return fallbackViewModel();
    }
    try {
      return instance.getViewModel();
    } catch (_error) {
      return fallbackViewModel();
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function noop() {};
    listeners.add(listener);
    ensureCore();
    return () => listeners.delete(listener);
  }

  function stableResult(result) {
    if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
      return {
        ok: false,
        code: "INVALID_CORE_RESULT",
        message: "刚才的操作没有完成，请再试一次。",
        viewModel: getViewModel()
      };
    }
    return {
      ...result,
      viewModel: getViewModel()
    };
  }

  async function invoke(method, args) {
    const instance = ensureCore();
    if (!instance || typeof instance[method] !== "function") {
      return { ...NOT_READY, viewModel: getViewModel() };
    }
    try {
      if (method !== "init") {
        const initResult = await instance.init();
        if (!initResult.ok) return stableResult(initResult);
      }
      return stableResult(await instance[method](...(args || [])));
    } catch (error) {
      return {
        ok: false,
        code: error && error.code ? error.code : "UNEXPECTED_ERROR",
        message: error && error.message
          ? error.message
          : "哎呀，出错了，请重启试试。",
        viewModel: getViewModel()
      };
    }
  }

  function init() {
    return invoke("init");
  }

  function feedFish(fishId) {
    return invoke("feedFish", [fishId]);
  }

  function openAddFlow() {
    return invoke("openAddFlow");
  }

  function selectInputImage(file) {
    return invoke("selectInputImage", [file]);
  }

  function generateCutout(options) {
    return invoke("generateCutout", [options]);
  }

  function cancelCutout() {
    return invoke("cancelCutout");
  }

  function confirmAddObject(options) {
    return invoke("confirmAddObject", [options]);
  }

  function setViewing(enabled) {
    return invoke("setViewing", [enabled]);
  }

  function toggleBackground() {
    return invoke("toggleBackground");
  }

  function toggleSound() {
    return invoke("toggleSound");
  }

  function setObjectState(objectId, state) {
    return invoke("setObjectState", [objectId, state]);
  }

  function setObjectScale(objectId, scale) {
    return invoke("setObjectScale", [objectId, scale]);
  }

  function removeObject(objectId) {
    return invoke("removeObject", [objectId]);
  }

  function setFishScale(fishId, scale) {
    return invoke("setFishScale", [fishId, scale]);
  }

  function removeFish(fishId) {
    return invoke("removeFish", [fishId]);
  }

  function setDecorScale(decorId, scale) {
    return invoke("setDecorScale", [decorId, scale]);
  }

  function removeDecor(decorId) {
    return invoke("removeDecor", [decorId]);
  }

  function upgradeCapacity() {
    return invoke("upgradeCapacity");
  }

  function purchaseUnlock(kind, unlockId) {
    return invoke("purchaseUnlock", [kind, unlockId]);
  }

  function chooseMaturity(fishId, choice) {
    return invoke("chooseMaturity", [fishId, choice]);
  }

  function startJourney(fishId) {
    return invoke("startJourney", [fishId]);
  }

  function openOfflineEvent(eventId) {
    return invoke("openOfflineEvent", [eventId]);
  }

  function resolveEventChoice(eventId, choiceId) {
    return invoke("resolveEventChoice", [eventId, choiceId]);
  }

  function createEventPoster(eventId) {
    return invoke("createEventPoster", [eventId]);
  }

  function createPoster() {
    return invoke("createPoster");
  }

  function savePoster() {
    return invoke("savePoster");
  }

  function saveNow() {
    return invoke("saveNow");
  }

  root.AquariumAPI = {
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
    chooseMaturity,
    startJourney,

    openOfflineEvent,
    resolveEventChoice,
    createEventPoster,
    createPoster,
    savePoster,
    saveNow
  };

  if (root.addEventListener) {
    root.addEventListener("pagehide", () => {
      if (core && typeof core.saveNow === "function") core.saveNow();
    });
  }

  root.addEventListener && root.addEventListener("beforeunload", () => {
    if (unsubscribeCore) unsubscribeCore();
  });
})(globalThis);
