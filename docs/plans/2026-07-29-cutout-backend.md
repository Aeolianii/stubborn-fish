# 拍图与 AI 抠图后端实现计划

## 目标

实现供 Canvas 游戏前端调用的拍图/相册图片抠图后端。后端接收图片和用户描述，调用 Doubao Seedream 5.0 系列模型生成透明 PNG，暂存结果，并支持后续命名和四类分类信息写入。

## 不在本次范围

- Canvas 游戏界面及弹窗前端。
- 动物、植物、自然景观、其他类的具体属性模型。
- 抠图对象进入鱼缸后的摆放、动画和持久化。

## 技术方案

- Node.js 24 + TypeScript。
- Fastify 提供 HTTP API，`@fastify/multipart` 接收图片。
- Seedream API Key、Base URL、模型 ID 通过环境变量配置。
- Prompt 由独立模块生成，便于单独优化。
- Seedream 返回 Base64 图片，避免额外下载远程图片。
- 使用 Sharp 校验/转换 PNG；如果模型结果没有有效透明通道，使用边缘连通背景透明化算法兜底。
- 抠图图片和 JSON 元数据保存到本地临时目录，并按 TTL 清理。

## 计划文件

- `src/config.ts`：环境变量读取与校验。
- `src/prompts/cutout-prompt.ts`：抠图 Prompt。
- `src/services/seedream-client.ts`：Seedream API 适配器。
- `src/services/alpha-matte.ts`：透明通道检查与本地兜底。
- `src/services/cutout-store.ts`：临时结果存储。
- `src/services/cutout-service.ts`：业务编排。
- `src/routes/cutouts.ts`：上传、查询、图片、更新和删除接口。
- `src/app.ts`、`src/server.ts`：应用组装与启动。
- `test/`：单元测试与接口测试。
- `README.md`：启动、API 配置、Prompt 优化位置和前端接入说明。

## API 契约

- `POST /api/cutouts`：上传 `image`、`description` 和可选 `source`。
- `GET /api/cutouts/:id`：查询暂存对象元数据。
- `GET /api/cutouts/:id/image`：读取透明 PNG。
- `PATCH /api/cutouts/:id`：写入名称和分类。
- `DELETE /api/cutouts/:id`：删除暂存对象。
- `GET /api/cutout-categories`：返回四类分类占位信息。
- `GET /health`：健康检查。

## 验证

1. 先为配置、Prompt、透明化、临时存储和路由写失败测试。
2. 实现最小代码使测试通过。
3. 运行完整测试、TypeScript 构建和本地接口烟测。
4. 检查无 API Key 泄漏、无非必要网络请求，并审查错误处理。
