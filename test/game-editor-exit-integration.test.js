import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../game/js/app.js", import.meta.url), "utf8");
const uiShellSource = readFileSync(new URL("../game/js/ui-shell.js", import.meta.url), "utf8");

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

describe("aquarium editor exit integration", () => {
  it("lets the direct game UI run its complete editor cleanup", () => {
    const bindings = functionSource(
      uiShellSource,
      "function bindStaticButtons()",
      "function bindInputs()"
    );
    const finishClickStart = bindings.indexOf('interceptClick("finishFishEditButton"');
    const finishGuardStart = bindings.lastIndexOf("if (!directTutorialUi) {", finishClickStart);
    const directUiGuard = bindings.slice(
      finishGuardStart,
      bindings.indexOf('document.querySelectorAll("[data-close-sheet]")', finishClickStart)
    );
    const finishEditing = functionSource(
      appSource,
      "function finishEditing()",
      "function updateEditorState()"
    );

    expect(finishClickStart).toBeGreaterThanOrEqual(0);
    expect(finishGuardStart).toBeGreaterThanOrEqual(0);
    expect(directUiGuard).toContain('interceptClick("finishEditButton"');
    expect(finishEditing).toContain("state.editing = false");
    expect(finishEditing).toContain('state.tutorial.signal("finishDecor")');
  });

  it("leaves new-object placement choices to the direct cutout flow", () => {
    const bindings = functionSource(
      uiShellSource,
      "function bindStaticButtons()",
      "function bindInputs()"
    );
    const placementBindingStart = bindings.indexOf(
      'document.querySelectorAll("[data-new-state]")'
    );
    const placementGuardStart = bindings.lastIndexOf(
      "if (!directTutorialUi) {",
      placementBindingStart
    );
    const placementGuard = bindings.slice(
      placementGuardStart,
      bindings.indexOf('document.querySelectorAll("[data-state]")', placementBindingStart)
    );
    const directPlacementHandler = functionSource(
      appSource,
      "function selectNewState(value)",
      "function selectAddSource(source)"
    );

    expect(placementBindingStart).toBeGreaterThanOrEqual(0);
    expect(placementGuardStart).toBeGreaterThanOrEqual(0);
    expect(placementGuard).toContain('document.querySelectorAll("[data-new-state]")');
    expect(directPlacementHandler).toContain("state.selectedState = value");
    expect(directPlacementHandler).toContain("cutoutSession.update({ placement: value })");
  });

  it("keeps a collected fish arrival visible and out of edit mode", () => {
    const addDefaultAsset = functionSource(
      appSource,
      "async function addDefaultAsset(item, options = {})",
      "function eventAnchorForParticipants"
    );

    expect(addDefaultAsset).toContain("await state.aquariumCore.notifyFishAdded(fish.id)");
    expect(addDefaultAsset).toContain("showStory(`${fish.name}游进了鱼缸。`)");
    expect(addDefaultAsset).toContain('soundManager.play("splash")');
    expect(addDefaultAsset).not.toContain("openFishEditor(fish)");
  });
});
