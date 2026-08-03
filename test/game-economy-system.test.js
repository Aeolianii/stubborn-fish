import { describe, expect, it } from "vitest";

import "./helpers/aquarium-test-runtime.js";

describe("aquarium affection economy", () => {
  it("uses only active fish count and affection to accelerate online income", () => {
    const state = {
      feed: 0,
      lastOnlineFeedAt: 0,
      fish: [
        { id: "active-close", active: true, affection: 100 },
        { id: "active-new", active: true, affection: 0 },
        { id: "journey", active: false, affection: 100 }
      ]
    };

    expect(globalThis.AquariumEconomy.incomeRate(state)).toMatchObject({
      multiplier: 1.65,
      activeFishCount: 2
    });
    expect(globalThis.AquariumEconomy.settleOnlineFeed(state, 90_000)).toBe(3);
    expect(state.feed).toBe(3);

    state.fish[0].active = false;
    expect(globalThis.AquariumEconomy.incomeRate(state)).toMatchObject({
      multiplier: 1.15,
      activeFishCount: 1
    });
  });

  it("keeps the eight-hour offline cap and limits boosted income to three times", () => {
    const state = {
      feed: 0,
      lastActiveAt: 0,
      lastOnlineFeedAt: 0,
      fish: Array.from({ length: 6 }, (_, index) => ({
        id: `fish-${index}`,
        active: true,
        affection: 100
      }))
    };

    const result = globalThis.AquariumEconomy.settleOfflineFeed(
      state,
      10 * 60 * 60 * 1000
    );

    expect(result).toMatchObject({
      feedEarned: 360,
      multiplier: 3,
      maxFeed: 360,
      capped: true,
      valid: true
    });
    expect(state.feed).toBe(360);
  });

  it("applies one-time unlock prices marked as new-player discounts", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    const shop = globalThis.AquariumEconomy.getShopView(state);

    expect(shop.decor.find((item) => item.id === "stone-cave")).toMatchObject({
      price: 10,
      originalPrice: 20,
      newPlayerDiscount: true,
      affordable: true
    });
    expect(globalThis.AquariumEconomy.purchaseUnlock(state, "decor", "stone-cave"))
      .toMatchObject({
        ok: true,
        data: { spent: 10, originalPrice: 20, newPlayerDiscount: true }
      });
    expect(globalThis.AquariumEconomy.purchaseUnlock(state, "fish", "betta"))
      .toMatchObject({
        ok: true,
        data: { spent: 30, originalPrice: 50, newPlayerDiscount: true }
      });
    expect(state.feed).toBe(160);
  });
});
