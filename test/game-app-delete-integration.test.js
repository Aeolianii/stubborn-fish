import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../game/js/app.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../game/index.html", import.meta.url), "utf8");
const uiShellSource = readFileSync(new URL("../game/js/ui-shell.js", import.meta.url), "utf8");

function functionSource(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  return appSource.slice(start, end);
}

describe("aquarium app fish actions", () => {
  it("persists fish deletion through the AquariumAPI before clearing the UI", () => {
    const handler = functionSource(
      "async function deleteSelectedFish()",
      "function deleteSelectedObject()"
    );

    expect(handler).toContain("await aquariumApi.removeFish(fish.id)");
    expect(handler.indexOf("await aquariumApi.removeFish(fish.id)"))
      .toBeLessThan(handler.indexOf("state.selectedFishId = null"));
  });

  it("does not intercept delete buttons before the app persistence handlers", () => {
    expect(uiShellSource).not.toContain('interceptClick("deleteFishButton"');
    expect(uiShellSource).not.toContain('interceptClick("deleteObjectButton"');
    expect(uiShellSource).not.toContain('interceptClick("deleteDecorButton"');
  });

  it("persists object and decor deletion through the AquariumAPI", () => {
    const objectHandler = functionSource(
      "async function deleteSelectedObject()",
      "async function deleteSelectedDecor()"
    );
    const decorHandler = functionSource(
      "async function deleteSelectedDecor()",
      "function cancelLongPress()"
    );

    expect(objectHandler).toContain("await aquariumApi.removeObject(object.id)");
    expect(objectHandler.indexOf("await aquariumApi.removeObject(object.id)"))
      .toBeLessThan(objectHandler.indexOf("state.memoryObject ="));
    expect(decorHandler).toContain("await aquariumApi.removeDecor(decor.id)");
    expect(decorHandler.indexOf("await aquariumApi.removeDecor(decor.id)"))
      .toBeLessThan(decorHandler.indexOf("state.selectedDecorId = null"));
  });

  it("does not show the stale 99-affection message after feeding", () => {
    const handler = functionSource(
      "async function feedFish()",
      "function disturbFish"
    );

    expect(handler).not.toContain("亲密度暂时停在 99");
    expect(handler).toContain("continueTutorialForMatureCompanion(result.viewModel)");
    expect(handler).toContain("if (!data.mature)");
    expect(handler).toContain("亲密度提升了");
  });

  it("advances the feed tutorial when the companion was already mature", () => {
    const recovery = functionSource(
      "function continueTutorialForMatureCompanion",
      "function resumeTutorialAfterInit"
    );

    expect(recovery).toContain("if (!companion || !companion.mature) return false");
    expect(recovery).toContain('state.tutorial.signal("maturityReady"');
    expect(recovery).toContain('openMaturityChoice("fish-1")');
    expect(recovery).toContain("if (companion.maturityChoice)");
    expect(recovery).toContain('state.tutorial.signal("maturityResolved"');
  });

  it("keeps the tutorial feed step free of a fixed 99-affection stat", () => {
    const presentation = functionSource(
      "function tutorialPresentation(step)",
      "function renderTutorialStep()"
    );
    const feedStep = presentation.slice(
      presentation.indexOf("feed: {"),
      presentation.indexOf("photo: {")
    );

    expect(feedStep).not.toContain("99");
    expect(feedStep).not.toContain("stats:");
    expect(feedStep).toContain('target: "#feedButton"');
  });

  it("uses affection consistently and keeps the maturity choice concise", () => {
    expect(indexSource).toContain('id="fishAffectionStatus">亲密度 0/100');
    expect(indexSource).toContain('id="maturityFishImage"');
    expect(indexSource).toContain('width="360" height="200"');
    expect(indexSource).toContain("要去远方吗？");
    expect(indexSource).toContain("保留收益，占用鱼位");
    expect(indexSource).toContain("腾出鱼位，记忆保留");
    expect(indexSource).not.toContain("A GROWN-UP CHOICE");
    expect(indexSource).not.toContain("它游到了故事的分岔口");
    expect(appSource).toContain("paintMaturityFish");
    expect(appSource).toContain("fishCard?.id");
    expect(indexSource).not.toContain("成长 0/100");
    expect(indexSource).not.toContain("一次性成长奖励");
    expect(uiShellSource).toContain('"亲密度 " + fish.affection + "/100');
    expect(uiShellSource).not.toContain('"成长 " + fish.growth');
  });
});
