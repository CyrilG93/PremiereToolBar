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
assert.equal(defaultConfig.collections[0].buttonIds.length, 9);
assert.ok(defaultConfig.collections[0].buttonIds.includes("btn-settings"));
assert.ok(defaultConfig.buttons.every((item) => item.displayMode === "both"));
assert.ok(defaultConfig.buttons.some((button) => button.effect && button.effect.displayName === "Ultra Key"));
assert.ok(defaultConfig.buttons.some((button) => button.actionType === "transition" && button.transition.matchName === "AE.AE_Impact_Pop"));

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
assert.equal(replacedCollection.buttonIds.length, 9);
assert.equal(schema.getCollection(importedConfig, "collection-empty-2").buttonIds.length, 1);

// Verify captured stack snapshots survive normalization.
const button = schema.createButton({
  actionType: "preset",
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
function renderSettingsHarness(initialConfig) {
  const document = createFakeDocument();
  let savedConfig = null;
  const context = {
    console,
    document,
    setTimeout() {},
    window: null,
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
  return { context, document, rootNode, getSavedConfig: () => savedConfig };
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
assert.ok(settingsRoot.textContent.includes("Preset"));
assert.ok(settingsRoot.textContent.includes("Transform"));

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
      const component = {
        getDisplayName: async () => "Custom Blur",
        getMatchName: async () => "AE.ADBE Custom Blur",
        getParamCount: () => 1,
        getParam: () => param
      };
      const item = {
        createAddVideoTransitionAction() {},
        getName: async () => "Preset Source Clip",
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
