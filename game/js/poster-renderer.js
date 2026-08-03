(function (root) {
  "use strict";

  const WIDTH = 1080;
  const HEIGHT = 1440;
  const PARTICIPANT_FALLBACKS = {
    fish: "/game/assets/ui/fish-fallback.svg",
    object: "/game/assets/ui/object-fallback.svg"
  };

  function createCanvas(width, height, factory) {
    const canvas = typeof factory === "function"
      ? factory(width, height)
      : root.document && typeof root.document.createElement === "function"
        ? root.document.createElement("canvas")
        : null;
    if (!canvas) throw new Error("当前环境暂时无法生成海报");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function wrapText(context, text, maxWidth, maxLines) {
    const source = String(text || "");
    const lines = [];
    let line = "";
    for (const character of source) {
      const candidate = line + character;
      const width = context.measureText
        ? context.measureText(candidate).width
        : candidate.length * 30;
      if (line && width > maxWidth) {
        lines.push(line);
        line = character;
        if (lines.length >= maxLines) break;
      } else {
        line = candidate;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.join("").length < source.length && lines.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
    }
    return lines;
  }

  function drawWaterBackground(context) {
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#d9f0ea");
    gradient.addColorStop(0.5, "#9bcac4");
    gradient.addColorStop(1, "#356f75");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.globalAlpha = 0.08;
    for (let index = 0; index < 24; index += 1) {
      context.beginPath();
      context.arc(
        70 + (index * 173) % 980,
        110 + (index * 97) % 1120,
        18 + (index % 4) * 12,
        0,
        Math.PI * 2
      );
      context.fillStyle = "#ffffff";
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawScene(context, sceneCanvas) {
    const x = 72;
    const y = 220;
    const width = 936;
    const height = 670;
    context.save();
    roundedRect(context, x, y, width, height, 36);
    context.clip();
    if (sceneCanvas && typeof context.drawImage === "function") {
      try {
        context.drawImage(sceneCanvas, x, y, width, height);
      } catch (_error) {
        const gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, "#8ccbc8");
        gradient.addColorStop(1, "#285f6d");
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);
      }
    } else {
      const gradient = context.createLinearGradient(0, y, 0, y + height);
      gradient.addColorStop(0, "#8ccbc8");
      gradient.addColorStop(1, "#285f6d");
      context.fillStyle = gradient;
      context.fillRect(x, y, width, height);
    }
    context.restore();
  }

  function drawParticipantBadge(context, participant, image, x, y) {
    context.save();
    context.fillStyle = participant && participant.type === "fish"
      ? "rgba(255, 244, 190, 0.92)"
      : "rgba(229, 247, 241, 0.92)";
    context.beginPath();
    context.arc(x, y, 58, 0, Math.PI * 2);
    context.fill();
    if (image && typeof context.drawImage === "function") {
      context.save();
      context.beginPath();
      context.arc(x, y, 54, 0, Math.PI * 2);
      context.clip();
      const naturalWidth = Number(image.naturalWidth || image.width) || 1;
      const naturalHeight = Number(image.naturalHeight || image.height) || 1;
      const scale = Math.max(108 / naturalWidth, 108 / naturalHeight);
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      context.drawImage(
        image,
        x - drawWidth / 2,
        y - drawHeight / 2,
        drawWidth,
        drawHeight
      );
      context.restore();
    }
    context.strokeStyle = "rgba(26, 69, 74, 0.25)";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = image ? "rgba(20, 63, 70, 0.82)" : "#315e63";
    if (image) context.fillRect(x - 52, y + 27, 104, 27);
    context.fillStyle = image ? "#ffffff" : "#315e63";
    context.font = image ? "600 19px sans-serif" : "600 28px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const name = participant && participant.name ? participant.name : "水下邻居";
    context.fillText(name.slice(0, 5), x, image ? y + 41 : y);
    context.restore();
  }

  function formatDate(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  }

  function findEntity(state, participantId) {
    const fish = (state.fish || []).find((item) => item.id === participantId);
    if (fish) return { ...fish, type: "fish" };
    const object = (state.objects || []).find((item) => item.id === participantId);
    if (object) return { ...object, type: "object" };
    return {
      id: participantId,
      type: "object",
      name: "留在记忆里的邻居",
      missingAsset: true
    };
  }

  function canvasBlob(canvas) {
    if (typeof canvas.toBlob !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), "image/png");
    });
  }

  function posterDataUrl(canvas) {
    if (typeof canvas.toDataURL !== "function") return "";
    try {
      return canvas.toDataURL("image/png");
    } catch (_error) {
      return "";
    }
  }

  function drawPosterLayout(canvas, layout, sceneCanvas, participantImages) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境暂时无法绘制海报");
    drawWaterBackground(context);

    context.fillStyle = "#143f46";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.font = "700 58px sans-serif";
    context.fillText("私人记忆生态缸", 72, 105);
    context.font = "400 30px sans-serif";
    context.fillStyle = "rgba(20, 63, 70, 0.72)";
    context.fillText(layout.date, 74, 158);

    drawScene(context, sceneCanvas);

    context.fillStyle = "rgba(244, 250, 245, 0.94)";
    roundedRect(context, 72, 850, 936, 490, 38);
    context.fill();

    if (layout.participants.length === 2) {
      drawParticipantBadge(
        context,
        layout.participants[0],
        participantImages && participantImages[0],
        145,
        935
      );
      drawParticipantBadge(
        context,
        layout.participants[1],
        participantImages && participantImages[1],
        280,
        935
      );
    }

    const titleX = layout.participants.length === 2 ? 370 : 120;
    context.fillStyle = "#153f46";
    context.font = "700 48px sans-serif";
    context.textAlign = "left";
    context.fillText(layout.title, titleX, 950);

    context.fillStyle = "#315e63";
    context.font = "400 34px sans-serif";
    const bodyLines = wrapText(context, layout.body, 820, 4);
    bodyLines.forEach((line, index) => {
      context.fillText(line, 120, 1045 + index * 52);
    });

    context.fillStyle = "#1d555c";
    context.font = "500 31px sans-serif";
    const posterLines = wrapText(context, layout.posterLine, 820, 2);
    posterLines.forEach((line, index) => {
      context.fillText(line, 120, 1268 + index * 42);
    });
    return canvas;
  }

  function createPosterRenderer(options) {
    const config = options || {};
    const canvasFactory = config.canvasFactory;
    const now = typeof config.now === "function" ? config.now : Date.now;
    let lastPoster = null;

    function defaultLoadImage(source) {
      if (!source) return Promise.reject(new Error("EMPTY_IMAGE_SOURCE"));
      if (
        typeof source === "object"
        && (source.naturalWidth || source.width)
        && (source.naturalHeight || source.height)
      ) {
        return Promise.resolve(source);
      }
      if (!root.Image) return Promise.reject(new Error("IMAGE_UNAVAILABLE"));
      return new Promise((resolve, reject) => {
        const image = new root.Image();
        let objectUrl = "";
        if (
          typeof source === "object"
          && root.URL
          && typeof root.URL.createObjectURL === "function"
        ) {
          try {
            objectUrl = root.URL.createObjectURL(source);
          } catch (_error) {
            objectUrl = "";
          }
        }
        const cleanup = () => {
          if (objectUrl && root.URL && typeof root.URL.revokeObjectURL === "function") {
            root.URL.revokeObjectURL(objectUrl);
          }
        };
        image.addEventListener("load", () => {
          cleanup();
          resolve(image);
        }, { once: true });
        image.addEventListener("error", () => {
          cleanup();
          reject(new Error("IMAGE_LOAD_FAILED"));
        }, { once: true });
        image.src = objectUrl || String(source);
      });
    }

    const loadImage = typeof config.loadImage === "function"
      ? config.loadImage
      : defaultLoadImage;

    async function loadParticipantImage(participant, imageProvider) {
      if (!participant) return null;
      if (typeof imageProvider === "function") {
        try {
          const provided = await imageProvider(participant.id, participant);
          if (provided) return await loadImage(provided);
        } catch (_error) {
          // Continue through persisted and local participant sources.
        }
      }
      const sources = [participant.iconUrl, participant.previewUrl].filter(Boolean);
      if (participant.imageKey && typeof config.loadAsset === "function") {
        try {
          const asset = await config.loadAsset(participant.imageKey);
          if (asset) sources.push(asset);
        } catch (_error) {
          // Continue to the local silhouette.
        }
      }
      sources.push(
        participant.type === "fish"
          ? PARTICIPANT_FALLBACKS.fish
          : PARTICIPANT_FALLBACKS.object
      );
      for (const source of sources) {
        try {
          const image = await loadImage(source);
          if (image) return image;
        } catch (_error) {
          // Try the next local or persisted source.
        }
      }
      return null;
    }

    async function render(layout, sceneCanvas, imageProvider) {
      const canvas = createCanvas(WIDTH, HEIGHT, canvasFactory);
      const participantImages = await Promise.all(
        (layout.participants || []).map(
          (participant) => loadParticipantImage(participant, imageProvider)
        )
      );
      drawPosterLayout(canvas, layout, sceneCanvas, participantImages);
      const blob = await canvasBlob(canvas);
      const previewUrl = posterDataUrl(canvas);
      lastPoster = {
        width: WIDTH,
        height: HEIGHT,
        previewUrl,
        blob,
        canvas,
        layout
      };
      return lastPoster;
    }

    function selectGeneralStory(state) {
      const stories = Array.isArray(state.stories) ? state.stories : [];
      const active = state.activeStoryId
        ? stories.find((story) => story.id === state.activeStoryId)
        : null;
      return active || stories[stories.length - 1] || {
        id: "default-story",
        title: "水很安静",
        body: "鱼群在水光里慢慢游过，一段没有被催促的相遇，就这样安静地留在了今天的生态缸里。",
        posterLine: "让每一段相遇，在水里慢慢长成记忆。",
        occurredAt: now()
      };
    }

    function createPoster(state, sceneCanvas) {
      const story = selectGeneralStory(state);
      return render({
        kind: "aquarium",
        storyId: story.id,
        participantIds: [],
        participants: [],
        title: story.title,
        body: story.body,
        posterLine: story.posterLine,
        date: formatDate(story.occurredAt || now())
      }, sceneCanvas);
    }

    function createEventPoster(eventId, state, sceneCanvas, imageProvider) {
      const event = (state.offlineEvents || []).find((item) => item.id === eventId)
        || (state.stories || []).find((item) => item.id === eventId);
      if (!event) {
        return Promise.reject(Object.assign(new Error("没有找到这段事件故事。"), {
          code: "EVENT_NOT_FOUND"
        }));
      }
      const participants = [
        findEntity(state, event.participantAId),
        findEntity(state, event.participantBId)
      ];
      return render({
        kind: "event",
        eventId: event.id,
        storyId: event.id,
        participantIds: [event.participantAId, event.participantBId],
        participants,
        title: event.title,
        body: event.body,
        posterLine: event.posterLine,
        date: formatDate(event.occurredAt || now())
      }, sceneCanvas, imageProvider);
    }

    async function savePoster() {
      if (!lastPoster) {
        return { ok: false, code: "POSTER_NOT_READY", message: "请先生成一张海报。" };
      }
      if (typeof config.saveImage === "function") {
        try {
          const saved = await config.saveImage(lastPoster);
          if (saved) {
            return {
              ok: true,
              data: {
                saved: true,
                previewUrl: lastPoster.previewUrl,
                message: "海报已经保存到本地。"
              }
            };
          }
        } catch (_error) {
          // Keep the complete preview as the platform-safe fallback.
        }
      }
      return {
        ok: true,
        data: {
          saved: false,
          previewUrl: lastPoster.previewUrl,
          blob: lastPoster.blob,
          message: "当前环境暂时不能直接保存，请在完整预览上长按保存。"
        }
      };
    }

    function getLastPoster() {
      return lastPoster;
    }

    return {
      createPoster,
      createEventPoster,
      savePoster,
      getLastPoster
    };
  }

  root.AquariumPosterRenderer = {
    WIDTH,
    HEIGHT,
    wrapText,
    createPosterRenderer
  };
})(globalThis);
