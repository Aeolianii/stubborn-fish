# 后端同学任务书：玩法函数、Canvas 接入、AI 与发布

日期：2026-07-29

开发时间：黑客松最后 10 小时

配套文档：

- `docs/superpowers/specs/2026-07-29-memory-aquarium-idle-mvp-design.md`
- `docs/roles/2026-07-29-frontend-owner.md`

这里的“后端”指所有不属于页面布局和 CSS 的功能层。由于作品是本地 H5，你同时负责玩法 Core、现有 Canvas 鱼缸接入、平台 AI、本地存档、抠图、海报、测试和最终打包。

## 1. 你的目标

- 第一小时先交付稳定的 `window.AquariumAPI` 空壳和 mock 返回；
- 后续只补充同名函数的真实实现，不要求前端替换按钮代码；
- 实现饲料、容量、亲密度、关系、事件、留下/远游和商店；
- 把现有 Canvas、抠图、本地存档、AI 故事和海报接入 API；
- 保证故事策划可以独立增删改模板，不需要修改后端逻辑文件；
- 最后负责合并、验证、根入口和静态包。

## 2. 文件所有权

只由后端同学修改：

```text
game/js/app.js
game/js/cutout-flow.js
game/js/aquarium-api.js
game/js/aquarium-core.js
game/js/state-store.js
game/js/economy-system.js
game/js/relationship-system.js
game/js/growth-journey.js
game/js/event-director.js
game/js/story-agent.js
game/js/story-template-registry.js
game/js/poster-renderer.js
game/js/object-segmentation.js
game/js/webgl-fish-mesh.js
src/routes/game.ts
test/*
README.md
```

最终联调时允许修改 `game/index.html`，但仅限：

- 增加本地 `<script>`；
- 调整脚本加载顺序；
- 移除开发期 mock；
- 不修改页面结构和 CSS。

不要修改：

```text
game/styles.css
game/js/ui-shell.js
game/js/ui-mock-data.js
game/assets/ui/*
```

故事策划同学独占：

```text
game/js/story-template-catalog.js
```

后端创建这个文件的初始结构后，不再把玩法代码写进该文件。

## 3. 第一小时必须交付的 API 空壳

创建：

```text
game/js/aquarium-api.js
```

暴露：

```javascript
globalThis.AquariumAPI = {
  init,
  getViewModel,
  subscribe,

  feedFish,
  openAddFlow,
  selectInputImage,
  generateCutout,
  cancelCutout,
  confirmAddObject,

  setViewing,
  toggleBackground,
  toggleSound,

  setObjectState,
  setObjectScale,
  removeObject,
  setFishScale,
  removeFish,
  setDecorScale,
  removeDecor,

  upgradeCapacity,
  purchaseUnlock,
  chooseMaturity,
  startJourney,

  openOfflineEvent,
  createEventPoster,
  createPoster,
  savePoster,
  saveNow
};
```

未完成函数统一返回：

```javascript
Promise.resolve({
  ok: false,
  code: "NOT_READY",
  message: "这个功能还在准备中。"
});
```

前端始终调用上述同名函数。真实功能完成时，只替换 API 内部 handler，不修改 DOM 监听器。

成功与失败结构：

```javascript
{
  ok: true,
  data: {},
  viewModel: core.getViewModel()
}
```

```javascript
{
  ok: false,
  code: "INSUFFICIENT_FEED",
  message: "饲料还不够，再等一小会儿吧。"
}
```

禁止把异常堆栈直接抛给 UI。所有公开异步函数必须 resolve 为稳定结果；严重异常另外发出 `core:error`。

## 4. API 函数契约

### 基础

```javascript
await AquariumAPI.init()
AquariumAPI.getViewModel()
AquariumAPI.subscribe(listener)
```

- `init()` 只初始化一次，重复调用返回当前状态；
- `getViewModel()` 返回只读快照；
- `subscribe()` 返回取消订阅函数；
- 每次状态变化最多发出一次 `state:changed`。

### 投喂

```javascript
await AquariumAPI.feedFish(fishId)
```

- 消耗 4 饲料；
- 目标鱼亲密度 `+5`；
- 亲密度是唯一成长进度；旧字段 `growth` 仅作为兼容别名并始终等于 `affection`；
- 不足两个有效事件时亲密度最多显示 99；
- 返回 `SPAWN_FOOD` Canvas effect；
- 没有明确鱼时由后端选择当前鱼、故事主角或亲密度最低的鱼。

### 放入和抠图

```javascript
await AquariumAPI.openAddFlow()
await AquariumAPI.selectInputImage(file)
await AquariumAPI.generateCutout({
  description,
  subjectType,
  objectName
})
AquariumAPI.cancelCutout()
await AquariumAPI.confirmAddObject({
  name,
  placement,
  capturedAt,
  capturedPlace
})
```

- `openAddFlow()` 检查容量，满时返回 `CAPACITY_FULL`；
- 图片只进入已声明的 AI 抠图流程；
- `confirmAddObject()` 使用最近一次透明结果；
- `placement` 只允许 `fish / bottom / suspended / surface`；
- 现实物品落稳后立即生成本地事件，再异步生成 AI 故事；
- 原始图片不长期保存。

### Canvas 与编辑

```javascript
await AquariumAPI.setViewing(enabled)
await AquariumAPI.toggleBackground()
await AquariumAPI.toggleSound()
await AquariumAPI.setObjectState(objectId, state)
await AquariumAPI.setObjectScale(objectId, scale)
await AquariumAPI.removeObject(objectId)
await AquariumAPI.setFishScale(fishId, scale)
await AquariumAPI.removeFish(fishId)
await AquariumAPI.setDecorScale(decorId, scale)
await AquariumAPI.removeDecor(decorId)
```

后端在 `app.js` 消费 Core effects：

```text
SPAWN_FOOD
FOCUS_FISH_ON_OBJECT
BIND_FISH_TO_OBJECT
BIND_FISH_TO_FISH
REMOVE_FISH_FROM_SCENE
SHOW_STORY
```

关系和事件检查使用低频 tick，不进入每帧全量扫描。

### 商店

```javascript
await AquariumAPI.upgradeCapacity()
await AquariumAPI.purchaseUnlock(kind, unlockId)
```

固定数值：

```javascript
const CAPACITY_LIMITS = [3, 5, 7, 9];
const CAPACITY_COSTS = [60, 120, 220];
```

装饰和鱼的价格只保存在后端 catalog，前端从 ViewModel 读取。

### 成鱼选择

```javascript
await AquariumAPI.chooseMaturity(fishId, "stay")
await AquariumAPI.chooseMaturity(fishId, "journey")
await AquariumAPI.startJourney(fishId)
```

- 亲密度达到 100 且经历两个有效事件后成熟；
- 首次选择发放相同规则的 `30–60` 饲料；
- 奖励只发一次；
- 留下继续占鱼位；
- 远游释放鱼位；
- 留下后可以再远游，但不再次领奖。

### 海报和保存

```javascript
await AquariumAPI.createEventPoster(eventId)
await AquariumAPI.createPoster()
await AquariumAPI.savePoster()
await AquariumAPI.saveNow()
```

- 海报固定 `1080 × 1440`；
- 使用当前故事、最近故事或默认短句；
- `createEventPoster(eventId)` 必须锁定指定离线事件和两个参与者，不能误用最新故事；
- 保存接口不可用时返回预览和长按保存提示；
- `saveNow()` 保存 Core 结构化状态和 Canvas scene。

### 离线关系气泡与事件卡

```javascript
await AquariumAPI.openOfflineEvent(eventId)
await AquariumAPI.createEventPoster(eventId)
```

离线事件结构：

```javascript
{
  id: "offline-event-1",
  source: "offline",
  participantAId: "fish-1",
  participantBId: "memory-1",
  title: "一小块屋檐",
  body: "旧车票落进水里后，月白把它当成了一小块屋檐。",
  posterLine: "有些走过的路，会在水里变成屋檐。",
  status: "generated",
  occurredAt: 1785254400000,
  readAt: null,
  anchor: { x: 0.52, y: 0.38 }
}
```

规则：

- 离线结算最多创建 3 个未读事件；
- 支持鱼—鱼、鱼—物和物—物；
- `app.js` 根据两个参与实体的 Canvas 坐标计算中点；
- `anchor.x / anchor.y` 使用 `0–1` 归一化坐标；
- 锚点只在初始化、resize 和低频 scene tick 时更新，不进入每帧 Core 计算；
- `openOfflineEvent(eventId)` 返回完整事件卡数据并设置 `readAt`；
- 已读事件保留正文用于海报和存档，但不再进入 `offlineEventBubbles`；
- 未读事件刷新后恢复；
- 参与实体已离开或图片丢失时保留名称并使用本地通用剪影；
- 打开一张卡片时其他气泡是否隐藏由前端处理，后端不删除其他未读事件。

现实物品入缸事件不进入这套离线气泡队列。物品完成落稳动画后，由 `app.js` 只调用一次入缸事件，并通过 `story:immediate` 交给原有黑底白字 UI。

## 5. ViewModel 契约

必须至少返回：

```javascript
{
  ready: true,
  feed: 200,
  income: {
    multiplier: 1.4965,
    activeFishCount: 1,
    onlineIntervalMs: 30070.163715335785,
    offlineIntervalMs: 160374.206481791,
    offlineCapMs: 28800000,
    offlineMaxFeed: 179
  },
  capacity: {
    used: 0,
    limit: 3,
    nextLimit: 5,
    upgradeCost: 60
  },
  selected: {
    fishId: null,
    objectId: null,
    decorId: null
  },
  fishCards: [
    {
      id: "fish-1",
      name: "月白",
      growth: 99,
      affection: 99,
      effectiveEventCount: 2,
      mature: false,
      active: true
    }
  ],
  latestStory: null,
  offlineEventBubbles: [
    {
      id: "offline-event-1",
      participantA: {
        id: "fish-1",
        type: "fish",
        name: "月白",
        iconUrl: "./assets/fish/moon-white.png"
      },
      participantB: {
        id: "memory-1",
        type: "object",
        name: "旧车票",
        iconUrl: "blob:..."
      },
      anchor: { x: 0.52, y: 0.38 },
      read: false
    }
  ],
  shop: {
    decor: [],
    fish: [],
    capacity: {}
  },
  cutout: {
    status: "idle",
    sourcePreviewUrl: "",
    resultPreviewUrl: "",
    message: ""
  }
}
```

`fishCards[].growth` 是旧客户端兼容字段，值始终与 `affection` 相同；新界面只展示亲密度。

不得在 MVP 中重新加入独立纪念册列表。

## 6. 事件契约

```text
state:changed
story:immediate
story:resolved
offline:settled
maturity:ready
maturity:resolved
journey:started
poster:ready
core:error
```

示例：

```javascript
{
  type: "story:resolved",
  payload: {
    id: "story-1",
    status: "generated",
    title: "一小块屋檐",
    body: "旧车票落进水里后，小鱼把它当成了屋顶。",
    posterLine: "有些走过的路，会在水里变成屋檐。"
  },
  viewModel: AquariumAPI.getViewModel()
}
```

AI 从 pending 变为 generated 或 fallback 时可以再次发出 `state:changed`，但不得重复结算成长和奖励。

`offline:settled` payload：

```javascript
{
  feedEarned: 30,
  eventsCreated: 3,
  eventIds: [
    "offline-event-1",
    "offline-event-2",
    "offline-event-3"
  ]
}
```

事件发出后，`viewModel.offlineEventBubbles` 必须已经可读。AI 仍在生成时可以先使用模板 fallback 显示气泡；正式文案返回后只更新事件卡内容，不重复创建气泡。

## 7. 故事模板必须做成可独立维护的数据

### 7.1 文件分离

故事策划只修改：

```text
game/js/story-template-catalog.js
```

后端只修改：

```text
game/js/story-template-registry.js
game/js/event-director.js
game/js/story-agent.js
```

模板文件先于 registry、event director 和 story agent 加载：

```html
<script src="./js/story-template-catalog.js"></script>
<script src="./js/story-template-registry.js"></script>
<script src="./js/event-director.js"></script>
<script src="./js/story-agent.js"></script>
```

正式产物不使用 `fetch()` 读取本地 JSON，避免静态环境和网络限制问题。

### 7.2 模板数据格式

模板文件只有数据，不写业务函数：

```javascript
globalThis.AquariumStoryTemplateCatalog = [
  {
    id: "first-meeting-roof-01",
    enabled: true,
    eventType: "first-meeting",
    participants: ["fish", "object"],
    weight: 10,
    promptGuide: "小鱼第一次见到物品，把它误认成水下建筑。",
    imageHints: ["绕行", "停在下方", "观察"],
    immediatePattern: "{fishName}绕着{objectName}游了两圈。",
    fallbackTitle: "一小块屋檐",
    fallbackBody: "{objectName}落进水里后，被{fishName}当成了一小块屋檐。",
    fallbackPosterLine: "有些走过的路，会在水里变成屋檐。"
  }
];
```

字段规则：

| 字段 | 规则 |
| --- | --- |
| `id` | 永久唯一，发布后不要改旧 ID |
| `enabled` | `false` 可临时停用 |
| `eventType` | 使用十类固定事件之一 |
| `participants` | `fish`、`object` 的组合 |
| `weight` | `1–100`，只影响同类型模板选择 |
| `promptGuide` | 给 AI 的情境和文风提示，不写数值规则 |
| `imageHints` | 可选的本地动画意图 |
| `immediatePattern` | AI 返回前立即显示 |
| `fallbackTitle` | AI 失败时的标题 |
| `fallbackBody` | AI 失败时的正文 |
| `fallbackPosterLine` | AI 失败时的海报短句 |

允许占位符：

```text
{fishName}
{secondFishName}
{objectName}
{secondObjectName}
{capturedAt}
{capturedPlace}
```

时间、地点为空时，registry 必须移除相关空句，AI 不得虚构。

### 7.3 十类固定 eventType

```text
first-meeting
misunderstood-use
shelter
play
fish-object-friendship
fish-fish-shared
object-object-memory
environment-change
deep-companionship
maturity-choice
```

故事策划可以：

- 随时增加同类型模板；
- 修改提示词、即时短句和回退文案；
- 用 `enabled: false` 暂停某个模板；
- 调整同类型模板权重；
- 不等后端修改代码即可看到新文案。

故事策划不能单独完成：

- 新的奖励规则；
- 新的成长数值；
- 新的参与者种类；
- 新的 Canvas 动画 effect；
- 第十一种全新触发逻辑。

这些变化需要先告诉后端，但仍然不需要改已有模板文案。

### 7.4 Registry 必须容错

`story-template-registry.js` 暴露：

```javascript
globalThis.AquariumStoryTemplates = {
  list,
  getById,
  select,
  validate,
  renderPattern,
  buildGenericFallback
};
```

必须做到：

- 每次选择故事时读取 catalog，而不是把十个模板复制进业务代码；
- 单条模板错误时跳过该条，不让游戏白屏；
- ID 重复时保留第一条并输出开发期警告；
- catalog 为空或全部无效时使用通用回退；
- 已完成故事保存最终文本，不依赖模板继续存在；
- 待生成事件的模板被删除时改用同类型模板或通用回退；
- AI 失败不撤销事件、成长、关系或饲料。

### 7.5 AI 只负责写作

模型：

```text
doubao-seed-2-1-turbo-260628
```

AI 输入：

- registry 选中的 `promptGuide`；
- 鱼、物品、关系和玩家主动填写的时间地点；
- 最近事件指纹；
- 40–80 字、轻盈克制、安全合规等要求。

AI 输出：

```javascript
{
  title,
  body,
  posterLine
}
```

AI 不得决定饲料、成长、关系、容量、奖励或鱼是否远游。12 秒超时、解析失败或内容不合格时，使用所选模板的 fallback。

## 8. 本地存档

`localStorage`：

```text
stubborn_fish_state_v1
stubborn_fish_state_backup_v1
```

`IndexedDB` 保存透明图片和自定义鱼图片。

保存时机：

- 资源获得或消费；
- 放入、删除和编辑结束；
- 故事、成长、关系和远游完成；
- 离线事件创建、AI 文案更新或被标记已读；
- 页面进入后台或关闭；
- 每 30 秒低频兜底。

读取顺序：

```text
主存档 → 备份 → 旧版存档迁移 → 新存档
```

图片丢失时使用通用剪影，不得白屏。

## 9. 脚本顺序

最终顺序：

```html
<script src="./js/object-segmentation.js"></script>
<script src="./js/cutout-flow.js"></script>
<script src="./js/webgl-fish-mesh.js"></script>
<script src="./js/story-template-catalog.js"></script>
<script src="./js/story-template-registry.js"></script>
<script src="./js/state-store.js"></script>
<script src="./js/economy-system.js"></script>
<script src="./js/relationship-system.js"></script>
<script src="./js/growth-journey.js"></script>
<script src="./js/event-director.js"></script>
<script src="./js/story-agent.js"></script>
<script src="./js/poster-renderer.js"></script>
<script src="./js/aquarium-core.js"></script>
<script src="./js/aquarium-api.js"></script>
<script src="./js/ui-shell.js"></script>
<script src="./js/app.js"></script>
```

开发服务器可以继续使用 `/game/...` 路径；最终静态包统一转换为相对路径。

## 10. 开发顺序

### 0–1 小时：先让前端开工

- 建立 `aquarium-api.js`；
- 完成全部函数名和 `NOT_READY` 回退；
- 提供固定 ViewModel；
- 建立 `story-template-catalog.js` 示例和 registry；
- 把 catalog 文件交给故事策划独立维护。

### 1–3 小时：核心闭环

- 存档、饲料、容量；
- 投喂和两事件成长；
- 商店购买；
- ViewModel 和 `state:changed`。

### 3–5 小时：物品、事件和 AI

- 接入现有抠图；
- 物品落稳立即事件；
- 入缸即时事件只走现有黑底白字故事条；
- registry 选模板；
- AI 正式故事和 12 秒回退；
- 关系和软绑定 effects。

### 5–7 小时：成熟、远游和海报

- 相同一次性奖励；
- 留下占位、远游释放；
- 海报生成与保存兜底；
- 离线结算、最多 3 个关系气泡和双实体事件卡。

### 7–8 小时：合并与联调

- 合并前端；
- 调整脚本顺序；
- 删除生产 mock；
- 只修 P0/P1。

## 11. 最小验证

自动检查优先保护：

- 初始饲料 200；
- 在线和离线收益；
- 离线最多 8 小时；
- 投喂扣 4、亲密度 `+5`；
- 两个不同事件才能成熟；
- 容量 `3 → 5 → 7 → 9`；
- 留下和远游奖励相同且只发一次；
- AI 超时和坏输出使用 fallback；
- catalog 新增模板无需改 registry；
- 无效模板不会导致白屏；
- 入缸落稳事件只结算一次并发出黑底故事条事件；
- 离线事件最多 3 个且包含两个有效参与者；
- 中点锚点归一化并限制在 `0–1`；
- 打开气泡后标记已读，未读气泡刷新后恢复；
- `createEventPoster(eventId)` 使用指定事件和两个参与者；
- 海报尺寸 `1080 × 1440`；
- 刷新后状态保留。

手工主流程：

```text
打开鱼缸
→ 放入现实物品
→ 抠图
→ 入缸即时故事
→ AI 或回退故事
→ 投喂
→ 第二事件增加亲密度
→ 留下或远游
→ 模拟离线归来
→ 同时显示最多 3 个关系气泡
→ 点击气泡查看双实体事件卡
→ 转发当前事件并保存海报
→ 刷新恢复
```

## 12. 发布检查

- [ ] 前端没有直接实现玩法规则；
- [ ] 所有按钮调用的 API 函数存在；
- [ ] `story-template-catalog.js` 可以独立增删改；
- [ ] 模板错误和 AI 错误都有回退；
- [ ] 入缸事件使用现有黑底白字 UI，不生成离线气泡；
- [ ] 离线气泡最多 3 个，支持鱼—鱼、鱼—物和物—物；
- [ ] 已读状态与未读气泡可以正确恢复；
- [ ] 转发事件生成的是当前事件卡海报；
- [ ] 不包含外部 CDN、远程字体和非指定请求；
- [ ] 不包含站外链接、二维码和 `iframe`；
- [ ] 根目录包含唯一 `index.html`；
- [ ] 静态包尽量控制在 20 MB 内；
- [ ] 横屏主流程无白屏；
- [ ] 最终可工作 commit 清晰可回退。
