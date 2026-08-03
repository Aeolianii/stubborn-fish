# 前端同学任务书：界面、横屏适配与按钮绑定

日期：2026-07-29

开发时间：黑客松最后 10 小时

配套文档：

- `docs/superpowers/specs/2026-07-29-memory-aquarium-idle-mvp-design.md`
- `docs/roles/2026-07-29-backend-owner.md`

## 1. 你的目标

你负责玩家能够看见和点击的部分：

- 在现有主鱼缸界面上补齐状态、弹层和按钮；
- 做手机横屏适配；
- 把按钮绑定到本文冻结的 `window.AquariumAPI` 函数；
- 把后端返回的 `viewModel` 和事件渲染到页面；
- 不在前端重复实现饲料、亲密度、事件、存档或 AI 规则。

按钮调用的函数可以暂时返回“功能开发中”。后端完成真实实现后，按钮代码不需要替换，只会自动调用同名的真实函数。

## 2. 你独占的文件

只由前端同学修改：

```text
game/index.html
game/styles.css
game/js/ui-shell.js
game/js/ui-mock-data.js
game/assets/ui/*
```

不要修改：

```text
game/js/app.js
game/js/cutout-flow.js
game/js/aquarium-api.js
game/js/aquarium-core.js
game/js/*-system.js
game/js/event-director.js
game/js/story-agent.js
game/js/story-template-registry.js
game/js/story-template-catalog.js
game/js/poster-renderer.js
src/routes/game.ts
test/*
```

`game/js/story-template-catalog.js` 由故事策划同学独占，前后端都不要顺手修改。

## 3. 前后端合作方式

页面加载后，所有玩法按钮只调用：

```javascript
window.AquariumAPI
```

统一返回结构：

```javascript
// 成功
{
  ok: true,
  data: {},
  viewModel: {}
}

// 失败
{
  ok: false,
  code: "INSUFFICIENT_FEED",
  message: "饲料还不够，再等一小会儿吧。"
}
```

前端规则：

1. 成功后用返回的 `viewModel` 重绘状态；
2. 失败后直接展示 `message`；
3. 不根据 `code` 自己计算玩法结果；
4. 不直接修改 `localStorage` 或 `IndexedDB`；
5. 不直接调用 AI；
6. AI 故事使用 `textContent` 写入，禁止拼接到 `innerHTML`。

初始化：

```javascript
await window.AquariumAPI.init();

window.AquariumAPI.subscribe((event) => {
  if (event.viewModel) {
    renderViewModel(event.viewModel);
  }
  handleAquariumEvent(event);
});

renderViewModel(window.AquariumAPI.getViewModel());
```

后端尚未完成时，可以使用 `ui-mock-data.js` 提供的假 `viewModel`。不要在 `ui-shell.js` 里实现另一套经济或成长逻辑。

## 4. 冻结的后端函数名

前端只调用下列函数，不自行改名：

```javascript
window.AquariumAPI.init()
window.AquariumAPI.getViewModel()
window.AquariumAPI.subscribe(listener)

window.AquariumAPI.feedFish(fishId)
window.AquariumAPI.openAddFlow()
window.AquariumAPI.selectInputImage(file)
window.AquariumAPI.generateCutout(input)
window.AquariumAPI.cancelCutout()
window.AquariumAPI.confirmAddObject(input)

window.AquariumAPI.setViewing(enabled)
window.AquariumAPI.toggleBackground()
window.AquariumAPI.toggleSound()

window.AquariumAPI.setObjectState(objectId, state)
window.AquariumAPI.setObjectScale(objectId, scale)
window.AquariumAPI.removeObject(objectId)
window.AquariumAPI.setFishScale(fishId, scale)
window.AquariumAPI.removeFish(fishId)
window.AquariumAPI.setDecorScale(decorId, scale)
window.AquariumAPI.removeDecor(decorId)

window.AquariumAPI.upgradeCapacity()
window.AquariumAPI.purchaseUnlock(kind, unlockId)
window.AquariumAPI.chooseMaturity(fishId, choice)
window.AquariumAPI.startJourney(fishId)

window.AquariumAPI.openOfflineEvent(eventId)
window.AquariumAPI.createEventPoster(eventId)
window.AquariumAPI.createPoster()
window.AquariumAPI.savePoster()
window.AquariumAPI.saveNow()
```

参数固定值：

```text
state: "bottom" | "suspended" | "surface"
kind: "decor" | "fish"
choice: "stay" | "journey"
```

如果函数还没有实现，`AquariumAPI` 会返回：

```javascript
{
  ok: false,
  code: "NOT_READY",
  message: "这个功能还在准备中。"
}
```

前端不需要给按钮换函数，只需正常显示这条提示。

## 5. ViewModel

前端只根据以下对象渲染：

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
    used: 1,
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
      growth: 99, // 兼容别名，始终等于 affection
      affection: 99,
      effectiveEventCount: 2,
      mature: false,
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

不要缓存并修改 `viewModel`。每次操作成功或收到事件后，以后端返回的新对象为准。

## 6. 全部界面

| 编号 | 界面 | 根节点 | 工作内容 |
| --- | --- | --- | --- |
| S01 | 主鱼缸 | `#app` | 保留现有主界面，增加饲料、容量和商店入口 |
| S02 | 放入现实物品 | `#addSheet` | 图片、描述、类型、时间、地点 |
| S03 | 抠图结果 | `[data-cutout-view="result"]` | 原图、透明结果、返回、取消、确认 |
| S04 | 物品编辑条 | `#objectEditor` | 状态、大小、删除、完成 |
| S05 | 鱼编辑条 | `#fishEditor` | 大小、亲密度、故事数、去向、删除 |
| S06 | 装饰编辑条 | `#decorEditor` | 大小、删除、完成 |
| S07 | 商店 | `#shopSheet` | 装饰、预设鱼、实物容量 |
| S08A | 离线事件气泡层 | `#offlineBubbleLayer` | 同时显示最多 3 个双实体关系气泡 |
| S08B | 离线事件卡 | `#offlineEventSheet` | 两个实体、AI 文案、转发事件、返回 |
| S09 | 成鱼选择 | `#maturityChoiceSheet` | 留下、远游、稍后决定 |
| S10 | 海报预览 | `#posterSheet` | 预览、保存、关闭 |
| S11 | 观赏模式 | 现有 viewing 状态 | 生成海报、轻触返回 |
| S12 | 错误提示 | `#errorToast` | 友好提示，不出现白屏 |

MVP 不做独立纪念册、故事列表、筛选和时间线。

## 7. 按钮与函数对照

### S01 主鱼缸

| 按钮 | DOM ID | 点击处理函数 | 调用 |
| --- | --- | --- | --- |
| 背景 | `backgroundButton` | `handleBackgroundClick` | `AquariumAPI.toggleBackground()` |
| 声音 | `soundButton` | `handleSoundClick` | `AquariumAPI.toggleSound()` |
| 商店 | `shopButton` | `handleShopClick` | 前端打开 S07 |
| 投喂 | `feedButton` | `handleFeedClick` | `AquariumAPI.feedFish(selectedFishId)` |
| 放入 | `addButton` | `handleAddClick` | `AquariumAPI.openAddFlow()`，成功后打开 S02 |
| 观赏 | `viewButton` | `handleViewClick` | `AquariumAPI.setViewing(true)` |
| 返回 | `exitViewButton` | `handleExitViewClick` | `AquariumAPI.setViewing(false)` |
| 生成海报 | `posterButton` | `handlePosterClick` | `AquariumAPI.createPoster()` |

新增状态节点：

```text
feedBalance
capacityStatus
shopButton
posterButton
```

显示示例：

```text
饲料 20
实物 1/3
```

现实物品完成落稳动画后，`story:immediate` 必须继续使用现有黑底白字故事条 `#storyCard / #storyText`。不要为入缸即时事件打开 S08B。

### S02/S03 放入与抠图

保留节点：

```text
addSheet
imagePicker
fileInput
imagePreview
subjectDescription
subjectType
objectName
generateCutoutButton
backToCaptureButton
cancelCutoutButton
confirmAddButton
sourcePreview
cutoutResult
resultSummary
captureStatus
sheetStatus
```

新增：

```text
capturedAtInput
capturedPlaceInput
```

| 按钮 | 处理函数 | 调用 |
| --- | --- | --- |
| 选择图片 | `handleImagePickerClick` | `fileInput.click()` |
| 文件改变 | `handleFileChange` | `AquariumAPI.selectInputImage(file)` |
| 生成透明物品 | `handleGenerateCutoutClick` | `AquariumAPI.generateCutout(input)` |
| 返回修改 | `handleBackToCaptureClick` | 前端切回输入视图 |
| 取消处理 | `handleCancelCutoutClick` | `AquariumAPI.cancelCutout()` |
| 确认放入 | `handleConfirmAddClick` | `AquariumAPI.confirmAddObject(input)` |
| 关闭弹层 | `handleCloseSheetClick` | 前端关闭 S02 |

`confirmAddObject(input)`：

```javascript
{
  name: "旧车票",
  placement: "bottom",
  capturedAt: "2026年7月",
  capturedPlace: "杭州"
}
```

### S04/S05/S06 编辑条

| 控件 | DOM | 调用 |
| --- | --- | --- |
| 物品状态 | `[data-state]` | `setObjectState(objectId, state)` |
| 物品大小 | `objectScaleRange` | `setObjectScale(objectId, value)` |
| 删除物品 | `deleteObjectButton` | `removeObject(objectId)` |
| 完成物品编辑 | `finishEditButton` | 前端关闭编辑条 |
| 鱼大小 | `fishScaleRange` | `setFishScale(fishId, value)` |
| 删除鱼 | `deleteFishButton` | `removeFish(fishId)` |
| 完成鱼编辑 | `finishFishEditButton` | 前端关闭编辑条 |
| 装饰大小 | `decorScaleRange` | `setDecorScale(decorId, value)` |
| 删除装饰 | `deleteDecorButton` | `removeDecor(decorId)` |
| 完成装饰编辑 | `finishDecorEditButton` | 前端关闭编辑条 |

鱼状态新增节点：

```text
fishAffectionStatus
maturityChoiceButton
startJourneyButton
```

显示示例：

```text
亲密度 75/100 · 故事 1/2
```

### S07 商店

节点：

```text
shopSheet
shopCloseButton
shopTabDecorButton
shopTabFishButton
shopTabCapacityButton
shopDecorPanel
shopFishPanel
shopCapacityPanel
shopCapacityStatus
shopCapacityButton
```

| 操作 | 调用 |
| --- | --- |
| 切换标签 | 前端切换对应 panel |
| 买装饰 | `AquariumAPI.purchaseUnlock("decor", itemId)` |
| 买预设鱼 | `AquariumAPI.purchaseUnlock("fish", itemId)` |
| 升级容量 | `AquariumAPI.upgradeCapacity()` |
| 关闭 | 前端关闭 S07 |

价格和是否已拥有全部来自 `viewModel.shop`，前端不得另写一份价格表。

### S08A 离线事件气泡

节点：

```text
offlineFeedToast
offlineBubbleLayer
```

每个气泡使用：

```html
<button
  class="offline-event-bubble"
  data-offline-event-id="offline-event-1"
  aria-label="查看月白和旧车票的故事"
></button>
```

渲染规则：

- 只渲染 `viewModel.offlineEventBubbles`，数量最多 3；
- `anchor.x / anchor.y` 为 `0–1` 的 Canvas 归一化坐标；
- 换算为 `#tank` 在页面中的实际位置后，把气泡放在关系中点上方；
- 两个气泡发生视觉重叠时，第二、第三个依次向上错开；
- 超出安全区时限制在屏幕边缘以内；
- 不在 `requestAnimationFrame` 中持续计算 DOM 位置；
- 打开事件卡时隐藏整个 `offlineBubbleLayer`；
- 返回后重新显示剩余未读气泡。

点击：

```javascript
async function handleOfflineBubbleClick(eventId) {
  const result = await AquariumAPI.openOfflineEvent(eventId);
  if (!result.ok) {
    showError(result.message);
    return;
  }
  renderOfflineEventCard(result.data.event);
  openOnlySheet("offlineEventSheet");
}
```

离线饲料收益使用 `offlineFeedToast` 做简短提示，不再用包含故事列表的离线弹层。

### S08B 离线事件卡

节点：

```text
offlineEventSheet
eventParticipantAIcon
eventParticipantAName
eventParticipantBIcon
eventParticipantBName
offlineEventTitle
offlineEventBody
forwardEventButton
eventBackButton
```

布局：

```text
实体 A 图标和名字  ···  实体 B 图标和名字
事件标题
AI 正文或模板回退正文
[转发事件] [返回]
```

图标优先使用自定义透明图片或预设鱼本地资源。图片引用丢失时显示本地通用剪影，不隐藏名称。

| 按钮 | 处理函数 | 调用 |
| --- | --- | --- |
| 转发事件 | `handleForwardEventClick` | `AquariumAPI.createEventPoster(activeEventId)` |
| 返回 | `handleEventBackClick` | 关闭 S08B，重新渲染剩余气泡 |

`openOfflineEvent()` 成功时该事件已经标记已读，因此返回后对应气泡不得恢复。

### S09 成鱼选择

节点：

```text
maturityChoiceSheet
maturityFishName
maturityRewardText
stayFishButton
sendJourneyButton
maturityLaterButton
```

| 按钮 | 调用 |
| --- | --- |
| 留下 | `AquariumAPI.chooseMaturity(fishId, "stay")` |
| 远游 | `AquariumAPI.chooseMaturity(fishId, "journey")` |
| 稍后决定 | 前端关闭 S09 |
| 留下后再次远游 | `AquariumAPI.startJourney(fishId)` |

留下和远游的奖励必须显示为相同规则，不要把任何一个选项做成“推荐”。

### S10 海报

节点：

```text
posterSheet
posterPreview
posterStatus
posterSaveButton
posterCloseButton
```

| 按钮 | 调用 |
| --- | --- |
| 保存 | `AquariumAPI.savePoster()` |
| 关闭 | 前端关闭 S10 |

`createPoster()` 成功后，把 `data.previewUrl` 设置到 `posterPreview.src`。

`createEventPoster(eventId)` 同样打开 S10，但海报内容必须来自当前事件卡。按钮虽然叫“转发事件”，MVP 实际行为是生成海报并保存到本地，不做站外跳转。

## 8. 后端事件对照

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

| 事件 | 前端动作 |
| --- | --- |
| `state:changed` | 使用 `event.viewModel` 重绘数值和按钮状态 |
| `story:immediate` | 在现有黑底白字故事条立即显示本地短句 |
| `story:resolved` | 用 AI 正式故事原位替换黑底白字故事条 |
| `offline:settled` | 显示离线饲料提示，并渲染最多 3 个关系气泡 |
| `maturity:ready` | 打开标题为“成熟抉择”的 S09 |
| `maturity:resolved` | 更新奖励并关闭或刷新 S09 |
| `journey:started` | 播放轻量告别反馈 |
| `poster:ready` | 打开 S10 并显示预览 |
| `core:error` | 在 S12 显示 `message` |

## 9. UI 与适配要求

- 默认手机横屏；
- 适配 `16:9`、`19.5:9`、`4:3`；
- 使用 `env(safe-area-inset-*)` 处理安全区；
- 不出现横向滚动条；
- 可点击区域不小于 44 px；
- 同一时刻只显示一个主弹层；
- 保留竖屏旋转提示；
- AI 文本只能使用 `textContent`；
- 不使用 `alert`、`confirm`、`prompt`；
- 不使用内联 `onXXX`；
- 不加入外链、二维码、站外跳转和 `iframe`；
- 不重做现有主鱼缸视觉。

## 10. 开发顺序

### 0–1 小时

- 保留和补齐所有 DOM ID；
- 接入后端提供的 `aquarium-api.js` 空壳；
- 用 mock ViewModel 显示饲料、容量和亲密度。

### 1–4 小时

- 完成商店、离线气泡、双实体事件卡、成鱼选择和海报弹层；
- 完成所有按钮绑定；
- AI 尚未完成时正常显示 `NOT_READY`。

### 4–6 小时

- 接入真实 ViewModel 和事件；
- 删除生产入口中的 `ui-mock-data.js`；
- 完成横屏尺寸适配。

### 6–8 小时

- 与后端一起跑主流程；
- 只修阻断操作、白屏、错位和无法关闭的弹层。

## 11. 交付检查

- [ ] 每个按钮都能映射到本文的前端处理函数或 `AquariumAPI`；
- [ ] 没有在 UI 中实现饲料、亲密度、价格或奖励计算；
- [ ] 没有直接读写存档；
- [ ] 没有直接调用 AI；
- [ ] `viewModel` 更新后页面能够刷新；
- [ ] AI 超时能看到回退故事；
- [ ] 入缸即时事件使用原有黑底白字故事条；
- [ ] 同时最多显示 3 个离线关系气泡；
- [ ] 气泡锚定在两个参与实体之间，重叠和越界时仍可点击；
- [ ] 事件卡显示两个实体图标、标题、正文、转发事件和返回；
- [ ] 已读气泡返回后消失，其他未读气泡恢复；
- [ ] 转发事件生成的是当前事件卡海报；
- [ ] 留下和远游奖励展示一致；
- [ ] 观赏模式能生成并预览海报；
- [ ] 三种横屏比例没有横向滚动；
- [ ] 任意错误显示友好提示，不出现白屏。
