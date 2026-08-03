import { describe, expect, it } from "vitest";

import "./helpers/aquarium-test-runtime.js";

describe("offline event Canvas anchors", () => {
  it("normalizes and clamps a pair midpoint", () => {
    expect(globalThis.AquariumCore.midpointAnchor(
      { x: 200, y: 100 },
      { x: 600, y: 300 },
      { width: 1000, height: 500 }
    )).toEqual({ x: 0.4, y: 0.4 });

    expect(globalThis.AquariumCore.midpointAnchor(
      { x: -20, y: 20 },
      { x: 3_000, y: 900 },
      { width: 1_000, height: 500 }
    )).toEqual({ x: 1, y: 0.92 });
  });

  it("uses the safe fallback when either entity is missing", () => {
    expect(globalThis.AquariumCore.midpointAnchor(
      { x: 0.2, y: 0.2 },
      null
    )).toEqual({ x: 0.5, y: 0.35 });
  });
});
