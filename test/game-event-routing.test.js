import { describe, expect, it } from "vitest";

import "./helpers/aquarium-test-runtime.js";

function createObject(id, state = "bottom") {
  return {
    id,
    type: "object",
    name: `物件${id}`,
    state,
    x: 0.5,
    y: 0.6
  };
}

function addSecondFish(state) {
  state.fish.push({
    ...state.fish[0],
    id: "fish-2",
    name: "青团",
    effectiveEventIds: [],
    effectiveEventCount: 0
  });
}

function preferRelationshipTemplate(state) {
  state.stories = [{ id: "previous-fixed", storyMode: "fixed" }];
}

function createFishObjectState(relationshipValue) {
  const state = globalThis.AquariumStateStore.createDefaultState(1_000);
  state.fish = state.fish.slice(0, 1);
  state.objects = [createObject("object-1")];
  preferRelationshipTemplate(state);
  if (relationshipValue > 0) {
    globalThis.AquariumRelationships.addRelationship(
      state,
      state.fish[0].id,
      state.objects[0].id,
      relationshipValue,
      { now: 1_000 }
    );
  }
  return state;
}

describe("story event routing", () => {
  it("uses the same first-five placement pool for bottom, suspended and surface objects", () => {
    const director = globalThis.AquariumEventDirector;
    expect(director.PLACEMENT_EVENT_TYPES).toEqual([
      "first-meeting",
      "misunderstood-use",
      "shelter",
      "play",
      "fish-object-friendship"
    ]);

    const eventTypes = ["bottom", "suspended", "surface"].map((objectState) => {
      const state = globalThis.AquariumStateStore.createDefaultState(1_000);
      state.stateId = "placement-state-independent";
      state.objects = [createObject("same-object", objectState)];
      return director.createPlacementEvent(state, "same-object", 2_000).data.event.eventType;
    });

    expect(new Set(eventTypes).size).toBe(1);
    expect(director.PLACEMENT_EVENT_TYPES).toContain(eventTypes[0]);

    const reachedTypes = new Set();
    for (let index = 0; index < 100; index += 1) {
      const state = globalThis.AquariumStateStore.createDefaultState(1_000);
      state.stateId = `placement-pool-${index}`;
      const objectId = `object-${index}`;
      state.objects = [createObject(objectId, "surface")];
      reachedTypes.add(
        director.createPlacementEvent(state, objectId, 2_000 + index).data.event.eventType
      );
    }
    expect(reachedTypes).toEqual(new Set(director.PLACEMENT_EVENT_TYPES));
  });

  it("keeps live relationship events strictly fish-fish first", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    addSecondFish(state);
    state.objects = [createObject("object-1"), createObject("object-2")];
    preferRelationshipTemplate(state);

    const event = globalThis.AquariumEventDirector.createOnlineEvent(state, 2_000);

    expect(event.eventType).toBe("fish-fish-shared");
    expect(event.participants.map((participant) => participant.type)).toEqual(["fish", "fish"]);
    expect(globalThis.AquariumEventDirector.RELATIONSHIP_PAIR_PRIORITY)
      .toEqual(["fish|fish", "fish|object", "object|object"]);
  });

  it("routes fish-object relationships to environment change below 90 and deep companionship at 90", () => {
    const shallow = createFishObjectState(89);
    const deep = createFishObjectState(90);

    expect(globalThis.AquariumEventDirector.createOnlineEvent(shallow, 2_000).eventType)
      .toBe("environment-change");
    expect(globalThis.AquariumEventDirector.createOnlineEvent(deep, 2_000).eventType)
      .toBe("deep-companionship");
  });

  it("maps one offline event to each available relationship category", () => {
    const state = globalThis.AquariumStateStore.createDefaultState(1_000);
    addSecondFish(state);
    state.objects = [createObject("object-1"), createObject("object-2")];

    const events = globalThis.AquariumEventDirector.settleOfflineEvents(state, 1, 2_000);
    const eventTypeByPair = Object.fromEntries(events.map((event) => [
      event.participants.map((participant) => participant.type).sort().join("|"),
      event.eventType
    ]));

    expect(eventTypeByPair).toEqual({
      "fish|fish": "fish-fish-shared",
      "fish|object": "environment-change",
      "object|object": "object-object-memory"
    });
  });

  it("provides varied object-object stories that the recent-fingerprint rule can rotate", () => {
    const templates = globalThis.AquariumStoryTemplates.list()
      .filter((template) => template.eventType === "object-object-memory");

    expect(templates).toHaveLength(7);
    expect(new Set(templates.map((template) => template.metaphor)).size).toBe(7);
    templates.forEach((template) => {
      expect(template.participants).toEqual(["object", "object"]);
      expect(template.fallbackBody).toContain("{objectName}");
      expect(template.fallbackBody).toContain("{secondObjectName}");
    });
  });
});
