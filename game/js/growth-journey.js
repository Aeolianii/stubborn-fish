(function (root) {
  "use strict";

  const AFFECTION_PER_FEED = 5;
  const AFFECTION_PER_EVENT = 50;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalizeFish(fish) {
    fish.effectiveEventIds = Array.isArray(fish.effectiveEventIds)
      ? fish.effectiveEventIds
      : [];
    fish.effectiveEventCount = Math.max(
      Number(fish.effectiveEventCount) || 0,
      fish.effectiveEventIds.length
    );
    const legacyGrowth = Number(fish.growth) || 0;
    const storedAffection = fish.affection === undefined
      ? legacyGrowth
      : Number(fish.affection) || 0;
    const rawAffection = clamp(Math.max(legacyGrowth, storedAffection), 0, 100);
    fish.affection = rawAffection >= 100 && fish.effectiveEventCount < 2
      ? 99
      : rawAffection;
    // growth 只作为旧存档和冻结 API 的兼容别名，唯一进度是 affection。
    fish.growth = fish.affection;
    fish.mature = Boolean(
      fish.affection >= 100
      && fish.effectiveEventCount >= 2
    );
    fish.maturityRewardClaimed = Boolean(fish.maturityRewardClaimed);
    fish.maturityChoice = fish.maturityChoice === "stay"
      || fish.maturityChoice === "journey"
      ? fish.maturityChoice
      : null;
    fish.journeyStartedAt = Number.isFinite(Number(fish.journeyStartedAt))
      ? Number(fish.journeyStartedAt)
      : null;
    if (typeof fish.active !== "boolean") fish.active = true;
    return fish;
  }

  function updateMaturity(fish) {
    normalizeFish(fish);
    if (
      fish.affection >= 100
      && fish.effectiveEventCount >= 2
    ) {
      fish.affection = 100;
      fish.growth = 100;
      fish.mature = true;
    } else if (fish.affection >= 100) {
      fish.affection = 99;
      fish.growth = 99;
      fish.mature = false;
    }
    return fish.mature;
  }

  function applyFeedAffection(fish) {
    normalizeFish(fish);
    fish.affection = clamp(fish.affection + AFFECTION_PER_FEED, 0, 100);
    fish.growth = fish.affection;
    updateMaturity(fish);
    return fish;
  }

  const applyFeedGrowth = applyFeedAffection;

  function applyEffectiveEvent(fish, eventId) {
    normalizeFish(fish);
    const id = String(eventId || "");
    if (!id || fish.effectiveEventIds.includes(id)) {
      return { applied: false, matured: fish.mature };
    }
    const wasMature = fish.mature;
    fish.effectiveEventIds.push(id);
    fish.effectiveEventIds = fish.effectiveEventIds.slice(-40);
    fish.effectiveEventCount = Math.max(
      fish.effectiveEventCount + 1,
      fish.effectiveEventIds.length
    );
    fish.affection = clamp(fish.affection + AFFECTION_PER_EVENT, 0, 100);
    fish.growth = fish.affection;
    updateMaturity(fish);
    return { applied: true, matured: !wasMature && fish.mature };
  }

  function maturityRewardFor(fish, state) {
    normalizeFish(fish);
    const relationships = state && state.relationships
      ? Object.values(state.relationships)
      : [];
    const strongest = relationships
      .filter((relationship) => (
        relationship.participantAId === fish.id
        || relationship.participantBId === fish.id
      ))
      .reduce((max, relationship) => Math.max(max, Number(relationship.value) || 0), 0);
    return clamp(30 + Math.floor(strongest / 5), 30, 60);
  }

  function closestObjectId(fish, state) {
    const relationships = state && state.relationships
      ? Object.values(state.relationships)
      : [];
    const objectIds = new Set((state.objects || []).map((item) => item.id));
    const strongest = relationships
      .filter((relationship) => (
        relationship.participantAId === fish.id
        || relationship.participantBId === fish.id
      ))
      .map((relationship) => {
        const otherId = relationship.participantAId === fish.id
          ? relationship.participantBId
          : relationship.participantAId;
        return { relationship, otherId };
      })
      .filter((entry) => objectIds.has(entry.otherId))
      .sort((a, b) => b.relationship.value - a.relationship.value)[0];
    return strongest
      ? strongest.otherId
      : (state.objects && state.objects[0] && state.objects[0].id) || null;
  }

  function ensureJourneyRecord(state, fish, now) {
    state.journeys = Array.isArray(state.journeys) ? state.journeys : [];
    let record = state.journeys.find((item) => item.fishId === fish.id);
    if (!record) {
      record = {
        id: `journey-${fish.id}-${now}`,
        fishId: fish.id,
        fishName: fish.name,
        closestObjectId: closestObjectId(fish, state),
        startedAt: now,
        letter: `${fish.name}去了更远的水里。它寄回的第一封信，只写着：这里的水光，也让我想起那只熟悉的鱼缸。`
      };
      state.journeys.push(record);
    }
    return record;
  }

  function chooseMaturity(state, fishId, choice, now) {
    if (choice !== "stay" && choice !== "journey") {
      return { ok: false, code: "INVALID_MATURITY_CHOICE", message: "请选择留下或远游。" };
    }
    const fish = (state.fish || []).find((item) => item.id === fishId);
    if (!fish) return { ok: false, code: "FISH_NOT_FOUND", message: "没有找到这条鱼。" };
    normalizeFish(fish);
    if (!fish.mature) {
      return { ok: false, code: "FISH_NOT_MATURE", message: "它还需要经历更多故事。" };
    }
    if (fish.maturityChoice === "journey" && choice === "stay") {
      return { ok: false, code: "JOURNEY_ALREADY_STARTED", message: "它已经开始远游了。" };
    }
    if (fish.maturityChoice === choice) {
      const journey = choice === "journey"
        ? (state.journeys || []).find((item) => item.fishId === fish.id) || null
        : null;
      return {
        ok: true,
        data: {
          fishId,
          choice,
          reward: 0,
          rewardClaimed: fish.maturityRewardClaimed,
          active: fish.active,
          journey,
          alreadyResolved: true
        }
      };
    }
    let reward = 0;
    if (!fish.maturityRewardClaimed) {
      reward = maturityRewardFor(fish, state);
      fish.maturityRewardClaimed = true;
      state.feed = Math.max(0, Number(state.feed) || 0) + reward;
    }
    fish.maturityChoice = choice;
    let journey = null;
    if (choice === "stay") {
      fish.active = true;
    } else {
      const startedAt = Number(now) || Date.now();
      fish.active = false;
      fish.journeyStartedAt = fish.journeyStartedAt || startedAt;
      journey = ensureJourneyRecord(state, fish, fish.journeyStartedAt);
    }
    return {
      ok: true,
      data: {
        fishId,
        choice,
        reward,
        rewardClaimed: fish.maturityRewardClaimed,
        active: fish.active,
        journey
      }
    };
  }

  function startJourney(state, fishId, now) {
    const fish = (state.fish || []).find((item) => item.id === fishId);
    if (!fish) return { ok: false, code: "FISH_NOT_FOUND", message: "没有找到这条鱼。" };
    normalizeFish(fish);
    if (!fish.mature) {
      return { ok: false, code: "FISH_NOT_MATURE", message: "它还需要经历更多故事。" };
    }
    if (fish.maturityChoice === "journey") {
      const journey = (state.journeys || []).find((item) => item.fishId === fishId) || null;
      return { ok: true, data: { fishId, alreadyStarted: true, reward: 0, journey } };
    }
    return chooseMaturity(state, fishId, "journey", now);
  }

  root.AquariumGrowthJourney = {
    AFFECTION_PER_FEED,
    AFFECTION_PER_EVENT,
    normalizeFish,
    updateMaturity,
    applyFeedAffection,
    applyFeedGrowth,
    applyEffectiveEvent,
    maturityRewardFor,
    closestObjectId,
    chooseMaturity,
    startJourney
  };
})(globalThis);
