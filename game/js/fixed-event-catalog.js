(function (root) {
  "use strict";

  const catalog = Array.isArray(root.AquariumStoryTemplateCatalog)
    ? root.AquariumStoryTemplateCatalog
    : [];

  catalog.push(
    {
      id: "fixed-feed-food-race-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["feed"],
      eventType: "fish-fish-shared",
      participants: ["fish", "fish"],
      weight: 10,
      metaphor: "争夺食物",
      promptGuide: "固定喂食事件，不交给 AI 改写。",
      imageHints: ["追逐食物", "抢先吃到"],
      immediatePattern: "食物刚落入水中，{fishName}和{secondFishName}便冲了过去。经过一番争夺，{fishName}抢先吃到了食物。",
      fallbackTitle: "争夺食物",
      fallbackBody: "食物刚落入水中，{fishName}和{secondFishName}便冲了过去。经过一番争夺，{fishName}抢先吃到了食物。",
      fallbackPosterLine: "鱼缸里的默契，偶尔也从一场争抢开始。"
    },
    {
      id: "fixed-offline-bait-thief-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["offline"],
      eventType: "play",
      participants: ["fish", "object"],
      weight: 10,
      metaphor: "盗饵者",
      currencyDeltaMin: -8,
      currencyDeltaMax: -4,
      promptGuide: "固定离线事件，不交给 AI 改写。",
      imageHints: ["悄悄靠近", "带走藻币"],
      immediatePattern: "因为你长时间没有喂食，盗饵者普罗米{fishName}出现了。它为了终生获得金藻粒，偷偷拿走了一些藻币。你的藻币减少了。",
      fallbackTitle: "盗饵者普罗米{fishName}",
      fallbackBody: "因为你长时间没有喂食，盗饵者普罗米{fishName}出现了。它为了终生获得金藻粒，偷偷拿走了一些藻币。你的藻币减少了。",
      fallbackPosterLine: "安静的鱼缸里，也会有意外访客。"
    },
    {
      id: "fixed-offline-hunting-shadow-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["offline"],
      eventType: "fish-object-friendship",
      participants: ["fish", "object"],
      weight: 10,
      metaphor: "萧瑟背影",
      currencyDeltaMin: 6,
      currencyDeltaMax: 10,
      promptGuide: "固定离线事件，不交给 AI 改写。",
      imageHints: ["独自外出", "带回战利品"],
      immediatePattern: "你长时间没有喂食。{fishName}留下一个萧瑟的背影，独自外出打猎。它成功找到了食物，还带回了一些战利品。你的藻币增加了。",
      fallbackTitle: "萧瑟背影",
      fallbackBody: "你长时间没有喂食。{fishName}留下一个萧瑟的背影，独自外出打猎。它成功找到了食物，还带回了一些战利品。你的藻币增加了。",
      fallbackPosterLine: "有些背影离开一会儿，是为了带着收获回来。"
    },
    {
      id: "fixed-fish-fish-argument-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["online", "offline"],
      eventType: "fish-fish-shared",
      participants: ["fish", "fish"],
      weight: 10,
      metaphor: "对鱼谈琴",
      promptGuide: "固定鱼群互动事件，不交给 AI 改写。",
      imageHints: ["面对面", "快速摆尾"],
      immediatePattern: "{fishName}：“咕噜咕噜咕噜！”{secondFishName}：“咕嘟咕嘟咕嘟！”它们不是文盲，只是你听不懂——对鱼谈琴。",
      fallbackTitle: "对鱼谈琴",
      fallbackBody: "{fishName}：“咕噜咕噜咕噜！”{secondFishName}：“咕嘟咕嘟咕嘟！”它们不是文盲，只是你听不懂——对鱼谈琴。",
      fallbackPosterLine: "听不懂没有关系，水波已经替它们记下了。"
    },
    {
      id: "fixed-offline-teary-river-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["offline"],
      eventType: "deep-companionship",
      participants: ["fish", "object"],
      weight: 10,
      metaphor: "泪汪汪汪",
      promptGuide: "固定离线见闻事件，不交给 AI 改写。",
      imageHints: ["讲述见闻", "水面波纹"],
      immediatePattern: "{fishName}说：你不在的时候，我遇到了一个长袍男子。他说着“帝高阳之苗裔兮……”很厉害的样子。",
      fallbackTitle: "泪汪汪汪",
      fallbackBody: "{fishName}说：你不在的时候，我遇到了一个长袍男子。他说着“帝高阳之苗裔兮……”很厉害的样子。",
      fallbackPosterLine: "有些听不懂的话，也会被认真带回家。"
    },
    {
      id: "fixed-online-tank-goddess-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["online"],
      eventType: "play",
      participants: ["fish", "object"],
      weight: 10,
      metaphor: "缸中女神",
      promptGuide: "固定随机问答事件，不交给 AI 改写。",
      imageHints: ["浮出水面", "三颗藻粒"],
      immediatePattern: "一条鱼从水中浮了上来，问道：“你掉的是这颗金藻粒，还是这颗银藻粒，还是这颗铜藻粒……”",
      fallbackTitle: "缸中女神",
      fallbackBody: "一条鱼从水中浮了上来，问道：“你掉的是这颗金藻粒，还是这颗银藻粒，还是这颗铜藻粒……”",
      fallbackPosterLine: "诚实的答案，也许就藏在一圈水波里。"
    },
    {
      id: "fixed-offline-yellow-sponge-starfish-01",
      enabled: true,
      storyMode: "fixed",
      triggers: ["offline"],
      eventType: "deep-companionship",
      participants: ["fish", "object"],
      weight: 10,
      metaphor: "黄色海绵与粉色海星",
      promptGuide: "固定授权离线见闻事件，不交给 AI 改写。",
      imageHints: ["黄色海绵", "粉色海星", "抓水母"],
      immediatePattern: "{fishName}说：你不在的时候，我遇到了一个会说话的黄色海绵和一只粉色海星。他们好像正准备去抓水母。",
      fallbackTitle: "黄色海绵与粉色海星",
      fallbackBody: "{fishName}说：你不在的时候，我遇到了一个会说话的黄色海绵和一只粉色海星。他们好像正准备去抓水母。",
      fallbackPosterLine: "远处的新朋友，也会顺着水波来到故事里。"
    }
  );

  root.AquariumStoryTemplateCatalog = catalog;
})(globalThis);
