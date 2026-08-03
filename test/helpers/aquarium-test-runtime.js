import "../../game/js/cutout-flow.js";
import "../../game/js/story-template-catalog.js";
import "../../game/js/fixed-event-catalog.js";
import "../../game/js/story-template-registry.js";
import "../../game/js/state-store.js";
import "../../game/js/economy-system.js";
import "../../game/js/relationship-system.js";
import "../../game/js/growth-journey.js";
import "../../game/js/event-director.js";
import "../../game/js/story-agent.js";
import "../../game/js/poster-renderer.js";
import "../../game/js/aquarium-core.js";
import "../../game/js/aquarium-api.js";

export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values
  };
}

export function createFallbackStoryAgent() {
  return {
    generate(event) {
      return Promise.resolve({
        title: event.title,
        body: event.body,
        posterLine: event.posterLine,
        status: "fallback",
        reason: "TEST_FALLBACK",
        resolvedAt: event.occurredAt + 1
      });
    }
  };
}

export function createFakeCanvas() {
  const gradient = { addColorStop() {} };
  const context = {
    drawImageCalls: [],
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
    globalAlpha: 1,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    arc() {},
    clip() {},
    save() {},
    restore() {},
    drawImage(...args) {
      this.drawImageCalls.push(args);
    },
    fillText() {},
    createLinearGradient() {
      return gradient;
    },
    measureText(text) {
      return { width: String(text).length * 28 };
    }
  };
  return {
    width: 0,
    height: 0,
    getContext() {
      return context;
    },
    toDataURL() {
      return "data:image/png;base64,dGVzdA==";
    },
    toBlob(callback) {
      callback({ type: "image/png", size: 4 });
    }
  };
}
