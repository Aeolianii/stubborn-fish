(function (root) {
  "use strict";

  const OFFLINE_EVENT_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const MAX_OFFLINE_EVENTS = 3;
  const RECENT_FINGERPRINT_LIMIT = 20;
  const REPEAT_GAP = 5;
  const DEEP_COMPANIONSHIP_THRESHOLD = 90;
  const PLACEMENT_EVENT_TYPES = [
    "first-meeting",
    "misunderstood-use",
    "shelter",
    "play",
    "fish-object-friendship"
  ];
  const RELATIONSHIP_PAIR_PRIORITY = ["fish|fish", "fish|object", "object|object"];
  // Hackathon demo behavior: any positive offline gap fills all available slots.
  const FILL_OFFLINE_EVENTS_ON_ANY_RETURN = true;
  const EVENT_CHOICE_CATALOG = {
    "first-meeting": [
      {
        id: "let-rest",
        label: "让它们先安静待一会儿",
        algaeCoins: 6,
        intimacy: 3,
        fallbackOutcome: "{fishName}没有再靠近，只陪着{objectName}安静停了一会儿。"
      },
      {
        id: "show-purpose",
        label: "告诉它这件物品原来的用途",
        algaeCoins: 3,
        intimacy: 5,
        fallbackOutcome: "{fishName}似懂非懂地绕了一圈，最后还是保留了自己的解释。"
      }
    ],
    "misunderstood-use": [
      {
        id: "explain",
        label: "告诉它这不是新玩具",
        algaeCoins: 4,
        intimacy: 4,
        fallbackOutcome: "{fishName}礼貌地退开一点，又从另一个方向重新观察{objectName}。"
      },
      {
        id: "keep-exploring",
        label: "让它按自己的方式探索",
        algaeCoins: 6,
        intimacy: 3,
        fallbackOutcome: "{fishName}又轻轻碰了一下，很快为{objectName}发明了新的玩法。"
      }
    ],
    shelter: [
      {
        id: "stay-quiet",
        label: "陪它们再安静一会儿",
        algaeCoins: 8,
        intimacy: 5,
        fallbackOutcome: "没有新的动作发生，但这段安静被水光好好地留了下来。"
      },
      {
        id: "invite-neighbor",
        label: "邀请邻居一起靠近",
        algaeCoins: 6,
        intimacy: 3,
        fallbackOutcome: "水下的角落热闹了一点，却仍然保留着刚好的距离。"
      }
    ],
    play: [
      {
        id: "join-game",
        label: "加入它们的小游戏",
        algaeCoins: 7,
        intimacy: 4,
        fallbackOutcome: "节奏被轻轻打乱后，它们愣了一下，又很快找到了新的玩法。"
      },
      {
        id: "watch-game",
        label: "在一旁看它们继续",
        algaeCoins: 5,
        intimacy: 3,
        fallbackOutcome: "它们认真玩了一会儿，最后像什么也没发生一样慢慢游开。"
      }
    ],
    "fish-object-friendship": [
      {
        id: "keep-company",
        label: "让它继续留在熟悉的位置",
        algaeCoins: 9,
        intimacy: 5,
        fallbackOutcome: "{fishName}摆了摆尾巴，又停回{objectName}身边熟悉的位置。"
      },
      {
        id: "give-space",
        label: "留一点新的距离",
        algaeCoins: 6,
        intimacy: 3,
        fallbackOutcome: "{fishName}游远了一点，回头时仍能看见{objectName}安静地待在那里。"
      }
    ],
    "fish-fish-shared": [
      {
        id: "keep-rhythm",
        label: "鼓励它们继续同步",
        algaeCoins: 8,
        intimacy: 4,
        fallbackOutcome: "{fishName}和{secondFishName}又试了一次，这回连转身都几乎一模一样。"
      },
      {
        id: "change-rhythm",
        label: "突然改变游动节奏",
        algaeCoins: 5,
        intimacy: 2,
        fallbackOutcome: "节奏被打乱后，它们同时愣了一下，又同时装作什么也没发生。"
      }
    ],
    "object-object-memory": [
      {
        id: "keep-distance",
        label: "保留这段刚好的距离",
        algaeCoins: 7,
        intimacy: 4,
        fallbackOutcome: "{objectName}和{secondObjectName}仍待在原处，两圈水波在中间轻轻碰了一下。"
      },
      {
        id: "move-closer",
        label: "让水流带它们靠近一点",
        algaeCoins: 6,
        intimacy: 3,
        fallbackOutcome: "水流把它们之间的距离缩短了一点，两个旧故事共享了一小片光。"
      }
    ],
    "environment-change": [
      {
        id: "watch-light",
        label: "陪它们看看新的水光",
        algaeCoins: 7,
        intimacy: 4,
        fallbackOutcome: "{fishName}没有急着游开，和{objectName}一起看着水色慢慢变亮。"
      },
      {
        id: "swim-around",
        label: "绕一圈寻找变化的原因",
        algaeCoins: 5,
        intimacy: 3,
        fallbackOutcome: "{fishName}认真绕了一圈，最后把这次变化当成了鱼缸的新天气。"
      }
    ],
    "deep-companionship": [
      {
        id: "stay-together",
        label: "让它们继续待在一起",
        algaeCoins: 10,
        intimacy: 5,
        fallbackOutcome: "{fishName}安静停在{objectName}身边，像是早已熟悉这段不必解释的陪伴。"
      },
      {
        id: "remember-moment",
        label: "替它们记下这一刻",
        algaeCoins: 8,
        intimacy: 4,
        fallbackOutcome: "水光慢慢移开，这段安静却被认真留在了今天的故事里。"
      }
    ]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededValue(seed) {
    let value = hashString(seed) + 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function eventId(state, prefix, now) {
    state.eventSequence = Math.max(0, Number(state.eventSequence) || 0) + 1;
    return `${prefix}-${now}-${state.eventSequence}`;
  }

  function entityType(entity) {
    return entity && entity.type === "fish" ? "fish" : "object";
  }

  function pairSignature(a, b) {
    return [entityType(a), entityType(b)].sort().join("|");
  }

  function eventTypeForPair(a, b, relationshipValue) {
    const signature = pairSignature(a, b);
    if (signature === "fish|fish") return "fish-fish-shared";
    if (signature === "object|object") return "object-object-memory";
    if (relationshipValue >= DEEP_COMPANIONSHIP_THRESHOLD) return "deep-companionship";
    return "environment-change";
  }

  function buildContext(a, b) {
    const fish = [a, b].filter((item) => entityType(item) === "fish");
    const objects = [a, b].filter((item) => entityType(item) === "object");
    return {
      fishName: fish[0] ? fish[0].name : "",
      secondFishName: fish[1] ? fish[1].name : "",
      objectName: objects[0] ? objects[0].name : "",
      secondObjectName: objects[1] ? objects[1].name : "",
      capturedAt: objects[0] ? objects[0].capturedAt || "" : "",
      capturedPlace: objects[0] ? objects[0].capturedPlace || "" : ""
    };
  }

  function buildFingerprint(eventType, aId, bId, metaphor) {
    return [
      eventType,
      [String(aId), String(bId)].sort().join("+"),
      String(metaphor || "相遇")
    ].join("|");
  }

  function isFingerprintAllowed(state, fingerprint) {
    const recent = Array.isArray(state.recentFingerprints)
      ? state.recentFingerprints
      : [];
    const lastIndex = recent.lastIndexOf(fingerprint);
    return lastIndex < 0 || recent.length - 1 - lastIndex >= REPEAT_GAP;
  }

  function rememberFingerprint(state, fingerprint) {
    state.recentFingerprints = Array.isArray(state.recentFingerprints)
      ? state.recentFingerprints
      : [];
    state.recentFingerprints.push(fingerprint);
    state.recentFingerprints = state.recentFingerprints.slice(-RECENT_FINGERPRINT_LIMIT);
  }

  function fallbackStory(template, context, templates) {
    return {
      title: templates.renderPattern(template.fallbackTitle, context),
      body: templates.renderPattern(template.fallbackBody, context),
      posterLine: templates.renderPattern(template.fallbackPosterLine, context)
    };
  }

  function buildEventChoices(template, context, templates) {
    const source = Array.isArray(template && template.choices) && template.choices.length
      ? template.choices
      : EVENT_CHOICE_CATALOG[template && template.eventType] || [];
    return source.map((choice) => ({
      id: String(choice.id || ""),
      label: templates.renderPattern(choice.label, context),
      algaeCoins: Math.max(0, Math.floor(Number(choice.algaeCoins) || 0)),
      intimacy: Math.max(0, Math.floor(Number(choice.intimacy) || 0)),
      fallbackOutcome: templates.renderPattern(choice.fallbackOutcome, context)
    })).filter((choice) => choice.id && choice.label && choice.fallbackOutcome);
  }

  function ensureEventChoices(event) {
    if (!event || typeof event !== "object") return [];
    if (Array.isArray(event.choices) && event.choices.length) return event.choices;
    const template = root.AquariumStoryTemplates.getById(event.templateId);
    if (!template) return [];
    event.choices = buildEventChoices(
      template,
      event.context || {},
      root.AquariumStoryTemplates
    );
    return event.choices;
  }

  function storyModeOf(template) {
    return template && template.storyMode === "fixed" ? "fixed" : "template";
  }

  function nextStoryMode(state) {
    const stories = Array.isArray(state.stories) ? state.stories : [];
    for (let index = stories.length - 1; index >= 0; index -= 1) {
      if (stories[index].storyMode === "fixed") return "template";
      if (stories[index].storyMode === "template") return "fixed";
    }
    return "fixed";
  }

  function participantTypesMatch(template, participants) {
    const expected = (template.participants || []).slice().sort().join("|");
    const actual = participants.map(entityType).sort().join("|");
    return expected === actual;
  }

  function weightedTemplate(candidates, randomValue) {
    const total = candidates.reduce((sum, template) => sum + Number(template.weight), 0);
    let cursor = Math.max(0, Math.min(0.999999, Number(randomValue) || 0)) * total;
    for (const template of candidates) {
      cursor -= Number(template.weight);
      if (cursor < 0) return template;
    }
    return candidates[candidates.length - 1] || null;
  }

  function chooseTemplate(
    templates,
    state,
    eventType,
    participants,
    source,
    salt,
    allowFixed
  ) {
    const all = templates.list();
    const candidatesForMode = (mode) => all.filter((template) => {
      if (storyModeOf(template) !== mode) return false;
      if (!participantTypesMatch(template, participants)) return false;
      if (mode === "fixed") {
        if (allowFixed === false) return false;
        if (!Array.isArray(template.triggers) || !template.triggers.includes(source)) {
          return false;
        }
      } else if (template.eventType !== eventType) {
        return false;
      }
      return true;
    });
    const repeatSafeCandidates = (candidates) => candidates.filter((template) => {
      const fingerprint = buildFingerprint(
        template.eventType || eventType,
        participants[0].id,
        participants[1].id,
        template.metaphor || template.id
      );
      return isFingerprintAllowed(state, fingerprint);
    });
    const preferred = nextStoryMode(state);
    const modes = [preferred, preferred === "fixed" ? "template" : "fixed"];
    for (const mode of modes) {
      const modeCandidates = candidatesForMode(mode);
      if (!modeCandidates.length) continue;
      const repeatSafe = repeatSafeCandidates(modeCandidates);
      const candidates = repeatSafe.length ? repeatSafe : modeCandidates;
      return weightedTemplate(
        candidates,
        seededValue(`${state.stateId}|${salt}|${mode}`)
      );
    }
    return templates.select({
      eventType,
      participants: participants.map(entityType),
      storyMode: "template",
      random: () => seededValue(`${state.stateId}|${salt}|fallback`)
    });
  }

  function applyEventRules(state, event, participants, amount, reward) {
    const relationships = root.AquariumRelationships;
    const progression = root.AquariumGrowthJourney;
    const economy = root.AquariumEconomy;
    const relationship = relationships.addRelationship(
      state,
      participants[0].id,
      participants[1].id,
      amount,
      { eventId: event.id, now: event.occurredAt }
    );
    participants
      .filter((participant) => entityType(participant) === "fish")
      .forEach((fish) => progression.applyEffectiveEvent(fish, event.id));
    let appliedReward = 0;
    if (reward < 0) {
      const cost = Math.min(Math.max(0, Number(state.feed) || 0), Math.abs(reward));
      economy.spendFeed(state, cost);
      appliedReward = -cost;
    } else {
      appliedReward = economy.addFeed(state, reward);
    }
    event.relationshipValue = relationship ? relationship.value : 0;
    event.relationshipStage = relationship ? relationship.stage : "陌生";
    event.reward = appliedReward;
  }

  function addStory(state, event) {
    state.stories = Array.isArray(state.stories) ? state.stories : [];
    state.stories.push({ ...event });
    state.stories = state.stories.slice(-100);
    state.activeStoryId = event.id;
  }

  function createEventRecord(state, options) {
    const templates = root.AquariumStoryTemplates;
    const participants = options.participants;
    const context = buildContext(participants[0], participants[1]);
    const template = chooseTemplate(
      templates,
      state,
      options.eventType,
      participants,
      options.source,
      `${options.source}|${options.now}|${participants[0].id}|${participants[1].id}`,
      options.allowFixed
    );
    const resolvedEventType = template.eventType || options.eventType;
    const storyMode = storyModeOf(template);
    const fallback = fallbackStory(template, context, templates);
    const fingerprint = buildFingerprint(
      resolvedEventType,
      participants[0].id,
      participants[1].id,
      template.metaphor || template.id
    );
    const record = {
      id: eventId(state, options.idPrefix || "story", options.now),
      source: options.source,
      eventType: resolvedEventType,
      storyMode,
      templateId: template.id,
      participantAId: participants[0].id,
      participantBId: participants[1].id,
      participants: participants.map((item) => ({
        id: item.id,
        type: entityType(item),
        name: item.name
      })),
      title: fallback.title,
      body: fallback.body,
      posterLine: fallback.posterLine,
      immediateText: templates.renderPattern(template.immediatePattern, context),
      choices: buildEventChoices(template, context, templates),
      selectedChoice: null,
      promptGuide: template.promptGuide,
      context,
      status: storyMode === "fixed" ? "fixed" : "pending",
      occurredAt: options.now,
      readAt: options.source === "offline" ? null : options.now,
      anchor: options.anchor || { x: 0.5, y: 0.35 },
      fingerprint
    };
    rememberFingerprint(state, fingerprint);
    return record;
  }

  function rewardForEvent(event, fallbackReward) {
    if (!event || event.storyMode !== "fixed") return fallbackReward;
    const template = root.AquariumStoryTemplates.getById(event.templateId);
    const min = Number(template && template.currencyDeltaMin);
    const max = Number(template && template.currencyDeltaMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    const span = Math.max(0, Math.floor(max) - Math.ceil(min));
    return Math.ceil(min) + Math.floor(seededValue(`${event.id}|currency`) * (span + 1));
  }

  function activeFish(state) {
    return (state.fish || []).filter((fish) => fish.active !== false);
  }

  function createPlacementEvent(state, objectId, nowValue) {
    const now = Number(nowValue) || Date.now();
    const object = (state.objects || []).find((item) => item.id === objectId);
    if (!object) {
      return { ok: false, code: "OBJECT_NOT_FOUND", message: "没有找到这件现实物品。" };
    }
    state.settledObjectIds = Array.isArray(state.settledObjectIds)
      ? state.settledObjectIds
      : [];
    if (object.entryEventId || state.settledObjectIds.includes(objectId)) {
      return {
        ok: true,
        data: {
          duplicate: true,
          event: object.entryEventId
            ? (state.stories || []).find((story) => story.id === object.entryEventId) || null
            : null
        }
      };
    }
    const fish = activeFish(state)
      .slice()
      .sort((a, b) => (
        (Number(a.effectiveEventCount) || 0) - (Number(b.effectiveEventCount) || 0)
        || (Number(a.affection) || 0) - (Number(b.affection) || 0)
      ))[0];
    if (!fish) {
      return { ok: false, code: "NO_ACTIVE_FISH", message: "鱼缸里暂时没有可以参与故事的鱼。" };
    }
    const eventType = PLACEMENT_EVENT_TYPES[
      Math.floor(
        seededValue(`${state.stateId}|${object.id}|placement`) * PLACEMENT_EVENT_TYPES.length
      )
    ];
    const event = createEventRecord(state, {
      participants: [fish, object],
      eventType,
      source: "placement",
      idPrefix: "story",
      now
    });
    object.entryEventId = event.id;
    object.settledAt = now;
    state.settledObjectIds.push(objectId);
    state.settledObjectIds = state.settledObjectIds.slice(-100);
    const relationshipAmount = 25 + Math.floor(seededValue(`${event.id}|relationship`) * 11);
    const storyReward = 4 + Math.floor(seededValue(`${event.id}|reward`) * 5);
    applyEventRules(state, event, [fish, object], relationshipAmount, storyReward);
    if (!state.firstObjectRewarded) {
      root.AquariumEconomy.addFeed(state, 10);
      state.firstObjectRewarded = true;
      event.firstObjectReward = 10;
    }
    addStory(state, event);
    state.nextOnlineEventAt = now + 60 * 1000
      + Math.floor(seededValue(`${event.id}|next`) * 60 * 1000);
    return { ok: true, data: { duplicate: false, event } };
  }

  function createFishArrivalEvent(state, fishId, nowValue) {
    const now = Number(nowValue) || Date.now();
    const fish = activeFish(state).find((item) => item.id === fishId);
    if (!fish) {
      return { ok: false, code: "FISH_NOT_FOUND", message: "没有找到刚入缸的鱼。" };
    }
    state.arrivedFishIds = Array.isArray(state.arrivedFishIds) ? state.arrivedFishIds : [];
    if (state.arrivedFishIds.includes(fishId)) {
      return { ok: true, data: { duplicate: true, event: null } };
    }
    const companion = activeFish(state).find((item) => item.id !== fishId);
    if (!companion) {
      return { ok: false, code: "NO_COMPANION", message: "鱼缸里还没有能迎接它的伙伴。" };
    }
    const eventTypes = ["fish-fish-shared", "deep-companionship"];
    const eventType = eventTypes[
      Math.floor(seededValue(`${state.stateId}|${fishId}|arrival`) * eventTypes.length)
    ];
    const event = createEventRecord(state, {
      participants: [companion, fish],
      eventType,
      source: "arrival",
      idPrefix: "arrival",
      now
    });
    const relationship = root.AquariumRelationships.getRelationship(
      state,
      companion.id,
      fish.id
    );
    event.relationshipValue = Number(relationship && relationship.value) || 0;
    event.relationshipStage = relationship ? relationship.stage : "陌生";
    event.reward = 0;
    event.effective = false;
    state.arrivedFishIds.push(fishId);
    addStory(state, event);
    return { ok: true, data: { duplicate: false, event } };
  }

  function createFeedEvent(state, fishId, nowValue) {
    const now = Number(nowValue) || Date.now();
    const fish = activeFish(state);
    if (fish.length < 2) return null;
    const fedFish = fish.find((item) => item.id === fishId) || fish[0];
    const companions = fish.filter((item) => item.id !== fedFish.id);
    const companion = companions[
      Math.floor(seededValue(`${state.stateId}|${now}|feed-companion`) * companions.length)
    ];
    if (!companion) return null;
    const event = createEventRecord(state, {
      participants: [fedFish, companion],
      eventType: "fish-fish-shared",
      source: "feed",
      idPrefix: "feed-story",
      now
    });
    event.effective = false;
    event.reward = 0;
    const relationship = root.AquariumRelationships.getRelationship(
      state,
      fedFish.id,
      companion.id
    );
    event.relationshipValue = Number(relationship && relationship.value) || 0;
    event.relationshipStage = relationship ? relationship.stage : "陌生";
    addStory(state, event);
    return event;
  }

  function orderedOfflinePairs(state) {
    const pairs = root.AquariumRelationships.listPairCandidates(state);
    const signatureOrder = RELATIONSHIP_PAIR_PRIORITY;
    const groups = new Map(signatureOrder.map((signature) => [signature, []]));
    pairs.forEach((pair) => {
      const signature = pairSignature(pair[0], pair[1]);
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(pair);
    });
    groups.forEach((values) => {
      values.sort((left, right) => {
        const leftRelationship = root.AquariumRelationships.getRelationship(
          state,
          left[0].id,
          left[1].id
        );
        const rightRelationship = root.AquariumRelationships.getRelationship(
          state,
          right[0].id,
          right[1].id
        );
        return (Number(rightRelationship && rightRelationship.value) || 0)
          - (Number(leftRelationship && leftRelationship.value) || 0);
      });
    });
    const diverse = [];
    signatureOrder.forEach((signature) => {
      const first = groups.get(signature).shift();
      if (first) diverse.push(first);
    });
    signatureOrder.forEach((signature) => {
      diverse.push(...groups.get(signature));
    });
    return diverse;
  }

  function settleOfflineEvents(state, elapsedMs, nowValue) {
    const now = Number(nowValue) || Date.now();
    state.offlineEvents = Array.isArray(state.offlineEvents) ? state.offlineEvents : [];
    const unreadCount = state.offlineEvents.filter((event) => event.readAt === null).length;
    const availableSlots = Math.max(0, MAX_OFFLINE_EVENTS - unreadCount);
    const offlineDuration = Math.max(0, Number(elapsedMs) || 0);
    const elapsedEventCount = FILL_OFFLINE_EVENTS_ON_ANY_RETURN
      ? (offlineDuration > 0 ? MAX_OFFLINE_EVENTS : 0)
      : Math.floor(offlineDuration / OFFLINE_EVENT_INTERVAL_MS);
    const desiredCount = Math.min(
      MAX_OFFLINE_EVENTS,
      availableSlots,
      elapsedEventCount
    );
    if (desiredCount <= 0) return [];
    const usedPairs = new Set();
    const created = [];
    const pairs = orderedOfflinePairs(state);
    for (const participants of pairs) {
      if (created.length >= desiredCount) break;
      const pairId = [participants[0].id, participants[1].id].sort().join("|");
      if (usedPairs.has(pairId)) continue;
      usedPairs.add(pairId);
      const relationship = root.AquariumRelationships.getRelationship(
        state,
        participants[0].id,
        participants[1].id
      );
      const eventType = eventTypeForPair(
        participants[0],
        participants[1],
        Number(relationship && relationship.value) || 0
      );
      const event = createEventRecord(state, {
        participants,
        eventType,
        source: "offline",
        idPrefix: "offline-event",
        now: now - (desiredCount - created.length - 1) * 1000,
        allowFixed: offlineDuration >= OFFLINE_EVENT_INTERVAL_MS,
        anchor: { x: 0.5, y: 0.35 + created.length * 0.08 }
      });
      const relationshipAmount = 15 + Math.floor(seededValue(`${event.id}|offline-rel`) * 11);
      const defaultReward = 4 + Math.floor(seededValue(`${event.id}|offline-reward`) * 5);
      const reward = rewardForEvent(event, defaultReward);
      applyEventRules(state, event, participants, relationshipAmount, reward);
      state.offlineEvents.push(event);
      addStory(state, event);
      created.push(event);
    }
    state.offlineEvents = state.offlineEvents.slice(-60);
    return created;
  }

  function createOnlineEvent(state, nowValue) {
    const now = Number(nowValue) || Date.now();
    const pair = orderedOfflinePairs(state)[0];
    if (!pair) return null;
    const relationship = root.AquariumRelationships.getRelationship(
      state,
      pair[0].id,
      pair[1].id
    );
    const eventType = eventTypeForPair(
      pair[0],
      pair[1],
      Number(relationship && relationship.value) || 0
    );
    const event = createEventRecord(state, {
      participants: pair,
      eventType,
      source: "online",
      idPrefix: "story",
      now
    });
    const relationshipAmount = 25 + Math.floor(seededValue(`${event.id}|online-rel`) * 11);
    const defaultReward = 4 + Math.floor(seededValue(`${event.id}|online-reward`) * 5);
    const reward = rewardForEvent(event, defaultReward);
    applyEventRules(state, event, pair, relationshipAmount, reward);
    addStory(state, event);
    state.nextOnlineEventAt = now + 2 * 60 * 1000
      + Math.floor(seededValue(`${event.id}|next-online`) * 2 * 60 * 1000);
    return event;
  }

  function resolveStory(state, storyId, result) {
    const targets = [];
    const story = (state.stories || []).find((item) => item.id === storyId);
    const offline = (state.offlineEvents || []).find((item) => item.id === storyId);
    if (story) targets.push(story);
    if (offline && offline !== story) targets.push(offline);
    if (!targets.length) return null;
    targets.forEach((target) => {
      target.title = result.title;
      target.body = result.body;
      target.posterLine = result.posterLine;
      target.status = result.status;
      target.resolvedAt = result.resolvedAt || Date.now();
      if (result.reason) target.fallbackReason = result.reason;
    });
    return offline || story;
  }

  function resolveEventChoice(state, eventIdValue, choiceIdValue, nowValue) {
    const eventIdText = String(eventIdValue || "");
    const choiceIdText = String(choiceIdValue || "");
    const story = (state.stories || []).find((item) => item.id === eventIdText);
    const offline = (state.offlineEvents || []).find((item) => item.id === eventIdText);
    const event = offline || story;
    if (!event) {
      return { ok: false, code: "EVENT_NOT_FOUND", message: "没有找到这段事件。" };
    }
    if (event.selectedChoice) {
      if (event.selectedChoice.id !== choiceIdText) {
        return {
          ok: false,
          code: "EVENT_CHOICE_ALREADY_RESOLVED",
          message: "这段事件已经有了结局。"
        };
      }
      return {
        ok: true,
        data: { event: { ...event }, choice: { ...event.selectedChoice }, duplicate: true }
      };
    }
    const choices = ensureEventChoices(event);
    const choice = choices.find((item) => item.id === choiceIdText);
    if (!choice) {
      return { ok: false, code: "EVENT_CHOICE_NOT_FOUND", message: "没有找到这个回应选项。" };
    }
    const appliedAlgaeCoins = root.AquariumEconomy.addFeed(state, choice.algaeCoins);
    const relationship = root.AquariumRelationships.addRelationship(
      state,
      event.participantAId,
      event.participantBId,
      choice.intimacy,
      {
        eventId: `${event.id}:choice:${choice.id}`,
        now: Number(nowValue) || Date.now()
      }
    );
    const selectedChoice = {
      ...choice,
      outcome: choice.fallbackOutcome,
      selectedAt: Number(nowValue) || Date.now(),
      appliedAlgaeCoins,
      appliedIntimacy: choice.intimacy
    };
    const targets = [story, offline].filter((item, index, list) => (
      item && list.indexOf(item) === index
    ));
    targets.forEach((target) => {
      target.choices = choices.map((item) => ({ ...item }));
      target.selectedChoice = { ...selectedChoice };
      if (relationship) {
        target.relationshipValue = relationship.value;
        target.relationshipStage = relationship.stage;
      }
    });
    state.activeStoryId = event.id;
    return {
      ok: true,
      data: {
        event: { ...event },
        choice: { ...selectedChoice },
        duplicate: false
      }
    };
  }

  function openOfflineEvent(state, eventId, nowValue) {
    const event = (state.offlineEvents || []).find((item) => item.id === eventId);
    if (!event) {
      return { ok: false, code: "EVENT_NOT_FOUND", message: "没有找到这段离线故事。" };
    }
    ensureEventChoices(event);
    if (event.readAt === null) event.readAt = Number(nowValue) || Date.now();
    state.activeStoryId = event.id;
    return { ok: true, data: { event: { ...event } } };
  }

  function getUnreadOfflineEvents(state) {
    return (state.offlineEvents || [])
      .filter((event) => event.readAt === null)
      .slice(-MAX_OFFLINE_EVENTS);
  }

  function updateEventAnchor(state, eventIdValue, anchorValue) {
    const event = (state.offlineEvents || []).find((item) => item.id === eventIdValue);
    if (!event) return false;
    const next = {
      x: clamp(anchorValue && anchorValue.x, 0, 1),
      y: clamp(anchorValue && anchorValue.y, 0, 1)
    };
    const current = event.anchor || { x: 0.5, y: 0.35 };
    if (Math.abs(current.x - next.x) < 0.002 && Math.abs(current.y - next.y) < 0.002) {
      return false;
    }
    event.anchor = next;
    const story = (state.stories || []).find((item) => item.id === eventIdValue);
    if (story) story.anchor = { ...next };
    return true;
  }

  root.AquariumEventDirector = {
    OFFLINE_EVENT_INTERVAL_MS,
    MAX_OFFLINE_EVENTS,
    REPEAT_GAP,
    DEEP_COMPANIONSHIP_THRESHOLD,
    PLACEMENT_EVENT_TYPES: PLACEMENT_EVENT_TYPES.slice(),
    RELATIONSHIP_PAIR_PRIORITY: RELATIONSHIP_PAIR_PRIORITY.slice(),
    buildFingerprint,
    isFingerprintAllowed,
    createPlacementEvent,
    createFishArrivalEvent,
    createFeedEvent,
    settleOfflineEvents,
    createOnlineEvent,
    resolveStory,
    resolveEventChoice,
    openOfflineEvent,
    getUnreadOfflineEvents,
    updateEventAnchor
  };
})(globalThis);
