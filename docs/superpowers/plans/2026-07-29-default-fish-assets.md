# Default Fish Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the six supplied images into transparent local PNG files and expose them as directly selectable, animated, persistent default fish.

**Architecture:** Keep the existing 2×2 atlas unchanged. Add a focused browser module that owns the six standalone preset-fish records, preload those records into a `Map`, and reuse the existing standalone-image rendering path for both uploaded and preset fish.

**Tech Stack:** JavaScript ES6+, TypeScript 5.9, Fastify 5, Vitest 3, Sharp 0.35, local PNG assets, Canvas/WebGL.

## Global Constraints

- All new runtime resources must be local relative assets; no CDN or non-business network requests.
- The mobile experience remains landscape-first and WebKit-compatible.
- The six outputs must be transparent PNG files under `game/assets/default-fish/`.
- Existing default atlas fish and existing upload/AI cutout behavior must remain unchanged.
- Image proportions must be preserved; no stretching.
- A failed preset image must not prevent aquarium initialization.
- The final publishable artifact must remain below 8 MB.
- Do not edit or delete the user's untracked `camera-cutout-test.zip`.

---

### Task 1: Produce Transparent Preset Assets

**Files:**
- Create: `game/assets/default-fish/yellow-cartoon-fish.png`
- Create: `game/assets/default-fish/basketball-fish-24.png`
- Create: `game/assets/default-fish/cow-cat-fish.png`
- Create: `game/assets/default-fish/orange-cat-fish.png`
- Create: `game/assets/default-fish/round-cat-fish.png`
- Create: `game/assets/default-fish/charging-dog-fish.png`

**Interfaces:**
- Consumes: the six user-supplied files listed in the task conversation.
- Produces: tightly cropped PNGs with real alpha channels and unchanged subjects.

- [ ] **Step 1: Generate each transparent PNG**

Use the `imagegen` image-editing workflow once per source image. Preserve the subject exactly, remove only the white or baked checkerboard background, keep the full silhouette, and request a transparent background. Save each result to the exact path above.

- [ ] **Step 2: Verify alpha, dimensions, crop, and size**

Run:

```powershell
@'
import sharp from "sharp";
import { readdir } from "node:fs/promises";
const dir = "game/assets/default-fish";
for (const name of await readdir(dir)) {
  const image = sharp(`${dir}/${name}`);
  const meta = await image.metadata();
  const stats = await image.stats();
  if (!meta.hasAlpha || stats.isOpaque) throw new Error(`${name} is not transparent`);
  console.log(name, meta.width, meta.height, meta.hasAlpha, stats.isOpaque);
}
'@ | node
```

Expected: six files; every record reports `hasAlpha: true` and `isOpaque: false`. Visually inspect all six images against a dark checkerboard to confirm that the original baked background is gone and the subject is intact.

- [ ] **Step 3: Compress without changing dimensions or alpha**

Run a lossless Sharp rewrite only when the six files exceed a reasonable combined budget:

```powershell
Get-ChildItem game\assets\default-fish\*.png | ForEach-Object {
  pnpm exec sharp-cli -i $_.FullName -o "$($_.DirectoryName)\optimized" png --compressionLevel 9
}
```

If `sharp-cli` is not installed, do not add a package solely for this step; keep the verified ImageGen outputs and record their combined size.

- [ ] **Step 4: Commit the verified assets**

```powershell
git add -- game/assets/default-fish
git commit -m "assets: add transparent default fish"
```

### Task 2: Define and Serve the Preset Catalog

**Files:**
- Create: `game/js/default-fish-catalog.js`
- Modify: `game/index.html`
- Modify: `src/routes/game.ts`
- Create: `test/game-default-fish-assets.test.js`
- Modify: `test/game-route.test.ts`

**Interfaces:**
- Produces: `globalThis.AquariumDefaultFishCatalog.items`, `getById(id)`, and `getLoadedImage(images, fish)`.
- Each item has `{ id, name, src, size }`.
- `src/routes/game.ts` serves the catalog script and all six PNG paths as `image/png`.

- [ ] **Step 1: Write the failing catalog and route tests**

Add a Vitest suite that imports `game/js/default-fish-catalog.js` and asserts:

```javascript
expect(globalThis.AquariumDefaultFishCatalog.items).toEqual([
  expect.objectContaining({ id: "yellow-cartoon-fish", src: "/game/assets/default-fish/yellow-cartoon-fish.png" }),
  expect.objectContaining({ id: "basketball-fish-24", src: "/game/assets/default-fish/basketball-fish-24.png" }),
  expect.objectContaining({ id: "cow-cat-fish", src: "/game/assets/default-fish/cow-cat-fish.png" }),
  expect.objectContaining({ id: "orange-cat-fish", src: "/game/assets/default-fish/orange-cat-fish.png" }),
  expect.objectContaining({ id: "round-cat-fish", src: "/game/assets/default-fish/round-cat-fish.png" }),
  expect.objectContaining({ id: "charging-dog-fish", src: "/game/assets/default-fish/charging-dog-fish.png" })
]);
```

Use Sharp metadata in the same test to assert each file is PNG, has alpha, is non-opaque, and has positive dimensions. Extend `test/game-route.test.ts` to request the new script and all six asset URLs and assert HTTP 200 plus PNG signatures.

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
pnpm test -- test/game-default-fish-assets.test.js test/game-route.test.ts
```

Expected: FAIL because the catalog module and explicit Fastify routes do not exist.

- [ ] **Step 3: Implement the catalog module and routes**

Create the global module with six immutable records:

```javascript
(function (global) {
  "use strict";
  const items = Object.freeze([
    { id: "yellow-cartoon-fish", name: "小黄鱼", src: "/game/assets/default-fish/yellow-cartoon-fish.png", size: 0.13 },
    { id: "basketball-fish-24", name: "24号篮球鱼", src: "/game/assets/default-fish/basketball-fish-24.png", size: 0.13 },
    { id: "cow-cat-fish", name: "奶牛猫鱼", src: "/game/assets/default-fish/cow-cat-fish.png", size: 0.13 },
    { id: "orange-cat-fish", name: "橘猫鱼", src: "/game/assets/default-fish/orange-cat-fish.png", size: 0.13 },
    { id: "round-cat-fish", name: "圆脸猫鱼", src: "/game/assets/default-fish/round-cat-fish.png", size: 0.13 },
    { id: "charging-dog-fish", name: "冲锋小狗", src: "/game/assets/default-fish/charging-dog-fish.png", size: 0.13 }
  ]);
  const getById = (id) => items.find((item) => item.id === id) || null;
  const getLoadedImage = (images, fish) => (
    fish && fish.assetKind === "preset-fish" && fish.catalogId
      ? images.get(fish.catalogId) || null
      : null
  );
  global.AquariumDefaultFishCatalog = { items, getById, getLoadedImage };
})(globalThis);
```

Load it before `app.js` in `game/index.html`. Add explicit entries to `GAME_ASSETS` in `src/routes/game.ts` for the script and six PNGs.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```powershell
pnpm test -- test/game-default-fish-assets.test.js test/game-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the catalog boundary**

```powershell
git add -- game/js/default-fish-catalog.js game/index.html src/routes/game.ts test/game-default-fish-assets.test.js test/game-route.test.ts
git commit -m "feat: register standalone default fish"
```

### Task 3: Load, Display, Place, and Persist Preset Fish

**Files:**
- Modify: `game/js/app.js`
- Modify: `game/styles.css`
- Create: `test/game-default-fish-integration.test.ts`

**Interfaces:**
- Consumes: `globalThis.AquariumDefaultFishCatalog`.
- Adds `state.art.presetFish: Map<string, HTMLImageElement>`.
- Adds fish `assetKind: "preset-fish"` and uses `catalogId` to resolve the image.

- [ ] **Step 1: Write the failing integration test**

Read `game/js/app.js` and assert it:

```typescript
expect(source).toContain("AquariumDefaultFishCatalog");
expect(source).toContain('assetKind: "preset-fish"');
expect(source).toContain("presetFishApi.getLoadedImage");
expect(source).toContain("state.art.presetFish.set(item.id, image)");
expect(source).toContain("showError(\"素材加载失败，请重启试试\")");
```

Read `game/styles.css` and assert it includes `.default-thumb.is-preset-fish`, `background-size: contain`, and `background-repeat: no-repeat`.

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
pnpm test -- test/game-default-fish-integration.test.ts
```

Expected: FAIL because `app.js` does not yet load or place preset fish.

- [ ] **Step 3: Implement resilient loading and catalog thumbnails**

At app startup, require `AquariumDefaultFishCatalog`, add its items to `DEFAULT_CATALOG` as `type: "fish"` and `assetKind: "preset-fish"`, initialize `state.art.presetFish = new Map()`, and load each preset independently. Catch each preset error and record the failure without rejecting the core `loadArt()` promise.

In `renderDefaultCatalog()`, use an `is-preset-fish` thumbnail class and `thumb.style.backgroundImage = \`url("${item.src}")\`` for preset records. Preserve existing sprite-position logic for atlas records.

- [ ] **Step 4: Implement standalone placement and rendering**

Update `createPlaceholderFish()` to preserve `"preset-fish"` as an allowed `assetKind`. In `addDefaultAsset()`:

```javascript
if (item.assetKind === "preset-fish") {
  const image = state.art.presetFish.get(item.id);
  if (!image) {
    showError("素材加载失败，请重启试试");
    return;
  }
  const fish = createPlaceholderFish({
    name: item.name,
    x: 0.48,
    y: 0.42 + Math.random() * 0.12,
    baseY: 0.46,
    size: item.size,
    dir: Math.random() < 0.5 ? -1 : 1,
    assetKind: "preset-fish",
    catalogId: item.id,
    aspectRatio: image.naturalWidth / image.naturalHeight
  });
  state.fish.push(fish);
  saveState();
  closeSheet();
  resetSheetForm();
  openFishEditor(fish);
  return;
}
```

Generalize the existing standalone-image rendering branch so uploaded fish use `state.memoryImages` and preset fish use `presetFishApi.getLoadedImage(state.art.presetFish, fish)`. Feed either image into the existing WebGL mesh renderer with Canvas fallback and retain aspect-ratio sizing.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```powershell
pnpm test -- test/game-default-fish-assets.test.js test/game-default-fish-integration.test.ts test/game-route.test.ts test/game-webgl-fish-mesh.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the behavior**

```powershell
git add -- game/js/app.js game/styles.css test/game-default-fish-integration.test.ts
git commit -m "feat: add selectable preset fish"
```

### Task 4: Review and Full Verification

**Files:**
- Modify only files required by verified review findings.

**Interfaces:**
- Produces: a reviewed, test-passing, visually verified integration.

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
pnpm test
pnpm check
pnpm build
git diff --check
```

Expected: all tests pass, TypeScript reports no errors, build exits 0, and `git diff --check` is silent.

- [ ] **Step 2: Run code review**

Use `superpowers:requesting-code-review`. Address only verified findings, applying `superpowers:receiving-code-review` before changing code in response to review.

- [ ] **Step 3: Visually verify in a landscape browser**

Start the server locally, open `/`, and check:

- all six thumbnails are visible in the default library;
- transparent edges show the aquarium behind each subject;
- every item can be placed;
- aspect ratios remain correct;
- placed items swim, turn, can be selected, and survive a page reload;
- existing atlas fish and upload flow remain usable;
- no horizontal scrollbar appears.

- [ ] **Step 4: Verify package size and compliance**

This task does not create a publishable zip. Record the current game-directory total and the six-file subtotal:

```powershell
$gameBytes = (Get-ChildItem game -Recurse -File | Measure-Object Length -Sum).Sum
$presetBytes = (Get-ChildItem game\assets\default-fish -File | Measure-Object Length -Sum).Sum
[PSCustomObject]@{ GameBytes = $gameBytes; PresetBytes = $presetBytes; LimitBytes = 8388608 }
```

Expected: report exact byte counts. If the complete server-backed game directory exceeds 8,388,608 bytes because of pre-existing assets, do not broaden this task into unrelated asset replacement; report the baseline and ensure the six new files are compressed as tightly as practical.

- [ ] **Step 5: Commit verified review fixes**

If review or verification required changes:

```powershell
git add -- game/js/app.js game/js/default-fish-catalog.js game/index.html game/styles.css src/routes/game.ts test/game-default-fish-assets.test.js test/game-default-fish-integration.test.ts test/game-route.test.ts
git commit -m "fix: address default fish review"
```
