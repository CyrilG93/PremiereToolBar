import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import schema from "../src/schema.js";

// Resolve project files from this test script location.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Verify the first-run configuration always contains four dockable bars and one base collection.
const defaultConfig = schema.createDefaultConfig();
assert.equal(defaultConfig.schemaVersion, 2);
assert.equal(defaultConfig.bars.length, 4);
assert.equal(defaultConfig.bars[0].id, "bar-1");
assert.equal(defaultConfig.bars[0].collectionId, "collection-base-effects");
assert.equal(defaultConfig.collections[0].buttonIds.length, 8);
assert.ok(defaultConfig.collections[0].buttonIds.includes("btn-settings"));
assert.ok(defaultConfig.buttons.every((item) => item.displayMode === "icon"));
assert.ok(defaultConfig.buttons.some((button) => button.effect && button.effect.displayName === "Ultra Key"));

// Verify malformed legacy configs are migrated to the collection model.
const migratedLegacy = schema.normalizeConfig({
  activeBarId: "unknown",
  bars: [{ id: "bad", name: "Old Bar", enabled: false, buttons: [{ actionType: "bad", label: "Old Button" }] }]
});
assert.equal(migratedLegacy.schemaVersion, 2);
assert.equal(migratedLegacy.bars.length, 4);
assert.ok(migratedLegacy.collections.some((collection) => collection.name === "Old Bar"));
assert.ok(migratedLegacy.buttons.some((button) => button.label === "Old Button"));

// Verify selected-collection export/import replaces only the requested target collection.
const exportedCollection = schema.exportToJson(defaultConfig, "collection-base-effects");
const customConfig = schema.normalizeConfig(defaultConfig);
const importedConfig = schema.importJson(customConfig, exportedCollection, {
  mode: "collection",
  targetCollectionId: "collection-empty-3"
});
const replacedCollection = schema.getCollection(importedConfig, "collection-empty-3");
assert.equal(replacedCollection.id, "collection-empty-3");
assert.equal(replacedCollection.buttonIds.length, 8);
assert.equal(schema.getCollection(importedConfig, "collection-empty-2").buttonIds.length, 0);

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

// Verify the old beta Solarize starter button is migrated to a safer default.
const migratedButton = schema.createButton({
  label: "Solarize",
  icon: "sun",
  effect: { matchName: "PR.ADBE Solarize", displayName: "Solarize" }
});
assert.equal(migratedButton.label, "Gaussian Blur");
assert.equal(migratedButton.effect.matchName, "AE.ADBE Gaussian Blur 2");

// Minimal DOM element used to smoke-test UXP panel rendering in Node.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this._textContent = "";
    this._innerHTML = "";
    this.clientWidth = 720;
    this.clientHeight = 420;
    this.classList = {
      add: (token) => {
        const tokens = this.className ? this.className.split(/\s+/) : [];
        if (!tokens.includes(token)) {
          tokens.push(token);
          this.className = tokens.join(" ");
        }
      },
      remove: (token) => {
        this.className = (this.className ? this.className.split(/\s+/) : []).filter((item) => item !== token).join(" ");
      }
    };
  }

  // Append a child node and keep parent links for recursive assertions.
  appendChild(child) {
    if (child) {
      child.parentNode = this;
      this.children.push(child);
    }
    return child;
  }

  // Store attributes that the UI assigns during rendering.
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  // Keep event registration harmless in the Node smoke test.
  addEventListener(type, handler) {
    this["on" + type] = handler;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || "").join("");
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === "") {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

// Create the subset of document APIs used by the Tool Bar UI.
function createFakeDocument() {
  const document = {
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    getElementById(id) {
      return findByPredicate(document.documentElement, (node) => node.id === id) || null;
    }
  };
  document.documentElement = new FakeElement("html", document);
  document.head = new FakeElement("head", document);
  document.body = new FakeElement("body", document);
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  return document;
}

// Traverse a fake DOM tree and return the first matching node.
function findByPredicate(node, predicate) {
  if (!node) {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findByPredicate(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

// Count nodes with a specific class token in the fake DOM.
function countClass(node, className) {
  if (!node) {
    return 0;
  }
  const tokens = node.className ? node.className.split(/\s+/) : [];
  const selfCount = tokens.includes(className) ? 1 : 0;
  return selfCount + (node.children || []).reduce((count, child) => count + countClass(child, className), 0);
}

// Execute the browser UI scripts against the fake DOM.
function renderSettingsSmokeTest() {
  const document = createFakeDocument();
  const context = {
    console,
    document,
    setTimeout() {},
    window: null,
    PTB_SCHEMA: schema,
    PTB_STORAGE: {
      loadConfig: () => schema.createDefaultConfig(),
      saveConfig: (config) => schema.normalizeConfig(config),
      exportJsonFile: async () => {},
      importJsonFile: async () => "",
      copyText: async () => {}
    },
    PTB_PREMIERE: {
      applyButton: async () => {},
      captureSelectedStack: async () => ({ components: [] })
    }
  };
  context.window = context;
  vm.createContext(context);
  ["src/i18n.js", "src/iconLibrary.js", "src/ui.js"].forEach((relativePath) => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"), context, { filename: relativePath });
  });
  const rootNode = document.createElement("div");
  document.body.appendChild(rootNode);
  context.PTB_UI.mountPanel(rootNode, "ptb-settings", {});
  return rootNode;
}

const settingsRoot = renderSettingsSmokeTest();
assert.ok(findByPredicate(settingsRoot, (node) => String(node.className).includes("ptb-settings-content")));
assert.equal(countClass(settingsRoot, "ptb-section"), 4);
assert.ok(settingsRoot.textContent.includes("Button Gallery"));
assert.ok(settingsRoot.textContent.includes("Button Editor"));
assert.ok(settingsRoot.textContent.includes("Collections"));
assert.ok(settingsRoot.textContent.includes("Import / Export"));
assert.ok(settingsRoot.textContent.includes("Button Display"));
assert.ok(settingsRoot.textContent.includes("Transform"));

// Report success for CI and local verification.
console.log("ptb:test passed");
