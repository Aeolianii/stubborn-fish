(function (root) {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function pairKey(aId, bId) {
    return [String(aId || ""), String(bId || "")].sort().join("::");
  }

  function relationshipStage(value) {
    const score = clamp(value, 0, 100);
    if (score >= 90) return "特别的陪伴";
    if (score >= 60) return "好朋友";
    if (score >= 25) return "注意到了";
    return "陌生";
  }

  function findEntity(state, id) {
    const groups = [
      { type: "fish", values: state.fish },
      { type: "object", values: state.objects }
    ];
    for (const group of groups) {
      const entity = Array.isArray(group.values)
        ? group.values.find((item) => item.id === id)
        : null;
      if (entity) return { ...entity, type: group.type };
    }
    return null;
  }

  function ensureGraph(state) {
    if (!state.relationships || typeof state.relationships !== "object") {
      state.relationships = {};
    }
    return state.relationships;
  }

  function getRelationship(state, aId, bId) {
    return ensureGraph(state)[pairKey(aId, bId)] || null;
  }

  function addRelationship(state, aId, bId, amount, metadata) {
    if (!aId || !bId || aId === bId) return null;
    const graph = ensureGraph(state);
    const key = pairKey(aId, bId);
    const current = graph[key] || {
      id: key,
      participantAId: aId,
      participantBId: bId,
      value: 0,
      stage: "陌生",
      eventIds: [],
      updatedAt: 0
    };
    const nextValue = clamp(current.value + Number(amount || 0), 0, 100);
    const eventId = metadata && metadata.eventId;
    if (eventId && current.eventIds.includes(eventId)) return current;
    current.value = nextValue;
    current.stage = relationshipStage(nextValue);
    current.updatedAt = Number(metadata && metadata.now) || Date.now();
    if (eventId) current.eventIds = current.eventIds.concat(eventId).slice(-40);
    graph[key] = current;
    return current;
  }

  function listPairCandidates(state) {
    const fish = (Array.isArray(state.fish) ? state.fish : [])
      .filter((item) => item.active !== false)
      .map((item) => {
        item.type = "fish";
        return item;
      });
    const objects = (Array.isArray(state.objects) ? state.objects : [])
      .map((item) => {
        item.type = "object";
        return item;
      });
    const pairs = [];
    for (let i = 0; i < fish.length; i += 1) {
      for (let j = i + 1; j < fish.length; j += 1) {
        pairs.push([fish[i], fish[j]]);
      }
    }
    fish.forEach((fishItem) => {
      objects.forEach((objectItem) => pairs.push([fishItem, objectItem]));
    });
    for (let i = 0; i < objects.length; i += 1) {
      for (let j = i + 1; j < objects.length; j += 1) {
        pairs.push([objects[i], objects[j]]);
      }
    }
    return pairs;
  }

  function strongestFor(state, entityId, participantType) {
    const graph = ensureGraph(state);
    return Object.values(graph)
      .filter((relationship) => (
        relationship.participantAId === entityId
        || relationship.participantBId === entityId
      ))
      .map((relationship) => {
        const otherId = relationship.participantAId === entityId
          ? relationship.participantBId
          : relationship.participantAId;
        return { relationship, other: findEntity(state, otherId) };
      })
      .filter((entry) => (
        entry.other
        && (!participantType || entry.other.type === participantType)
      ))
      .sort((a, b) => b.relationship.value - a.relationship.value)[0] || null;
  }

  function buildSoftBindingEffects(state, options) {
    if (state.editing) return [];
    const random = options && typeof options.random === "function"
      ? options.random
      : Math.random;
    const effects = [];
    Object.values(ensureGraph(state)).forEach((relationship) => {
      if (relationship.value < 60 || random() > 0.35) return;
      const a = findEntity(state, relationship.participantAId);
      const b = findEntity(state, relationship.participantBId);
      if (!a || !b) return;
      if (a.type === "fish" && b.type === "object") {
        effects.push({
          type: "BIND_FISH_TO_OBJECT",
          fishId: a.id,
          objectId: b.id,
          strength: relationship.value / 100
        });
      } else if (a.type === "object" && b.type === "fish") {
        effects.push({
          type: "BIND_FISH_TO_OBJECT",
          fishId: b.id,
          objectId: a.id,
          strength: relationship.value / 100
        });
      } else if (a.type === "fish" && b.type === "fish") {
        effects.push({
          type: "BIND_FISH_TO_FISH",
          fishAId: a.id,
          fishBId: b.id,
          strength: relationship.value / 100
        });
      } else if (
        a.type === "object"
        && b.type === "object"
        && a.state === "suspended"
        && b.state === "suspended"
      ) {
        effects.push({
          type: "BIND_OBJECT_TO_OBJECT",
          objectAId: a.id,
          objectBId: b.id,
          strength: Math.min(0.18, relationship.value / 600)
        });
      }
    });
    return effects;
  }

  root.AquariumRelationships = {
    pairKey,
    relationshipStage,
    findEntity,
    getRelationship,
    addRelationship,
    listPairCandidates,
    strongestFor,
    buildSoftBindingEffects
  };
})(globalThis);
