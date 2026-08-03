import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/app.js", import.meta.url)),
  "utf8"
);
const uiShellSource = fs.readFileSync(
  fileURLToPath(new URL("../game/js/ui-shell.js", import.meta.url)),
  "utf8"
);

describe("home dock visibility sync", () => {
  it("recomputes dock visibility from homepage state instead of scattered toggles", () => {
    expect(appSource).toContain("const shouldHideDock = Boolean(");
    expect(appSource).toContain("syncSceneEditingMode();");
    expect(appSource).toContain('$("#exitViewButton").classList.toggle("is-hidden", !state.viewing);');
    expect(uiShellSource).toContain("function syncHomeDockVisibility()");
    expect(uiShellSource).toContain("setHidden(\"dock\", Boolean(");
  });

  it("refreshes dock visibility when shell overlays or mode changes", () => {
    expect(uiShellSource).toContain("openOnlySheet(id)");
    expect(uiShellSource).toContain("closeSheet(id)");
    expect(uiShellSource).toContain("handleModeChange(event)");
    expect(uiShellSource).toContain("syncHomeDockVisibility();");
  });
});
