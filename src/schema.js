(function (root, factory) {
  "use strict";

  // Support both UXP browser globals and Node-based verification scripts.
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PTB_SCHEMA = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // Store schema version separately from plugin version for future migrations.
  const CONFIG_VERSION = 2;
  const MAX_BARS = 4;
  const BAR_IDS = ["bar-1", "bar-2", "bar-3", "bar-4"];
  const ACTION_TYPES = ["settings", "effect", "transition", "stack"];
  const MEDIA_TYPES = ["video", "audio"];
  const DISPLAY_MODES = ["icon", "text", "both"];

  // Create stable ids without relying on external dependencies.
  function createId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 10);
    const timePart = Date.now().toString(36);
    return (prefix || "id") + "-" + timePart + "-" + randomPart;
  }

  // Clone plain configuration data so UI edits never mutate import payloads by reference.
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Return a string with a fallback when imported data is missing or invalid.
  function safeString(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  // Clamp numeric values used by transitions.
  function safeNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  // Build a normalized toolbar button.
  function createButton(overrides) {
    const input = overrides || {};
    const actionType = ACTION_TYPES.includes(input.actionType) ? input.actionType : "effect";
    const mediaType = MEDIA_TYPES.includes(input.mediaType) ? input.mediaType : "video";
    const button = {
      id: safeString(input.id, createId("button")),
      label: safeString(input.label, actionType === "settings" ? "Settings" : "Button"),
      actionType,
      mediaType,
      icon: safeString(input.icon, actionType === "settings" ? "camera-addon-identification" : "aperture"),
      iconColor: safeString(input.iconColor, actionType === "settings" ? "#d7dee8" : "#8fd6ff"),
      accentColor: safeString(input.accentColor, actionType === "settings" ? "#313840" : "#1f2937"),
      displayMode: DISPLAY_MODES.includes(input.displayMode) ? input.displayMode : "icon",
      textOverride: safeString(input.textOverride, safeString(input.label, actionType === "settings" ? "Settings" : "Button")),
      effect: {
        matchName: typeof (input.effect && input.effect.matchName) === "string" ? input.effect.matchName.trim() : safeString(input.effectMatchName, ""),
        displayName: safeString(input.effect && input.effect.displayName, input.effectDisplayName || "Mosaic")
      },
      transition: {
        matchName: safeString(input.transition && input.transition.matchName, input.transitionMatchName || ""),
        applyTo: input.transition && input.transition.applyTo === "start" ? "start" : "end",
        durationSeconds: safeNumber(input.transition && input.transition.durationSeconds, 1, 0.01, 30),
        forceSingleSided: Boolean(input.transition && input.transition.forceSingleSided),
        alignment: safeNumber(input.transition && input.transition.alignment, 0, -2, 2)
      },
      stack: normalizeStack(input.stack)
    };
    if (button.effect.matchName === "PR.ADBE Solarize") {
      // Migrate the old beta starter effect to a Premiere effect match name that is widely exposed.
      button.effect.matchName = "AE.ADBE Gaussian Blur 2";
      button.effect.displayName = "Gaussian Blur";
      if (button.label === "Solarize") {
        button.label = "Gaussian Blur";
      }
      if (button.icon === "sun") {
        button.icon = "blur";
      }
    }
    return button;
  }

  // Normalize a captured effect stack payload.
  function normalizeStack(stack) {
    const input = stack && typeof stack === "object" ? stack : {};
    const components = Array.isArray(input.components) ? input.components : [];
    return {
      sourceName: safeString(input.sourceName, ""),
      capturedAt: safeString(input.capturedAt, ""),
      components: components.map(normalizeComponentSnapshot).filter(Boolean)
    };
  }

  // Normalize one captured component snapshot.
  function normalizeComponentSnapshot(component) {
    if (!component || typeof component !== "object") {
      return null;
    }
    const mediaType = MEDIA_TYPES.includes(component.mediaType) ? component.mediaType : "video";
    const matchName = safeString(component.matchName, "");
    const displayName = safeString(component.displayName, matchName || "Component");
    if (!matchName && mediaType === "video") {
      return null;
    }
    const params = Array.isArray(component.params) ? component.params : [];
    return {
      mediaType,
      matchName,
      displayName,
      params: params.map(normalizeParamSnapshot).filter(Boolean)
    };
  }

  // Normalize one parameter snapshot.
  function normalizeParamSnapshot(param) {
    if (!param || typeof param !== "object") {
      return null;
    }
    return {
      index: safeNumber(param.index, 0, 0, 500),
      displayName: safeString(param.displayName, "Param"),
      timeVarying: Boolean(param.timeVarying),
      startValue: normalizeValueSnapshot(param.startValue),
      startTemporalInterpolation: typeof param.startTemporalInterpolation === "number" ? param.startTemporalInterpolation : null,
      keyframes: Array.isArray(param.keyframes) ? param.keyframes.map(normalizeKeyframeSnapshot).filter(Boolean) : []
    };
  }

  // Normalize a parameter value snapshot.
  function normalizeValueSnapshot(value) {
    if (!value || typeof value !== "object") {
      return { kind: "primitive", value };
    }
    if (value.kind === "point") {
      return { kind: "point", x: Number(value.x) || 0, y: Number(value.y) || 0 };
    }
    if (value.kind === "color") {
      return {
        kind: "color",
        red: Number(value.red) || 0,
        green: Number(value.green) || 0,
        blue: Number(value.blue) || 0,
        alpha: typeof value.alpha === "number" ? value.alpha : 1
      };
    }
    return { kind: "primitive", value: value.value };
  }

  // Normalize a captured keyframe snapshot.
  function normalizeKeyframeSnapshot(keyframe) {
    if (!keyframe || typeof keyframe !== "object") {
      return null;
    }
    return {
      ticks: safeString(keyframe.ticks, "0"),
      seconds: safeNumber(keyframe.seconds, 0, -86400, 86400),
      temporalInterpolation: typeof keyframe.temporalInterpolation === "number" ? keyframe.temporalInterpolation : null,
      value: normalizeValueSnapshot(keyframe.value)
    };
  }

  // Build a normalized collection.
  function createCollection(overrides) {
    const input = overrides || {};
    const buttonIds = Array.isArray(input.buttonIds) ? input.buttonIds : [];
    return {
      id: safeString(input.id, createId("collection")),
      name: safeString(input.name, "New Collection"),
      buttonIds: buttonIds.filter((id, index, list) => typeof id === "string" && list.indexOf(id) === index)
    };
  }

  // Build a normalized bar assignment.
  function createBar(overrides, index, fallbackCollectionId) {
    const input = overrides || {};
    const fallbackId = BAR_IDS[index] || "bar-" + (index + 1);
    return {
      id: BAR_IDS.includes(input.id) ? input.id : fallbackId,
      collectionId: safeString(input.collectionId, fallbackCollectionId || ""),
      enabled: input.enabled !== false,
      orientation: ["auto", "horizontal", "vertical"].includes(input.orientation) ? input.orientation : "auto"
    };
  }

  // Define starter buttons using stable ids so collections can reference them.
  function createPresetButtons() {
    return [
      createButton({
        id: "btn-settings",
        label: "Settings",
        actionType: "settings",
        icon: "camera-addon-identification",
        iconColor: "#d7dee8",
        accentColor: "#3a4149",
        displayMode: "icon",
        textOverride: "SET"
      }),
      createButton({
        id: "btn-transform",
        label: "Transform",
        actionType: "effect",
        icon: "slr-large-lens",
        iconColor: "#9bd3ff",
        accentColor: "#263747",
        displayMode: "icon",
        textOverride: "Transform",
        effect: { matchName: "AE.ADBE Transform", displayName: "Transform" }
      }),
      createButton({
        id: "btn-crop",
        label: "Crop",
        actionType: "effect",
        icon: "viewfinder",
        iconColor: "#9fe3c1",
        accentColor: "#263d35",
        displayMode: "icon",
        textOverride: "Crop",
        effect: { matchName: "AE.ADBE Crop", displayName: "Crop" }
      }),
      createButton({
        id: "btn-gaussian-blur",
        label: "Gaussian Blur",
        actionType: "effect",
        icon: "lens",
        iconColor: "#ffd166",
        accentColor: "#403724",
        displayMode: "icon",
        textOverride: "Gaussian Blur",
        effect: { matchName: "AE.ADBE Gaussian Blur 2", displayName: "Gaussian Blur" }
      }),
      createButton({
        id: "btn-drop-shadow",
        label: "Drop Shadow",
        actionType: "effect",
        icon: "softbox",
        iconColor: "#d7b6ff",
        accentColor: "#342a45",
        displayMode: "icon",
        textOverride: "Drop Shadow",
        effect: { matchName: "AE.ADBE Drop Shadow", displayName: "Drop Shadow" }
      }),
      createButton({
        id: "btn-flip-horizontal",
        label: "Flip Horizontal",
        actionType: "effect",
        icon: "wire",
        iconColor: "#ffb986",
        accentColor: "#423025",
        displayMode: "icon",
        textOverride: "Flip Horizontal",
        effect: { matchName: "AE.ADBE Horizontal Flip", displayName: "Horizontal Flip" }
      }),
      createButton({
        id: "btn-flip-vertical",
        label: "Flip Vertical",
        actionType: "effect",
        icon: "wire",
        iconColor: "#ff9aa2",
        accentColor: "#422a2f",
        displayMode: "icon",
        textOverride: "Flip Vertical",
        effect: { matchName: "AE.ADBE Vertical Flip", displayName: "Vertical Flip" }
      }),
      createButton({
        id: "btn-ultra-key",
        label: "Ultra Key",
        actionType: "effect",
        icon: "camera-addon",
        iconColor: "#9dffcf",
        accentColor: "#263b31",
        displayMode: "icon",
        textOverride: "Ultra Key",
        effect: { matchName: "AE.ADBE Ultra Key", displayName: "Ultra Key" }
      })
    ];
  }

  // Create the first-run configuration with a base collection.
  function createDefaultConfig() {
    const buttons = createPresetButtons();
    const collections = [
      createCollection({
        id: "collection-base-effects",
        name: "Base Effects",
        buttonIds: buttons.map((button) => button.id)
      }),
      createCollection({ id: "collection-empty-2", name: "Collection 2", buttonIds: [] }),
      createCollection({ id: "collection-empty-3", name: "Collection 3", buttonIds: [] }),
      createCollection({ id: "collection-empty-4", name: "Collection 4", buttonIds: [] })
    ];
    return {
      schemaVersion: CONFIG_VERSION,
      activeCollectionId: "collection-base-effects",
      activeButtonId: buttons[0].id,
      buttons,
      collections,
      bars: BAR_IDS.map((barId, index) => createBar(
        { id: barId, collectionId: collections[index] ? collections[index].id : collections[0].id },
        index,
        collections[0].id
      ))
    };
  }

  // Normalize a list of buttons and keep ids unique.
  function normalizeButtons(inputButtons) {
    const source = Array.isArray(inputButtons) ? inputButtons : [];
    const usedIds = [];
    return source.map((button) => {
      const normalized = createButton(button);
      if (usedIds.includes(normalized.id)) {
        normalized.id = createId("button");
      }
      usedIds.push(normalized.id);
      return normalized;
    });
  }

  // Normalize collections and remove references to missing buttons.
  function normalizeCollections(inputCollections, validButtonIds) {
    const source = Array.isArray(inputCollections) ? inputCollections : [];
    const usedIds = [];
    const collections = source.map((collection) => {
      const normalized = createCollection(collection);
      if (usedIds.includes(normalized.id)) {
        normalized.id = createId("collection");
      }
      usedIds.push(normalized.id);
      normalized.buttonIds = normalized.buttonIds.filter((buttonId) => validButtonIds.includes(buttonId));
      return normalized;
    });
    if (!collections.length) {
      collections.push(createCollection({ id: "collection-default", name: "Default", buttonIds: validButtonIds.slice(0, 1) }));
    }
    return collections;
  }

  // Convert legacy bar-based configs into collection-based configs.
  function migrateLegacyConfig(source) {
    if (!source || !Array.isArray(source.bars)) {
      return createDefaultConfig();
    }
    const defaultConfig = createDefaultConfig();
    const buttons = clone(defaultConfig.buttons);
    const collections = clone(defaultConfig.collections);
    source.bars.forEach((bar, index) => {
      if (!bar || !Array.isArray(bar.buttons) || !bar.buttons.length) {
        return;
      }
      const buttonIds = [];
      bar.buttons.forEach((button) => {
        const normalized = createButton(Object.assign({}, button, { id: createId("button") }));
        buttons.push(normalized);
        buttonIds.push(normalized.id);
      });
      collections.push(createCollection({
        id: "legacy-collection-" + (index + 1),
        name: safeString(bar.name, "Imported Bar " + (index + 1)),
        buttonIds
      }));
    });
    return normalizeConfig({
      schemaVersion: CONFIG_VERSION,
      activeCollectionId: defaultConfig.activeCollectionId,
      activeButtonId: defaultConfig.activeButtonId,
      buttons,
      collections,
      bars: defaultConfig.bars
    });
  }

  // Normalize a complete configuration object and guarantee four dockable bars.
  function normalizeConfig(input) {
    if (!input || input.schemaVersion !== CONFIG_VERSION || !Array.isArray(input.collections) || !Array.isArray(input.buttons)) {
      return migrateLegacyConfig(input);
    }
    const buttons = normalizeButtons(input.buttons);
    const validButtonIds = buttons.map((button) => button.id);
    const collections = normalizeCollections(input.collections, validButtonIds);
    const validCollectionIds = collections.map((collection) => collection.id);
    const fallbackCollectionId = collections[0].id;
    const bars = BAR_IDS.map((barId, index) => {
      const sourceBar = Array.isArray(input.bars) ? input.bars.find((bar) => bar && bar.id === barId) || input.bars[index] : null;
      const bar = createBar(sourceBar, index, fallbackCollectionId);
      if (!validCollectionIds.includes(bar.collectionId)) {
        bar.collectionId = fallbackCollectionId;
      }
      return bar;
    });
    const activeCollectionId = validCollectionIds.includes(input.activeCollectionId) ? input.activeCollectionId : fallbackCollectionId;
    const activeButtonId = validButtonIds.includes(input.activeButtonId) ? input.activeButtonId : (buttons[0] ? buttons[0].id : "");
    return {
      schemaVersion: CONFIG_VERSION,
      activeCollectionId,
      activeButtonId,
      buttons,
      collections,
      bars
    };
  }

  // Find a collection by id from a normalized configuration.
  function getCollection(config, collectionId) {
    const normalized = normalizeConfig(config);
    return normalized.collections.find((collection) => collection.id === collectionId) || normalized.collections[0];
  }

  // Find all buttons referenced by a collection.
  function getCollectionButtons(config, collectionId) {
    const normalized = normalizeConfig(config);
    const collection = getCollection(normalized, collectionId);
    return collection.buttonIds
      .map((buttonId) => normalized.buttons.find((button) => button.id === buttonId))
      .filter(Boolean);
  }

  // Export all collections or a single collection as a portable JSON payload.
  function createExportPayload(config, collectionId) {
    const normalized = normalizeConfig(config);
    const collections = collectionId ? [getCollection(normalized, collectionId)] : normalized.collections;
    const buttonIds = collections.reduce((ids, collection) => ids.concat(collection.buttonIds), []);
    const uniqueButtonIds = buttonIds.filter((id, index, list) => list.indexOf(id) === index);
    const buttons = normalized.buttons.filter((button) => !collectionId || uniqueButtonIds.includes(button.id));
    return {
      app: "Tool Bar",
      schemaVersion: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      buttons: clone(buttons),
      collections: clone(collections)
    };
  }

  // Convert a configuration or selected collection to formatted JSON.
  function exportToJson(config, collectionId) {
    return JSON.stringify(createExportPayload(config, collectionId), null, 2);
  }

  // Parse an import payload and return normalized buttons plus collections.
  function parseImportJson(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (Array.isArray(parsed && parsed.collections) && Array.isArray(parsed && parsed.buttons)) {
      const normalized = normalizeConfig({
        schemaVersion: CONFIG_VERSION,
        activeCollectionId: parsed.collections[0] && parsed.collections[0].id,
        activeButtonId: parsed.buttons[0] && parsed.buttons[0].id,
        buttons: parsed.buttons,
        collections: parsed.collections,
        bars: []
      });
      return {
        buttons: normalized.buttons,
        collections: normalized.collections
      };
    }
    const legacy = migrateLegacyConfig(parsed);
    return {
      buttons: legacy.buttons,
      collections: legacy.collections
    };
  }

  // Import all collections or replace a selected target collection with the first imported collection.
  function importJson(config, json, options) {
    const normalized = normalizeConfig(config);
    const imported = parseImportJson(json);
    const mode = options && options.mode === "collection" ? "collection" : "all";
    const mergedButtons = normalized.buttons.slice();
    imported.buttons.forEach((button) => {
      const existingIndex = mergedButtons.findIndex((item) => item.id === button.id);
      if (existingIndex >= 0) {
        mergedButtons[existingIndex] = button;
      } else {
        mergedButtons.push(button);
      }
    });
    if (mode === "collection") {
      const targetCollectionId = options && options.targetCollectionId;
      const sourceCollection = imported.collections[0];
      if (!sourceCollection) {
        throw new Error("No collection found in import file.");
      }
      const replacement = createCollection(Object.assign({}, sourceCollection, {
        id: targetCollectionId || sourceCollection.id
      }));
      normalized.buttons = mergedButtons;
      normalized.collections = normalized.collections.map((collection) => (
        collection.id === replacement.id ? replacement : collection
      ));
      if (!normalized.collections.some((collection) => collection.id === replacement.id)) {
        normalized.collections.push(replacement);
      }
      normalized.activeCollectionId = replacement.id;
      return normalizeConfig(normalized);
    }
    normalized.buttons = mergedButtons;
    normalized.collections = imported.collections;
    normalized.activeCollectionId = imported.collections[0] ? imported.collections[0].id : normalized.activeCollectionId;
    return normalizeConfig(normalized);
  }

  // Expose the schema helpers.
  return {
    CONFIG_VERSION,
    MAX_BARS,
    BAR_IDS,
    ACTION_TYPES,
    MEDIA_TYPES,
    DISPLAY_MODES,
    createId,
    clone,
    createButton,
    createCollection,
    createBar,
    createPresetButtons,
    createDefaultConfig,
    normalizeConfig,
    normalizeStack,
    getCollection,
    getCollectionButtons,
    exportToJson,
    importJson,
    parseImportJson
  };
}));
