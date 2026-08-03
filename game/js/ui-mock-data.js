(function installAquariumUIMock(global) {
  "use strict";

  const fishIcon = "data:image/svg+xml;charset=utf-8,"
    + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="28" fill="#dcecdf"/><path d="M19 50c12-19 36-23 53-8l13-9-2 17 2 17-13-9c-17 15-41 11-53-8Z" fill="#70a795"/><circle cx="60" cy="46" r="3" fill="#f6f1d7"/></svg>');
  const objectIcon = "data:image/svg+xml;charset=utf-8,"
    + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="28" fill="#e7edda"/><path d="M31 30h34l8 38H23l8-38Z" fill="#91aa80"/><path d="M36 30c0-8 5-13 12-13s12 5 12 13" fill="none" stroke="#6b8972" stroke-width="6" stroke-linecap="round"/></svg>');
  const posterPreview = "data:image/svg+xml;charset=utf-8,"
    + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1440"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#edf3df"/><stop offset=".25" stop-color="#86c9b4"/><stop offset="1" stop-color="#176d73"/></linearGradient></defs><rect width="1080" height="1440" fill="#f2efe0"/><rect x="70" y="180" width="940" height="850" rx="42" fill="url(#w)"/><ellipse cx="410" cy="600" rx="130" ry="56" fill="#e9d18e"/><path d="M280 600 170 520l22 80-22 80 110-80Z" fill="#e9d18e"/><text x="70" y="105" fill="#315e55" font-size="42" font-family="sans-serif">忍不住化身一条固执的鱼</text><text x="70" y="1120" fill="#315e55" font-size="56" font-family="sans-serif">水里发生了一件很小的事</text><text x="70" y="1200" fill="#657e70" font-size="30" font-family="sans-serif">有些陪伴，安静得像一束水光。</text></svg>');

  function mockEventChoices() {
    return [
      {
        id: "stay-quiet",
        label: "陪它们再安静一会儿",
        algaeCoins: 8,
        intimacy: 5,
        fallbackOutcome: "没有新的动作发生，但这段安静被水光好好地留了下来。"
      },
      {
        id: "look-around",
        label: "让它们去别处看看",
        algaeCoins: 5,
        intimacy: 3,
        fallbackOutcome: "它们慢慢游开，又在另一束水光里碰了面。"
      }
    ];
  }

  const events = {
    "offline-event-1": {
      id: "offline-event-1",
      participantA: { id: "fish-1", type: "fish", name: "月白", iconUrl: fishIcon },
      participantB: { id: "memory-1", type: "object", name: "旧车票", iconUrl: objectIcon },
      title: "一小块屋檐",
      body: "旧车票落进水里后，月白把它当成了一小块屋檐，在下面安静地停了很久。",
      posterLine: "有些走过的路，会在水里变成屋檐。",
      choices: mockEventChoices(),
      occurredAt: Date.now() - 2_400_000
    },
    "offline-event-2": {
      id: "offline-event-2",
      participantA: { id: "fish-2", type: "fish", name: "青团", iconUrl: fishIcon },
      participantB: { id: "fish-3", type: "fish", name: "珊瑚", iconUrl: fishIcon },
      title: "同一束水光",
      body: "青团和珊瑚在石头两边绕了几圈，最后不约而同地停在了同一束水光里。",
      posterLine: "它们没有约好，只是刚好看见了同一片亮处。",
      choices: mockEventChoices(),
      occurredAt: Date.now() - 1_800_000
    },
    "offline-event-3": {
      id: "offline-event-3",
      participantA: { id: "memory-1", type: "object", name: "旧车票", iconUrl: objectIcon },
      participantB: { id: "memory-2", type: "object", name: "小木马", iconUrl: objectIcon },
      title: "沉在水里的站台",
      body: "旧车票靠近小木马以后，鱼缸底部像多了一座不会催人出发的小站台。",
      posterLine: "留下来的东西，也会替远方守一会儿灯。",
      choices: mockEventChoices(),
      occurredAt: Date.now() - 1_200_000
    }
  };

  const viewModel = {
    ready: true,
    feed: 20,
    capacity: { used: 1, limit: 3, nextLimit: 5, upgradeCost: 60 },
    selected: { fishId: "fish-1", objectId: "memory-1", decorId: "plant-1" },
    fishCards: [
      {
        id: "fish-1",
        name: "月白",
        growth: 75,
        eventCount: 1,
        mature: false,
        maturityChoice: null,
        canStartJourney: false
      },
      {
        id: "fish-2",
        name: "青团",
        growth: 100,
        eventCount: 2,
        mature: true,
        maturityChoice: null,
        canStartJourney: false
      }
    ],
    latestStory: {
      id: "story-1",
      title: "一小块屋檐",
      body: "旧车票落进水里后，小鱼把它当成了屋顶。",
      posterLine: "有些走过的路，会在水里变成屋檐。",
      status: "generated"
    },
    offlineEventBubbles: [
      { ...events["offline-event-1"], anchor: { x: 0.52, y: 0.38 }, read: false },
      { ...events["offline-event-2"], anchor: { x: 0.34, y: 0.5 }, read: false },
      { ...events["offline-event-3"], anchor: { x: 0.72, y: 0.64 }, read: false }
    ],
    shop: {
      decor: [
        { id: "stone-cave", name: "小石洞", price: 25, owned: false, description: "适合胆小的鱼躲一会儿" },
        { id: "soft-grass", name: "柔叶水草", price: 35, owned: true, description: "已拥有，可在默认素材中放入" },
        { id: "tiny-bridge", name: "水下小桥", price: 55, owned: false, description: "让鱼缸多一条安静的小路" }
      ],
      fish: [
        { id: "moon-fish", name: "月光鱼", price: 50, owned: false, description: "游得慢，喜欢停在亮处" },
        { id: "cloud-fish", name: "云尾鱼", price: 90, owned: false, description: "尾鳍很轻，偶尔快速穿过水草" },
        { id: "sunset-fish", name: "晚霞鱼", price: 140, owned: false, description: "颜色鲜亮，活动范围很大" }
      ],
      capacity: {}
    },
    cutout: {
      status: "idle",
      sourcePreviewUrl: "",
      resultPreviewUrl: "",
      message: ""
    }
  };

  const listeners = new Set();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const result = (data = {}) => Promise.resolve({ ok: true, data, viewModel: clone(viewModel) });
  const mockSuccess = () => result({ mock: true });

  function emit(type, payload = {}) {
    const event = { type, payload, viewModel: clone(viewModel) };
    listeners.forEach((listener) => listener(event));
  }

  const mockApi = {
    init: () => result({ mock: true }),
    getViewModel: () => clone(viewModel),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    feedFish: mockSuccess,
    openAddFlow: () => result(),
    selectInputImage: () => result(),
    generateCutout: () => {
      viewModel.cutout = {
        status: "ready",
        sourcePreviewUrl: "",
        resultPreviewUrl: objectIcon,
        message: "测试抠图已准备好，可以确认放入。"
      };
      return result({ mock: true });
    },
    cancelCutout: () => result(),
    confirmAddObject: mockSuccess,
    setViewing: () => result(),
    toggleBackground: () => result(),
    toggleSound: () => result(),
    setObjectState: mockSuccess,
    setObjectScale: mockSuccess,
    removeObject: mockSuccess,
    setFishScale: mockSuccess,
    removeFish: mockSuccess,
    setDecorScale: mockSuccess,
    removeDecor: mockSuccess,
    upgradeCapacity: mockSuccess,
    purchaseUnlock: mockSuccess,
    chooseMaturity: mockSuccess,
    startJourney: mockSuccess,
    openOfflineEvent(eventId) {
      const event = events[eventId];
      if (!event) return Promise.resolve({ ok: false, code: "ENTITY_NOT_FOUND", message: "这段故事刚刚游开了。" });
      viewModel.offlineEventBubbles = viewModel.offlineEventBubbles.filter((item) => item.id !== eventId);
      emit("state:changed", { reason: "offline-event-opened" });
      return result({ event: clone(event) });
    },
    resolveEventChoice(eventId, choiceId) {
      const event = events[eventId];
      const choice = event && event.choices.find((item) => item.id === choiceId);
      if (!event || !choice) {
        return Promise.resolve({ ok: false, code: "EVENT_CHOICE_NOT_FOUND", message: "没有找到这个回应选项。" });
      }
      if (!event.selectedChoice) {
        event.selectedChoice = {
          ...choice,
          outcome: choice.fallbackOutcome,
          appliedAlgaeCoins: choice.algaeCoins,
          appliedIntimacy: choice.intimacy
        };
        viewModel.feed += choice.algaeCoins;
      }
      return result({ event: clone(event), choice: clone(event.selectedChoice) });
    },
    createEventPoster: () => result({ previewUrl: posterPreview }),
    createPoster: () => result({ previewUrl: posterPreview }),
    savePoster: () => result({ saved: false, fallback: "long-press" }),
    saveNow: () => result()
  };

  global.AquariumUIMockData = {
    viewModel,
    events,
    fishIcon,
    objectIcon,
    posterPreview,
    icons: {
      fish: fishIcon,
      object: objectIcon
    }
  };
  if (!global.AquariumAPI) global.AquariumAPI = mockApi;
})(globalThis);
