(function (root) {
  "use strict";

  const EVENT_TYPES = new Set([
    "first-meeting",
    "misunderstood-use",
    "shelter",
    "play",
    "fish-object-friendship",
    "fish-fish-shared",
    "object-object-memory",
    "environment-change",
    "deep-companionship",
    "maturity-choice"
  ]);
  const PARTICIPANT_TYPES = new Set(["fish", "object"]);
  const STORY_MODES = new Set(["template", "fixed"]);
  const TRIGGER_TYPES = new Set(["feed", "online", "offline"]);
  const PLACEHOLDERS = new Set([
    "fishName",
    "secondFishName",
    "objectName",
    "secondObjectName",
    "capturedAt",
    "capturedPlace"
  ]);
  const REQUIRED_TEXT_FIELDS = [
    "id",
    "eventType",
    "promptGuide",
    "immediatePattern",
    "fallbackTitle",
    "fallbackBody",
    "fallbackPosterLine"
  ];

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function participantSignature(participants) {
    return (Array.isArray(participants) ? participants : [])
      .map(asText)
      .sort()
      .join("|");
  }

  function validate(template) {
    const errors = [];
    if (!template || typeof template !== "object") {
      return { valid: false, errors: ["模板必须是对象"] };
    }
    REQUIRED_TEXT_FIELDS.forEach((field) => {
      if (!asText(template[field])) errors.push(`${field} 不能为空`);
    });
    if (!EVENT_TYPES.has(template.eventType)) {
      errors.push("eventType 不在固定类型中");
    }
    if (
      !Array.isArray(template.participants)
      || template.participants.length !== 2
      || template.participants.some((type) => !PARTICIPANT_TYPES.has(type))
    ) {
      errors.push("participants 必须由两个 fish/object 组成");
    }
    const weight = Number(template.weight);
    if (!Number.isFinite(weight) || weight < 1 || weight > 100) {
      errors.push("weight 必须在 1–100");
    }
    if (template.storyMode && !STORY_MODES.has(template.storyMode)) {
      errors.push("storyMode 只能是 template/fixed");
    }
    if (
      template.storyMode === "fixed"
      && (
        !Array.isArray(template.triggers)
        || !template.triggers.length
        || template.triggers.some((trigger) => !TRIGGER_TYPES.has(trigger))
      )
    ) {
      errors.push("固定事件必须声明有效 triggers");
    }
    if (
      template.currencyDeltaMin !== undefined
      || template.currencyDeltaMax !== undefined
    ) {
      const min = Number(template.currencyDeltaMin);
      const max = Number(template.currencyDeltaMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
        errors.push("currencyDeltaMin/Max 必须是有效区间");
      }
    }
    [
      template.immediatePattern,
      template.fallbackBody
    ].forEach((pattern) => {
      const matches = String(pattern || "").match(/\{([^}]+)\}/g) || [];
      matches.forEach((match) => {
        const name = match.slice(1, -1);
        if (!PLACEHOLDERS.has(name)) errors.push(`不支持占位符 ${match}`);
      });
    });
    return { valid: errors.length === 0, errors };
  }

  function list(options) {
    const source = Array.isArray(root.AquariumStoryTemplateCatalog)
      ? root.AquariumStoryTemplateCatalog
      : [];
    const includeDisabled = Boolean(options && options.includeDisabled);
    const seen = new Set();
    const valid = [];
    source.forEach((template) => {
      const result = validate(template);
      if (!result.valid || (!includeDisabled && template.enabled === false)) {
        if (!result.valid && root.console && typeof root.console.warn === "function") {
          root.console.warn("忽略无效故事模板", template && template.id, result.errors);
        }
        return;
      }
      if (seen.has(template.id)) {
        if (root.console && typeof root.console.warn === "function") {
          root.console.warn("故事模板 ID 重复，保留第一条", template.id);
        }
        return;
      }
      seen.add(template.id);
      valid.push(template);
    });
    return valid;
  }

  function getById(id) {
    const target = asText(id);
    return list().find((template) => template.id === target) || null;
  }

  function buildGenericFallback(criteria) {
    const participants = criteria && Array.isArray(criteria.participants)
      ? criteria.participants
      : ["fish", "object"];
    const signature = participantSignature(participants);
    const patterns = signature === "fish|fish"
      ? {
        immediatePattern: "{fishName}和{secondFishName}在水光里碰了个正着。",
        fallbackTitle: "碰巧同行",
        fallbackBody: "{fishName}和{secondFishName}在水光里碰了个正着。它们一起游了一小段，随后又各自慢慢转开。",
        fallbackPosterLine: "短暂同行，也会留下温柔的水纹。"
      }
      : signature === "object|object"
        ? {
          immediatePattern: "{objectName}和{secondObjectName}之间荡起了一圈水波。",
          fallbackTitle: "水下邻居",
          fallbackBody: "{objectName}和{secondObjectName}安静地待在水里，一圈很小的波纹经过，让两段记忆短暂地靠近。",
          fallbackPosterLine: "记忆靠近时，水会替它们打招呼。"
        }
        : {
          immediatePattern: "{fishName}在{objectName}旁边停了一会儿。",
          fallbackTitle: "新的相遇",
          fallbackBody: "{fishName}在{objectName}旁边停了一会儿，又绕着它慢慢游开。水里从此多了一处值得回头的位置。",
          fallbackPosterLine: "每次相遇，都会让水下多一个坐标。"
        };
    return {
      id: `generic-${signature || "fish|object"}`,
      enabled: true,
      eventType: EVENT_TYPES.has(criteria && criteria.eventType)
        ? criteria.eventType
        : "first-meeting",
      participants: participants.slice(0, 2),
      weight: 1,
      metaphor: "相遇",
      promptGuide: "写一段克制、轻盈且不虚构私人信息的水下相遇。",
      imageHints: [],
      ...patterns,
      generic: true
    };
  }

  function select(criteria) {
    const options = criteria || {};
    const signature = participantSignature(options.participants);
    let candidates = list().filter((template) => {
      if (options.eventType && template.eventType !== options.eventType) return false;
      if (
        options.storyMode
        && (template.storyMode === "fixed" ? "fixed" : "template") !== options.storyMode
      ) {
        return false;
      }
      if (
        options.trigger
        && template.storyMode === "fixed"
        && (!Array.isArray(template.triggers) || !template.triggers.includes(options.trigger))
      ) {
        return false;
      }
      if (signature && participantSignature(template.participants) !== signature) return false;
      if (
        Array.isArray(options.excludeIds)
        && options.excludeIds.includes(template.id)
      ) return false;
      return true;
    });
    if (!candidates.length) return buildGenericFallback(options);
    const total = candidates.reduce((sum, template) => sum + Number(template.weight), 0);
    const randomValue = typeof options.random === "function"
      ? options.random()
      : Math.random();
    let cursor = Math.max(0, Math.min(0.999999, Number(randomValue) || 0)) * total;
    for (const template of candidates) {
      cursor -= Number(template.weight);
      if (cursor < 0) return template;
    }
    return candidates[candidates.length - 1];
  }

  function cleanupRenderedText(value) {
    return String(value || "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/[，、]\s*[，、]/g, "，")
      .replace(/\s+([，。！？；：])/g, "$1")
      .replace(/([，、])([。！？；])/g, "$2")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function renderPattern(pattern, context) {
    const source = typeof pattern === "object" && pattern
      ? pattern.immediatePattern
      : pattern;
    const values = context || {};
    const rendered = String(source || "").replace(/\{([^}]+)\}/g, (_match, key) => (
      PLACEHOLDERS.has(key) ? asText(values[key]) : ""
    ));
    return cleanupRenderedText(rendered);
  }

  root.AquariumStoryTemplates = {
    list,
    getById,
    select,
    validate,
    renderPattern,
    buildGenericFallback
  };
})(globalThis);
