# Custom Fish Directional Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tall custom cutouts sway left and right like seaweed while wide or square custom cutouts retain the existing fish-like up-and-down mesh wave.

**Architecture:** Keep one `AquariumWebGLFishMesh` renderer and one textured grid. Add a pure aspect-ratio classifier, pass its mode from `game/js/app.js` into the renderer, and use one shader uniform to select the propagation axis, displacement axis, and stable end without rotating the texture or changing fish navigation.

**Tech Stack:** ES6 browser JavaScript, WebGL 1 vertex shaders, Canvas 2D fallback, Vitest 3.

## Global Constraints

- Tall means `aspectRatio < 1`; wide or square means `aspectRatio >= 1`.
- Tall custom fish still use the existing navigation, feeding, fear, editing, sizing, and persistence behavior.
- Use the existing renderer and mesh; do not add a second renderer or rotate the texture.
- Preserve `prefers-reduced-motion` scaling and the static Canvas fallback.
- Preserve the current texture orientation and apply tail-side facing correction only to fish-mode cutouts.
- Do not modify backend cutout or object-grounding APIs.

---

### Task 1: Classify custom-cutout motion

**Files:**
- Modify: `game/js/webgl-fish-mesh.js`
- Test: `test/game-webgl-fish-mesh.test.js`

**Interfaces:**
- Consumes: a numeric `aspectRatio` equal to transparent-image width divided by height.
- Produces: `resolveMotionMode(aspectRatio): "fish" | "seaweed"` on `globalThis.AquariumWebGLFishMesh`.

- [ ] **Step 1: Write the failing classification tests**

Add this test after the mesh-orientation test:

```javascript
it("selects mesh motion from the transparent image aspect ratio", () => {
  const { resolveMotionMode } = globalThis.AquariumWebGLFishMesh;

  expect(resolveMotionMode(1.6)).toBe("fish");
  expect(resolveMotionMode(1)).toBe("fish");
  expect(resolveMotionMode(0.62)).toBe("seaweed");
  expect(resolveMotionMode(0)).toBe("fish");
  expect(resolveMotionMode(Number.NaN)).toBe("fish");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: FAIL because `resolveMotionMode` is not defined.

- [ ] **Step 3: Implement the minimal classifier**

Add beside `clamp`:

```javascript
function resolveMotionMode(aspectRatio) {
  const ratio = Number(aspectRatio);
  return Number.isFinite(ratio) && ratio > 0 && ratio < 1
    ? "seaweed"
    : "fish";
}
```

Expose it in `root.AquariumWebGLFishMesh`:

```javascript
root.AquariumWebGLFishMesh = {
  buildMesh,
  calculateMotion,
  createRenderer,
  resolveMotionMode,
  textureFlipY: TEXTURE_FLIP_Y,
  vertexShaderSource
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: all focused tests PASS.

---

### Task 2: Add the seaweed deformation profile to the shared WebGL shader

**Files:**
- Modify: `game/js/webgl-fish-mesh.js`
- Test: `test/game-webgl-fish-mesh.test.js`

**Interfaces:**
- Consumes: `fish.motionMode` with value `"fish"` or `"seaweed"`.
- Produces: `calculateMotion(fish)` with numeric `motionMode` (`0` for fish, `1` for seaweed); the renderer uploads it as `u_motionMode`.

- [ ] **Step 1: Write failing motion-parameter and renderer-contract tests**

Add:

```javascript
it("maps fish and seaweed modes onto one renderer direction value", () => {
  const { calculateMotion } = globalThis.AquariumWebGLFishMesh;

  expect(calculateMotion({ motionMode: "fish" }).motionMode).toBe(0);
  expect(calculateMotion({ motionMode: "seaweed" }).motionMode).toBe(1);
});
```

Extend the reduced-motion test so both modes retain a subtle wave:

```javascript
const reducedSeaweed = calculateMotion({
  speed: 0.02,
  currentSpeed: 0.02,
  behavior: "cruise",
  motionMode: "seaweed",
  reducedMotion: true
});

expect(reducedSeaweed.motionMode).toBe(1);
expect(reducedSeaweed.amplitude).toBeGreaterThan(0);
expect(reducedSeaweed.amplitude).toBeLessThan(normal.amplitude * 0.5);
```

Add a recording WebGL test adapter that implements the WebGL calls used by
`createRenderer()` and records `uniform1f(location, value)` pairs. Use a second
canvas with a `null` 2D context so tail analysis takes its existing fallback.
Then add:

```javascript
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
});
```

The adapter is a test-only boundary fake. It records the values uploaded by the
real renderer and does not duplicate motion calculations.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: FAIL because `motionMode`, `u_motionMode`, and the seaweed shader profile do not exist.

- [ ] **Step 3: Add the mode to calculated motion**

Extend the `calculateMotion` return value:

```javascript
return {
  amplitude: clamp(
    (0.052 + speedRatio * 0.034)
      * behaviorStrength
      * reducedMotionStrength,
    0.012,
    0.148
  ),
  frequency: clamp(
    (5.2 + speedRatio * 1.45)
      * frequencyStrength
      * reducedFrequencyStrength,
    3.2,
    10.8
  ),
  phase: Number(source.phase) || 0,
  headStability: 0.91,
  motionMode: source.motionMode === "seaweed" ? 1 : 0
};
```

- [ ] **Step 4: Extend the vertex shader without duplicating the renderer**

Declare:

```glsl
uniform float u_motionMode;
```

Replace the single-axis deformation block with:

```glsl
float fishProgress = mix(
  a_texCoord.x,
  1.0 - a_texCoord.x,
  u_tailOnLeft
);
float seaweedProgress = 1.0 - a_texCoord.y;
float motionProgress = mix(
  fishProgress,
  seaweedProgress,
  u_motionMode
);
float motionWeight = pow(
  smoothstep(0.0, 1.0, motionProgress),
  1.65
);
float fishBodyWeight = mix(
  1.0 - u_headStability,
  1.0,
  motionWeight
);
float bodyWeight = mix(
  fishBodyWeight,
  motionWeight,
  u_motionMode
);
float wavePhase = (
  u_time * u_frequency
  + motionProgress * 6.2
  + u_phase
);
float wave = sin(wavePhase);
float crossSectionTilt = cos(wavePhase);

vec2 position = a_position;
position.x *= ${CONTENT_SCALE_X.toFixed(2)};
position.y *= ${CONTENT_SCALE_Y.toFixed(2)};
vec2 fishOffset = vec2(
  a_position.y
    * crossSectionTilt
    * u_amplitude
    * motionWeight
    * 0.18,
  wave * u_amplitude * bodyWeight
);
fishOffset.x -= (
  abs(wave)
  * u_amplitude
  * motionWeight
  * 0.055
);
vec2 seaweedOffset = vec2(
  wave * u_amplitude * bodyWeight,
  a_position.x
    * crossSectionTilt
    * u_amplitude
    * motionWeight
    * 0.12
);
position += mix(fishOffset, seaweedOffset, u_motionMode);
```

The `seaweedProgress` expression makes the texture bottom (`v = 1`) stable and lets the top (`v = 0`) sway most.

- [ ] **Step 5: Upload the new uniform**

Add `motionMode` to the `locations` object created inside `initialize()`:

```javascript
motionMode: gl.getUniformLocation(program, "u_motionMode")
```

Upload it immediately before drawing:

```javascript
gl.uniform1f(locations.motionMode, motion.motionMode);
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: all focused tests PASS, including both reduced-motion modes.

---

### Task 3: Connect transparent-image aspect ratio and facing to the renderer

**Files:**
- Modify: `game/js/app.js`
- Modify: `game/js/webgl-fish-mesh.js`
- Test: `test/game-webgl-fish-mesh.test.js`

**Interfaces:**
- Consumes: `webglFishApi.resolveMotionMode(ratio)`,
  `webglFishApi.resolveSourceFacing(motionMode, meshFrame)`, and existing
  `fish.aspectRatio`.
- Produces: `motionMode` passed to `webglFishRenderer.render(image, fishMotion)`;
  seaweed mode skips fish-tail facing correction.

- [ ] **Step 1: Write a failing facing-behavior test**

Add:

```javascript
it("applies tail-facing correction only to fish-mode cutouts", () => {
  const { resolveSourceFacing } = globalThis.AquariumWebGLFishMesh;

  expect(resolveSourceFacing("fish", { tailOnLeft: false })).toBe(-1);
  expect(resolveSourceFacing("fish", { tailOnLeft: true })).toBe(1);
  expect(resolveSourceFacing("seaweed", { tailOnLeft: false })).toBe(1);
  expect(resolveSourceFacing("seaweed", null)).toBe(1);
});
```

- [ ] **Step 2: Run the focused renderer test and verify RED**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: FAIL because `resolveSourceFacing` is not defined.

- [ ] **Step 3: Implement the minimal facing helper**

Add beside `resolveMotionMode`:

```javascript
function resolveSourceFacing(motionMode, meshFrame) {
  return motionMode === "fish"
    && meshFrame
    && !meshFrame.tailOnLeft
    ? -1
    : 1;
}
```

Expose `resolveSourceFacing` on `root.AquariumWebGLFishMesh`, rerun the focused
test, and expect PASS.

- [ ] **Step 4: Classify and pass the custom-fish mode**

After calculating `ratio` in `drawFish`, add:

```javascript
const motionMode = webglFishApi
  && typeof webglFishApi.resolveMotionMode === "function"
  ? webglFishApi.resolveMotionMode(ratio)
  : "fish";
```

Pass it to the renderer:

```javascript
const meshFrame = (
  fish.id !== state.selectedFishId
)
  ? webglFishRenderer.render(image, {
    speed: fish.speed,
    currentSpeed: fish.currentSpeed,
    behavior: fish.behavior,
    eatingUntil: fish.eatingUntil,
    phase: fish.phase,
    time: state.time,
    reducedMotion: REDUCED_MOTION,
    motionMode
  })
  : false;
```

Use the tested facing helper:

```javascript
const sourceFacing = webglFishApi
  && typeof webglFishApi.resolveSourceFacing === "function"
  ? webglFishApi.resolveSourceFacing(motionMode, meshFrame)
  : 1;
```

- [ ] **Step 5: Run focused renderer and route regression tests**

Run:

```powershell
pnpm vitest run test/game-route.test.ts test/game-webgl-fish-mesh.test.js
```

Expected: both test files PASS.

---

### Task 4: Full verification, browser smoke test, review, and commit

**Files:**
- Modify: `game/js/app.js`
- Modify: `game/js/webgl-fish-mesh.js`
- Test: `test/game-webgl-fish-mesh.test.js`

**Interfaces:**
- Consumes: the completed directional-motion implementation.
- Produces: a verified feature commit with no unrelated files staged.

- [ ] **Step 1: Run the complete automated verification**

Run:

```powershell
pnpm test
pnpm check
pnpm build
```

Expected: all tests PASS, TypeScript reports no errors, and the build exits with code `0`.

- [ ] **Step 2: Restart or reload the local deployment**

If the existing server already serves current static files, reload `http://127.0.0.1:3000/`. If the server is not healthy, start the freshly built backend:

```powershell
node --env-file=.env dist/src/server.js
```

Expected: `GET http://127.0.0.1:3000/health` returns `{"status":"ok"}`.

- [ ] **Step 3: Run browser smoke checks**

In the local page:

1. Confirm the aquarium renders without a white screen.
2. Confirm the browser console has no errors or warnings.
3. Confirm the page has no horizontal overflow.
4. Add or restore one tall custom cutout and one wide custom cutout if local test assets are already available.
5. Confirm the tall cutout continues swimming while its mesh sways left/right.
6. Confirm the wide cutout continues swimming while its mesh bends up/down.
7. Confirm selecting either custom fish shows the stable, unwarped editor image.

- [ ] **Step 4: Request code review and address valid findings**

Use `superpowers:requesting-code-review` on the three changed source/test files. Analyze each finding; apply only technically valid fixes, then rerun the focused and full verification commands.

- [ ] **Step 5: Commit the verified feature**

Stage only:

```powershell
git add -- game/js/app.js game/js/webgl-fish-mesh.js test/game-webgl-fish-mesh.test.js
git diff --cached --check
git commit -m "feat: adapt custom fish motion to aspect ratio"
```

Do not stage the existing untracked `camera-cutout-test.zip`.

---

### Task 5: Increase fish and seaweed deformation amplitudes

**Files:**
- Modify: `game/js/webgl-fish-mesh.js:5-8,191-240`
- Test: `test/game-webgl-fish-mesh.test.js:173-234`

**Interfaces:**
- Consumes: the existing `calculateMotion(fish)` result and numeric `motionMode`.
- Produces: fish-mode amplitude scaled by `1.8`, seaweed-mode amplitude scaled by `2.0`, with unchanged frequency and enough renderer padding to avoid clipping the stronger deformation.

- [ ] **Step 1: Write the failing amplitude test**

Add after the existing speed-sensitive motion test:

```javascript
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
```

Expected: FAIL because the current implementation still returns the prior
`0.086688` fish amplitude and `0.099072` seaweed amplitude.

- [ ] **Step 3: Apply the approved mode-specific amplitude scales**

In `calculateMotion`, derive the mode scale:

```javascript
const motionAmplitudeScale = motionMode ? 2.0 : 1.8;
```

Apply it after the existing base-amplitude clamp:

```javascript
amplitude: clamp(
  (0.052 + speedRatio * 0.034)
    * behaviorStrength
    * reducedMotionStrength,
  0.012,
  0.148
) * motionAmplitudeScale,
```

Leave the frequency calculation unchanged. Reduce `CONTENT_SCALE_X` from `0.74`
to `0.68` and `CONTENT_SCALE_Y` from `0.72` to `0.68`; the renderer already
compensates frame width and height by these scales, so the cutout keeps its
visual size while the offscreen frame gains room for the maximum `0.296`
seaweed displacement and `0.2664` fish displacement.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
pnpm vitest run test/game-webgl-fish-mesh.test.js
pnpm test
pnpm check
pnpm build
```

Expected: 11 focused WebGL tests pass, the complete suite passes, type checking
reports no errors, and the build exits with code `0`.

- [ ] **Step 5: Reload the local preview and visually verify both modes**

Reload `http://127.0.0.1:3001/` and verify:

1. The tall cutout has visibly stronger left/right mesh deformation.
2. A wide cutout has visibly stronger up/down mesh deformation.
3. Neither mode clips at the edge of its offscreen WebGL frame.
4. The browser console has no errors or warnings.

- [ ] **Step 6: Review and commit the amplitude adjustment**

Request code review for the two changed source/test files, address valid
findings, rerun verification, then stage only:

```powershell
git add -- game/js/webgl-fish-mesh.js test/game-webgl-fish-mesh.test.js
git diff --cached --check
git commit -m "feat: strengthen directional fish motion"
```
