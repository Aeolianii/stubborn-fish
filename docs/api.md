# AI 抠图 API

默认服务地址：`http://127.0.0.1:3000`

## 图生文目标定位（开发期）

`POST /api/object-groundings`

Content-Type：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | File | 是 | JPEG、PNG 或 WebP，默认最大 5 MB |
| `description` | string | 是 | 玩家指定的目标，1–200 字符 |
| `subjectType` | string | 是 | 图片种类：`person`、`animal`、`plant` 或 `other` |

```js
const form = new FormData();
form.append("description", "图片右上角的小鸟");
form.append("subjectType", "animal");
form.append("image", imageFile);

const response = await fetch("/api/object-groundings", {
  method: "POST",
  body: form
});

const { grounding } = await response.json();
```

成功响应：`200`

```json
{
  "grounding": {
    "targetLabel": "红色小鸟",
    "bbox": {
      "xMin": 0.74,
      "yMin": 0.13,
      "xMax": 0.97,
      "yMax": 0.38
    },
    "center": {
      "x": 0.83,
      "y": 0.23
    },
    "polygon": [
      { "x": 0.76, "y": 0.16 },
      { "x": 0.81, "y": 0.14 },
      { "x": 0.87, "y": 0.14 },
      { "x": 0.92, "y": 0.16 },
      { "x": 0.95, "y": 0.19 },
      { "x": 0.96, "y": 0.23 },
      { "x": 0.95, "y": 0.28 },
      { "x": 0.92, "y": 0.33 },
      { "x": 0.87, "y": 0.36 },
      { "x": 0.82, "y": 0.36 },
      { "x": 0.78, "y": 0.34 },
      { "x": 0.75, "y": 0.31 },
      { "x": 0.74, "y": 0.27 },
      { "x": 0.74, "y": 0.22 },
      { "x": 0.75, "y": 0.19 },
      { "x": 0.76, "y": 0.17 }
    ],
    "confidence": 0.98
  }
}
```

坐标均为相对原图宽高的 `0–1` 归一化值。`polygon` 必须包含 16–32 个点，是完整覆盖目标的最终实心剪纸边界。浏览器会保留多边形内部的全部像素，只在最外沿进行子像素抗锯齿；颜色、阴影、纹理、头发和物体内部结构都不会形成透明孔洞。

真实 API Key 只保存在 Fastify 进程的 `ARK_API_KEY` 环境变量中。开发页只调用本地代理，不接触密钥。

## 前端流程

1. Canvas 游戏弹出拍摄面板。
2. 前端调用相机或系统相册得到图片文件。
3. 将图片、物体描述和来源提交到 `POST /api/cutouts`。
4. 后端把原图直接作为 Seedream 5.0 的 `image` 输入执行图生图，并完成透明背景处理。
5. 使用返回的 `previewUrl` 预览透明 PNG。
6. 用户输入名称并选择分类后，调用 `PATCH /api/cutouts/:id`。
7. 前端读取确认后的对象信息，并在过期前接入鱼缸对象系统。

## 创建抠图

`POST /api/cutouts`

Content-Type：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | File | 是 | JPEG、PNG 或 WebP，默认最大 5 MB |
| `description` | string | 否 | 希望抠出的物体，最多 500 字符；为空时默认使用参考图主要主体 |
| `subjectType` | string | 是 | `person`、`aquatic_animal`、`land_animal`、`plant` 或 `other` |
| `source` | string | 否 | `camera` 或 `album`，默认 `album` |

Canvas 前端调用示例：

```js
const form = new FormData();
form.append("description", "保留照片中央的蓝色陶瓷小鱼");
form.append("subjectType", "other");
form.append("source", "camera");
form.append("image", imageFile);

const response = await fetch("/api/cutouts", {
  method: "POST",
  body: form
});

const result = await response.json();
```

成功响应：`201`

```json
{
  "cutout": {
    "id": "123e4567-e89b-42d3-a456-426614174000",
    "status": "ready",
    "description": "保留照片中央的蓝色陶瓷小鱼",
    "source": "camera",
    "name": null,
    "category": null,
    "attributes": null,
    "mimeType": "image/png",
    "usedFallback": false,
    "transparencyRatio": 0.72,
    "createdAt": "2026-07-29T00:00:00.000Z",
    "expiresAt": "2026-07-29T00:30:00.000Z",
    "previewUrl": "/api/cutouts/123e4567-e89b-42d3-a456-426614174000/image"
  }
}
```

该接口等待 Seedream 完成后再返回，前端应在请求期间展示生成中状态。

## 读取元数据

`GET /api/cutouts/:id`

返回结构与创建接口中的 `cutout` 相同。

## 读取透明 PNG

`GET /api/cutouts/:id/image`

响应 `Content-Type: image/png`，并设置 `Cache-Control: no-store`。

## 确认名称与分类

`PATCH /api/cutouts/:id`

```json
{
  "name": "小蓝",
  "category": "other"
}
```

分类取值：

- `animal`：动物
- `plant`：植物
- `natural_landscape`：自然景观
- `other`：其他类

目前 `attributes` 固定为 `null`，等待队友的分类属性模型接入。

## 查询分类占位

`GET /api/cutout-categories`

## 删除暂存

`DELETE /api/cutouts/:id`

成功返回 `204`。

## 生成生态缸故事（开发期）

`POST /api/story-generations`

请求：

```json
{
  "prompt": "根据给定的事件资料生成一段克制的水下故事。"
}
```

服务端固定通过方舟 OpenAI 兼容接口调用
`doubao-seed-2-1-turbo-260628`。`ARK_API_KEY` 只保存在 Fastify 进程中，
请求超过 12 秒、上游失败或内容校验不通过时，Canvas 使用本地故事模板回退。

成功响应：

```json
{
  "data": "{\"title\":\"水下屋檐\",\"body\":\"……\",\"posterLine\":\"……\"}"
}
```

## 错误结构

```json
{
  "error": {
    "code": "INVALID_IMAGE",
    "message": "上传的文件不是有效图片或图片已损坏",
    "requestId": "req-1"
  }
}
```

常见状态码：

- `400`：字段或图片内容无效。
- `413`：图片超过大小限制。
- `415`：不是支持的图片格式。
- `422`：AI 结果无法形成可靠透明背景。
- `502` / `504`：Seedream 服务错误或超时。
- `404`：暂存结果不存在或已过期。
