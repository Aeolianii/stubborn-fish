import { describe, expect, it } from "vitest";

import { buildCutoutPrompt } from "../src/prompts/cutout-prompt.js";

describe("buildCutoutPrompt", () => {
  it("builds a precise chroma-key cutout instruction around the user description", () => {
    const prompt = buildCutoutPrompt("保留桌面中央的蓝色陶瓷小鱼");

    expect(prompt).toContain("蓝色陶瓷小鱼");
    expect(prompt).toContain("直接参考输入图片进行图生图编辑");
    expect(prompt).toContain("唯一视觉依据");
    expect(prompt).toContain("供后端色键抠图");
    expect(prompt).toContain("主体轮廓以内的每一个像素");
    expect(prompt).toContain("白色、米白、浅灰");
    expect(prompt).toContain("主体内部不得出现透明洞");
    expect(prompt).toContain("纯 #FF00FF（RGB 255, 0, 255）");
    expect(prompt).toContain("不得出现色差、渐变、阴影");
    expect(prompt).toContain("颗粒、噪点、喷溅、水彩笔触");
    expect(prompt).toContain("没有任何粉色纹理或斑点");
    expect(prompt).toContain("约 10% 的纯色安全边距");
    expect(prompt).toContain("不要尝试绘制透明效果");
    expect(prompt).toContain("插画风动漫形象");
    expect(prompt).toContain("精致二维动漫插画");
    expect(prompt).toContain("细腻赛璐璐上色");
    expect(prompt).toContain("避免照片感");
  });

  it("trims the user description", () => {
    const prompt = buildCutoutPrompt("  保留红色杯子  ");

    expect(prompt).toContain("用户指定目标：保留红色杯子");
    expect(prompt).not.toContain("  保留红色杯子  ");
  });

  it("keeps a person intact without inventing a merperson body", () => {
    const prompt = buildCutoutPrompt("红衣女孩", "person");

    expect(prompt).toContain("人物、脸部、发型、衣饰、四肢和姿态");
    expect(prompt).toContain("不得补画被遮挡或画面外的身体");
    expect(prompt).not.toContain("美人鱼");
  });

  it("keeps a land animal intact without adding a fish tail", () => {
    const prompt = buildCutoutPrompt("橘猫", "land_animal");

    expect(prompt).toContain("动物身体、四肢、尾巴、毛发");
    expect(prompt).toContain("不得改造成水生动物");
    expect(prompt).toContain("不得添加鱼尾");
  });

  it("keeps an aquatic animal body without adding another tail", () => {
    const prompt = buildCutoutPrompt(
      "蓝色金鱼",
      "aquatic_animal"
    );

    expect(prompt).toContain("水生动物身体、鳍、肢体、尾部");
    expect(prompt).toContain("不得改变品种或身体结构");
  });

  it("uses a reference-image fallback when the description is empty", () => {
    const prompt = buildCutoutPrompt("   ");

    expect(prompt).toContain("用户指定目标：参考图中的主要主体");
  });
});
