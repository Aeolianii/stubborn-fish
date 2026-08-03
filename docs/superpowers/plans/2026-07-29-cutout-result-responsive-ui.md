# Cutout Result Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the transparent-object result view fit common mobile landscape viewports without internal scrolling while showing both previews completely and renaming the back button to “重新生成”.

**Architecture:** Keep the existing cutout state machine and `backToCapture()` event unchanged. Convert the result view into a bounded flex column whose comparison grid consumes the remaining viewport height; each preview stage becomes a shrinkable flex child, and both the image and Canvas use a full-size CSS box with `object-fit: contain`.

**Tech Stack:** Static HTML, CSS3 Flexbox/Grid, dynamic viewport units, Vitest/Fastify injection tests, in-app browser visual verification.

## Global Constraints

- The product remains a mobile landscape experience; the two previews stay side by side.
- Common landscape sizes 1280×720, 844×390, and 667×375 should not require internal scrolling.
- Only an extreme short-height or enlarged-system-font case may use vertical scrolling as an accessibility fallback.
- The original photo and transparent Canvas must remain complete, proportional, and uncropped.
- The button label becomes “重新生成”, but clicking it still invokes the existing `backToCapture()` flow and does not call the AI automatically.
- Do not change fish movement, cutout API calls, transparent pixel data, or the 8 MB/offline packaging constraints.

---

### Task 1: Lock the “重新生成” Copy and Existing Navigation Behavior

**Files:**
- Modify: `test/game-route.test.ts:28-61`
- Modify: `game/index.html:240-243`

**Interfaces:**
- Consumes: the existing `#backToCaptureButton` click binding to `backToCapture()` in `game/js/app.js`.
- Produces: result-page HTML whose back button is still identified by `backToCaptureButton` and visibly says “重新生成”.

- [ ] **Step 1: Write the failing route test**

Add these assertions to the first test after the existing `backToCaptureButton` assertion:

```ts
expect(page.body).toMatch(
  /id="backToCaptureButton"[\s\S]*?重新生成[\s\S]*?<\/button>/
);
expect(page.body).not.toContain("返回修改");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm vitest run test/game-route.test.ts
```

Expected: FAIL because `game/index.html` still renders “返回修改”.

- [ ] **Step 3: Change only the button copy**

Update the existing button without changing its ID or event wiring:

```html
<button id="backToCaptureButton" class="secondary-button" type="button">
  重新生成
</button>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm vitest run test/game-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the copy change**

```powershell
git add -- game/index.html test/game-route.test.ts
git commit -m "fix: relabel cutout retry action"
```

---

### Task 2: Make the Result Preview Consume Available Landscape Height

**Files:**
- Modify: `game/styles.css:1166-1322`
- Modify: `game/styles.css:1324-1489`

**Interfaces:**
- Consumes: `.result-view`, `.result-content`, `.comparison-grid`, `.preview-card`, `.preview-stage`, `.result-actions`, and `.sheet-status` from the existing result markup.
- Produces: a result view bounded by the dynamic viewport height, with two complete contained previews and bottom actions kept visible.

- [ ] **Step 1: Replace the fixed-height result view with a bounded flex column**

Use the remaining landscape viewport while reserving room for the sheet handle, heading, padding, and safe-area inset:

```css
.result-view {
  min-height: 0;
}

.result-view:not(.is-hidden) {
  display: flex;
  height: min(620px, calc(100dvh - 96px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  min-height: 280px;
  flex-direction: column;
  overflow: hidden;
}
```

The `620px` cap prevents oversized previews on desktop; `100dvh` lets mobile browser chrome changes update the usable height.

- [ ] **Step 2: Let the comparison area shrink without pushing actions below the fold**

Replace the result content and comparison/card sizing with:

```css
.result-content {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.comparison-grid {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.preview-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.preview-stage {
  display: grid;
  height: auto;
  min-height: 120px;
  flex: 1 1 auto;
  overflow: hidden;
  border: 1px solid rgba(214, 238, 225, 0.12);
  border-radius: 16px;
  place-items: center;
  background: rgba(255, 255, 255, 0.025);
}
```

- [ ] **Step 3: Size replaced preview elements to the stage and contain their content**

Use a fixed CSS content box so `object-fit` applies consistently to both the `<img>` and `<canvas>`:

```css
.preview-stage img,
.preview-stage canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
}
```

Keep the Canvas bitmap dimensions set by `copyCutoutCanvas()` unchanged.

- [ ] **Step 4: Keep summaries and actions from consuming preview flex space**

Add `flex: 0 0 auto` to `.result-summary`, `.result-actions`, and the result view’s `.sheet-status`. Keep the existing three-column action layout and button sizes.

- [ ] **Step 5: Replace the fixed short-screen preview height**

Inside `@media (orientation: landscape) and (max-height: 500px)`:

```css
.result-view:not(.is-hidden) {
  height: calc(100dvh - 70px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  min-height: 250px;
}

.preview-stage {
  height: auto;
  min-height: 108px;
}

.preview-label {
  margin-bottom: 3px;
}

.result-summary {
  margin-top: 3px;
}

.result-actions {
  margin-top: 4px;
}
```

Remove the existing `height: 190px` override. Preserve the sheet panel’s `overflow-y: auto` only as an extreme-height fallback.

- [ ] **Step 6: Run code checks**

Run:

```powershell
pnpm vitest run test/game-route.test.ts
pnpm run check
```

Expected: both commands pass.

- [ ] **Step 7: Verify the result UI visually**

Use the local game and a completed cutout result. Check these landscape viewports:

```text
1280 × 720
844 × 390
667 × 375
```

For each viewport verify:

- the sheet has no horizontal scrollbar;
- no internal vertical scroll is needed for the main result content;
- both source and transparent previews show all four edges of their content;
- neither preview is stretched;
- the checkerboard remains visible around transparent pixels;
- “重新生成” and “确认放入鱼缸” stay visible;
- “重新生成” returns to the capture form without starting a request;
- processing and error states still fit and keep their actions accessible.

- [ ] **Step 8: Run the full verification suite**

Run:

```powershell
pnpm test
pnpm run check
git diff --check
```

Expected: all tests and TypeScript checks pass; `git diff --check` prints no errors.

- [ ] **Step 9: Request code review and address actionable findings**

Use `superpowers:requesting-code-review` to inspect the focused HTML/CSS/test diff. Apply only findings that preserve the approved scope, then rerun Step 8.

- [ ] **Step 10: Commit the responsive layout**

```powershell
git add -- game/styles.css
git commit -m "fix: adapt cutout result previews"
```

