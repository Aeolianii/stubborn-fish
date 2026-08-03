(function (root) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const PRIMARY_KEY = "stubborn_fish_state_v1";
  const BACKUP_KEY = "stubborn_fish_state_backup_v1";
  const LEGACY_KEYS = ["quiet-aquarium-state-v2"];
  const DB_NAME = "stubborn-fish-assets-v1";
  const DB_STORE = "images";

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      }
    };
  }

  function randomId(now) {
    return `aquarium-${now}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function defaultFish() {
    return [
      {
        id: "fish-1",
        type: "fish",
        name: "月白",
        personality: ["好奇", "慢热"],
        x: 0.34,
        y: 0.42,
        size: 0.112,
        growth: 99,
        affection: 99,
        effectiveEventIds: ["starter-memory-1", "starter-memory-2"],
        effectiveEventCount: 2,
        mature: false,
        maturityRewardClaimed: false,
        maturityChoice: null,
        journeyStartedAt: null,
        active: true,
        source: "preset",
        sprite: 0,
        atlas: "original",
        assetKind: "atlas-fish",
        iconUrl: "/game/assets/fish-atlas.png"
      }
    ];
  }

  function createDefaultState(nowValue) {
    const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
    return {
      schemaVersion: SCHEMA_VERSION,
      stateId: randomId(now),
      savedAt: now,
      lastActiveAt: now,
      lastOnlineFeedAt: now,
      ready: false,
      feed: 200,
      capacityIndex: 0,
      unlocks: { decor: [], fish: [] },
      inventory: { decor: {}, fish: {} },
      selected: { fishId: null, objectId: null, decorId: null },
      settings: {
        viewing: false,
        backgroundId: "westlake",
        soundOn: false
      },
      fish: defaultFish(),
      objects: [],
      decor: [],
      relationships: {},
      stories: [],
      offlineEvents: [],
      recentFingerprints: [],
      settledObjectIds: [],
      arrivedFishIds: [],
      journeys: [],
      firstObjectRewarded: false,
      activeStoryId: null,
      nextOnlineEventAt: null,
      cutout: {
        status: "idle",
        sourcePreviewUrl: "",
        resultPreviewUrl: "",
        message: ""
      },
      scene: {}
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalizeInventory(input, unlocks) {
    const inventory = input && typeof input === "object" && !Array.isArray(input)
      ? input
      : null;
    const normalized = { decor: {}, fish: {} };
    ["decor", "fish"].forEach((kind) => {
      const source = inventory && inventory[kind]
        && typeof inventory[kind] === "object"
        && !Array.isArray(inventory[kind])
        ? inventory[kind]
        : null;
      if (source) {
        Object.entries(source).forEach(([id, value]) => {
          const quantity = Math.floor(Number(value));
          if (id && Number.isFinite(quantity) && quantity > 0) {
            normalized[kind][id] = quantity;
          }
        });
        return;
      }
      asArray(unlocks && unlocks[kind]).forEach((id) => {
        if (typeof id === "string" && id) normalized[kind][id] = 1;
      });
    });
    return normalized;
  }

  function normalizeFish(item, index) {
    const fish = item && typeof item === "object" ? item : {};
    const isLegacyStarterAtlas = fish.id === "fish-1"
      && fish.iconUrl === "/game/assets/default-fish-atlas.png";
    const effectiveEventIds = asArray(fish.effectiveEventIds)
      .filter((id) => typeof id === "string")
      .slice(-40);
    const effectiveEventCount = Math.max(
      Number(fish.effectiveEventCount) || 0,
      effectiveEventIds.length
    );
    const rawAffection = clamp(Math.max(
      Number(fish.growth) || 0,
      fish.affection === undefined ? 0 : Number(fish.affection) || 0
    ), 0, 100);
    const affection = rawAffection >= 100 && effectiveEventCount < 2
      ? 99
      : rawAffection;
    const growth = affection;
    const maturityChoice = fish.maturityChoice === "stay"
      || fish.maturityChoice === "journey"
      ? fish.maturityChoice
      : null;
    return {
      ...fish,
      id: String(fish.id || `fish-${index + 1}`),
      type: "fish",
      name: String(fish.name || `小鱼${index + 1}`),
      x: clamp(fish.x === undefined ? 0.3 + index * 0.12 : fish.x, 0, 1),
      y: clamp(fish.y === undefined ? 0.42 : fish.y, 0, 1),
      growth,
      affection,
      effectiveEventIds,
      effectiveEventCount,
      mature: Boolean(affection >= 100 && effectiveEventCount >= 2),
      maturityRewardClaimed: Boolean(fish.maturityRewardClaimed),
      maturityChoice,
      journeyStartedAt: Number.isFinite(Number(fish.journeyStartedAt))
        ? Number(fish.journeyStartedAt)
        : null,
      active: maturityChoice === "journey" ? false : fish.active !== false,
      source: fish.source === "memory" ? "memory" : (fish.source || "preset"),
      sprite: Math.max(0, Math.min(3, Math.floor(Number(fish.sprite) || 0))),
      atlas: isLegacyStarterAtlas
        ? "original"
        : fish.atlas === "default"
          ? "default"
          : "original",
      assetKind: fish.assetKind || "atlas-fish",
      iconUrl: isLegacyStarterAtlas
        ? "/game/assets/fish-atlas.png"
        : fish.iconUrl
    };
  }

  function normalizeObject(item, index) {
    const object = item && typeof item === "object" ? item : {};
    const allowedStates = new Set(["bottom", "suspended", "surface"]);
    return {
      ...object,
      id: String(object.id || `memory-${index + 1}`),
      type: "object",
      name: String(object.name || "没有名字的东西"),
      state: allowedStates.has(object.state) ? object.state : "suspended",
      x: clamp(object.x === undefined ? 0.5 : object.x, 0, 1),
      y: clamp(object.y === undefined ? 0.52 : object.y, 0, 1),
      scale: clamp(object.scale || 1, 0.5, 2),
      source: object.source || "memory",
      capturedAt: typeof object.capturedAt === "string" ? object.capturedAt : "",
      capturedPlace: typeof object.capturedPlace === "string" ? object.capturedPlace : "",
      entryEventId: typeof object.entryEventId === "string" ? object.entryEventId : null
    };
  }

  function normalizeState(input, nowValue) {
    const defaults = createDefaultState(nowValue);
    const state = input && typeof input === "object" ? input : {};
    const capacityIndex = clamp(
      Math.floor(Number(state.capacityIndex) || 0),
      0,
      3
    );
    const unlocks = {
      decor: asArray(state.unlocks && state.unlocks.decor)
        .filter((id) => typeof id === "string"),
      fish: asArray(state.unlocks && state.unlocks.fish)
        .filter((id) => typeof id === "string")
    };
    return {
      ...defaults,
      ...state,
      schemaVersion: SCHEMA_VERSION,
      stateId: typeof state.stateId === "string" && state.stateId
        ? state.stateId
        : defaults.stateId,
      savedAt: Number.isFinite(Number(state.savedAt))
        ? Number(state.savedAt)
        : defaults.savedAt,
      lastActiveAt: Number.isFinite(Number(state.lastActiveAt))
        ? Number(state.lastActiveAt)
        : defaults.lastActiveAt,
      lastOnlineFeedAt: Number.isFinite(Number(state.lastOnlineFeedAt))
        ? Number(state.lastOnlineFeedAt)
        : defaults.lastOnlineFeedAt,
      ready: Boolean(state.ready),
      feed: Math.max(0, Math.floor(Number(state.feed) || 0)),
      capacityIndex,
      unlocks,
      inventory: normalizeInventory(state.inventory, unlocks),
      selected: {
        fishId: state.selected && typeof state.selected.fishId === "string"
          ? state.selected.fishId
          : null,
        objectId: state.selected && typeof state.selected.objectId === "string"
          ? state.selected.objectId
          : null,
        decorId: state.selected && typeof state.selected.decorId === "string"
          ? state.selected.decorId
          : null
      },
      settings: {
        viewing: Boolean(state.settings && state.settings.viewing),
        backgroundId: state.settings && state.settings.backgroundId === "classic"
          ? "classic"
          : "westlake",
        soundOn: Boolean(state.settings && state.settings.soundOn)
      },
      fish: Array.isArray(state.fish)
        ? state.fish.map(normalizeFish)
        : defaults.fish,
      objects: asArray(state.objects).map(normalizeObject),
      decor: asArray(state.decor).filter((item) => item && typeof item === "object"),
      relationships: state.relationships && typeof state.relationships === "object"
        && !Array.isArray(state.relationships)
        ? state.relationships
        : {},
      stories: asArray(state.stories).slice(-100),
      arrivedFishIds: asArray(state.arrivedFishIds)
        .filter((id) => typeof id === "string")
        .slice(-50),
      offlineEvents: asArray(state.offlineEvents).slice(-60),
      recentFingerprints: asArray(state.recentFingerprints)
        .filter((value) => typeof value === "string")
        .slice(-20),
      settledObjectIds: asArray(state.settledObjectIds)
        .filter((value) => typeof value === "string")
        .slice(-100),
      journeys: asArray(state.journeys).slice(-40),
      firstObjectRewarded: Boolean(state.firstObjectRewarded),
      activeStoryId: typeof state.activeStoryId === "string"
        ? state.activeStoryId
        : null,
      nextOnlineEventAt: Number.isFinite(Number(state.nextOnlineEventAt))
        ? Number(state.nextOnlineEventAt)
        : null,
      cutout: {
        status: state.cutout && typeof state.cutout.status === "string"
          ? state.cutout.status
          : "idle",
        sourcePreviewUrl: "",
        resultPreviewUrl: "",
        message: state.cutout && typeof state.cutout.message === "string"
          ? state.cutout.message
          : ""
      },
      scene: state.scene && typeof state.scene === "object" ? state.scene : {}
    };
  }

  function migrate(input, nowValue) {
    const state = input && typeof input === "object" ? input : {};
    if (Number(state.schemaVersion) === SCHEMA_VERSION) {
      return normalizeState(state, nowValue);
    }
    if (Array.isArray(state.memoryObjects) || Array.isArray(state.customFish)) {
      const defaults = createDefaultState(nowValue);
      return normalizeState({
        ...defaults,
        settings: {
          viewing: false,
          backgroundId: state.backgroundId,
          soundOn: state.soundOn
        },
        fish: defaults.fish.concat(asArray(state.customFish).map((fish) => ({
          ...fish,
          source: "memory",
          active: true
        }))),
        objects: asArray(state.memoryObjects).map((object) => ({
          ...object,
          source: "memory"
        })),
        decor: Object.entries(state.decorLayout || {}).map(([id, layout]) => ({
          id,
          ...layout
        }))
      }, nowValue);
    }
    return normalizeState(state, nowValue);
  }

  function parseSnapshot(raw, nowValue) {
    if (typeof raw !== "string" || !raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return migrate(parsed, nowValue);
    } catch (_error) {
      return null;
    }
  }

  function snapshotForStorage(state, nowValue) {
    const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
    const normalized = normalizeState(state, now);
    normalized.savedAt = now;
    normalized.lastActiveAt = now;
    normalized.ready = true;
    normalized.cutout = {
      status: normalized.cutout.status === "processing" ? "idle" : normalized.cutout.status,
      sourcePreviewUrl: "",
      resultPreviewUrl: "",
      message: normalized.cutout.message || ""
    };
    return normalized;
  }

  function createStateStore(options) {
    const config = options || {};
    const storage = config.storage || root.localStorage || createMemoryStorage();
    const now = typeof config.now === "function" ? config.now : Date.now;
    const indexedDBRef = config.indexedDB === undefined ? root.indexedDB : config.indexedDB;
    let saveTimer = null;
    let dbPromise = null;

    function load() {
      const currentNow = now();
      const primary = parseSnapshot(storage.getItem(PRIMARY_KEY), currentNow);
      if (primary) return { state: primary, source: "primary", recovered: false };
      const backup = parseSnapshot(storage.getItem(BACKUP_KEY), currentNow);
      if (backup) return { state: backup, source: "backup", recovered: true };
      for (const key of LEGACY_KEYS) {
        const legacy = parseSnapshot(storage.getItem(key), currentNow);
        if (legacy) return { state: legacy, source: key, recovered: true };
      }
      return { state: createDefaultState(currentNow), source: "default", recovered: false };
    }

    function save(state) {
      const snapshot = snapshotForStorage(state, now());
      const serialized = JSON.stringify(snapshot);
      const previousRaw = storage.getItem(PRIMARY_KEY);
      const previous = parseSnapshot(previousRaw, snapshot.savedAt);
      try {
        if (previous && previousRaw) storage.setItem(BACKUP_KEY, previousRaw);
        storage.setItem(PRIMARY_KEY, serialized);
        if (!previous) storage.setItem(BACKUP_KEY, serialized);
      } catch (error) {
        const compact = {
          ...snapshot,
          stories: snapshot.stories.slice(-20),
          offlineEvents: snapshot.offlineEvents.slice(-20)
        };
        storage.setItem(PRIMARY_KEY, JSON.stringify(compact));
      }
      Object.assign(state, snapshot);
      return clone(snapshot);
    }

    function scheduleSave(state, delayMs) {
      if (saveTimer !== null) root.clearTimeout(saveTimer);
      saveTimer = root.setTimeout(() => {
        saveTimer = null;
        save(state);
      }, Math.max(0, Number(delayMs) || 500));
    }

    function openAssetDatabase() {
      if (dbPromise) return dbPromise;
      if (!indexedDBRef || typeof indexedDBRef.open !== "function") {
        dbPromise = Promise.resolve(null);
        return dbPromise;
      }
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDBRef.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(DB_STORE)) {
            request.result.createObjectStore(DB_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(() => null);
      return dbPromise;
    }

    async function assetOperation(mode, action) {
      const db = await openAssetDatabase();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const request = action(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
          request.onsuccess = () => resolve(request.result === undefined ? true : request.result);
          request.onerror = () => resolve(null);
        } catch (_error) {
          resolve(null);
        }
      });
    }

    function putAsset(key, blob) {
      if (!key || !blob) return Promise.resolve(false);
      return assetOperation("readwrite", (store) => store.put(blob, key));
    }

    function getAsset(key) {
      if (!key) return Promise.resolve(null);
      return assetOperation("readonly", (store) => store.get(key));
    }

    function deleteAsset(key) {
      if (!key) return Promise.resolve(false);
      return assetOperation("readwrite", (store) => store.delete(key));
    }

    function dispose() {
      if (saveTimer !== null) root.clearTimeout(saveTimer);
      saveTimer = null;
    }

    return {
      load,
      save,
      scheduleSave,
      putAsset,
      getAsset,
      deleteAsset,
      dispose
    };
  }

  root.AquariumStateStore = {
    SCHEMA_VERSION,
    PRIMARY_KEY,
    BACKUP_KEY,
    LEGACY_KEYS,
    createDefaultState,
    normalizeState,
    migrate,
    createStateStore
  };
})(globalThis);
