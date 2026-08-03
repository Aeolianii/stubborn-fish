# Offline Relationship Event Bubbles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep object-placement stories in the existing black story bar while presenting up to three unread offline relationship events as clickable pair bubbles, dual-entity event cards, and locally saved event posters.

**Architecture:** Core owns offline event generation, unread state and story content. `app.js` adapts Canvas entity coordinates into normalized pair anchors. `ui-shell.js` renders bubbles and cards through the stable `AquariumAPI`; `poster-renderer.js` renders either the general aquarium poster or a poster locked to one event ID.

**Tech Stack:** Browser ES6 IIFE modules, Canvas 2D, localStorage, IndexedDB, Vitest, existing Fastify static routes.

## Global Constraints

- Mobile landscape is the default layout; verify `16:9`, `19.5:9` and `4:3`.
- Render at most 3 offline event bubbles at once.
- Object-placement events use the existing `#storyCard / #storyText` black-background white-text UI.
- AI model is `doubao-seed-2-1-turbo-260628`; 12-second timeout falls back locally.
- AI never controls feed, growth, relationships, rewards or read state.
- Event posters are `1080 × 1440` and contain no QR code, contact details, external link or forced-share copy.
- No external assets, CDN, iframe or non-business network request.
- Static output should remain below 20 MB where practical.

---

### Task 1: Persisted Offline Event Queue

**Files:**

- Create: `test/game-offline-events.test.js`
- Modify: `game/js/event-director.js`
- Modify: `game/js/aquarium-core.js`
- Modify: `game/js/state-store.js`

**Interfaces:**

- Consumes: existing fish, object, relationship, story and offline-time state.
- Produces: `OfflineRelationshipEvent`, `viewModel.offlineEventBubbles`, `openOfflineEvent(eventId)`.

```javascript
{
  id,
  source: "offline",
  participantAId,
  participantBId,
  title,
  body,
  posterLine,
  status: "pending" | "generated" | "fallback",
  occurredAt,
  readAt: null,
  anchor: { x: 0.5, y: 0.5 }
}
```

- [ ] **Step 1: Add failing queue tests**

Test that one settlement creates no more than 3 events, supports fish—fish, fish—object and object—object pairs, excludes duplicate participant pairs, and exposes only events with `readAt === null`.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
pnpm vitest run test/game-offline-events.test.js
```

Expected: failure because the offline event queue and unread projection do not exist.

- [ ] **Step 3: Implement queue creation and persistence**

Add a maximum of 3 new offline events per settlement. Save participant IDs and final story text in the structured snapshot. Preserve unread events across reloads and preserve read event text for poster generation.

- [ ] **Step 4: Implement read transition**

Opening a valid event sets `readAt` once and returns the full event. Reopening a read event may return the card data, but it must not restore the bubble or award resources.

- [ ] **Step 5: Run focused tests**

```powershell
pnpm vitest run test/game-offline-events.test.js
```

Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```powershell
git add game/js/event-director.js game/js/aquarium-core.js game/js/state-store.js test/game-offline-events.test.js
git commit -m "feat: persist offline relationship events"
```

### Task 2: Stable API and Canvas Pair Anchors

**Files:**

- Create: `test/game-offline-event-anchor.test.js`
- Modify: `game/js/aquarium-api.js`
- Modify: `game/js/app.js`

**Interfaces:**

- Consumes: `OfflineRelationshipEvent.participantAId`, `participantBId` and current scene entity positions.
- Produces: `AquariumAPI.openOfflineEvent(eventId)`, normalized `anchor`, and one-shot `story:immediate` placement behavior.

- [ ] **Step 1: Add failing anchor tests**

Cover midpoint normalization, clamping to `0–1`, a missing participant fallback at `{ x: 0.5, y: 0.35 }`, and stable ordering for three events.

```javascript
expect(midpointAnchor(
  { x: 200, y: 100 },
  { x: 600, y: 300 },
  { width: 1000, height: 500 }
)).toEqual({ x: 0.4, y: 0.4 });
```

- [ ] **Step 2: Verify the tests fail**

```powershell
pnpm vitest run test/game-offline-event-anchor.test.js
```

Expected: failure because the anchor helper is not exported.

- [ ] **Step 3: Implement the API handlers**

Add `openOfflineEvent(eventId)` and `createEventPoster(eventId)` to the same API object already called by the UI. Keep `NOT_READY` behavior until each real handler is registered.

- [ ] **Step 4: Implement low-frequency pair anchors**

Calculate each pair midpoint after initialization, resize and the existing low-frequency scene tick. Do not move this work into `requestAnimationFrame`. Update the Core/view-model anchor only when it changes materially.

- [ ] **Step 5: Keep placement events separate**

After a new reality object completes its settle animation, dispatch its entry event once. Emit `story:immediate` to `#storyCard / #storyText`; never add that event to `offlineEventBubbles`.

- [ ] **Step 6: Run focused tests**

```powershell
pnpm vitest run test/game-offline-event-anchor.test.js test/game-cutout-flow.test.js
```

Expected: both files pass.

- [ ] **Step 7: Commit**

```powershell
git add game/js/aquarium-api.js game/js/app.js test/game-offline-event-anchor.test.js
git commit -m "feat: expose offline event bubble anchors"
```

### Task 3: Three Bubbles and Dual-Entity Event Card

**Files:**

- Modify: `game/index.html`
- Modify: `game/styles.css`
- Modify: `game/js/ui-shell.js`
- Modify: `game/js/ui-mock-data.js`

**Interfaces:**

- Consumes: `viewModel.offlineEventBubbles`, `AquariumAPI.openOfflineEvent(eventId)`, `AquariumAPI.createEventPoster(eventId)`.
- Produces: `#offlineBubbleLayer`, `#offlineEventSheet`, `handleOfflineBubbleClick`, `handleForwardEventClick`, `handleEventBackClick`.

- [ ] **Step 1: Add the fixed DOM nodes**

Add `offlineFeedToast`, `offlineBubbleLayer`, both participant icon/name nodes, title/body nodes, `forwardEventButton` and `eventBackButton`. Use `addEventListener`; do not add inline handlers.

- [ ] **Step 2: Render at most three bubble buttons**

Use `anchor.x / anchor.y` against the displayed tank rectangle. Offset overlapping bubbles upward and clamp them to the safe area. Include an accessible label naming both participants.

- [ ] **Step 3: Open the selected event card**

Call `openOfflineEvent(eventId)`, hide the bubble layer, and render the returned event through `textContent`. Show custom image or preset asset first and a local silhouette on image failure.

- [ ] **Step 4: Implement card buttons**

“转发事件” calls `createEventPoster(activeEventId)`. “返回” closes only the event card and rerenders remaining unread bubbles from the returned ViewModel.

- [ ] **Step 5: Verify landscape layouts manually**

Check `16:9`, `19.5:9` and `4:3` with three overlapping mock bubbles. Confirm every bubble remains clickable and the event card fits without horizontal scrolling.

- [ ] **Step 6: Commit**

```powershell
git add game/index.html game/styles.css game/js/ui-shell.js game/js/ui-mock-data.js
git commit -m "feat: add offline relationship event cards"
```

### Task 4: Event-Locked Poster Rendering

**Files:**

- Create: `test/game-event-poster.test.js`
- Modify: `game/js/poster-renderer.js`
- Modify: `game/js/aquarium-api.js`

**Interfaces:**

- Consumes: a specific event ID, its two participants, event title/body/poster line, date and tank Canvas.
- Produces: `{ width: 1080, height: 1440, previewUrl, blob }`.

- [ ] **Step 1: Add a failing event-selection test**

Create two stored stories, request the older event ID, and assert the poster layout contains the requested title and participant IDs rather than the latest story.

- [ ] **Step 2: Verify the test fails**

```powershell
pnpm vitest run test/game-event-poster.test.js
```

Expected: failure because only the general latest-story poster path exists.

- [ ] **Step 3: Implement event poster input**

Render the two participant icons, title, 40–80-character body, date, poster line and tank/background. Use local silhouettes when image blobs are missing.

- [ ] **Step 4: Reuse the existing save fallback**

Attempt the supported local album/download path. If unavailable or denied, return the complete preview and a long-press-save message. Do not navigate or directly post to another application.

- [ ] **Step 5: Run focused tests**

```powershell
pnpm vitest run test/game-event-poster.test.js
```

Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```powershell
git add game/js/poster-renderer.js game/js/aquarium-api.js test/game-event-poster.test.js
git commit -m "feat: render posters for selected events"
```

### Task 5: Integration, Routes and Release Check

**Files:**

- Modify: `game/index.html`
- Modify: `src/routes/game.ts`
- Modify: `test/game-route.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: all scripts and DOM IDs from Tasks 1–4.
- Produces: a runnable mobile-landscape build with local assets only.

- [ ] **Step 1: Freeze script order and remove the UI mock**

Load template catalog before registry, Core before API, and API before UI shell. Remove `ui-mock-data.js` from the production entry.

- [ ] **Step 2: Add route coverage**

Request each newly added local script from the development server and assert HTTP 200 with JavaScript content type.

- [ ] **Step 3: Run focused automated verification**

```powershell
pnpm vitest run test/game-offline-events.test.js test/game-offline-event-anchor.test.js test/game-event-poster.test.js test/game-cutout-flow.test.js test/game-route.test.ts
pnpm check
pnpm build
```

Expected: every command exits with code 0.

- [ ] **Step 4: Run the critical manual flow**

```text
place object
→ settle once
→ black story bar
→ simulate offline settlement
→ three bubbles
→ open one event card
→ return and confirm only two remain
→ forward another event
→ save or preview its event poster
→ reload and confirm unread bubbles return
```

- [ ] **Step 5: Inspect package constraints**

Confirm the final root has one `index.html`, uses relative local resources, contains no iframe or external navigation, and remains under the 20 MB target where practical.

- [ ] **Step 6: Commit**

```powershell
git add game/index.html src/routes/game.ts test/game-route.test.ts README.md
git commit -m "chore: integrate offline event experience"
```
