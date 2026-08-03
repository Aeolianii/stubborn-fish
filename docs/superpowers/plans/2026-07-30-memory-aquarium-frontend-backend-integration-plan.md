# Memory Aquarium Frontend–Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge frontend commit `aec4c8b` with backend commit `8503254` into one runnable mobile-landscape aquarium that uses the real `AquariumAPI`, preserves the catch mini-game, and completes the core add/event/save/poster flow.

**Architecture:** Keep `ui-shell.js` responsible for DOM rendering and API calls, `app.js` responsible for Canvas rendering and Canvas adapters, and `aquarium-core.js` responsible for gameplay state. Use the existing 28-function `AquariumAPI` as the only public UI boundary. Keep the current Ark story proxy for development and retain the local 12-second fallback.

**Tech Stack:** Browser IIFE JavaScript, Canvas 2D/WebGL, Fastify 5, TypeScript 5, Vitest 3, localStorage, IndexedDB.

## Global Constraints

- Integration source refs are `origin/codex/memory-aquarium-frontend@aec4c8b` and `codex/memory-aquarium-backend@8503254`.
- Preserve the frontend-owned `game/styles.css`, UI assets, overlay structure, and catch mini-game behavior.
- Preserve exactly 28 public `window.AquariumAPI` function names.
- Production `game/index.html` must not load `ui-mock-data.js`.
- Reality-object settlement emits one `story:immediate` event and does not create an offline bubble.
- Temporary test behavior remains enabled: any positive offline gap fills unread bubbles up to three.
- AI model remains `doubao-seed-2-1-turbo-260628` with a 12-second local fallback.
- Do not add albums, accounts, rankings, external links, iframes, CDN assets, or unrelated network calls.
- Runtime resources remain local and the primary layout remains mobile landscape.

## Confirmed Merge Facts

| Check | Result |
| --- | --- |
| Frontend head | `aec4c8b style: balance aquarium action dock` |
| Backend head | `8503254 feat: fill offline event bubbles for testing` |
| Common ancestor | `28b3581` |
| Direct content conflict | `game/js/app.js` only |
| Auto-merged shared file | `src/routes/game.ts` |
| Missing after automatic merge | UI script routes, UI SVG routes, correct script order |
| Known frontend runtime error | `renderShopList()` reads undefined `bubble.id` |
| Known ViewModel mismatch | UI reads `eventCount` and `canStartJourney`; Core currently exposes `effectiveEventCount` only |

## Execution Order

| Order | Work package | Primary owner | Depends on | Exit condition |
| --- | --- | --- | --- | --- |
| 1 | Freeze refs and create integration branch | Integrator | None | Branch contains both histories and only expected conflicts |
| 2 | Resolve `app.js` while preserving catch and Core bridge | Integrator | 1 | Canvas starts, catch code remains, Core adapter compiles |
| 3 | Fix production bootstrap, routes, and remove mock | Integrator | 2 | All scripts/assets return 200 and real API initializes |
| 4 | Align ViewModel and UI event contract | Backend + UI | 3 | No undefined fields or shop crash; one UI render per state |
| 5 | Complete Canvas selection, object settlement, and reload hydration | Canvas + Core | 4 | Added entities survive refresh and edit calls target the selected entity |
| 6 | Join economy, shop, growth, and journey flows | Gameplay + UI | 5 | Purchases gate catalog placement and maturity actions update Canvas |
| 7 | Join offline events, Ark stories, and posters | Events + UI | 6 | Three test bubbles, read state, AI fallback, selected-event poster all work |
| 8 | End-to-end verification and delivery | Integrator | 7 | Full tests/build/manual landscape smoke pass; branch is pushed |

---

### Task 1: Freeze Both Heads and Create the Integration Branch

**Files:**
- No source edits

**Interfaces:**
- Consumes: frontend `aec4c8b`, backend `8503254`
- Produces: `codex/memory-aquarium-integration`

- [ ] **Step 1: Verify clean backend checkout and frozen heads**

```powershell
git status -sb
git fetch origin --prune
git rev-parse codex/memory-aquarium-backend
git rev-parse origin/codex/memory-aquarium-frontend
```

Expected backend prefix: `8503254`.
Expected frontend prefix: `aec4c8b`.

- [ ] **Step 2: Create the integration branch from the backend**

```powershell
git switch -c codex/memory-aquarium-integration codex/memory-aquarium-backend
git merge --no-commit --no-ff origin/codex/memory-aquarium-frontend
```

Expected: a content conflict only in `game/js/app.js`; `src/routes/game.ts` auto-merges.

- [ ] **Step 3: Confirm no frontend assets were dropped**

```powershell
git status --short
git diff --name-status --cached
```

Expected additions include `ui-shell.js`, `ui-mock-data.js`, the three UI SVG files, catch-claw image, and local music.

---

### Task 2: Resolve the Canvas Application Conflict

**Files:**
- Modify: `game/js/app.js`
- Test: `test/game-route.test.ts`
- Test: `test/game-aquarium-core.test.js`

**Interfaces:**
- Consumes: frontend catch/motion implementation and backend `AquariumCore.configure()`
- Produces: `sceneAdapter` methods `getSceneSnapshot`, `hydrateScene`, `applyEffect`, `getEntityPosition`, `getSceneSize`, `getCanvas`

- [ ] **Step 1: Use the frontend `app.js` as the behavioral base**

Preserve the frontend implementations for:

- fish personality and image motion profiles;
- catch-game state, drawing, pointer controls, scoring, and local music;
- updated fish motion, hiding, avoidance, and Canvas render order.

Reapply the backend bridge functions around that base:

```javascript
const aquariumCoreModule = globalThis.AquariumCore;
const aquariumApi = globalThis.AquariumAPI;

function sceneSnapshotForCore() {}
function hydrateSceneFromCore(coreState) {}
function applyCoreEffect(effect) {}
async function configureAquariumCore() {}
```

- [ ] **Step 2: Resolve the four conflict regions explicitly**

1. State object: keep both `catchGame/catchAudio` and `aquariumCore/coreUnsubscribe/coreSceneTimer`.
2. Feeding: keep frontend `feedFish()` for legacy fallback and backend `spawnFoodEffect()` for the `SPAWN_FOOD` Core effect.
3. Event binding: direct feed/add/settings/edit bindings stay inside `if (!aquariumApi)`; catch-game bindings remain unconditional.
4. Initialization: perform frontend motion restoration and `saveState()`, then `await configureAquariumCore()`, then start the frame loop.

- [ ] **Step 3: Make application readiness explicit**

Replace the final bare `init()` call with:

```javascript
globalThis.MemoryAquariumAppReady = init().then(() => {
  if (
    globalThis.MemoryAquariumUI
    && typeof globalThis.MemoryAquariumUI.mount === "function"
  ) {
    return globalThis.MemoryAquariumUI.mount();
  }
  return null;
});
```

- [ ] **Step 4: Run the first merge check**

```powershell
pnpm check
pnpm vitest run test/game-route.test.ts test/game-aquarium-core.test.js
```

Expected: TypeScript passes; route and Core tests pass with no conflict markers.

- [ ] **Step 5: Commit the structural merge**

```powershell
git add game/js/app.js src/routes/game.ts game/index.html game/styles.css game/js/ui-shell.js game/js/ui-mock-data.js game/assets
git commit -m "merge: integrate memory aquarium frontend"
```

---

### Task 3: Fix Production Bootstrap and Static Routes

**Files:**
- Modify: `game/index.html`
- Modify: `game/js/ui-shell.js`
- Modify: `src/routes/game.ts`
- Modify: `test/game-route.test.ts`

**Interfaces:**
- Consumes: all browser global modules
- Produces: a deterministic real-API startup with no mock dependency

- [ ] **Step 1: Add a failing route and script-order test**

Extend `test/game-route.test.ts`:

```typescript
const scriptOrder = [
  "object-segmentation",
  "cutout-flow",
  "webgl-fish-mesh",
  "story-template-catalog",
  "story-template-registry",
  "state-store",
  "economy-system",
  "relationship-system",
  "growth-journey",
  "event-director",
  "story-agent",
  "poster-renderer",
  "aquarium-core",
  "aquarium-api",
  "ui-shell",
  "app"
];

let previousIndex = -1;
for (const script of scriptOrder) {
  const index = page.body.indexOf(`/game/js/${script}.js`);
  expect(index, script).toBeGreaterThan(previousIndex);
  previousIndex = index;
}
expect(page.body).not.toContain("ui-mock-data.js");
```

Also inject and assert HTTP 200 for:

```text
/game/js/ui-shell.js
/game/assets/ui/fish-fallback.svg
/game/assets/ui/object-fallback.svg
/game/assets/ui/poster-placeholder.svg
/game/assets/catch-claw.webp
/game/assets/music/upbeat-loop.mp3
```

- [ ] **Step 2: Run the test and verify it fails on missing routes/order**

```powershell
pnpm vitest run test/game-route.test.ts
```

- [ ] **Step 3: Set the exact production script order**

At the end of `game/index.html`, load the scripts in the test order. Do not include `ui-mock-data.js`.

- [ ] **Step 4: Remove the UI shell's runtime dependence on mock globals**

Use local fallbacks:

```javascript
var FALLBACK_ICONS = {
  fish: "/game/assets/ui/fish-fallback.svg",
  object: "/game/assets/ui/object-fallback.svg",
  poster: "/game/assets/ui/poster-placeholder.svg"
};
```

Replace every `global.AquariumUIMockData` fallback read with `FALLBACK_ICONS`.

- [ ] **Step 5: Prevent premature/double UI mounting**

Add `mounted: false` to UI state, guard `mount()`, and remove its automatic `DOMContentLoaded` call:

```javascript
async function mount() {
  if (state.mounted) return;
  state.mounted = true;
  // existing bindings and AquariumAPI.init()
}
```

`app.js` becomes the single caller after Canvas/Core configuration.

- [ ] **Step 6: Add all local UI and script routes**

Add the missing `ui-shell.js` and UI asset entries to `GAME_ASSETS`. Do not expose `ui-mock-data.js` from the production page.

- [ ] **Step 7: Verify and commit**

```powershell
pnpm vitest run test/game-route.test.ts
pnpm check
git add game/index.html game/js/ui-shell.js src/routes/game.ts test/game-route.test.ts
git commit -m "fix: boot real aquarium api in production"
```

---

### Task 4: Align AquariumAPI ViewModel and UI Events

**Files:**
- Modify: `game/js/aquarium-core.js`
- Modify: `game/js/ui-shell.js`
- Modify: `test/game-aquarium-api.test.js`
- Modify: `test/game-aquarium-core.test.js`

**Interfaces:**
- Consumes: `viewModel.fishCards`, Core subscription events
- Produces: UI-compatible fish cards and stable story rendering

- [ ] **Step 1: Add failing fish-card compatibility assertions**

```javascript
const fish = core.getViewModel().fishCards[0];
expect(fish.eventCount).toBe(fish.effectiveEventCount);
expect(fish.canStartJourney).toBe(false);
```

After setting a mature fish to `maturityChoice: "stay"`:

```javascript
expect(core.getViewModel().fishCards[0].canStartJourney).toBe(true);
```

- [ ] **Step 2: Implement compatibility fields without changing the public API**

In `getViewModel()`:

```javascript
effectiveEventCount: fish.effectiveEventCount || 0,
eventCount: fish.effectiveEventCount || 0,
canStartJourney: Boolean(
  fish.mature
  && fish.active !== false
  && fish.maturityChoice === "stay"
),
```

- [ ] **Step 3: Fix the shop render crash**

Delete the invalid line:

```javascript
button.dataset.offlineEventId = bubble.id;
```

Use only:

```javascript
button.dataset.unlockId = item.id;
button.dataset.unlockKind = kind;
```

- [ ] **Step 4: Normalize subscribed event rendering**

Render story text with:

```javascript
var storyText = detail.text || detail.body || "";
if (
  (event.type === "story:immediate" || event.type === "story:resolved")
  && storyText
) {
  showStory(storyText);
}
```

Keep `ui-shell.js` as the sole DOM subscriber. `app.js` must not subscribe separately to write the same story/error nodes.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm vitest run test/game-aquarium-api.test.js test/game-aquarium-core.test.js
git add game/js/aquarium-core.js game/js/ui-shell.js game/js/app.js test/game-aquarium-api.test.js test/game-aquarium-core.test.js
git commit -m "fix: align aquarium ui contract"
```

---

### Task 5: Complete Canvas Selection, Settlement, and Reload Hydration

**Files:**
- Modify: `game/js/app.js`
- Modify: `game/js/aquarium-core.js`
- Modify: `test/game-aquarium-core.test.js`
- Modify: `test/game-offline-event-anchor.test.js`

**Interfaces:**
- Consumes: Canvas scene state and Core stored entities
- Produces: correct selected IDs, one-shot settlement, complete refresh restoration

- [ ] **Step 1: Add selected IDs to the scene snapshot**

```javascript
selected: {
  fishId: state.selectedFishId || null,
  objectId: state.memoryObject ? state.memoryObject.id : null,
  decorId: state.selectedDecorId || null
}
```

Preserve frontend motion fields in each fish/object snapshot:

```javascript
personality: fish.personality || null,
motionProfile: fish.motionProfile || null,
aspectRatio: fish.aspectRatio || null
```

- [ ] **Step 2: Teach Core scene sync to accept selection**

In `syncSceneSnapshot()`:

```javascript
if (snapshot.selected && typeof snapshot.selected === "object") {
  state.selected = {
    fishId: snapshot.selected.fishId || null,
    objectId: snapshot.selected.objectId || null,
    decorId: snapshot.selected.decorId || null
  };
}
```

Add a Core test asserting that the next ViewModel returns those exact IDs.

- [ ] **Step 3: Rebuild missing Canvas entities during hydration**

`hydrateSceneFromCore(coreState)` must:

- remove inactive journey fish;
- update existing fish;
- create missing custom and purchased preset fish with `createPlaceholderFish`;
- rebuild missing reality objects with their saved state and no entry animation;
- restore decor layout;
- load each `imageKey` through the existing Canvas IndexedDB helper and install the decoded image into `state.memoryImages`;
- keep a local fallback image when the blob is unavailable.

- [ ] **Step 4: Preserve the one-shot settlement call**

At the end of a custom object's entry animation:

```javascript
state.aquariumCore.syncSceneSnapshot(sceneSnapshotForCore(), { silent: true });
awaitOrIgnore(state.aquariumCore.notifyObjectSettled(object.id));
```

Use a small helper that safely consumes the promise without blocking the frame:

```javascript
function awaitOrIgnore(promise) {
  Promise.resolve(promise).catch((error) => {
    showError(error && error.message);
  });
}
```

The existing `entryEventId` and `settledObjectIds` guards remain authoritative.

- [ ] **Step 5: Verify reload behavior**

Run:

```powershell
pnpm vitest run test/game-aquarium-core.test.js test/game-state-store.test.js test/game-offline-event-anchor.test.js
```

Manual check:

1. Add one custom fish and one custom object.
2. Wait for object settlement.
3. Refresh.
4. Confirm both images and positions return.
5. Long-press each entity and confirm edit/delete targets the selected ID.

- [ ] **Step 6: Commit**

```powershell
git add game/js/app.js game/js/aquarium-core.js test/game-aquarium-core.test.js test/game-offline-event-anchor.test.js
git commit -m "fix: restore aquarium canvas from core state"
```

---

### Task 6: Join Shop, Growth, and Journey Flows

**Files:**
- Modify: `game/js/app.js`
- Modify: `game/js/ui-shell.js`
- Modify: `game/js/growth-journey.js`
- Modify: `test/game-aquarium-core.test.js`

**Interfaces:**
- Consumes: `viewModel.shop`, `purchaseUnlock`, maturity methods
- Produces: owned-catalog placement and idempotent maturity transitions

- [ ] **Step 1: Gate the existing default catalog with real ownership**

Expose a private Canvas bridge:

```javascript
globalThis.MemoryAquariumCanvas = {
  setShopView(shop) {
    state.shopView = shop || { decor: [], fish: [] };
    renderDefaultCatalog();
  }
};
```

In `ui-shell.js`, after rendering the ViewModel:

```javascript
if (
  global.MemoryAquariumCanvas
  && typeof global.MemoryAquariumCanvas.setShopView === "function"
) {
  global.MemoryAquariumCanvas.setShopView(viewModel.shop);
}
```

`renderDefaultCatalog()` enables only items whose matching shop entry has `owned: true`. Purchased fish use `source: "preset"` and do not consume reality-object capacity.

- [ ] **Step 2: Keep purchases and placement separate**

`purchaseUnlock(kind, id)` only deducts feed and marks ownership. The existing default catalog is the placement surface after purchase; no 29th public API is added.

- [ ] **Step 3: Add an idempotency regression test for maturity choices**

Call `chooseMaturity(fishId, "stay")` twice and assert:

```javascript
expect(state.stories.filter((story) => story.source === "maturity")).toHaveLength(1);
expect(second.data.reward).toBe(0);
```

Repeat for `"journey"` and assert only one journey record and one departure story.

- [ ] **Step 4: Implement idempotent same-choice handling**

Return the existing choice result before creating another story when the requested choice already matches. Continue allowing the one-way transition from `"stay"` to `"journey"`.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm vitest run test/game-aquarium-core.test.js test/game-aquarium-api.test.js
git add game/js/app.js game/js/ui-shell.js game/js/growth-journey.js game/js/aquarium-core.js test/game-aquarium-core.test.js
git commit -m "fix: connect shop and maturity flows"
```

---

### Task 7: Join Offline Events, Ark Stories, and Posters

**Files:**
- Modify: `game/js/ui-shell.js`
- Modify: `game/js/poster-renderer.js`
- Modify: `test/game-offline-events.test.js`
- Modify: `test/game-event-poster.test.js`
- Test: `test/game-story-agent.test.js`
- Test: `test/story-generations-route.test.ts`

**Interfaces:**
- Consumes: unread offline events, exact event IDs, participant images, Ark proxy
- Produces: three test bubbles, read cards, real participant poster visuals

- [ ] **Step 1: Keep temporary three-bubble testing behavior**

Retain:

```javascript
const FILL_OFFLINE_EVENTS_ON_ANY_RETURN = true;
```

Verify a positive offline gap fills only the available unread slots and never exceeds three.

- [ ] **Step 2: Verify read-state UI**

Opening a bubble must:

1. call `openOfflineEvent(eventId)`;
2. store `activeEventId`;
3. hide other bubbles while the card is open;
4. render both resolved participants;
5. leave the opened event absent after returning and refreshing.

- [ ] **Step 3: Add a failing poster drawing test**

Enhance the fake Canvas context to record `drawImage` calls. Build an event with two participant image sources and assert the event poster draws the scene plus two participant visuals.

- [ ] **Step 4: Draw participant images with local fallbacks**

Before rendering the event layout, load each participant's `iconUrl` or `previewUrl`. Draw it clipped to the existing circular badge. If loading fails, draw the local fish/object SVG silhouette and keep the participant name.

- [ ] **Step 5: Verify the exact event and AI fallback**

```powershell
pnpm vitest run test/game-offline-events.test.js test/game-event-poster.test.js test/game-story-agent.test.js test/story-generations-route.test.ts test/ark-story-client.test.ts
```

Expected:

- requested event ID appears in the poster layout;
- two participant IDs are present;
- model is `doubao-seed-2-1-turbo-260628`;
- timeout and invalid output save the template result;
- no gameplay rewards are applied twice after story resolution.

- [ ] **Step 6: Commit**

```powershell
git add game/js/ui-shell.js game/js/poster-renderer.js test/game-offline-events.test.js test/game-event-poster.test.js
git commit -m "fix: complete offline event presentation"
```

---

### Task 8: End-to-End Verification and Delivery

**Files:**
- Modify only files required by failures found in this task

**Interfaces:**
- Consumes: the complete integrated application
- Produces: pushed integration branch ready for final product review

- [ ] **Step 1: Run automated verification**

```powershell
pnpm vitest run --exclude ".worktrees/**"
pnpm check
pnpm build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the local app**

```powershell
pnpm dev
```

Open `/` in a mobile-landscape viewport and confirm there are no 404 responses, uncaught exceptions, or `NOT_READY` results.

- [ ] **Step 3: Execute the product smoke sequence**

1. Confirm feed starts at 20 and one feed costs 4.
2. Open the add flow, select an image, generate the cutout, and place an object.
3. Wait for settlement and confirm exactly one black-bar story.
4. Refresh and confirm the custom entity returns.
5. Leave and return; confirm three unread test bubbles.
6. Open one bubble, return, and confirm only two remain.
7. Generate that event's poster and save/preview it.
8. Complete two effective events, choose stay, then start journey.
9. Purchase one fish/decor, then place it from the owned catalog.
10. Start and finish the catch mini-game; confirm aquarium state returns intact.

- [ ] **Step 4: Check production constraints**

```powershell
rg -n "ui-mock-data|https?://|<iframe|window\\.location" game
git status --short
```

Expected:

- no production mock script;
- no remote runtime asset URL or iframe;
- only intended local API URLs;
- no `.env` file added by the integration work.

- [ ] **Step 5: Push the integration branch**

```powershell
git push -u origin codex/memory-aquarium-integration
```

Final delivery must name both source commits, the integration head, automated test counts, manual smoke results, and the remaining pre-launch switches:

- restore the two-hour offline event cadence;
- switch Ark story generation to the approved `tt.*` Agent interface;
- rotate and remove tracked development secrets before publication.
