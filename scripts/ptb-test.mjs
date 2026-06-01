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
assert.equal(defaultConfig.collections[0].buttonIds.length, 11);
assert.ok(defaultConfig.collections[0].buttonIds.includes("btn-settings"));
assert.ok(defaultConfig.collections[0].buttonIds.includes("btn-copy-effects"));
assert.ok(defaultConfig.collections[0].buttonIds.includes("btn-paste-effects"));
assert.ok(defaultConfig.buttons.every((item) => item.displayMode === "both"));
assert.ok(defaultConfig.buttons.some((button) => button.actionType === "tool" && button.tool.id === "openSettings"));
assert.ok(defaultConfig.buttons.some((button) => button.effect && button.effect.displayName === "Ultra Key"));
assert.ok(defaultConfig.buttons.some((button) => button.actionType === "transition" && button.transition.matchName === "AE.AE_Impact_Pop"));
assert.equal(schema.createButton({ actionType: "settings" }).actionType, "tool");
assert.equal(schema.createButton({ actionType: "settings" }).tool.id, "openSettings");
const removeEffectsButton = schema.createButton({
  actionType: "tool",
  tool: { id: "removeClipEffects", removeEffects: { includeIntrinsic: false, includeVideoEffects: true } }
});
assert.equal(removeEffectsButton.tool.id, "removeClipEffects");
assert.equal(removeEffectsButton.tool.removeEffects.includeIntrinsic, false);
assert.equal(removeEffectsButton.tool.removeEffects.includeVideoEffects, true);
const scriptButton = schema.createButton({ actionType: "script", script: { name: "Sort Project", sourceFileName: "Sort Project.jsx", source: "alert('x');" } });
assert.equal(scriptButton.actionType, "script");
assert.equal(scriptButton.script.sourceFileName, "Sort Project.jsx");
assert.equal(scriptButton.script.source, "alert('x');");

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
const exportedComplete = JSON.parse(schema.exportToJson(defaultConfig));
assert.equal(exportedComplete.exportType, "complete");
assert.equal(exportedComplete.bars.length, 4);
const customConfig = schema.normalizeConfig(defaultConfig);
const importedConfig = schema.importJson(customConfig, exportedCollection, {
  mode: "collection",
  targetCollectionId: "collection-empty-3"
});
const replacedCollection = schema.getCollection(importedConfig, "collection-empty-3");
assert.equal(replacedCollection.id, "collection-empty-3");
assert.equal(replacedCollection.buttonIds.length, 11);
assert.equal(schema.getCollection(importedConfig, "collection-empty-2").buttonIds.length, 1);

// Verify complete import merges conflicts instead of replacing the user's current setup.
const conflictConfig = schema.normalizeConfig(defaultConfig);
const importedPack = JSON.parse(schema.exportToJson(defaultConfig));
importedPack.buttons[0].label = "Changed Settings";
const mergedConfig = schema.importJson(conflictConfig, JSON.stringify(importedPack), { mode: "all" });
assert.ok(mergedConfig.buttons.some((item) => item.id === "btn-settings"));
assert.ok(mergedConfig.buttons.some((item) => item.label === "Changed Settings Imported"));
assert.equal(mergedConfig.collections.length, defaultConfig.collections.length);

// Verify captured stack snapshots survive normalization.
const button = schema.createButton({
  actionType: "preset",
  stack: {
    sourceInPointSeconds: 100,
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
      }, {
        index: 1,
        displayName: "Lumetri Curve",
        timeVarying: false,
        startValue: { kind: "raw", encoding: "base64", value: "AAAA", checksum: "1234", parameterControlType: "9" },
        keyframes: []
      }]
    }]
  }
});
assert.equal(button.stack.components[0].params[0].keyframes[0].seconds, 1);
assert.equal(button.stack.sourceInPointSeconds, 100);
assert.equal(button.stack.components[0].params[1].startValue.kind, "raw");
assert.equal(button.stack.components[0].params[1].startValue.encoding, "base64");

// Verify legacy captured-stack buttons migrate to the user-facing preset action.
const legacyStackButton = schema.createButton({ actionType: "stack" });
assert.equal(legacyStackButton.actionType, "preset");

// Verify the old beta Solarize starter button is migrated to a safer default.
const migratedButton = schema.createButton({
  label: "Solarize",
  icon: "sun",
  effect: { matchName: "PR.ADBE Solarize", displayName: "Solarize" }
});
assert.equal(migratedButton.label, "Gaussian Blur");
assert.equal(migratedButton.effect.matchName, "AE.ADBE Gaussian Blur 2");

// Verify the .prfpset importer can parse Premiere XML without DOMParser in UXP.
function prfpsetImporterSmokeTest() {
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/presetImport.js"), "utf8"), context, { filename: "src/presetImport.js" });
  const samplePreset = `<?xml version="1.0" encoding="UTF-8"?>
    <PremiereData Version="3">
      <TreeItem ObjectID="7"><TreeItemBase><Name>ZOOM 5%</Name></TreeItemBase></TreeItem>
      <FilterPreset ObjectID="9">
        <FilterMatchName>AE.ADBE Geometry2</FilterMatchName>
        <Component ObjectRef="10"/>
        <AnchorInPoint>914452519680000</AnchorInPoint>
        <AnchorOutPoint>915438101760000</AnchorOutPoint>
      </FilterPreset>
      <VideoFilterComponent ObjectID="10">
        <Component><DisplayName>Transform</DisplayName><Params><Param Index="0" ObjectRef="11"/><Param Index="3" ObjectRef="14"/><Param Index="4" ObjectRef="15"/><Param Index="5" ObjectRef="16"/><Param Index="6" ObjectRef="17"/></Params></Component>
        <MatchName>AE.ADBE Geometry2</MatchName>
      </VideoFilterComponent>
      <VideoComponentParam ObjectID="11">
        <Keyframes></Keyframes>
        <IsTimeVarying>false</IsTimeVarying>
        <StartKeyframe>-91445760000000000,100.,0,0,0,0,0,0</StartKeyframe>
        <CurrentValue>0.</CurrentValue>
        <ParameterID>1</ParameterID>
        <Name>Static Default</Name>
      </VideoComponentParam>
      <VideoComponentParam ObjectID="14">
        <Keyframes>914452519680000,100.,0,0;915438101760000,105.,0,0;</Keyframes>
        <IsTimeVarying>true</IsTimeVarying>
        <CurrentValue>105.</CurrentValue>
        <ParameterID>3</ParameterID>
        <Name>Scale Height</Name>
      </VideoComponentParam>
      <ArbVideoComponentParam ObjectID="15" ClassID="313e54d4-6903-49ad-b0bf-8262cdd10f4e">
        <ParameterControlType>9</ParameterControlType>
        <IsTimeVarying>false</IsTimeVarying>
        <Name>Hue vs Hue</Name>
        <StartKeyframeValue Encoding="base64" Checksum="3879288038">AwAAAAMAAAA+BCk3Fc2jPw==</StartKeyframeValue>
        <ParameterID>106</ParameterID>
      </ArbVideoComponentParam>
      <VideoComponentParam ObjectID="16" ClassID="0fde4e9f-f895-4ba3-b0fe-9a6feafda583">
        <ParameterControlType>5</ParameterControlType>
        <IsTimeVarying>false</IsTimeVarying>
        <StartKeyframe>-91445760000000000,18374809626483900416,0,0,0,0,0,0</StartKeyframe>
        <CurrentValue>0</CurrentValue>
        <ParameterID>114</ParameterID>
        <Name>Hue (vs Hue) Selector</Name>
      </VideoComponentParam>
      <VideoComponentParam ObjectID="17">
        <Keyframes></Keyframes>
        <IsTimeVarying>false</IsTimeVarying>
        <StartKeyframe>-91445760000000000,0.,0,0,0,0,0,0</StartKeyframe>
        <CurrentValue>115.</CurrentValue>
        <ParameterID>6</ParameterID>
        <Name>Static Edited Value</Name>
      </VideoComponentParam>
    </PremiereData>`;
  const result = context.PTB_PRESET_IMPORT.parsePrfpsetText(samplePreset, "Zoom5.prfpset");
  assert.equal(result.stack.sourceName, "ZOOM 5%");
  assert.equal(result.stack.components[0].matchName, "AE.ADBE Geometry2");
  assert.equal(result.stack.components[0].params[0].startValue.value, 100);
  assert.equal(result.stack.components[0].params[1].keyframes.length, 2);
  assert.equal(result.stack.components[0].params[1].keyframes[1].value.value, 105);
  assert.equal(result.stack.components[0].params[2].startValue.kind, "raw");
  assert.equal(result.stack.components[0].params[2].startValue.encoding, "base64");
  assert.equal(result.stack.components[0].params[3].startValue.kind, "raw");
  assert.equal(result.stack.components[0].params[3].startValue.encoding, "compact-start-keyframe");
  assert.equal(result.stack.components[0].params[4].startValue.value, 115);
  assert.ok(result.stack.sourceDurationSeconds > 3.8);

  const transitionPreset = `<?xml version="1.0" encoding="UTF-8"?>
    <PremiereData Version="3">
      <TreeItem ObjectID="5"><TreeItemBase><Name>Test Preset Pop</Name></TreeItemBase></TreeItem>
      <FilterPreset ObjectID="7">
        <AnchorInPoint>0</AnchorInPoint>
        <AnchorOutPoint>121927680000</AnchorOutPoint>
        <TransitionDuration>121927680000</TransitionDuration>
        <Component ObjectRef="8"/>
        <FilterMatchName>AE.AE_Impact_Pop</FilterMatchName>
      </FilterPreset>
      <VideoFilterComponent ObjectID="8">
        <VideoFilterType>2</VideoFilterType>
        <Component><DisplayName>Pop Motion</DisplayName><Params><Param Index="2" ObjectRef="9"/></Params></Component>
        <MatchName>AE.AE_Impact_Pop</MatchName>
      </VideoFilterComponent>
      <VideoComponentParam ObjectID="9">
        <Keyframes></Keyframes>
        <IsTimeVarying>false</IsTimeVarying>
        <StartKeyframe>-91445760000000000,42.,0,0,0,0,0,0</StartKeyframe>
        <CurrentValue>0.</CurrentValue>
        <ParameterID>12</ParameterID>
        <Name>Bounces</Name>
      </VideoComponentParam>
    </PremiereData>`;
  const transitionResult = context.PTB_PRESET_IMPORT.parseTransitionPrfpsetText(transitionPreset, "Preset Pop.prfpset");
  assert.equal(transitionResult.transitions.length, 1);
  assert.equal(transitionResult.transitions[0].name, "Test Preset Pop");
  assert.equal(transitionResult.transitions[0].displayName, "Pop Motion");
  assert.equal(transitionResult.transitions[0].matchName, "AE.AE_Impact_Pop");
  assert.ok(transitionResult.transitions[0].durationSeconds > 0.47);
  assert.ok(transitionResult.transitions[0].durationSeconds < 0.49);
  assert.equal(transitionResult.transitions[0].component.params.length, 1);
  assert.equal(transitionResult.transitions[0].component.params[0].startValue.value, 42);
}

prfpsetImporterSmokeTest();

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

  // Provide stable fake geometry so drag insertion tests can choose before/after slots.
  getBoundingClientRect() {
    const index = Number(this.dataset.collectionIndex) || 0;
    const left = index * 160;
    const top = 0;
    const width = 150;
    const height = 44;
    return { left, top, width, height, right: left + width, bottom: top + height };
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
    },
    querySelectorAll(selector) {
      const wanted = String(selector || "").split(",").map((item) => item.trim().replace(/^\./, "")).filter(Boolean);
      return findAllByPredicate(document.documentElement, (node) => {
        const tokens = node.className ? String(node.className).split(/\s+/) : [];
        return wanted.some((className) => tokens.includes(className));
      });
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
function renderSettingsHarness(initialConfig, options = {}) {
  const document = createFakeDocument();
  let savedConfig = null;
  let copiedText = "";
  const context = {
    console,
    document,
    setTimeout() {},
    fetch: options.fetch,
    require: options.require,
    window: null,
    PTB_VERSION: options.version || "0.4.3",
    PTB_SCHEMA: schema,
    PTB_STORAGE: {
      loadConfig: () => schema.normalizeConfig(initialConfig || schema.createDefaultConfig()),
      saveConfig: (config) => {
        savedConfig = schema.normalizeConfig(config);
        return savedConfig;
      },
      restoreConfigBackup: async () => null,
      exportJsonFile: async () => {},
      importJsonFile: async () => "",
      copyText: async (text) => {
        copiedText = text;
      }
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
  return { context, document, rootNode, getSavedConfig: () => savedConfig, getCopiedText: () => copiedText };
}

// Return only the root for tests that only inspect rendered text.
function renderSettingsSmokeTest() {
  const { rootNode } = renderSettingsHarness();
  return rootNode;
}

const settingsRoot = renderSettingsSmokeTest();
assert.ok(findByPredicate(settingsRoot, (node) => String(node.className).includes("ptb-settings-content")));
assert.equal(countClass(settingsRoot, "ptb-section"), 6);
assert.ok(settingsRoot.textContent.includes("Button Gallery"));
assert.ok(settingsRoot.textContent.includes("Button Editor"));
assert.equal(settingsRoot.textContent.includes("Audio Transition"), false);
assert.ok(settingsRoot.textContent.includes("Collections"));
assert.ok(settingsRoot.textContent.includes("Import / Export"));
assert.ok(settingsRoot.textContent.includes("Logs"));
assert.ok(settingsRoot.textContent.includes("Bar Controls"));
assert.ok(settingsRoot.textContent.includes("Button Display"));
assert.ok(settingsRoot.textContent.includes("Tools"));
assert.ok(settingsRoot.textContent.includes("Remove Effects"));
assert.ok(settingsRoot.textContent.includes("Multi Action"));
assert.ok(settingsRoot.textContent.includes("Effect Preset"));
assert.ok(settingsRoot.textContent.includes("Transform"));

// Verify a newer GitHub release renders a direct top-header download button.
async function updateDownloadButtonSmokeTest() {
  let openedUrl = "";
  const releaseUrl = "https://github.com/CyrilG93/PremiereToolBar/releases/download/v0.4.3/ToolBar-0.4.3-install.zip";
  const harness = renderSettingsHarness(null, {
    version: "0.3.99",
    require: (name) => {
      if (name !== "uxp") {
        throw new Error("Unexpected module: " + name);
      }
      return {
        shell: {
          openExternal: async (url, developerText) => {
            openedUrl = url;
            assert.ok(String(developerText || "").includes("Tool Bar"));
            return "";
          }
        }
      };
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v0.4.3",
        html_url: "https://github.com/CyrilG93/PremiereToolBar/releases/tag/v0.4.3",
        assets: [{
          name: "ToolBar-0.4.3-install.zip",
          browser_download_url: releaseUrl
        }]
      })
    })
  });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(harness.rootNode.textContent.includes("Download v0.4.3"));
  const updateButton = findByPredicate(harness.rootNode, (node) => String(node.textContent || "") === "Download v0.4.3");
  assert.ok(String(updateButton.className).includes("ptb-update-download"));
  await updateButton.onclick();
  assert.equal(openedUrl, releaseUrl);
}

await updateDownloadButtonSmokeTest();

// Verify collection drag/drop can reorder to the beginning and preview gaps between cards.
function collectionReorderSmokeTest() {
  const harness = renderSettingsHarness();
  const lists = findAllByPredicate(harness.rootNode, (node) => String(node.className || "").split(/\s+/).includes("ptb-collection-member-list"));
  const list = lists.find((node) => (node.children || []).filter((child) => String(child.className || "").includes("ptb-collection-member")).length >= 3);
  const members = (list.children || []).filter((node) => String(node.className || "").includes("ptb-collection-member"));
  const originalThirdId = schema.createDefaultConfig().collections[0].buttonIds[2];
  members[2].onmousedown({ target: members[2] });
  members[0].onmousemove({ target: members[0], clientX: 0, clientY: 20, stopPropagation() { this.stopped = true; } });
  list.onmousemove({ target: members[0], clientX: 0, clientY: 20 });
  assert.ok(String(members[0].className).includes("drop-before"));
  members[0].onmouseup({ target: members[0], stopPropagation() {} });
  assert.equal(harness.getSavedConfig().collections[0].buttonIds[0], originalThirdId);

  const secondHarness = renderSettingsHarness();
  const secondList = findAllByPredicate(secondHarness.rootNode, (node) => String(node.className || "").split(/\s+/).includes("ptb-collection-member-list"))[0];
  const secondMembers = (secondList.children || []).filter((node) => String(node.className || "").includes("ptb-collection-member"));
  secondMembers[2].onmousedown({ target: secondMembers[2] });
  secondList.onmousemove({ target: secondList, clientX: 155, clientY: 20 });
  assert.ok(String(secondMembers[0].className).includes("drop-after"));
}

collectionReorderSmokeTest();

// Verify Multi Action editing accepts gallery drops and in-list reordering.
function multiActionDropSmokeTest() {
  const multiButton = schema.createButton({
    id: "btn-multi-test",
    label: "Multi",
    actionType: "multi",
    multi: { buttonIds: ["btn-transform", "btn-crop"] }
  });
  const config = schema.createDefaultConfig();
  config.buttons.push(multiButton);
  config.collections[0].buttonIds.push(multiButton.id);
  config.activeButtonId = multiButton.id;
  const harness = renderSettingsHarness(config);
  const lists = findAllByPredicate(harness.rootNode, (node) => String(node.className || "").split(/\s+/).includes("ptb-collection-member-list"));
  const multiList = lists.find((node) => String(node.textContent || "").includes("Transform") && String(node.textContent || "").includes("Crop"));
  const members = (multiList.children || []).filter((node) => String(node.className || "").includes("ptb-multi-member"));
  members[1].onmousedown({ target: members[1] });
  members[0].onmousemove({ target: members[0], clientX: 0, clientY: 20, stopPropagation() {} });
  members[0].onmouseup({ target: members[0], stopPropagation() {} });
  assert.deepEqual(harness.getSavedConfig().buttons.find((button) => button.id === "btn-multi-test").multi.buttonIds.slice(0, 2), ["btn-crop", "btn-transform"]);

  const addHarness = renderSettingsHarness(config);
  const galleryCards = findAllByPredicate(addHarness.rootNode, (node) => String(node.className || "").split(/\s+/).includes("ptb-gallery-card"));
  const blurCard = galleryCards.find((node) => String(node.textContent || "").includes("Gaussian Blur"));
  const addLists = findAllByPredicate(addHarness.rootNode, (node) => String(node.className || "").split(/\s+/).includes("ptb-collection-member-list"));
  const addMultiList = addLists.find((node) => String(node.textContent || "").includes("Transform") && String(node.textContent || "").includes("Crop"));
  blurCard.onmousedown({ target: blurCard });
  addMultiList.onmousemove({ target: addMultiList, clientX: 400, clientY: 20 });
  addMultiList.onmouseup({ target: addMultiList });
  assert.ok(addHarness.getSavedConfig().buttons.find((button) => button.id === "btn-multi-test").multi.buttonIds.includes("btn-gaussian-blur"));
}

multiActionDropSmokeTest();

// Verify video effect buttons show the stable match name while audio effects keep display-name lookup.
function effectLookupDisplaySmokeTest() {
  const videoConfig = schema.createDefaultConfig();
  videoConfig.activeButtonId = "btn-transform";
  const videoHarness = renderSettingsHarness(videoConfig);
  const videoInputs = findAllByPredicate(videoHarness.rootNode, (node) => node.tagName === "INPUT");
  assert.ok(videoInputs.some((input) => input.value === "AE.ADBE Geometry2"));

  const audioButton = schema.createButton({
    id: "btn-audio-test",
    label: "Audio FX",
    actionType: "effect",
    mediaType: "audio",
    effect: { displayName: "Parametric Equalizer", matchName: "" }
  });
  const audioConfig = schema.normalizeConfig({
    schemaVersion: 2,
    activeCollectionId: "collection-audio-test",
    activeButtonId: "btn-audio-test",
    buttons: [audioButton],
    collections: [{ id: "collection-audio-test", name: "Audio", buttonIds: ["btn-audio-test"] }],
    bars: []
  });
  const audioHarness = renderSettingsHarness(audioConfig);
  const audioInputs = findAllByPredicate(audioHarness.rootNode, (node) => node.tagName === "INPUT");
  assert.ok(audioInputs.some((input) => input.value === "Parametric Equalizer"));
}

effectLookupDisplaySmokeTest();

// Verify preset capture preserves time-varying keyframes exposed by the Premiere API.
async function capturePresetSmokeTest() {
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const keyTimes = [
        { ticks: "254016000000", seconds: 1 },
        { ticks: "508032000000", seconds: 2 }
      ];
      const param = {
        displayName: "Amount",
        async getStartValue() {
          return { value: 10, getTemporalInterpolationMode: async () => 1 };
        },
        isTimeVarying: () => true,
        getKeyframeListAsTickTimes: async () => keyTimes,
        getKeyframePtr: async (time) => ({
          position: time,
          value: { value: 0 },
          getTemporalInterpolationMode: async () => 2
        }),
        getValueAtTime: async (time) => (time.seconds === 1 ? 25 : 50)
      };
      const staticParam = {
        displayName: "Static Scale",
        async getStartValue() {
          return { value: 0, getTemporalInterpolationMode: async () => 1 };
        },
        isTimeVarying: () => false,
        getKeyframeListAsTickTimes: async () => [],
        getValueAtTime: async (time) => (time.seconds === 100 ? 115 : 0)
      };
      const staticPointParam = {
        displayName: "Position",
        async getStartValue() {
          return { value: { x: 356, y: 538 }, getTemporalInterpolationMode: async () => 1 };
        },
        isTimeVarying: () => false,
        getKeyframeListAsTickTimes: async () => [],
        getValueAtTime: async () => ({ x: 960, y: 540 })
      };
      const arrayPointParam = {
        displayName: "Anchor Point",
        async getStartValue() {
          return { value: [936, 514], getTemporalInterpolationMode: async () => 1 };
        },
        isTimeVarying: () => false,
        getKeyframeListAsTickTimes: async () => [],
        getValueAtTime: async () => ({ 0: 960, 1: 540 })
      };
      const component = {
        getDisplayName: async () => "Custom Blur",
        getMatchName: async () => "AE.ADBE Custom Blur",
        getParamCount: () => 4,
        getParam: (index) => (index === 3 ? arrayPointParam : (index === 2 ? staticPointParam : (index === 1 ? staticParam : param)))
      };
      const item = {
        createAddVideoTransitionAction() {},
        getName: async () => "Preset Source Clip",
        getInPoint: async () => ({ seconds: 100, ticks: "100" }),
        getComponentChain: async () => ({
          getComponentCount: () => 1,
          getComponentAtIndex: () => component
        })
      };
      return {
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            })
          })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  const stack = await context.PTB_PREMIERE.captureSelectedStack();
  assert.equal(stack.sourceName, "Preset Source Clip");
  assert.equal(stack.components[0].params[0].keyframes.length, 2);
  assert.equal(stack.components[0].params[0].keyframes[0].value.value, 25);
  assert.equal(stack.components[0].params[0].keyframes[1].ticks, "508032000000");
  assert.equal(stack.components[0].params[1].startValue.value, 115);
  assert.equal(stack.components[0].params[2].startValue.x, 356);
  assert.equal(stack.components[0].params[2].startValue.y, 538);
  assert.equal(stack.components[0].params[3].startValue.x, 936);
  assert.equal(stack.components[0].params[3].startValue.y, 514);
}

// Traverse a fake DOM tree and return every matching node.
function findAllByPredicate(node, predicate, output = []) {
  if (!node) {
    return output;
  }
  if (predicate(node)) {
    output.push(node);
  }
  for (const child of node.children || []) {
    findAllByPredicate(child, predicate, output);
  }
  return output;
}

await capturePresetSmokeTest();

// Verify preset replay anchors captured keyframes to the selected target clip.
async function applyPresetTimingSmokeTest() {
  const runs = [];
  let transactionCount = 0;
  // Record transaction boundaries so keyframe setup stays before keyframe creation.
  const transactionActionTypes = [];
  let keyframeSeconds = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const param = {
        createSetTimeVaryingAction: () => ({ type: "timeVarying" }),
        createKeyframe: (value) => ({ value }),
        createAddKeyframeAction(keyframe) {
          return { type: "keyframe", keyframe };
        },
        createSetValueAction: (keyframe) => ({ type: "value", keyframe })
      };
      const component = {
        getParamCount: () => 1,
        getParam: () => param
      };
      const item = {
        createAddVideoTransitionAction() {},
        getStartTime: async () => ({ seconds: 10, ticks: "10" }),
        getEndTime: async () => ({ seconds: 20, ticks: "20" }),
        getInPoint: async () => ({ seconds: 100, ticks: "100" }),
        getOutPoint: async () => ({ seconds: 110, ticks: "110" }),
        getComponentChain: async () => ({
          getComponentCount: () => 0,
          createInsertComponentAction: () => ({ type: "insert" })
        })
      };
      return {
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            }),
            executeTransaction: (handler) => {
              transactionCount += 1;
              const actionTypes = [];
              handler({
                addAction(action) {
                  if (action && action.type) {
                    actionTypes.push(action.type);
                  }
                  if (action && action.type === "keyframe") {
                    keyframeSeconds.push(action.keyframe.position.seconds);
                  }
                }
              });
              transactionActionTypes.push(actionTypes);
              return true;
            }
          })
        },
        VideoFilterFactory: {
          createComponent: async () => component
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  async function applyTimingMode(mode, sourceDuration, keyframes) {
    keyframeSeconds = [];
    await context.PTB_PREMIERE.applyButton(schema.createButton({
      label: "Preset Test",
      actionType: "preset",
      preset: { keyframeTiming: mode },
      stack: {
        sourceStartSeconds: 0,
        sourceEndSeconds: sourceDuration,
        sourceDurationSeconds: sourceDuration,
        components: [{
          mediaType: "video",
          matchName: "AE.ADBE Mosaic",
          displayName: "Mosaic",
          params: [{
            index: 0,
            displayName: "Amount",
            timeVarying: true,
            startValue: { kind: "primitive", value: 0 },
            keyframes
          }]
        }]
      }
    }));
    runs.push({ mode, keyframeSeconds: keyframeSeconds.slice() });
  }
  await applyTimingMode("anchorIn", 4, [{ seconds: 2, relativeSeconds: 2, value: { kind: "primitive", value: 50 } }]);
  await applyTimingMode("anchorIn", 20, [
    { seconds: 0, relativeSeconds: 0, value: { kind: "primitive", value: 10 } },
    { seconds: 20, relativeSeconds: 20, value: { kind: "primitive", value: 20 } }
  ]);
  await applyTimingMode("anchorOut", 4, [
    { seconds: 0, relativeSeconds: 0, value: { kind: "primitive", value: 10 } },
    { seconds: 2, relativeSeconds: 2, value: { kind: "primitive", value: 50 } }
  ]);
  await applyTimingMode("absolute", 4, [{ seconds: 2, relativeSeconds: 2, ticks: "914452519680000", value: { kind: "primitive", value: 50 } }]);
  assert.equal(transactionCount, 12);
  assert.deepEqual(transactionActionTypes.slice(0, 3), [["insert"], ["timeVarying"], ["keyframe"]]);
  assert.deepEqual(runs[0].keyframeSeconds, [102]);
  assert.deepEqual(runs[1].keyframeSeconds, [100, 110]);
  assert.deepEqual(runs[2].keyframeSeconds, [108, 110]);
  assert.deepEqual(runs[3].keyframeSeconds, [102]);
}

await applyPresetTimingSmokeTest();

// Verify preset replay writes real PointF coordinates for static Transform Position and Anchor Point values.
async function applyPresetPointValueSmokeTest() {
  let pointValue = null;
  const transactions = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      function PointF() {
        this.x = 0;
        this.y = 0;
      }
      const pointParam = {
        createKeyframe(value) {
          return { value };
        },
        createSetValueAction(keyframe) {
          pointValue = keyframe.value;
          return { type: "pointValue", keyframe };
        }
      };
      const scaleParam = {
        createKeyframe(value) {
          return { value };
        },
        createSetValueAction(keyframe) {
          return { type: "scaleValue", keyframe };
        }
      };
      const component = {
        getParamCount: () => 2,
        getParam: (index) => (index === 0 ? pointParam : scaleParam)
      };
      const item = {
        createAddVideoTransitionAction() {},
        getComponentChain: async () => ({
          getComponentCount: () => 0,
          getComponentAtIndex: () => component,
          createInsertComponentAction: () => ({ type: "insert" })
        })
      };
      return {
        PointF,
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            }),
            executeTransaction: (handler) => {
              const actionTypes = [];
              handler({
                addAction(action) {
                  actionTypes.push(action && action.type ? action.type : "unknown");
                }
              });
              transactions.push(actionTypes);
              return true;
            }
          })
        },
        VideoFilterFactory: {
          createComponent: async () => component
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({
    label: "Point Preset",
    actionType: "preset",
    stack: {
      components: [{
        mediaType: "video",
        matchName: "AE.ADBE Geometry2",
        displayName: "Transform",
        params: [{
          index: 0,
          displayName: "Anchor Point",
          timeVarying: false,
          startValue: { kind: "point", x: 936, y: 514 },
          keyframes: []
        }, {
          index: 1,
          displayName: "Scale",
          timeVarying: false,
          startValue: { kind: "primitive", value: 105 },
          keyframes: []
        }]
      }]
    }
  }));
  assert.deepEqual(transactions, [["insert"], ["scaleValue"], ["pointValue"]]);
  assert.equal(pointValue.x, 936);
  assert.equal(pointValue.y, 514);
}

await applyPresetPointValueSmokeTest();

// Verify effect buttons target Premiere's reverse UI order so they appear at the bottom.
async function applyEffectOrderSmokeTest() {
  let appended = false;
  let insertedIndex = -1;
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const chain = {
        getComponentCount: () => 4,
        createInsertComponentAction(component, index) {
          insertedIndex = index;
          return { component, index };
        },
        createAppendComponentAction(component) {
          appended = true;
          return { component };
        }
      };
      const item = {
        createAddVideoTransitionAction() {},
        getComponentChain: async () => chain
      };
      return {
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        VideoFilterFactory: {
          createComponent: async () => ({})
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({ actionType: "effect", effect: { matchName: "AE.ADBE Mosaic", displayName: "Mosaic" } }));
  assert.equal(appended, false);
  assert.equal(insertedIndex, 0);
}

await applyEffectOrderSmokeTest();

// Verify Script buttons store JSX and call a compatible host runner only when one exists.
async function applyScriptButtonSmokeTest() {
  let executedSource = "";
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    PTB_LOGGER: { info() {}, warn() {}, error() {} },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      return {
        evalScript(source) {
          executedSource = source;
          return "ok";
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  const result = await context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "script",
    script: { name: "Rename Sequence", source: "app.project.activeSequence.name = 'x';" }
  }));
  assert.equal(result, "ok");
  assert.equal(executedSource, "app.project.activeSequence.name = 'x';");
}

await applyScriptButtonSmokeTest();

async function unsupportedScriptButtonSmokeTest() {
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    PTB_LOGGER: { info() {}, warn() {}, error() {} },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      return {};
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await assert.rejects(() => context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "script",
    script: { name: "Sort Project", source: "organizeProject();" }
  })), /scriptUnsupported/);
}

await unsupportedScriptButtonSmokeTest();

// Verify transitions can target both clip edges and nudge the timeline refresh.
async function applyTransitionSmokeTest() {
  const appliedStarts = [];
  let playerPositionSet = false;
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const item = {
        createAddVideoTransitionAction(transition, options) {
          appliedStarts.push(options.applyToStart);
          return { transition, options };
        }
      };
      return {
        AddTransitionOptions: function AddTransitionOptions() {
          this.setApplyToStart = (value) => { this.applyToStart = value; return this; };
          this.setForceSingleSided = (value) => { this.forceSingleSided = value; return this; };
          this.setTransitionAlignment = (value) => { this.transitionAlignment = value; return this; };
          this.setDuration = (value) => { this.duration = value; return this; };
        },
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getPlayerPosition: () => ({ ticks: "0" }),
              setPlayerPosition: () => { playerPositionSet = true; },
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        TransitionFactory: {
          createVideoTransition: async (matchName) => ({ matchName })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "transition",
    transition: { matchName: "VideoTransition", applyTo: "both", durationSeconds: 0.5 }
  }));
  assert.deepEqual(appliedStarts, [true, false]);
  assert.equal(playerPositionSet, true);
}

await applyTransitionSmokeTest();

// Verify imported transition presets replay exposed transition parameters after creation.
async function applyTransitionPresetParameterSmokeTest() {
  let setValueActions = 0;
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const param = {
        createKeyframe(value) {
          return { value };
        },
        createSetValueAction(keyframe) {
          setValueActions += 1;
          return { kind: "setValue", keyframe };
        }
      };
      const component = {
        getParamCount: () => 1,
        getParam: () => param,
        getMatchName: async () => "AE.AE_Impact_Pop",
        getDisplayName: async () => "Pop Motion"
      };
      const transitionItem = {
        getName: async () => "Pop Motion",
        getMatchName: async () => "AE.AE_Impact_Pop",
        getType: async () => 2,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 0, ticks: "0" }),
        getEndTime: async () => ({ seconds: 0.5, ticks: "127008000000" }),
        getInPoint: async () => ({ seconds: 0, ticks: "0" }),
        getOutPoint: async () => ({ seconds: 0.5, ticks: "127008000000" }),
        getComponentChain: async () => ({
          getComponentCount: () => 1,
          getComponentAtIndex: () => component
        })
      };
      const selectedClip = {
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 0, ticks: "0" }),
        getEndTime: async () => ({ seconds: 10, ticks: "2540160000000" }),
        getInPoint: async () => ({ seconds: 0, ticks: "0" }),
        getOutPoint: async () => ({ seconds: 10, ticks: "2540160000000" }),
        createAddVideoTransitionAction(transition, options) {
          return { transition, options };
        }
      };
      return {
        AddTransitionOptions: function AddTransitionOptions() {
          this.setApplyToStart = (value) => { this.applyToStart = value; return this; };
          this.setForceSingleSided = (value) => { this.forceSingleSided = value; return this; };
          this.setTransitionAlignment = (value) => { this.transitionAlignment = value; return this; };
          this.setDuration = (value) => { this.duration = value; return this; };
        },
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getPlayerPosition: () => ({ ticks: "0" }),
              setPlayerPosition: () => {},
              getSelection: async () => ({
                getTrackItems: async () => [selectedClip]
              }),
              getVideoTrackCount: async () => 1,
              getVideoTrack: async () => ({
                getTrackItems: async (type) => type === 2 ? [transitionItem] : [selectedClip]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        TransitionFactory: {
          createVideoTransition: async (matchName) => ({ matchName })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({
    label: "Imported Pop",
    actionType: "transitionPreset",
    transition: { matchName: "AE.AE_Impact_Pop", applyTo: "end", durationSeconds: 0.5 },
    stack: {
      sourceDurationSeconds: 0.5,
      components: [{
        mediaType: "video",
        matchName: "AE.AE_Impact_Pop",
        displayName: "Pop Motion",
        params: [{
          index: 0,
          displayName: "Bounces",
          timeVarying: false,
          startValue: { kind: "primitive", value: 42 },
          keyframes: []
        }]
      }]
    }
  }));
  assert.equal(setValueActions, 1);
}

await applyTransitionPresetParameterSmokeTest();

// Verify a selected edit point applies the transition at that edit regardless of the button start/end mode.
async function applyEditPointTransitionSmokeTest() {
  const appliedStarts = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const leftClip = {
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 5, ticks: "5" }),
        getEndTime: async () => ({ seconds: 10, ticks: "10" }),
        createAddVideoTransitionAction(transition, options) {
          appliedStarts.push(options.applyToStart);
          return { transition, options, clip: "left" };
        }
      };
      const rightClip = {
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 10, ticks: "10" }),
        getEndTime: async () => ({ seconds: 15, ticks: "15" }),
        createAddVideoTransitionAction(transition, options) {
          appliedStarts.push(options.applyToStart);
          return { transition, options, clip: "right" };
        }
      };
      const editPoint = {
        getType: async () => 2,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 10, ticks: "10" }),
        getEndTime: async () => ({ seconds: 10.5, ticks: "10.5" })
      };
      return {
        Constants: {
          TrackItemType: {
            CLIP: 1,
            TRANSITION: 2
          }
        },
        AddTransitionOptions: function AddTransitionOptions() {
          this.setApplyToStart = (value) => { this.applyToStart = value; return this; };
          this.setDuration = (value) => { this.duration = value; return this; };
        },
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [editPoint]
              }),
              getVideoTrack: async () => ({
                getTrackItems: async () => [leftClip, rightClip]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        TransitionFactory: {
          createVideoTransition: async (matchName) => ({ matchName })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "transition",
    transition: { matchName: "VideoTransition", applyTo: "end", durationSeconds: 0.5 }
  }));
  assert.deepEqual(appliedStarts, [true]);
}

await applyEditPointTransitionSmokeTest();

// Verify two selected adjacent video clips receive one centered transition at their shared cut only.
async function applyAdjacentSelectedClipsTransitionSmokeTest() {
  const applied = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const leftClip = {
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 2, ticks: "2" }),
        getEndTime: async () => ({ seconds: 5, ticks: "5" }),
        createAddVideoTransitionAction(transition, options) {
          applied.push({ clip: "left", applyToStart: options.applyToStart, alignment: options.transitionAlignment });
          return { transition, options, clip: "left" };
        }
      };
      const rightClip = {
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ seconds: 5, ticks: "5" }),
        getEndTime: async () => ({ seconds: 8, ticks: "8" }),
        createAddVideoTransitionAction(transition, options) {
          applied.push({
            clip: "right",
            applyToStart: options.applyToStart,
            forceSingleSided: options.forceSingleSided,
            alignment: options.transitionAlignment
          });
          return { transition, options, clip: "right" };
        }
      };
      return {
        Constants: {
          TrackItemType: {
            CLIP: 1,
            TRANSITION: 2
          }
        },
        AddTransitionOptions: function AddTransitionOptions() {
          this.setApplyToStart = (value) => { this.applyToStart = value; return this; };
          this.setForceSingleSided = (value) => { this.forceSingleSided = value; return this; };
          this.setTransitionAlignment = (value) => { this.transitionAlignment = value; return this; };
          this.setDuration = (value) => { this.duration = value; return this; };
        },
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [leftClip, rightClip]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        TransitionFactory: {
          createVideoTransition: async (matchName) => ({ matchName })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "transition",
    transition: { matchName: "VideoTransition", applyTo: "both", durationSeconds: 0.5 }
  }));
  assert.deepEqual(applied, [{ clip: "right", applyToStart: true, forceSingleSided: false, alignment: 0.5 }]);
}

await applyAdjacentSelectedClipsTransitionSmokeTest();

// Verify audio transitions stay disabled while the Premiere UXP API is not reliable enough.
async function disabledAudioTransitionSmokeTest() {
  const appliedStarts = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const item = {
        createAddAudioTransitionAction(transition, options) {
          appliedStarts.push(options.applyToStart);
          return { transition, options };
        },
        getComponentChain: async () => ({})
      };
      return {
        AddTransitionOptions: function AddTransitionOptions() {
          this.setApplyToStart = (value) => { this.applyToStart = value; return this; };
          this.setDuration = (value) => { this.duration = value; return this; };
        },
        TickTime: {
          createWithSeconds: (seconds) => ({ seconds })
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [item]
              })
            }),
            executeTransaction: (handler) => {
              handler({ addAction() {} });
              return true;
            }
          })
        },
        TransitionFactory: {
          getAudioTransitionMatchNames: async () => ["Constant Gain"],
          createAudioTransition: async (matchName) => ({ matchName })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  await assert.rejects(() => context.PTB_PREMIERE.applyButton(schema.createButton({
    actionType: "audioTransition",
    transition: { matchName: "Constant Gain", applyTo: "both", durationSeconds: 0.5 }
  })), /Audio transitions are disabled/);
  assert.deepEqual(appliedStarts, []);
}

await disabledAudioTransitionSmokeTest();

// Verify selection diagnostics report component and nearby transition match names.
async function inspectSelectionMatchNamesSmokeTest() {
  const logs = [];
  const context = {
    console,
    window: null,
    PTB_SCHEMA: schema,
    PTB_I18N: { t: (key) => key },
    PTB_LOGGER: {
      info(message, details) {
        logs.push({ level: "info", message, details });
      },
      warn(message, details) {
        logs.push({ level: "warn", message, details });
      },
      error(message, details) {
        logs.push({ level: "error", message, details });
      }
    },
    require(name) {
      if (name !== "premierepro") {
        throw new Error("Unexpected module: " + name);
      }
      const component = {
        getDisplayName: async () => "Gaussian Blur",
        getMatchName: async () => "AE.ADBE Gaussian Blur 2",
        getParamCount: () => 1
      };
      const clipItem = {
        createAddVideoTransitionAction() {},
        getName: async () => "Clip 1",
        getMatchName: async () => "Clip.Match",
        getType: async () => 1,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ ticks: "0", seconds: 10 }),
        getEndTime: async () => ({ ticks: "1", seconds: 20 }),
        getComponentChain: async () => ({
          getComponentCount: () => 1,
          getComponentAtIndex: () => component
        })
      };
      const transitionItem = {
        getName: async () => "Dip to Black",
        getMatchName: async () => "AE.ADBE Dip To Black",
        getType: async () => 2,
        getTrackIndex: async () => 0,
        getStartTime: async () => ({ ticks: "2", seconds: 19.5 }),
        getEndTime: async () => ({ ticks: "3", seconds: 20.5 })
      };
      return {
        Constants: {
          TrackItemType: {
            TRANSITION: 2
          }
        },
        Project: {
          getActiveProject: async () => ({
            getActiveSequence: async () => ({
              getSelection: async () => ({
                getTrackItems: async () => [clipItem]
              }),
              getVideoTrackCount: async () => 1,
              getAudioTrackCount: async () => 0,
              getVideoTrack: async () => ({
                getTrackItems: async () => [transitionItem]
              }),
              getAudioTrack: async () => ({
                getTrackItems: async () => []
              })
            })
          })
        }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "src/premiereBridge.js"), "utf8"), context, { filename: "src/premiereBridge.js" });
  const result = await context.PTB_PREMIERE.inspectSelectionMatchNames();
  assert.equal(result.effects[0].matchName, "AE.ADBE Gaussian Blur 2");
  assert.equal(result.transitions[0].matchName, "AE.ADBE Dip To Black");
  assert.equal(result.transitionScan.video.transitionCount, 1);
  assert.ok(logs.some((entry) => entry.message === "Selection match-name inspection."));
}

await inspectSelectionMatchNamesSmokeTest();

// Report success for CI and local verification.
console.log("ptb:test passed");
