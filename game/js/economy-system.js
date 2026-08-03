(function (root) {
  "use strict";

  const ONLINE_INTERVAL_MS = 45 * 1000;
  const OFFLINE_INTERVAL_MS = 4 * 60 * 1000;
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const MAX_INCOME_MULTIPLIER = 3;
  const MAX_REASONABLE_GAP_MS = 365 * 24 * 60 * 60 * 1000;
  const FEED_COST = 4;
  const CAPACITY_LIMITS = [3, 5, 7, 9];
  const CAPACITY_COSTS = [60, 120, 220];
  const decorProduct = (id, name, price, description, extra = {}) => ({
    id,
    name,
    price,
    size: "medium",
    iconUrl: `/game/assets/preset-decor/${id}.png`,
    description,
    ...extra
  });
  const SHOP_CATALOG = {
    decor: [
      decorProduct("stone-cave", "石洞", 20, "适合躲藏的小石洞", {
        newPlayerPrice: 10,
        size: "small"
      }),
      decorProduct("driftwood", "沉木", 35, "沉静铺开的弯曲沉木", { size: "small" }),
      decorProduct("amphora", "旧陶罐", 50, "带时间痕迹的旧陶罐", {
        newPlayerPrice: 35
      }),
      decorProduct("rooted-grass", "扎根水草", 30, "从砂底舒展的彩色水草"),
      decorProduct("coral", "浅色珊瑚", 45, "柔和明亮的水下珊瑚"),
      decorProduct("ribbon-grass", "带状水草", 30, "随水流轻摆的高挑水草"),
      decorProduct("feather-grass", "羽叶水草", 40, "枝叶轻盈的羽状水草"),
      decorProduct("moss-bush", "团簇水草", 35, "贴近砂底生长的浓密水草"),
      decorProduct("river-stones", "河滩卵石", 25, "层层叠放的圆润卵石"),
      decorProduct("slate-rocks", "青岩石柱", 55, "安静挺立的深色岩柱"),
      decorProduct("pebble-cluster", "小卵石群", 20, "适合点缀角落的小石群", { size: "small" }),
      decorProduct("water-lily", "睡莲", 65, "轻轻浮在水面的睡莲"),
      decorProduct("duckweed", "浮萍", 25, "铺开一小片圆润浮萍", { size: "small" }),
      decorProduct("water-lettuce", "水鳖", 35, "叶片层叠的漂浮水草"),
      decorProduct("water-hyacinth", "水葫芦", 50, "开着灰蓝小花的水葫芦"),
      decorProduct("floating-heart", "荇菜", 40, "带着小黄花的圆叶荇菜"),
      decorProduct("floating-fern", "槐叶萍", 45, "叶缘细碎的漂浮蕨草"),
      decorProduct("lotus-pair", "小莲花", 70, "一朵盛放、一枚含苞的小莲花")
    ],
    fish: [
      {
        id: "betta",
        name: "铜蓝斗鱼",
        price: 50,
        newPlayerPrice: 30,
        iconUrl: "/game/assets/preset-fish/betta.png?v=2",
        description: "尾鳍舒展的铜蓝斗鱼"
      },
      {
        id: "guppy",
        name: "金尾孔雀鱼",
        price: 90,
        iconUrl: "/game/assets/preset-fish/guppy.png?v=2",
        description: "轻快摆尾的金尾孔雀鱼"
      },
      {
        id: "butterfly-koi",
        name: "蝶尾锦鲤",
        price: 140,
        iconUrl: "/game/assets/preset-fish/butterfly-koi.png?v=2",
        description: "尾鳍柔展的蝶尾锦鲤"
      },
      {
        id: "big-dog-fish",
        name: "大狗鱼",
        price: 200,
        iconUrl: "/game/assets/preset-fish/big-dog-fish.png",
        description: "一跃入水的大狗鱼"
      },
      {
        id: "cat-fish",
        name: "猫鱼",
        price: 200,
        iconUrl: "/game/assets/preset-fish/cat-fish.png",
        description: "圆滚滚的猫鱼"
      },
      {
        id: "milk-cat-fish",
        name: "奶猫鱼",
        price: 200,
        iconUrl: "/game/assets/preset-fish/milk-cat-fish.png",
        description: "黑白花纹的奶猫鱼"
      },
      {
        id: "milk-fish",
        name: "奶鱼",
        price: 200,
        iconUrl: "/game/assets/preset-fish/milk-fish.png",
        description: "金灿灿的奶鱼"
      },
      {
        id: "tingquan-fish",
        name: "听泉鱼",
        price: 200,
        iconUrl: "/game/assets/preset-fish/tingquan-fish.png",
        description: "悠闲摆尾的听泉鱼"
      }
    ]
  };

  function asSafeAmount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function incomeRate(state) {
    const activeFish = (Array.isArray(state && state.fish) ? state.fish : [])
      .filter((fish) => fish && fish.active !== false);
    const affectionContribution = activeFish.reduce((sum, fish) => (
      sum + Math.max(0, Math.min(100, Number(fish.affection) || 0)) / 100 * 0.35
    ), 0);
    const multiplier = Math.min(
      MAX_INCOME_MULTIPLIER,
      1 + activeFish.length * 0.15 + affectionContribution
    );
    const roundedMultiplier = Number(multiplier.toFixed(4));
    return {
      multiplier: roundedMultiplier,
      activeFishCount: activeFish.length,
      onlineIntervalMs: ONLINE_INTERVAL_MS / roundedMultiplier,
      offlineIntervalMs: OFFLINE_INTERVAL_MS / roundedMultiplier,
      offlineCapMs: OFFLINE_CAP_MS,
      offlineMaxFeed: Math.floor(OFFLINE_CAP_MS / OFFLINE_INTERVAL_MS * roundedMultiplier)
    };
  }

  function normalizeIncomeMultiplier(value) {
    const multiplier = Number(value);
    return Number.isFinite(multiplier)
      ? Math.max(1, Math.min(MAX_INCOME_MULTIPLIER, multiplier))
      : 1;
  }

  function calculateOfflineFeed(lastActiveAt, now, incomeMultiplier) {
    const start = Number(lastActiveAt);
    const end = Number(now);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { feedEarned: 0, elapsedMs: 0, valid: false, reason: "INVALID_TIME" };
    }
    const rawElapsedMs = end - start;
    if (rawElapsedMs < 0) {
      return { feedEarned: 0, elapsedMs: 0, valid: false, reason: "TIME_REVERSED" };
    }
    if (rawElapsedMs > MAX_REASONABLE_GAP_MS) {
      return { feedEarned: 0, elapsedMs: 0, valid: false, reason: "ABNORMAL_GAP" };
    }
    const elapsedMs = Math.min(rawElapsedMs, OFFLINE_CAP_MS);
    const multiplier = normalizeIncomeMultiplier(incomeMultiplier);
    const effectiveIntervalMs = OFFLINE_INTERVAL_MS / multiplier;
    return {
      feedEarned: Math.floor(elapsedMs / effectiveIntervalMs),
      elapsedMs,
      rawElapsedMs,
      multiplier,
      maxFeed: Math.floor(OFFLINE_CAP_MS / effectiveIntervalMs),
      valid: true,
      capped: rawElapsedMs > OFFLINE_CAP_MS
    };
  }

  function settleOnlineFeed(state, now) {
    const current = Number(now);
    const last = Number(state.lastOnlineFeedAt);
    if (!Number.isFinite(current)) return 0;
    if (!Number.isFinite(last) || current < last) {
      state.lastOnlineFeedAt = current;
      return 0;
    }
    const rate = incomeRate(state);
    const earned = Math.floor((current - last) / rate.onlineIntervalMs);
    if (earned > 0) {
      state.feed = asSafeAmount(state.feed) + earned;
      state.lastOnlineFeedAt = last + earned * rate.onlineIntervalMs;
    }
    return earned;
  }

  function settleOfflineFeed(state, now) {
    const rate = incomeRate(state);
    const result = calculateOfflineFeed(state.lastActiveAt, now, rate.multiplier);
    if (result.feedEarned > 0) {
      state.feed = asSafeAmount(state.feed) + result.feedEarned;
    }
    state.lastActiveAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    state.lastOnlineFeedAt = state.lastActiveAt;
    return result;
  }

  function canAfford(state, amount) {
    return asSafeAmount(state && state.feed) >= asSafeAmount(amount);
  }

  function spendFeed(state, amount) {
    const cost = asSafeAmount(amount);
    if (!canAfford(state, cost)) return false;
    state.feed = asSafeAmount(state.feed) - cost;
    return true;
  }

  function addFeed(state, amount) {
    const earned = asSafeAmount(amount);
    state.feed = asSafeAmount(state.feed) + earned;
    return earned;
  }

  function capacityView(state) {
    const index = Math.max(
      0,
      Math.min(CAPACITY_LIMITS.length - 1, Math.floor(Number(state.capacityIndex) || 0))
    );
    const limit = CAPACITY_LIMITS[index];
    return {
      index,
      limit,
      nextLimit: CAPACITY_LIMITS[index + 1] || null,
      upgradeCost: CAPACITY_COSTS[index] || null
    };
  }

  function upgradeCapacity(state) {
    const current = capacityView(state);
    if (current.upgradeCost === null) {
      return { ok: false, code: "CAPACITY_MAX", message: "实物容量已经升到最高了。" };
    }
    if (!spendFeed(state, current.upgradeCost)) {
      return {
        ok: false,
        code: "INSUFFICIENT_FEED",
        message: "藻币还不够，再等一小会儿吧。"
      };
    }
    state.capacityIndex = current.index + 1;
    return {
      ok: true,
      data: {
        spent: current.upgradeCost,
        previousLimit: current.limit,
        limit: CAPACITY_LIMITS[state.capacityIndex]
      }
    };
  }

  function findCatalogItem(kind, unlockId) {
    const catalog = SHOP_CATALOG[kind];
    return Array.isArray(catalog)
      ? catalog.find((item) => item.id === unlockId) || null
      : null;
  }

  function ensureInventory(state) {
    state.inventory = state.inventory && typeof state.inventory === "object"
      ? state.inventory
      : { decor: {}, fish: {} };
    ["decor", "fish"].forEach((kind) => {
      state.inventory[kind] = state.inventory[kind]
        && typeof state.inventory[kind] === "object"
        && !Array.isArray(state.inventory[kind])
        ? state.inventory[kind]
        : {};
    });
    return state.inventory;
  }

  function inventoryQuantity(state, kind, unlockId) {
    const inventory = ensureInventory(state);
    return asSafeAmount(inventory[kind] && inventory[kind][unlockId]);
  }

  function purchasePrice(item) {
    return asSafeAmount(
      item && item.newPlayerPrice !== undefined ? item.newPlayerPrice : item && item.price
    );
  }

  function purchaseUnlock(state, kind, unlockId) {
    if (kind !== "decor" && kind !== "fish") {
      return { ok: false, code: "INVALID_UNLOCK_KIND", message: "没有找到这个解锁分类。" };
    }
    const item = findCatalogItem(kind, unlockId);
    if (!item) {
      return { ok: false, code: "UNLOCK_NOT_FOUND", message: "没有找到这个可解锁内容。" };
    }
    state.unlocks = state.unlocks || { decor: [], fish: [] };
    state.unlocks[kind] = Array.isArray(state.unlocks[kind]) ? state.unlocks[kind] : [];
    const price = purchasePrice(item);
    if (!spendFeed(state, price)) {
      return {
        ok: false,
        code: "INSUFFICIENT_FEED",
        message: "藻币还不够，再等一小会儿吧。"
      };
    }
    if (!state.unlocks[kind].includes(item.id)) state.unlocks[kind].push(item.id);
    const inventory = ensureInventory(state);
    const quantity = inventoryQuantity(state, kind, item.id) + 1;
    inventory[kind][item.id] = quantity;
    return {
      ok: true,
      data: {
        kind,
        unlockId: item.id,
        spent: price,
        originalPrice: item.price,
        newPlayerDiscount: price < item.price,
        quantity
      }
    };
  }

  function consumeOwnedCatalogItem(state, kind, unlockId) {
    if (kind !== "decor" && kind !== "fish") {
      return { ok: false, code: "INVALID_UNLOCK_KIND", message: "没有找到这个素材分类。" };
    }
    if (!findCatalogItem(kind, unlockId)) {
      return { ok: false, code: "UNLOCK_NOT_FOUND", message: "没有找到这个预设素材。" };
    }
    const quantity = inventoryQuantity(state, kind, unlockId);
    if (quantity <= 0) {
      return { ok: false, code: "ITEM_NOT_OWNED", message: "先去商店购买这个素材吧。" };
    }
    const nextQuantity = quantity - 1;
    const inventory = ensureInventory(state);
    if (nextQuantity > 0) inventory[kind][unlockId] = nextQuantity;
    else delete inventory[kind][unlockId];
    return {
      ok: true,
      data: { kind, unlockId, quantity: nextQuantity }
    };
  }

  function getShopView(state) {
    const decorate = (kind, item) => {
      const quantity = inventoryQuantity(state, kind, item.id);
      const price = purchasePrice(item);
      return {
        ...item,
        originalPrice: item.price,
        price,
        newPlayerDiscount: price < item.price,
        owned: quantity > 0,
        quantity,
        affordable: canAfford(state, price)
      };
    };
    const capacity = capacityView(state);
    return {
      decor: SHOP_CATALOG.decor.map((item) => decorate("decor", item)),
      fish: SHOP_CATALOG.fish.map((item) => decorate("fish", item)),
      capacity: {
        current: capacity.limit,
        next: capacity.nextLimit,
        price: capacity.upgradeCost,
        affordable: capacity.upgradeCost !== null && canAfford(state, capacity.upgradeCost)
      }
    };
  }

  root.AquariumEconomy = {
    ONLINE_INTERVAL_MS,
    OFFLINE_INTERVAL_MS,
    OFFLINE_CAP_MS,
    MAX_INCOME_MULTIPLIER,
    FEED_COST,
    CAPACITY_LIMITS,
    CAPACITY_COSTS,
    SHOP_CATALOG,
    incomeRate,
    calculateOfflineFeed,
    settleOnlineFeed,
    settleOfflineFeed,
    canAfford,
    spendFeed,
    addFeed,
    capacityView,
    upgradeCapacity,
    purchaseUnlock,
    consumeOwnedCatalogItem,
    getShopView
  };
})(globalThis);
