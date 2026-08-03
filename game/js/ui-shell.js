(function memoryAquariumUIShell(global) {
  "use strict";

  var api = global.AquariumAPI;
  var FALLBACK_ICONS = {
    fish: "/game/assets/ui/fish-fallback.svg",
    object: "/game/assets/ui/object-fallback.svg",
    poster: "/game/assets/ui/poster-placeholder.svg"
  };
  var state = {
    mounted: false,
    viewModel: null,
    activeEventId: "",
    activeEvent: null,
    liveEventBubbles: [],
    activeMaturityFishId: "",
    selectedPlacement: "fish",
    previewUrl: "",
    storyTimer: 0,
    catchMode: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = byId(id);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function setHidden(nodeOrId, hidden) {
    var node = typeof nodeOrId === "string" ? byId(nodeOrId) : nodeOrId;
    if (node) node.classList.toggle("is-hidden", Boolean(hidden));
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function makeElement(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue != null) node.textContent = String(textValue);
    return node;
  }

  function selectedFish(viewModel) {
    var fish = (viewModel && viewModel.fishCards) || [];
    var selectedId = viewModel && viewModel.selected && viewModel.selected.fishId;
    return fish.find(function findFish(item) {
      return item.id === selectedId;
    }) || fish[0] || null;
  }

  function selectedObjectId() {
    var viewModel = state.viewModel || {};
    return (viewModel.selected && (viewModel.selected.objectId || viewModel.selected.decorId)) || "";
  }

  function selectedDecorId() {
    var viewModel = state.viewModel || {};
    return (viewModel.selected && (viewModel.selected.decorId || viewModel.selected.objectId)) || "";
  }

  function showNotice(message, timeout) {
    var toast = byId("offlineFeedToast");
    if (!toast) return;
    toast.textContent = message || "操作未完成";
    toast.classList.remove("is-hidden");
    global.clearTimeout(toast._hideTimer);
    toast._hideTimer = global.setTimeout(function hideToast() {
      toast.classList.add("is-hidden");
    }, timeout || 2200);
  }

  function showError(message) {
    var toast = byId("errorToast");
    if (!toast) {
      showNotice(message);
      return;
    }
    toast.textContent = message || "操作失败，请稍后再试";
    toast.classList.remove("is-hidden");
    global.clearTimeout(toast._hideTimer);
    toast._hideTimer = global.setTimeout(function hideError() {
      toast.classList.add("is-hidden");
    }, 2800);
  }

  function showStory(textValue) {
    if (state.catchMode) return;
    var card = byId("storyCard");
    var text = byId("storyText");
    if (!card || !text || !textValue) return;
    text.textContent = String(textValue);
    card.classList.remove("is-hidden");
    global.clearTimeout(state.storyTimer);
    state.storyTimer = global.setTimeout(function hideStory() {
      card.classList.add("is-hidden");
    }, 4200);
  }

  function closeAllSheets() {
    document.querySelectorAll(".ui-sheet").forEach(function closeSheet(sheet) {
      sheet.classList.add("is-hidden");
      sheet.setAttribute("aria-hidden", "true");
    });
  }

  function syncHomeDockVisibility() {
    var settings = (state.viewModel && state.viewModel.settings) || {};
    var viewing = Boolean(settings.viewing);
    var blockingOverlay = document.querySelector(
      ".sheet:not(.is-hidden), .ui-sheet:not(.is-hidden), #catchPanel:not(.is-hidden), #catchHud:not(.is-hidden)"
    );
    var editingOverlay = [
      byId("objectEditor"),
      byId("fishEditor"),
      byId("decorEditor")
    ].some(function isVisible(node) {
      return node && !node.classList.contains("is-hidden");
    });
    setHidden("dock", Boolean(viewing || state.catchMode || blockingOverlay || editingOverlay));
    setHidden("viewingActions", !viewing);
  }

  function openOnlySheet(id) {
    closeAllSheets();
    var addSheet = byId("addSheet");
    if (addSheet) addSheet.classList.add("is-hidden");
    var sheet = byId(id);
    if (sheet) {
      sheet.classList.remove("is-hidden");
      sheet.setAttribute("aria-hidden", "false");
    }
    setHidden("offlineBubbleLayer", id === "offlineEventSheet");
    syncHomeDockVisibility();
  }

  function closeSheet(id) {
    var sheet = byId(id);
    if (sheet) {
      sheet.classList.add("is-hidden");
      sheet.setAttribute("aria-hidden", "true");
    }
    if (id === "offlineEventSheet") {
      setHidden("offlineBubbleLayer", false);
      state.activeEventId = "";
      state.activeEvent = null;
      syncOfflineEventPausedFish(state.viewModel);
      renderOfflineBubbles(state.viewModel);
    }
    syncHomeDockVisibility();
  }

  async function callApi(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!api || typeof api[name] !== "function") {
      showError("接口暂未接入：" + name);
      return { ok: false, code: "API_MISSING" };
    }
    try {
      var result = await api[name].apply(api, args);
      if (result && result.viewModel) renderViewModel(result.viewModel);
      if (result && result.ok === false && result.message) showError(result.message);
      return result || { ok: true };
    } catch (error) {
      showError(error && error.message ? error.message : "操作失败，请稍后再试");
      return { ok: false, code: "UI_API_ERROR" };
    }
  }

  function renderResources(viewModel) {
    var feed = viewModel.feed == null ? "--" : viewModel.feed;
    var capacity = viewModel.capacity || {};
    var used = capacity.used == null ? "--" : capacity.used;
    var total = capacity.limit == null ? "--" : capacity.limit;
    var capacityText = used + " / " + total;
    setText("feedBalance", feed);
    setText("dockFeedBalance", feed);
    setText("shopFeedBalance", feed);
    setText("capacityStatus", capacityText);
    setText("dockCapacityStatus", capacityText);
    setText("shopCapacityStatus", capacityText);
    if (capacity.nextLimit != null) {
      setText("shopCapacityStatus", "当前 " + capacityText + " · 下一档 " + capacity.nextLimit);
    }
    if (capacity.upgradeCost != null) {
      setText("shopCapacityButton", capacity.upgradeCost + " 藻币升级");
    }
  }

  function renderFishStatus(viewModel) {
    var fish = selectedFish(viewModel);
    var affectionText = fish
      ? "亲密度 " + fish.affection + "/100 · 共同经历 " + fish.eventCount + " 件"
      : "亲密度由系统同步";
    setText("fishAffectionStatus", affectionText);
    setHidden("maturityChoiceButton", !(fish && fish.mature && !fish.maturityChoice));
    setHidden("startJourneyButton", !(fish && fish.canStartJourney));
  }

  function cardIcon(item, fallback) {
    var img = makeElement("img", "shop-item__icon");
    img.alt = "";
    img.src = item.iconUrl || fallback || "";
    img.addEventListener("error", function iconFallback() {
      if (fallback && img.src !== fallback) img.src = fallback;
    }, { once: true });
    return img;
  }

  function renderShopList(panelId, items, kind, feedBalance) {
    var panel = byId(panelId);
    if (!panel) return;
    clearNode(panel);
    var list = items || [];
    panel.dataset.shopKind = kind;
    var heading = makeElement("header", "shop-panel-heading");
    var headingCopy = makeElement("div", "shop-panel-heading__copy");
    headingCopy.appendChild(makeElement(
      "strong",
      "",
      kind === "fish" ? "挑一尾新伙伴" : "布置你的水下角落"
    ));
    heading.appendChild(headingCopy);
    panel.appendChild(heading);

    list.forEach(function renderItem(item, itemIndex) {
      var card = makeElement("article", "shop-item");
      var fallback = kind === "fish"
        ? FALLBACK_ICONS.fish
        : FALLBACK_ICONS.object;
      var media = makeElement("div", "shop-item__media");
      var copy = makeElement("div", "shop-item__copy");
      var title = makeElement("strong", "", item.name || "未命名");
      var quantity = Math.max(
        0,
        Math.floor(Number(item.quantity == null && item.owned ? 1 : item.quantity) || 0)
      );
      var description = makeElement(
        "span",
        "",
        item.description || (kind === "fish" ? "等待游入你的鱼缸" : "给鱼缸添一点新变化")
      );
      var numericPrice = Number(item.price);
      var hasPrice = item.price != null && Number.isFinite(numericPrice);
      var canAfford = !hasPrice || Number(feedBalance) >= numericPrice;
      var button = makeElement("button", "ui-button ui-button--compact shop-item__buy");
      var footer = makeElement("div", "shop-item__footer");
      var priceGroup = makeElement("span", "shop-item__price-group");
      card.dataset.owned = quantity > 0 ? "true" : "false";
      card.classList.toggle("is-unaffordable", !canAfford);
      card.classList.toggle("is-featured", itemIndex === 0);
      media.appendChild(cardIcon(item, fallback));
      if (quantity > 0) {
        media.appendChild(makeElement("span", "shop-item__quantity", "×" + quantity));
      }
      if (itemIndex === 0) {
        card.appendChild(makeElement("span", "shop-item__recommend", "店主推荐"));
      }
      button.appendChild(makeElement(
        "span",
        "shop-item__action-label",
        !canAfford ? "藻币不足" : (quantity > 0 ? "再买一个" : "购买")
      ));
      priceGroup.appendChild(makeElement("span", "shop-item__price-icon", hasPrice ? "◆" : "＋"));
      priceGroup.appendChild(makeElement(
        "strong",
        "shop-item__price",
        hasPrice ? String(numericPrice) : "解锁"
      ));
      if (item.newPlayerDiscount && item.originalPrice != null) {
        priceGroup.appendChild(makeElement(
          "del",
          "shop-item__original-price",
          String(item.originalPrice)
        ));
      }
      priceGroup.appendChild(makeElement(
        "small",
        "shop-item__price-unit",
        hasPrice ? "藻币" : ""
      ));
      footer.appendChild(priceGroup);
      footer.appendChild(button);
      button.type = "button";
      button.disabled = !canAfford;
      button.dataset.unlockId = item.id;
      button.dataset.unlockKind = kind;
      button.setAttribute(
        "aria-label",
        (quantity > 0 ? "再次购买" : "购买") + (item.name || "商品")
        + (hasPrice ? "，需要 " + numericPrice + " 藻币" : "")
      );
      button.addEventListener("click", function purchase(event) {
        event.preventDefault();
        event.stopPropagation();
        callApi("purchaseUnlock", kind, item.id);
      });
      copy.appendChild(title);
      copy.appendChild(description);
      card.appendChild(media);
      card.appendChild(copy);
      card.appendChild(footer);
      panel.appendChild(card);
    });
  }

  function renderShop(viewModel) {
    var shop = viewModel.shop || {};
    renderShopList("shopDecorPanel", shop.decor || [], "decor", viewModel.feed);
    renderShopList("shopFishPanel", shop.fish || [], "fish", viewModel.feed);
  }

  function eventParticipantIds(eventData) {
    if (!eventData) return [];
    return [
      eventData.participantAId || (eventData.participantA && eventData.participantA.id),
      eventData.participantBId || (eventData.participantB && eventData.participantB.id)
    ].filter(Boolean);
  }

  function eventFishParticipantIds(eventData) {
    if (!eventData) return [];
    return [eventData.participantA, eventData.participantB]
      .filter(function fishParticipant(participant) {
        return participant && participant.type === "fish" && participant.id;
      })
      .map(function participantId(participant) { return participant.id; });
  }

  function clampEventValue(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function eventParticipantAnchor(participant, index, bridge) {
    var fallback = {
      x: index === 0 ? 0.42 : 0.58,
      y: index === 0 ? 0.44 : 0.54
    };
    if (!participant || !participant.id || !bridge || typeof bridge.getEventAnchor !== "function") {
      return fallback;
    }
    var anchor = bridge.getEventAnchor([participant.id]);
    return {
      x: clampEventValue(Number(anchor && anchor.x) || fallback.x, 0.02, 0.98),
      y: clampEventValue(Number(anchor && anchor.y) || fallback.y, 0.04, 0.96)
    };
  }

  function eventParticipantFocus(participant, index, bridge) {
    var anchor = eventParticipantAnchor(participant, index, bridge);
    var fallback = {
      x: anchor.x,
      y: anchor.y,
      width: participant && participant.type === "object" ? 0.16 : 0.13,
      height: participant && participant.type === "object" ? 0.2 : 0.14
    };
    if (!participant || !participant.id || !bridge || typeof bridge.getEventFocus !== "function") {
      return fallback;
    }
    var focus = bridge.getEventFocus([participant.id])[0];
    if (!focus) return fallback;
    return {
      x: clampEventValue(Number(focus.x) || fallback.x, 0.02, 0.98),
      y: clampEventValue(Number(focus.y) || fallback.y, 0.04, 0.96),
      width: clampEventValue(Number(focus.width) || fallback.width, 0.065, 0.34),
      height: clampEventValue(Number(focus.height) || fallback.height, 0.08, 0.42)
    };
  }

  function captureEventScene(participants, bridge) {
    var tank = byId("tank");
    var focuses = participants.map(function locateParticipant(participant, index) {
      return eventParticipantFocus(participant, index, bridge);
    });
    if (!tank || !tank.width || !tank.height) {
      return { src: "", markers: focuses };
    }

    try {
      var sourceWidth = tank.width;
      var sourceHeight = tank.height;
      var targetAspect = 1.25;
      var minimumX = Math.min.apply(Math, focuses.map(function focusLeft(focus) {
        return (focus.x - focus.width / 2) * sourceWidth;
      }));
      var maximumX = Math.max.apply(Math, focuses.map(function focusRight(focus) {
        return (focus.x + focus.width / 2) * sourceWidth;
      }));
      var minimumY = Math.min.apply(Math, focuses.map(function focusTop(focus) {
        return (focus.y - focus.height / 2) * sourceHeight;
      }));
      var maximumY = Math.max.apply(Math, focuses.map(function focusBottom(focus) {
        return (focus.y + focus.height / 2) * sourceHeight;
      }));
      var requiredWidth = maximumX - minimumX + sourceWidth * 0.16;
      var requiredHeight = maximumY - minimumY + sourceHeight * 0.22;
      var cropWidth = Math.max(sourceWidth * 0.42, requiredWidth);
      var cropHeight = Math.max(sourceHeight * 0.78, requiredHeight);

      if (cropWidth / cropHeight < targetAspect) cropWidth = cropHeight * targetAspect;
      else cropHeight = cropWidth / targetAspect;
      cropWidth = Math.min(sourceWidth, cropWidth);
      cropHeight = Math.min(sourceHeight, cropHeight);

      var centerX = (minimumX + maximumX) / 2;
      var centerY = (minimumY + maximumY) / 2;
      var cropX = clampEventValue(centerX - cropWidth / 2, 0, sourceWidth - cropWidth);
      var cropY = clampEventValue(centerY - cropHeight / 2, 0, sourceHeight - cropHeight);
      var scene = document.createElement("canvas");
      scene.width = 720;
      scene.height = 576;
      var context = scene.getContext("2d");
      if (!context) return { src: "", markers: anchors };

      context.fillStyle = "#79aaa3";
      context.fillRect(0, 0, scene.width, scene.height);
      var scale = Math.min(scene.width / cropWidth, scene.height / cropHeight);
      var drawWidth = cropWidth * scale;
      var drawHeight = cropHeight * scale;
      var offsetX = (scene.width - drawWidth) / 2;
      var offsetY = (scene.height - drawHeight) / 2;
      context.drawImage(
        tank,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
      );

      var markers = focuses.map(function mapFocus(focus) {
        return {
          x: clampEventValue(
            (offsetX + (focus.x * sourceWidth - cropX) * scale) / scene.width,
            0.08,
            0.92
          ),
          y: clampEventValue(
            (offsetY + (focus.y * sourceHeight - cropY) * scale) / scene.height,
            0.12,
            0.88
          ),
          width: clampEventValue(focus.width * sourceWidth * scale / scene.width * 1.22, 0.09, 0.42),
          height: clampEventValue(focus.height * sourceHeight * scale / scene.height * 1.3, 0.11, 0.48)
        };
      });
      return { src: scene.toDataURL("image/jpeg", 0.88), markers: markers };
    } catch (error) {
      console.warn("Event scene unavailable", error);
      return { src: "", markers: focuses };
    }
  }

  function renderEventFocus(participants, markers) {
    var layer = byId("eventModalFocus");
    clearNode(layer);
    if (!layer) return;
    participants.forEach(function renderMarker(participant, index) {
      if (!participant || !participant.name) return;
      var anchor = markers[index] || { x: index === 0 ? 0.42 : 0.58, y: 0.5 };
      var marker = makeElement("span", "event-focus-marker");
      var label = makeElement("span", "event-focus-label", participant.name);
      marker.style.left = (anchor.x * 100).toFixed(2) + "%";
      marker.style.top = (anchor.y * 100).toFixed(2) + "%";
      marker.style.width = ((anchor.width || 0.13) * 100).toFixed(2) + "%";
      marker.style.height = ((anchor.height || 0.14) * 100).toFixed(2) + "%";
      if (index % 2 === 1 || anchor.y - (anchor.height || 0.14) / 2 < 0.18) {
        marker.classList.add("is-below");
      }
      marker.appendChild(label);
      layer.appendChild(marker);
    });
  }

  function syncOfflineEventPausedFish(viewModel) {
    var pausedIds = [];
    if (state.activeEvent && state.activeEvent.source !== "online") {
      pausedIds = eventFishParticipantIds(state.activeEvent);
    }
    var bridge = global.MemoryAquariumCanvas;
    if (bridge && typeof bridge.setEventPausedFishIds === "function") {
      bridge.setEventPausedFishIds(Array.from(new Set(pausedIds)));
    }
  }

  function bubbleTextForEvent(eventData) {
    var eventType = String((eventData && eventData.eventType) || "");
    if (eventType.indexOf("misunderstood") >= 0) return "？！";
    if (eventType.indexOf("shelter") >= 0) return "～";
    if (eventType.indexOf("environment") >= 0) return "！？";
    if (eventType.indexOf("deep-companionship") >= 0) return "⋯ ♡";
    if (eventType.indexOf("fish-object-friendship") >= 0) return "⋯ ♡";
    if (eventType.indexOf("fish-fish-shared") >= 0) return "？♪";
    if (eventType.indexOf("object-object-memory") >= 0) return "……？";
    if (eventType.indexOf("play") >= 0) return "！！";
    return "？…";
  }

  function liveBubbleFromStory(story) {
    var participantIds = eventParticipantIds(story);
    var bridge = global.MemoryAquariumCanvas;
    var anchor = bridge && typeof bridge.getEventAnchor === "function"
      ? bridge.getEventAnchor(participantIds)
      : story.anchor;
    return {
      id: story.id,
      source: "online",
      eventType: story.eventType,
      title: story.title,
      participantA: story.participantA,
      participantB: story.participantB,
      anchor: anchor || { x: 0.5, y: 0.35 },
      event: story
    };
  }

  function upsertLiveEventBubble(story) {
    if (!story || !story.id || story.source !== "online") return;
    var nextBubble = liveBubbleFromStory(story);
    state.liveEventBubbles = state.liveEventBubbles
      .filter(function keepOtherBubble(bubble) { return bubble.id !== story.id; })
      .concat(nextBubble)
      .slice(-1);
  }

  function bubbleAnchorAssignment(bubble, usageByFishId) {
    var eventData = bubble.event || bubble;
    var fishIds = eventFishParticipantIds(eventData);
    if (bubble.source === "online" || !fishIds.length) {
      return {
        fishId: "",
        participantIds: eventParticipantIds(eventData),
        slot: 0
      };
    }
    var fishId = fishIds.reduce(function leastUsedFish(currentId, candidateId) {
      return (usageByFishId[candidateId] || 0) < (usageByFishId[currentId] || 0)
        ? candidateId
        : currentId;
    }, fishIds[0]);
    var slot = usageByFishId[fishId] || 0;
    usageByFishId[fishId] = slot + 1;
    return { fishId: fishId, participantIds: [fishId], slot: slot };
  }

  function bubblePosition(bubble, index, assignment) {
    var tank = byId("tank");
    var layer = byId("offlineBubbleLayer");
    if (!tank || !layer) {
      return { left: "50%", top: (24 + index * 58) + "px", tail: "0px" };
    }
    var rect = tank.getBoundingClientRect();
    var participantIds = assignment.participantIds;
    var bridge = global.MemoryAquariumCanvas;
    var anchor = bridge && typeof bridge.getEventAnchor === "function"
      ? bridge.getEventAnchor(participantIds)
      : bubble.anchor || {};
    var x = Math.max(0.08, Math.min(0.92, Number(anchor.x) || (0.25 + index * 0.25)));
    var y = Math.max(0.16, Math.min(0.84, Number(anchor.y) || (0.28 + index * 0.17)));
    var focus = assignment.fishId && bridge && typeof bridge.getEventFocus === "function"
      ? bridge.getEventFocus([assignment.fishId])[0]
      : null;
    var fishHalfHeight = focus
      ? rect.height * clampEventValue(Number(focus.height) || 0.08, 0.08, 0.42) / 2
      : 0;
    var bubbleClearance = assignment.fishId
      ? fishHalfHeight + Math.max(10, rect.height * 0.015)
      : 0;
    var slotOffsets = [
      { x: 0, y: 0, tail: 0 },
      { x: -26, y: -8, tail: 20 },
      { x: 26, y: -8, tail: -20 },
      { x: 0, y: -48, tail: 0 }
    ];
    var offset = assignment.fishId
      ? slotOffsets[Math.min(assignment.slot, slotOffsets.length - 1)]
      : { x: 0, y: index * 8, tail: 0 };
    var layerRect = layer.getBoundingClientRect();
    var left = rect.left - layerRect.left + rect.width * x + offset.x;
    var top = rect.top - layerRect.top + rect.height * y - bubbleClearance + offset.y;
    return { left: left + "px", top: top + "px", tail: offset.tail + "px" };
  }

  function renderOfflineBubbles(viewModel) {
    var layer = byId("offlineBubbleLayer");
    if (!layer) return;
    if (state.catchMode) {
      clearNode(layer);
      return;
    }
    if (layer.classList.contains("is-hidden")) return;
    clearNode(layer);
    var liveIds = state.liveEventBubbles.map(function bubbleId(bubble) { return bubble.id; });
    var offlineBubbles = (viewModel.offlineEventBubbles || []).filter(function notLive(bubble) {
      return liveIds.indexOf(bubble.id) < 0;
    });
    var bubbles = state.liveEventBubbles.concat(offlineBubbles).slice(0, 4);
    var usageByFishId = Object.create(null);
    bubbles.forEach(function renderBubble(bubble, index) {
      var isOnline = bubble.source === "online";
      var assignment = bubbleAnchorAssignment(bubble, usageByFishId);
      var button = makeElement(
        "button",
        "offline-event-bubble",
        bubbleTextForEvent(bubble)
      );
      var position = bubblePosition(bubble, index, assignment);
      button.type = "button";
      button.style.left = position.left;
      button.style.top = position.top;
      button.style.setProperty("--bubble-tail-offset", position.tail);
      if (assignment.fishId) button.dataset.anchorFishId = assignment.fishId;
      button.setAttribute(
        "aria-label",
        "打开" + (isOnline ? "随机" : "关系") + "事件：" + (bubble.title || bubble.label || "")
      );
      button.addEventListener("click", function openBubble(event) {
        event.preventDefault();
        event.stopPropagation();
        handleEventBubble(bubble);
      });
      layer.appendChild(button);
    });
  }

  function renderCutoutStatus(viewModel) {
    var cutout = viewModel.cutout || {};
    if (cutout.message) {
      setText("captureStatus", cutout.message);
      setText("sheetStatus", cutout.message);
    }
    if (cutout.sourcePreviewUrl) {
      var sourcePreview = byId("sourcePreview");
      if (sourcePreview) sourcePreview.src = cutout.sourcePreviewUrl;
    }
    if (cutout.resultPreviewUrl) drawCutoutPreview(cutout.resultPreviewUrl);
  }

  function drawCutoutPreview(source) {
    var canvas = byId("cutoutResult");
    if (!canvas || !source) return;
    var image = new Image();
    image.onload = function drawPreview() {
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;
      var context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
    };
    image.src = source;
  }

  function renderViewModel(viewModel) {
    if (!viewModel) return;
    state.viewModel = viewModel;
    renderResources(viewModel);
    renderFishStatus(viewModel);
    renderShop(viewModel);
    if (
      global.MemoryAquariumCanvas
      && typeof global.MemoryAquariumCanvas.setShopView === "function"
    ) {
      global.MemoryAquariumCanvas.setShopView(viewModel.shop);
    }
    renderCutoutStatus(viewModel);
    syncOfflineEventPausedFish(viewModel);
    renderOfflineBubbles(viewModel);
    syncHomeDockVisibility();
  }

  function renderEventCard(eventData) {
    if (!eventData) return;
    state.activeEvent = eventData;
    syncOfflineEventPausedFish(state.viewModel);
    var participantA = eventData.participantA || {};
    var participantB = eventData.participantB || {};
    var eventParticipants = [participantA, participantB];
    var image = byId("eventModalImage");
    var bridge = global.MemoryAquariumCanvas;
    var scene = captureEventScene(eventParticipants, bridge);
    if (image) {
      if (scene.src) image.src = scene.src;
      else image.removeAttribute("src");
      image.alt = [participantA.name, participantB.name].filter(Boolean).join("与")
        || "事件发生时的鱼缸画面";
    }
    renderEventFocus(eventParticipants, scene.markers);
    setText(
      "eventModalStatus",
      eventData.status === "pending"
        ? "AI 正在记录这段故事…"
        : eventData.status === "fallback"
          ? "网络故事暂时没有回来 · 已使用本地记录"
          : "AI 记忆故事"
    );
    var participants = byId("eventModalParticipants");
    clearNode(participants);
    if (participants) {
      [participantA, participantB].filter(function namedParticipant(participant) {
        return participant && participant.name;
      }).forEach(function renderParticipant(participant) {
        participants.appendChild(makeElement("span", "event-participant-chip", participant.name));
      });
      if (eventData.relationshipStage) {
        participants.appendChild(makeElement(
          "span",
          "event-participant-chip",
          "关系 · " + eventData.relationshipStage
        ));
      }
      if (!participants.children.length) {
        participants.appendChild(makeElement("span", "event-participant-chip", "鱼缸里的邻居"));
      }
    }
    setText("offlineEventTitle", eventData.title || "鱼缸里发生了一件小事");
    setText("offlineEventBody", eventData.body || eventData.immediateText || "");
    renderEventChoices(eventData);
    setText("eventModalPosterLine", eventData.posterLine || "水光替它们记住了这一刻。");
  }

  function renderEventChoices(eventData) {
    var choiceSection = byId("eventChoiceSection");
    var outcomeSection = byId("eventOutcomeSection");
    var choiceButtons = byId("eventChoiceButtons");
    var choices = Array.isArray(eventData && eventData.choices) ? eventData.choices : [];
    var selectedChoice = eventData && eventData.selectedChoice;
    clearNode(choiceButtons);
    if (selectedChoice) {
      setHidden(choiceSection, true);
      setHidden(outcomeSection, false);
      setText(
        "eventOutcomeText",
        selectedChoice.outcome || selectedChoice.fallbackOutcome || "这段故事有了新的结局。"
      );
      var rewards = [];
      var algaeCoins = Number(
        selectedChoice.appliedAlgaeCoins == null
          ? selectedChoice.algaeCoins
          : selectedChoice.appliedAlgaeCoins
      ) || 0;
      var intimacy = Number(
        selectedChoice.appliedIntimacy == null
          ? selectedChoice.intimacy
          : selectedChoice.appliedIntimacy
      ) || 0;
      if (algaeCoins) rewards.push("藻币 +" + algaeCoins);
      if (intimacy) rewards.push("亲密度 +" + intimacy);
      setText("eventOutcomeReward", rewards.join(" · ") || "这段故事已经被记住");
      return;
    }
    setHidden(outcomeSection, true);
    setHidden(choiceSection, choices.length === 0);
    choices.forEach(function renderChoice(choice) {
      var button = makeElement("button", "event-choice-button", choice.label);
      button.type = "button";
      button.dataset.eventChoiceId = choice.id;
      button.addEventListener("click", function chooseEventOutcome() {
        handleEventChoice(choice.id);
      });
      choiceButtons.appendChild(button);
    });
  }

  async function handleEventChoice(choiceId) {
    if (!state.activeEventId || !choiceId) return;
    var buttons = byId("eventChoiceButtons");
    if (buttons) {
      buttons.querySelectorAll("button").forEach(function disableChoice(button) {
        button.disabled = true;
      });
    }
    var result = await callApi("resolveEventChoice", state.activeEventId, choiceId);
    if (!result || result.ok === false) {
      if (buttons) {
        buttons.querySelectorAll("button").forEach(function enableChoice(button) {
          button.disabled = false;
        });
      }
      return;
    }
    var eventData = (result.data && result.data.event) || result.event || result.data;
    renderEventCard(eventData);
    if (globalThis.SoundManager) globalThis.SoundManager.play("coin");
  }

  async function handleEventBubble(bubble) {
    if (!bubble || !bubble.id) return;
    if (bubble.source === "online") {
      state.activeEventId = bubble.id;
      state.liveEventBubbles = state.liveEventBubbles.filter(function removeOpened(item) {
        return item.id !== bubble.id;
      });
      renderEventCard(bubble.event || bubble);
      openOnlySheet("offlineEventSheet");
      return;
    }
    state.activeEventId = bubble.id;
    state.activeEvent = bubble;
    syncOfflineEventPausedFish(state.viewModel);
    var result = await callApi("openOfflineEvent", bubble.id);
    if (!result || result.ok === false) {
      state.activeEventId = "";
      state.activeEvent = null;
      syncOfflineEventPausedFish(state.viewModel);
      return;
    }
    renderEventCard((result.data && result.data.event) || result.event || result.data);
    openOnlySheet("offlineEventSheet");
  }

  function handleOfflineEventBubble(eventId) {
    var bubbles = (state.viewModel && state.viewModel.offlineEventBubbles) || [];
    var bubble = bubbles.find(function findBubble(item) { return item.id === eventId; });
    return handleEventBubble(bubble || { id: eventId, source: "offline" });
  }

  async function handleForwardEvent() {
    if (!state.activeEventId) return;
    var result = await callApi("createEventPoster", state.activeEventId);
    if (!result || result.ok === false) return;
    renderPoster((result.data && (result.data.poster || result.data)) || result.poster);
    state.activeEventId = "";
    state.activeEvent = null;
    syncOfflineEventPausedFish(state.viewModel);
    openOnlySheet("posterSheet");
  }

  async function handleSavePoster() {
    var result = await callApi("savePoster");
    if (!result || result.ok === false) return;
    var data = result.data || {};
    setText(
      "posterStatus",
      data.message || result.message || "海报已准备好，请在预览图上长按保存。"
    );
  }

  function renderPoster(poster) {
    var preview = byId("posterPreview");
    var source = poster && (poster.previewUrl || poster.imageUrl || poster.url || poster.dataUrl);
    if (preview && source) preview.src = source;
    setText("posterStatus", poster && poster.statusText ? poster.statusText : "海报已生成");
  }

  async function handleFeedButton() {
    var fish = selectedFish(state.viewModel);
    if (fish) await callApi("feedFish", fish.id);
  }

  async function handleAddButton() {
    var result = await callApi("openAddFlow");
    if (result && result.ok !== false) openOnlySheet("addSheet");
  }

  async function handleShopOpen() {
    var result = await callApi("getViewModel");
    if (result && result.ok !== false) {
      renderViewModel(result.viewModel || result);
      openOnlySheet("shopSheet");
    }
  }

  async function handleGenerateButton() {
    var subjectType = byId("subjectType") ? byId("subjectType").value : "";
    var objectName = byId("objectName") ? byId("objectName").value.trim() : "";
    var description = byId("subjectDescription")
      ? byId("subjectDescription").value.trim()
      : "";
    if (!description) {
      description = objectName || {
        person: "图片中的人物",
        animal: "图片中的动物",
        plant: "图片中的植物",
        other: "图片中的主体"
      }[subjectType] || "";
    }
    var result = await callApi("generateCutout", {
      description: description,
      subjectType: subjectType,
      objectName: objectName
    });
    if (result && result.ok !== false) {
      document.querySelectorAll("[data-cutout-view]").forEach(function showResult(view) {
        view.classList.toggle("is-hidden", view.getAttribute("data-cutout-view") !== "result");
      });
      setHidden("processingState", true);
      setHidden("resultContent", false);
      var confirmButton = byId("confirmAddButton");
      if (confirmButton) confirmButton.disabled = false;
      if (result.viewModel) renderViewModel(result.viewModel);
    }
  }

  async function handleConfirmAdd() {
    var result = await callApi("confirmAddObject", {
      name: byId("objectName") ? byId("objectName").value.trim() : "",
      placement: state.selectedPlacement,
      capturedAt: byId("capturedAtInput") ? byId("capturedAtInput").value : "",
      capturedPlace: byId("capturedPlaceInput") ? byId("capturedPlaceInput").value.trim() : ""
    });
    if (result && result.ok !== false) closeSheet("addSheet");
  }

  async function handleViewing(enabled) {
    var result = await callApi("setViewing", Boolean(enabled));
    if (!result || result.ok === false) return;
    setHidden(document.querySelector(".topbar"), false);
    syncHomeDockVisibility();
  }

  function handlePlacementChoice(button) {
    state.selectedPlacement = button.getAttribute("data-new-state") || "bottom";
    document.querySelectorAll("[data-new-state]").forEach(function updateChoice(item) {
      item.classList.toggle("is-selected", item === button);
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
  }

  function renderMaturityFishPreview(fish) {
    var canvas = byId("maturityFishImage");
    if (!canvas || !fish) return;
    var isAtlas = (fish.assetKind || "atlas-fish") === "atlas-fish";
    var image = new Image();
    image.onload = function drawMaturityFish() {
      var context = canvas.getContext("2d");
      var sprite = Math.max(0, Math.min(3, Math.floor(Number(fish.sprite) || 0)));
      var sourceWidth = isAtlas ? image.naturalWidth / 2 : image.naturalWidth;
      var sourceHeight = isAtlas ? image.naturalHeight / 2 : image.naturalHeight;
      var sourceX = isAtlas ? (sprite % 2) * sourceWidth : 0;
      var sourceY = isAtlas ? (sprite < 2 ? 0 : sourceHeight) : 0;
      var padding = 12;
      var scale = Math.min(
        (canvas.width - padding * 2) / sourceWidth,
        (canvas.height - padding * 2) / sourceHeight
      );
      var drawWidth = sourceWidth * scale;
      var drawHeight = sourceHeight * scale;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    };
    canvas.setAttribute("aria-label", (fish.name || "这条鱼") + "的图片");
    image.src = isAtlas
      ? fish.atlas === "default"
        ? "/game/assets/default-fish-atlas.png"
        : "/game/assets/fish-atlas.png"
      : fish.iconUrl || "/game/assets/preset-fish/betta.png";
  }

  async function handleMaturityChoiceOpen() {
    var fish = selectedFish(state.viewModel);
    if (!fish) return;
    state.activeMaturityFishId = fish.id;
    setText("maturityFishName", fish.name || "这条鱼");
    renderMaturityFishPreview(fish);
    openOnlySheet("maturityChoiceSheet");
  }

  async function handleMaturityChoice(choice) {
    if (!state.activeMaturityFishId) return;
    var result = await callApi("chooseMaturity", state.activeMaturityFishId, choice);
    if (result && result.ok !== false) closeSheet("maturityChoiceSheet");
  }

  async function handleStartJourney() {
    var fish = selectedFish(state.viewModel);
    if (!fish) return;
    await callApi("startJourney", fish.id);
  }

  function interceptClick(id, handler) {
    var node = byId(id);
    if (!node) return;
    node.addEventListener("click", function capturedClick(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handler(event, node);
    }, true);
  }

  function interceptChange(id, handler) {
    var node = byId(id);
    if (!node) return;
    node.addEventListener("change", function capturedChange(event) {
      event.stopPropagation();
      event.stopImmediatePropagation();
      handler(event, node);
    }, true);
  }

  function bindStaticButtons() {
    var directTutorialUi = Boolean(byId("tutorialLayer"));
    if (!directTutorialUi) {
      interceptClick("feedButton", handleFeedButton);
      interceptClick("addButton", handleAddButton);
      interceptClick("shopButton", handleShopOpen);
    }
    if (!directTutorialUi) {
      interceptClick("shopCloseButton", function closeShop() { closeSheet("shopSheet"); });
    }
    interceptClick("shopCapacityButton", function upgrade() { callApi("upgradeCapacity"); });
    interceptClick("backgroundButton", function background() { callApi("toggleBackground"); });
    interceptClick("soundButton", function sound() { callApi("toggleSound"); });
    interceptClick("viewButton", function view() { handleViewing(true); });
    interceptClick("exitViewButton", function exitView() { handleViewing(false); });
    interceptClick("posterButton", async function poster() {
      var result = await callApi("createPoster");
      if (result && result.ok !== false) {
        renderPoster((result.data && (result.data.poster || result.data)) || result.poster);
        openOnlySheet("posterSheet");
      }
    });
    if (!directTutorialUi) {
      interceptClick("imagePicker", function imagePicker() {
        var fileInput = byId("fileInput");
        if (fileInput) fileInput.click();
      });
      interceptClick("generateCutoutButton", handleGenerateButton);
      interceptClick("backToCaptureButton", function backToCapture() {
        document.querySelectorAll("[data-cutout-view]").forEach(function showCapture(view) {
          view.classList.toggle("is-hidden", view.getAttribute("data-cutout-view") !== "capture");
        });
      });
      interceptClick("cancelCutoutButton", function cancelCutout() { callApi("cancelCutout"); });
      interceptClick("confirmAddButton", handleConfirmAdd);
    }
    interceptClick("maturityChoiceButton", handleMaturityChoiceOpen);
    interceptClick("stayFishButton", function stay() { handleMaturityChoice("stay"); });
    interceptClick("sendJourneyButton", function journey() { handleMaturityChoice("journey"); });
    interceptClick("maturityLaterButton", function later() { closeSheet("maturityChoiceSheet"); });
    interceptClick("startJourneyButton", handleStartJourney);
    interceptClick("forwardEventButton", handleForwardEvent);
    interceptClick("eventBackButton", function eventBack() { closeSheet("offlineEventSheet"); });
    interceptClick("posterSaveButton", handleSavePoster);
    interceptClick("posterCloseButton", function closePoster() { closeSheet("posterSheet"); });
    if (!directTutorialUi) {
      interceptClick("finishFishEditButton", function finishFish() { setHidden("fishEditor", true); });
      interceptClick("finishEditButton", function finishObject() { setHidden("objectEditor", true); });
      interceptClick("finishDecorEditButton", function finishDecor() { setHidden("decorEditor", true); });
    }

    document.querySelectorAll("[data-close-sheet]").forEach(function bindAddClose(button) {
      button.addEventListener("click", function closeAddSheet(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeSheet("addSheet");
      }, true);
    });

    if (!directTutorialUi) {
      document.querySelectorAll("[data-new-state]").forEach(function bindPlacement(button) {
        button.addEventListener("click", function choosePlacement(event) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          handlePlacementChoice(button);
        }, true);
      });
    }
    document.querySelectorAll("[data-state]").forEach(function bindObjectState(button) {
      button.addEventListener("click", function setState(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        var id = selectedObjectId();
        if (id) callApi("setObjectState", id, button.getAttribute("data-state"));
      }, true);
    });

    document.querySelectorAll("[data-shop-tab]").forEach(function bindShopTab(button) {
      button.addEventListener("click", function selectTab(event) {
        event.preventDefault();
        var tab = button.getAttribute("data-shop-tab");
        document.querySelectorAll("[data-shop-tab]").forEach(function updateTab(item) {
          item.classList.toggle("is-active", item === button);
          item.setAttribute("aria-selected", item === button ? "true" : "false");
        });
        ["decor", "fish", "capacity"].forEach(function updatePanel(name) {
          setHidden("shop" + name.charAt(0).toUpperCase() + name.slice(1) + "Panel", name !== tab);
        });
      });
    });

    document.querySelectorAll(".ui-sheet").forEach(function bindBackdrop(sheet) {
      sheet.addEventListener("click", function backdropClick(event) {
        if (event.target === sheet && sheet.id !== "offlineEventSheet") closeSheet(sheet.id);
      });
    });
    document.querySelectorAll("[data-ui-close]").forEach(function bindUIClose(button) {
      button.addEventListener("click", function closeUISheet(event) {
        event.preventDefault();
        closeSheet(button.getAttribute("data-ui-close"));
      });
    });
  }

  function bindInputs() {
    var photoInput = byId("fileInput");
    if (photoInput && !byId("tutorialLayer")) {
      photoInput.addEventListener("change", async function selectImage(event) {
        event.stopImmediatePropagation();
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = URL.createObjectURL(file);
        var preview = byId("imagePreview");
        if (preview) {
          preview.src = state.previewUrl;
          preview.classList.remove("is-hidden");
        }
        var emptyState = byId("pickerEmpty");
        if (emptyState) emptyState.classList.add("is-hidden");
        var replaceHint = byId("replaceImageHint");
        if (replaceHint) replaceHint.classList.remove("is-hidden");
        var result = await callApi("selectInputImage", file);
        var generateButton = byId("generateCutoutButton");
        if (generateButton && result && result.ok !== false) generateButton.disabled = false;
      }, true);
    }

    interceptChange("scaleRange", function objectScale(event, node) {
      var proxy = byId("objectScaleRange");
      if (proxy) proxy.value = node.value;
      var id = selectedObjectId();
      if (id) callApi("setObjectScale", id, Number(node.value));
    });
    interceptChange("objectScaleRange", function objectScaleProxy(event, node) {
      var visible = byId("scaleRange");
      if (visible) visible.value = node.value;
      var id = selectedObjectId();
      if (id) callApi("setObjectScale", id, Number(node.value));
    });
    interceptChange("fishScaleRange", function fishScale(event, node) {
      var fish = selectedFish(state.viewModel);
      if (fish) callApi("setFishScale", fish.id, Number(node.value));
    });
    interceptChange("decorScaleRange", function decorScale(event, node) {
      var id = selectedDecorId();
      if (id) callApi("setDecorScale", id, Number(node.value));
    });

    global.addEventListener("resize", function repositionBubbles() {
      global.requestAnimationFrame(function rerenderBubbles() {
        renderOfflineBubbles(state.viewModel || {});
      });
    });
  }

  function handleCoreEvent(event) {
    var detail = event.detail || event.payload || event || {};
    var nextViewModel = event.viewModel || detail.viewModel;
    var storyText = detail.text || detail.body || "";
    var latestStory = nextViewModel && nextViewModel.latestStory;
    if (event.type === "state:changed" && nextViewModel) renderViewModel(nextViewModel);
    if (event.type === "story:immediate" || event.type === "story:resolved") {
      if (latestStory && latestStory.source === "online") {
        if (state.activeEventId === latestStory.id) {
          renderEventCard(latestStory);
        } else {
          upsertLiveEventBubble(latestStory);
          renderOfflineBubbles(nextViewModel || state.viewModel || {});
        }
      } else if (storyText) {
        showStory(storyText);
      }
    }
    if (event.type === "offline:settled") {
      if (detail.feedEarned != null) showNotice("离线归来 · 饲料 +" + detail.feedEarned, 3200);
      if (detail.feedEarned != null && globalThis.SoundManager) {
        globalThis.SoundManager.play("coin");
      }
      if (nextViewModel) renderViewModel(nextViewModel);
    }
    if (event.type === "maturity:resolved" && nextViewModel) renderViewModel(nextViewModel);
    if (event.type === "journey:started") showStory(detail.text || "它游向了更远的地方。");
    if (event.type === "poster:ready") {
      renderPoster(detail.poster || detail);
      openOnlySheet("posterSheet");
    }
    if (event.type === "core:error") showNotice(detail.message || "系统暂时没有回应");
  }

  function bindCoreEvents() {
    [
      "state:changed",
      "story:immediate",
      "story:resolved",
      "offline:settled",
      "maturity:resolved",
      "journey:started",
      "poster:ready",
      "core:error"
    ].forEach(function bindEvent(name) {
      global.addEventListener(name, handleCoreEvent);
    });
  }

  function handleModeChange(event) {
    var detail = (event && event.detail) || {};
    state.catchMode = detail.mode === "catch";
    if (state.catchMode) {
      clearNode(byId("offlineBubbleLayer"));
      setHidden("storyCard", true);
      global.clearTimeout(state.storyTimer);
      syncOfflineEventPausedFish(null);
      syncHomeDockVisibility();
      return;
    }
    renderOfflineBubbles(state.viewModel || {});
    syncHomeDockVisibility();
  }

  async function mount() {
    if (state.mounted) return;
    state.mounted = true;
    if (!api) {
      showNotice("AquariumAPI 尚未加载");
      return;
    }
    bindStaticButtons();
    bindInputs();
    bindCoreEvents();
    global.addEventListener("aquarium:modechange", handleModeChange);
    if (typeof api.subscribe === "function") api.subscribe(handleCoreEvent);
    var initial = await callApi("init");
    if (initial && initial.viewModel) {
      renderViewModel(initial.viewModel);
    } else {
      var result = await callApi("getViewModel");
      renderViewModel((result && result.viewModel) || result);
    }
  }

  global.MemoryAquariumUI = {
    mount: mount,
    renderViewModel: renderViewModel,
    handleFeedButton: handleFeedButton,
    handleAddButton: handleAddButton,
    handleGenerateButton: handleGenerateButton,
    handleConfirmAdd: handleConfirmAdd,
    handleOfflineEventBubble: handleOfflineEventBubble,
    handleForwardEvent: handleForwardEvent
  };
})(window);
