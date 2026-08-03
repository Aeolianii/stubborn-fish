import { describe, expect, it } from "vitest";

import "../game/js/webgl-fish-mesh.js";

function createRecordingWebGL(uniformCalls) {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7,
    FLOAT: 8,
    BLEND: 9,
    ONE: 10,
    ONE_MINUS_SRC_ALPHA: 11,
    DEPTH_TEST: 12,
    UNPACK_FLIP_Y_WEBGL: 13,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 14,
    TEXTURE_2D: 15,
    TEXTURE_WRAP_S: 16,
    TEXTURE_WRAP_T: 17,
    CLAMP_TO_EDGE: 18,
    TEXTURE_MIN_FILTER: 19,
    TEXTURE_MAG_FILTER: 20,
    LINEAR: 21,
    RGBA: 22,
    UNSIGNED_BYTE: 23,
    COLOR_BUFFER_BIT: 24,
    TRIANGLES: 25,
    UNSIGNED_SHORT: 26,
    TEXTURE0: 27,
    createShader() {
      return {};
    },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return "";
    },
    deleteShader() {},
    createProgram() {
      return {};
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    getProgramInfoLog() {
      return "";
    },
    deleteProgram() {},
    createBuffer() {
      return {};
    },
    bindBuffer() {},
    bufferData() {},
    getAttribLocation() {
      return 0;
    },
    getUniformLocation(_program, name) {
      return name;
    },
    useProgram() {},
    enable() {},
    blendFunc() {},
    disable() {},
    pixelStorei() {},
    clearColor() {},
    viewport() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    uniform1i() {},
    createTexture() {
      return {};
    },
    bindTexture() {},
    texParameteri() {},
    texImage2D() {},
    clear() {},
    activeTexture() {},
    uniform1f(location, value) {
      uniformCalls.push([location, value]);
    },
    uniform2f(location, x, y) {
      uniformCalls.push([location, x, y]);
    },
    drawElements() {},
    flush() {}
  };
}

function createRecordingCanvasFactory(gl) {
  let callCount = 0;
  return function createCanvas() {
    callCount += 1;
    if (callCount === 1) {
      return {
        width: 0,
        height: 0,
        addEventListener() {},
        getContext(type) {
          return type === "webgl" ? gl : null;
        }
      };
    }
    return {
      width: 0,
      height: 0,
      getContext() {
        return null;
      }
    };
  };
}

describe("custom fish WebGL mesh", () => {
  it("builds a lightweight 16 by 4 textured grid", () => {
    const { buildMesh } = globalThis.AquariumWebGLFishMesh;
    const mesh = buildMesh(16, 4);

    expect(mesh.vertices).toHaveLength((16 + 1) * (4 + 1) * 4);
    expect(mesh.indices).toHaveLength(16 * 4 * 6);
    expect(Math.min(...mesh.vertices)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...mesh.vertices)).toBeLessThanOrEqual(1);
    expect(Math.max(...mesh.indices)).toBeLessThan((16 + 1) * (4 + 1));
  });

  it("keeps the image top aligned with the mesh top without upload flipping", () => {
    const { buildMesh, textureFlipY } = globalThis.AquariumWebGLFishMesh;
    const mesh = buildMesh(16, 4);

    expect(mesh.vertices.slice(0, 4)).toEqual([-1, 1, 0, 0]);
    expect(textureFlipY).toBe(false);
  });

  it("selects mesh motion from the transparent image aspect ratio", () => {
    const { resolveMotionMode } = globalThis.AquariumWebGLFishMesh;

    expect(resolveMotionMode(1.6)).toBe("fish");
    expect(resolveMotionMode(1)).toBe("fish");
    expect(resolveMotionMode(0.62)).toBe("seaweed");
    expect(resolveMotionMode(0)).toBe("fish");
    expect(resolveMotionMode(Number.NaN)).toBe("fish");
  });

  it("routes custom fish motion through a validated aspect ratio", () => {
    const { resolveCustomFishMotion } = globalThis.AquariumWebGLFishMesh;

    expect(resolveCustomFishMotion(1.8, 60, 120)).toEqual({
      aspectRatio: 1.8,
      motionMode: "fish"
    });
    expect(resolveCustomFishMotion(-2, 60, 120)).toEqual({
      aspectRatio: 0.5,
      motionMode: "seaweed"
    });
    expect(resolveCustomFishMotion(Infinity, 180, 90)).toEqual({
      aspectRatio: 2,
      motionMode: "fish"
    });
    expect(resolveCustomFishMotion(null, 0, 0)).toEqual({
      aspectRatio: 1,
      motionMode: "fish"
    });
  });

  it("keeps the head calmer while movement strengthens the tail wave", () => {
    const { calculateMotion } = globalThis.AquariumWebGLFishMesh;
    const resting = calculateMotion({
      speed: 0.02,
      currentSpeed: 0.004,
      behavior: "rest",
      phase: 0.4
    });
    const darting = calculateMotion({
      speed: 0.02,
      currentSpeed: 0.042,
      behavior: "dart",
      phase: 0.4
    });

    expect(resting.amplitude).toBeGreaterThan(0);
    expect(darting.amplitude).toBeGreaterThan(resting.amplitude);
    expect(darting.frequency).toBeGreaterThan(resting.frequency);
    expect(darting.headStability).toBeGreaterThan(0.8);
  });

  it("strengthens each direction without changing its wave frequency", () => {
    const { calculateMotion } = globalThis.AquariumWebGLFishMesh;
    const shared = {
      speed: 0.02,
      currentSpeed: 0.02,
      behavior: "cruise"
    };
    const fishMotion = calculateMotion({
      ...shared,
      motionMode: "fish"
    });
    const seaweedMotion = calculateMotion({
      ...shared,
      motionMode: "seaweed"
    });

    expect(fishMotion.amplitude).toBeCloseTo(0.111456, 6);
    expect(seaweedMotion.amplitude).toBeCloseTo(0.12384, 6);
    expect(fishMotion.frequency).toBeCloseTo(6.65, 6);
    expect(seaweedMotion.frequency).toBe(fishMotion.frequency);
  });

  it("keeps a subtle mesh wave when reduced motion is preferred", () => {
    const { calculateMotion } = globalThis.AquariumWebGLFishMesh;
    const normal = calculateMotion({
      speed: 0.02,
      currentSpeed: 0.02,
      behavior: "cruise"
    });
    const reduced = calculateMotion({
      speed: 0.02,
      currentSpeed: 0.02,
      behavior: "cruise",
      reducedMotion: true
    });
    const reducedSeaweed = calculateMotion({
      speed: 0.02,
      currentSpeed: 0.02,
      behavior: "cruise",
      motionMode: "seaweed",
      reducedMotion: true
    });

    expect(reduced.amplitude).toBeGreaterThan(0);
    expect(reduced.amplitude).toBeLessThan(normal.amplitude * 0.5);
    expect(reduced.frequency).toBeLessThan(normal.frequency);
    expect(reducedSeaweed.motionMode).toBe(1);
    expect(reducedSeaweed.amplitude).toBeGreaterThan(0);
    expect(reducedSeaweed.amplitude).toBeLessThan(normal.amplitude * 0.5);
  });

  it("maps fish and seaweed modes onto one renderer direction value", () => {
    const { calculateMotion } = globalThis.AquariumWebGLFishMesh;
    const fishMotion = calculateMotion({ motionMode: "fish" });
    const seaweedMotion = calculateMotion({ motionMode: "seaweed" });

    expect(fishMotion.motionMode).toBe(0);
    expect([fishMotion.bendAxisX, fishMotion.bendAxisY]).toEqual([0, 1]);
    expect(seaweedMotion.motionMode).toBe(1);
    expect([
      seaweedMotion.bendAxisX,
      seaweedMotion.bendAxisY
    ]).toEqual([1, 0]);
  });

  it("uploads seaweed mode to the shared WebGL renderer", () => {
    const uniformCalls = [];
    const gl = createRecordingWebGL(uniformCalls);
    const renderer = globalThis.AquariumWebGLFishMesh.createRenderer({
      createCanvas: createRecordingCanvasFactory(gl)
    });

    const frame = renderer.render({}, {
      motionMode: "seaweed",
      speed: 0.02,
      currentSpeed: 0.02,
      behavior: "cruise",
      time: 100
    });

    expect(frame).toBeTruthy();
    expect(uniformCalls).toContainEqual(["u_motionMode", 1]);
    expect(uniformCalls).toContainEqual(["u_bendAxis", 1, 0]);
  });

  it("applies tail-facing correction only to fish-mode cutouts", () => {
    const { resolveSourceFacing } = globalThis.AquariumWebGLFishMesh;

    expect(resolveSourceFacing("fish", { tailOnLeft: false })).toBe(-1);
    expect(resolveSourceFacing("fish", { tailOnLeft: true })).toBe(1);
    expect(resolveSourceFacing("seaweed", { tailOnLeft: false })).toBe(1);
    expect(resolveSourceFacing("seaweed", null)).toBe(1);
  });

  it("reports unavailable and lets Canvas render the static fallback", () => {
    const { createRenderer } = globalThis.AquariumWebGLFishMesh;
    const renderer = createRenderer({
      createCanvas() {
        return {
          width: 0,
          height: 0,
          addEventListener() {},
          getContext() {
            return null;
          }
        };
      }
    });

    expect(renderer.available).toBe(false);
    expect(renderer.render(null, {})).toBe(false);
  });
});
