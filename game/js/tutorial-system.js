(function (root) {
  "use strict";

  const STORAGE_KEY = "stubborn_fish_tutorial_v1";
  const STEPS = [
    "entry",
    "welcome",
    "shop-decor",
    "buy-decor",
    "close-decor-shop",
    "open-decor-add",
    "open-decor-collection",
    "place-decor",
    "select-decor",
    "adjust-decor",
    "shop-fish",
    "buy-fish",
    "place-fish",
    "event",
    "feed",
    "maturity",
    "photo",
    "complete"
  ];

  const TRANSITIONS = {
    entry: { enter: "welcome" },
    welcome: { continue: "shop-decor" },
    "shop-decor": { openShop: "buy-decor" },
    "buy-decor": { purchaseDecor: "close-decor-shop" },
    "close-decor-shop": { closeShop: "open-decor-add" },
    "open-decor-add": { openAdd: "open-decor-collection" },
    "open-decor-collection": { openCollection: "place-decor" },
    "place-decor": { placeDecor: "select-decor" },
    "select-decor": { selectDecor: "adjust-decor" },
    "adjust-decor": { finishDecor: "shop-fish" },
    "shop-fish": { openShop: "buy-fish" },
    "buy-fish": { purchaseFish: "place-fish" },
    "place-fish": { placeFish: "event" },
    event: { continue: "feed" },
    feed: { maturityReady: "maturity" },
    maturity: { maturityResolved: "photo" },
    photo: { openPhoto: "complete", skipPhoto: "complete" }
  };

  function safeParse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return value && typeof value === "object" ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      }
    };
  }

  function createTutorial(options) {
    const config = options || {};
    const storage = config.storage || root.localStorage || createMemoryStorage();
    const onChange = typeof config.onChange === "function" ? config.onChange : function noop() {};
    const stored = safeParse(storage.getItem(STORAGE_KEY));
    let step = stored && STEPS.includes(stored.step) ? stored.step : "entry";
    if (stored && stored.complete) step = "complete";

    function snapshot() {
      return {
        step,
        complete: step === "complete",
        index: Math.max(0, STEPS.indexOf(step)),
        total: 10
      };
    }

    function persist() {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    }

    function setStep(nextStep) {
      if (!STEPS.includes(nextStep) || nextStep === step) return false;
      step = nextStep;
      persist();
      onChange(snapshot());
      return true;
    }

    function signal(action, payload) {
      if (action === "skip") return setStep("complete");
      const expected = TRANSITIONS[step] && TRANSITIONS[step][action];
      if (!expected) return false;
      const data = payload || {};
      if (["purchaseDecor", "placeDecor", "selectDecor"].includes(action)) {
        if (data.itemId !== "stone-cave") return false;
      }
      if (action === "purchaseFish" || action === "placeFish") {
        if (data.itemId !== "betta") return false;
      }
      if (action === "maturityReady" || action === "maturityResolved") {
        if (data.fishId !== "fish-1") return false;
      }
      return setStep(expected);
    }

    function reset() {
      step = "entry";
      persist();
      onChange(snapshot());
    }

    return {
      getState: snapshot,
      signal,
      setStep,
      reset
    };
  }

  root.AquariumTutorial = {
    STORAGE_KEY,
    STEPS: STEPS.slice(),
    createTutorial,
    createMemoryStorage
  };
})(globalThis);
