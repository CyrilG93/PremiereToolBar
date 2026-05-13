import assert from "node:assert/strict";
import schema from "../src/schema.js";

// Verify the first-run configuration always contains four declared dockable bars.
const defaultConfig = schema.createDefaultConfig();
assert.equal(defaultConfig.bars.length, 4);
assert.equal(defaultConfig.bars[0].id, "bar-1");
assert.equal(defaultConfig.bars[0].buttons.length, 2);

// Verify malformed imports are normalized instead of leaking invalid values.
const normalized = schema.normalizeConfig({
  activeBarId: "unknown",
  bars: [{ id: "bad", name: "", enabled: false, buttons: [{ actionType: "bad", label: "" }] }]
});
assert.equal(normalized.activeBarId, "bar-1");
assert.equal(normalized.bars[0].id, "bar-1");
assert.equal(normalized.bars[0].enabled, false);
assert.equal(normalized.bars[0].buttons[0].actionType, "effect");

// Verify selected-bar export/import replaces only the requested target bar.
const exportedBar = schema.exportToJson(defaultConfig, "bar-1");
const importedConfig = schema.importJson(defaultConfig, exportedBar, { mode: "bar", targetBarId: "bar-3" });
assert.equal(importedConfig.bars[2].id, "bar-3");
assert.equal(importedConfig.bars[2].buttons.length, 2);
assert.equal(importedConfig.bars[1].buttons.length, 0);

// Verify captured stack snapshots survive normalization.
const button = schema.createButton({
  actionType: "stack",
  stack: {
    components: [{
      mediaType: "video",
      matchName: "AE.ADBE Mosaic",
      displayName: "Mosaic",
      params: [{
        index: 0,
        displayName: "Blocks",
        timeVarying: true,
        startValue: { kind: "primitive", value: 12 },
        keyframes: [{ ticks: "254016000000", seconds: 1, value: { kind: "primitive", value: 24 } }]
      }]
    }]
  }
});
assert.equal(button.stack.components[0].params[0].keyframes[0].seconds, 1);

// Report success for CI and local verification.
console.log("ptb:test passed");
