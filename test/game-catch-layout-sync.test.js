import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/app.js", import.meta.url)),
  "utf8"
);
const htmlSource = fs.readFileSync(
  fileURLToPath(new URL("../game/index.html", import.meta.url)),
  "utf8"
);

describe("catch mode scene synchronization", () => {
  it("lets the player choose any present fish while unselected fish stay innocent", () => {
    expect(appSource).toContain("selectedTargetIds: new Set()");
    expect(appSource).toContain("function renderCatchTargetPicker");
    expect(appSource).toContain(
      "state.catchGame.selectedTargetIds.has(fish.id)"
    );
    expect(htmlSource).toContain('id="catchTargetPicker"');
    expect(appSource).toContain("game.score += CATCH_TARGET_SCORE");
    expect(appSource).toContain("game.score -= CATCH_NPC_PENALTY");
  });

  it("derives moving surface blockers from the placed aquarium layout", () => {
    expect(appSource).toContain("function createCatchSurfaceObstacles");
    expect(appSource).toContain(
      '.filter((object) => object.state === "surface")'
    );
    expect(appSource).toContain("if (object) object.x = obstacle.x");
    expect(appSource).not.toContain(
      "{ x: 0.29, width: 0.16, dir: 1, speed: 0.024"
    );
  });

  it("restores the designed layout and limits hiding to one second", () => {
    expect(appSource).toContain("function restoreCatchSurfaceLayout");
    expect(appSource).toContain("if (object) object.x = x");
    expect(appSource).toContain("fish.hiddenUntil = now + 1000");
  });

  it("restores the main controls as soon as a round ends", () => {
    const endRound = appSource.slice(
      appSource.indexOf("function endCatchRound"),
      appSource.indexOf("function moveCatchClaw")
    );
    expect(endRound).toContain("game.running = false");
    expect(endRound).toContain("setCatchSceneActive(false)");
  });
});
