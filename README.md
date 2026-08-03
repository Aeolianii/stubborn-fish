# 忍不住化身一条固执的鱼

一个可以把现实中的人物、动物或物品变成动漫风透明素材，并放进互动鱼缸里的横屏 Web 游戏。

玩家上传照片后，后端会把原图直接发送给 Doubao Seedream 5.0 执行图生图，再使用纯色幕布抠图和本地 Alpha 后处理生成透明 PNG。生成的角色可以作为鱼、沉底摆件、悬浮摆件或水面漂浮物加入鱼缸。

## 功能

- 横屏互动鱼缸，支持喂食、成长、故事事件和本地存档。
- 从相机或相册上传 JPEG、PNG、WebP 图片。
- 使用 `doubao-seedream-5-0-260128` 直接进行图生图。
- 自动把生成结果处理为透明 PNG。
- 自定义角色可游动、缩放、删除，并在刷新后保持状态。
- API Key 仅保存在后端，不会发送到浏览器。
- 提供图生文目标定位诊断页，方便开发调试。

## 运行要求

- Node.js 20 或更高版本
- pnpm 11
- 已开通图片生成模型的火山方舟 API Key

AI 生图会消耗火山方舟额度。用户上传的图片会发送到火山方舟进行处理，请只上传你有权使用的内容。

## 快速开始

### 1. 克隆项目

```powershell
git clone "https://github.com/Aeolianii/stubborn-fish.git"
cd stubborn-fish
```

### 2. 安装依赖

```powershell
pnpm install --frozen-lockfile
```

### 3. 配置环境变量

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS 或 Linux：

```bash
cp .env.example .env
```

打开 `.env`，至少填写：

```dotenv
ARK_API_KEY=你的火山方舟_API_Key
SEEDREAM_MODEL=doubao-seedream-5-0-260128
HOST=127.0.0.1
PORT=3000
```

不要把真实 API Key 提交到 Git。项目已在 `.gitignore` 中忽略 `.env`。

### 4. 启动开发服务器

```powershell
pnpm dev
```

浏览器访问：

- 游戏主页：<http://127.0.0.1:3000/>
- 健康检查：<http://127.0.0.1:3000/health>
- 图生文诊断页：<http://127.0.0.1:3000/rest-test>

### 5. 生产方式运行

```powershell
pnpm build
pnpm start
```

## 如何游玩

1. 打开游戏主页，推荐使用横屏窗口。
2. 点击底部的“放入”。
3. 从相机或相册选择一张主体清晰的图片。
4. 选择人物、鱼或水生动物、非水生动物、植物或其他类别。
5. 填写希望保留的主体描述和名称。
6. 选择“一条鱼”、沉底、悬浮或漂浮状态，点击生成。
7. 对比原图与透明结果，确认后放入鱼缸。
8. 长按鱼或物品可调整大小或删除；存档保存在当前浏览器本地。

为了获得更干净的结果，建议使用主体完整、边缘清晰、遮挡较少的照片。

## 常用命令

```powershell
# 开发模式
pnpm dev

# 类型检查
pnpm check

# 运行测试
pnpm test

# 构建
pnpm build

# 启动构建后的服务
pnpm start
```

## API

前端通过 `POST /api/cutouts` 上传图片，后端负责：

1. 校验图片类型、大小和内容。
2. 将原图编码为 Base64 Data URL。
3. 调用 Seedream `/images/generations` 图生图接口。
4. 清理纯色背景并生成透明 PNG。
5. 暂存结果并返回本地预览地址。

完整请求字段和响应格式见 [`docs/api.md`](docs/api.md)。

## 项目结构

```text
game/                 互动鱼缸前端
src/                  Fastify 后端与 AI 服务
src/prompts/          图生图和图生文提示词
src/services/         Seedream 调用、透明化和存储逻辑
test/                 自动化测试
docs/                 API、设计和协作文档
rest-cutout-test/     图生文目标定位诊断页
```

## 常见问题

### 启动时提示缺少 `ARK_API_KEY`

确认项目根目录存在 `.env`，并且 `ARK_API_KEY` 不是空值。

### `3000` 端口被占用

在 `.env` 中将 `PORT=3000` 改为其他端口，例如 `PORT=3001`。

### 生图失败或超时

检查 API Key、模型权限、账户额度和网络连接。默认模型为 `doubao-seedream-5-0-260128`。

### 透明背景仍有少量杂色

尽量选择背景简单、主体与背景颜色差异明显的照片，然后重新生成。透明化提示词位于 `src/prompts/cutout-prompt.ts`。

### 如何清空本地进度

清除此站点在浏览器中的本地存储，或使用带 `?fresh=1` 的主页地址重新开始：

<http://127.0.0.1:3000/?fresh=1>

## 安全说明

- `.env`、临时图片和日志不会被 Git 跟踪。
- 不要在前端代码、Issue、截图或提交记录中公开 API Key。
- 如果密钥意外公开，请立即在火山方舟控制台中轮换。
