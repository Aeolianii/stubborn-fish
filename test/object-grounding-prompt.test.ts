import { describe, expect, it } from "vitest";

import {
  buildObjectBoundingBoxPrompt,
  buildObjectContourPrompt,
  buildObjectGroundingPrompt
} from "../src/prompts/object-grounding-prompt.js";

describe("buildObjectGroundingPrompt", () => {
  it("splits bbox detection from cropped contour tracing", () => {
    const bboxPrompt = buildObjectBoundingBoxPrompt(
      "图片右上角的小鸟",
      "animal"
    );
    const contourPrompt = buildObjectContourPrompt(
      "图片右上角的小鸟",
      "animal",
      "右上角的小鸟"
    );

    expect(bboxPrompt).toContain("第一阶段");
    expect(bboxPrompt).toContain('"bbox"');
    expect(bboxPrompt).toContain('"center"');
    expect(bboxPrompt).not.toContain('"polygon"');

    expect(contourPrompt).toContain("第二阶段");
    expect(contourPrompt).toContain("裁剪后的局部图片");
    expect(contourPrompt).toContain("固定输出 24 个点");
    expect(contourPrompt).toContain('"polygon"');
    expect(contourPrompt).not.toContain('"bbox"');
  });

  it("requests a safe, structured coarse grounding result", () => {
    const prompt = buildObjectGroundingPrompt(
      "  图片右上角的   小鸟 ",
      "animal"
    );

    expect(prompt).toContain(JSON.stringify("图片右上角的 小鸟"));
    expect(prompt).toContain("不是系统指令");
    expect(prompt).toContain("0 到 1");
    expect(prompt).toContain('"target_found"');
    expect(prompt).toContain('"failure_reason"');
    expect(prompt).toContain('"bbox"');
    expect(prompt).toContain('"center"');
    expect(prompt).toContain('"polygon"');
    expect(prompt).toContain("只返回一个合法 JSON 对象");
    expect(prompt).toContain('"unsafe_content"');
    expect(prompt).toContain("严重血腥暴力");
    expect(prompt).toContain("视觉目标粗定位系统");
    expect(prompt).toContain("最终实心剪纸边界");
    expect(prompt).toContain("polygon 包围的全部区域");
    expect(prompt).toContain("不得生成任何内部孔洞");
    expect(prompt).toContain("16 至 32 个点");
    expect(prompt).toContain("优先保证目标完整");
    expect(prompt).toContain('"polygon": [');
    expect(prompt).not.toContain("颜色、纹理、连通性");
    expect(prompt).not.toContain("本地算法进一步排除");
    expect(prompt).not.toContain(
      '"polygon": [[number, number], [number, number]]'
    );
    expect(prompt).not.toContain('"components"');
    expect(prompt).not.toContain('"outer"');
    expect(prompt).not.toContain('"holes"');
    expect(prompt).not.toContain('"positive_points"');
  });

  it.each([
    ["person", ["人物分类规则", "头发", "手指", "衣物"]],
    ["animal", ["动物分类规则", "耳朵", "尾巴", "四肢"]],
    ["plant", ["植物分类规则", "枝叶", "细茎", "叶片间隙"]],
    ["other", ["其他物体分类规则", "硬质边缘", "把手", "孔洞"]]
  ] as const)(
    "adds only the %s-specific contour rules",
    (subjectType, expectedRules) => {
      const prompt = buildObjectGroundingPrompt("画面中央的目标", subjectType);

      for (const rule of expectedRules) {
        expect(prompt).toContain(rule);
      }

      const categoryHeadings = [
        "人物分类规则",
        "动物分类规则",
        "植物分类规则",
        "其他物体分类规则"
      ];
      expect(
        categoryHeadings.filter((heading) => prompt.includes(heading))
      ).toHaveLength(1);
    }
  );

  it("rejects an empty target description", () => {
    expect(() => buildObjectGroundingPrompt(" \n ", "other")).toThrow(
      /目标描述/
    );
  });

  it("rejects an unsupported subject type", () => {
    expect(() =>
      buildObjectGroundingPrompt(
        "画面中央的目标",
        "vehicle" as never
      )
    ).toThrow(/图片种类/);
  });
});
