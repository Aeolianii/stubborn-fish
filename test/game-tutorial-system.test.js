import { describe, expect, it } from "vitest";

import "../game/js/tutorial-system.js";

describe("aquarium tutorial state machine", () => {
  it("requires the guided discounted items and maturity decision in order", () => {
    const storage = globalThis.AquariumTutorial.createMemoryStorage();
    const tutorial = globalThis.AquariumTutorial.createTutorial({ storage });

    expect(tutorial.getState().step).toBe("entry");
    expect(tutorial.signal("enter")).toBe(true);
    expect(tutorial.signal("continue")).toBe(true);
    expect(tutorial.signal("openShop")).toBe(true);
    expect(tutorial.signal("purchaseDecor", { itemId: "amphora" })).toBe(false);
    expect(tutorial.signal("purchaseDecor", { itemId: "stone-cave" })).toBe(true);
    expect(tutorial.getState()).toMatchObject({ step: "close-decor-shop", total: 10 });
    expect(tutorial.signal("closeShop")).toBe(true);
    expect(tutorial.signal("openAdd")).toBe(true);
    expect(tutorial.signal("openCollection")).toBe(true);
    expect(tutorial.signal("placeDecor", { itemId: "stone-cave" })).toBe(true);
    expect(tutorial.signal("selectDecor", { itemId: "amphora" })).toBe(false);
    expect(tutorial.signal("selectDecor", { itemId: "stone-cave" })).toBe(true);
    expect(tutorial.signal("finishDecor")).toBe(true);
    expect(tutorial.getState().step).toBe("shop-fish");
    expect(tutorial.signal("openShop")).toBe(true);
    expect(tutorial.signal("purchaseFish", { itemId: "betta" })).toBe(true);
    expect(tutorial.signal("placeFish", { itemId: "betta" })).toBe(true);
    expect(tutorial.signal("continue")).toBe(true);
    expect(tutorial.signal("maturityReady", { fishId: "fish-2" })).toBe(false);
    expect(tutorial.signal("maturityReady", { fishId: "fish-1" })).toBe(true);
    expect(tutorial.signal("maturityResolved", { fishId: "fish-1" })).toBe(true);
    expect(tutorial.signal("openPhoto")).toBe(true);
    expect(tutorial.getState()).toMatchObject({ step: "complete", complete: true });
  });

  it("persists progress and always permits skipping", () => {
    const storage = globalThis.AquariumTutorial.createMemoryStorage();
    const first = globalThis.AquariumTutorial.createTutorial({ storage });
    first.signal("enter");
    first.signal("continue");

    const resumed = globalThis.AquariumTutorial.createTutorial({ storage });
    expect(resumed.getState().step).toBe("shop-decor");
    expect(resumed.signal("skip")).toBe(true);

    const completed = globalThis.AquariumTutorial.createTutorial({ storage });
    expect(completed.getState()).toMatchObject({ step: "complete", complete: true });
  });
});
