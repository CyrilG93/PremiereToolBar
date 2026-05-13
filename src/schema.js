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
  const CONFIG_VERSION = 1;
  const MAX_BARS = 4;
  const BAR_IDS = ["bar-1", "bar-2", "bar-3", "bar-4"];
  const ACTION_TYPES = ["effect", "transition", "stack"];
  const MEDIA_TYPES = ["video", "audio"];

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
    return {
      id: safeString(input.id, createId("button")),
      label: safeString(input.label, "New Button"),
      actionType,
      mediaType,
      icon: safeString(input.icon, "bolt"),
      iconColor: safeString(input.iconColor, "#8fd6ff"),
      accentColor: safeString(input.accentColor, "#1f2937"),
      textOverride: typeof input.textOverride === "string" ? input.textOverride.slice(0, 4) : "",
      effect: {
        matchName: safeString(input.effect && input.effect.matchName, input.effectMatchName || "AE.ADBE Mosaic"),
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

  // Build a normalized toolbar bar.
  function normalizeBar(input, index) {
    const source = input && typeof input === "object" ? input : {};
    const fallbackId = BAR_IDS[index] || "bar-" + (index + 1);
    const id = BAR_IDS.includes(source.id) ? source.id : fallbackId;
    const orientation = ["auto", "horizontal", "vertical"].includes(source.orientation) ? source.orientation : "auto";
    const buttons = Array.isArray(source.buttons) ? source.buttons : [];
    return {
      id,
      name: safeString(source.name, "Tool Bar " + (index + 1)),
      enabled: source.enabled !== false,
      orientation,
      buttons: buttons.map(createButton)
    };
  }

  // Create the first-run configuration with useful starter buttons.
  function createDefaultConfig() {
    return {
      schemaVersion: CONFIG_VERSION,
      activeBarId: "bar-1",
      bars: [
        normalizeBar({
          id: "bar-1",
          name: "Effects",
          buttons: [
            createButton({
              label: "Mosaic",
              icon: "mosaic",
              iconColor: "#8fd6ff",
              accentColor: "#193241",
              effect: { matchName: "AE.ADBE Mosaic", displayName: "Mosaic" }
            }),
            createButton({
              label: "Solarize",
              icon: "sun",
              iconColor: "#ffd166",
              accentColor: "#3c2d13",
              effect: { matchName: "PR.ADBE Solarize", displayName: "Solarize" }
            })
          ]
        }, 0),
        normalizeBar({ id: "bar-2", name: "Transitions", buttons: [] }, 1),
        normalizeBar({ id: "bar-3", name: "Looks", buttons: [] }, 2),
        normalizeBar({ id: "bar-4", name: "Audio", buttons: [] }, 3)
      ]
    };
  }

  // Normalize a complete configuration object and guarantee four dockable bars.
  function normalizeConfig(input) {
    const fallback = createDefaultConfig();
    const source = input && typeof input === "object" ? input : fallback;
    const importedBars = Array.isArray(source.bars) ? source.bars : fallback.bars;
    const bars = BAR_IDS.map((barId, index) => {
      const matchingBar = importedBars.find((bar) => bar && bar.id === barId) || importedBars[index];
      return normalizeBar(matchingBar, index);
    });
    const activeBarId = BAR_IDS.includes(source.activeBarId) ? source.activeBarId : bars[0].id;
    return {
      schemaVersion: CONFIG_VERSION,
      activeBarId,
      bars
    };
  }

  // Find a bar by id from a normalized configuration.
  function getBar(config, barId) {
    const normalized = normalizeConfig(config);
    return normalized.bars.find((bar) => bar.id === barId) || normalized.bars[0];
  }

  // Export all bars or a single bar as a portable JSON payload.
  function createExportPayload(config, barId) {
    const normalized = normalizeConfig(config);
    const bars = barId ? [getBar(normalized, barId)] : normalized.bars;
    return {
      app: "Tool Bar",
      schemaVersion: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      bars: clone(bars)
    };
  }

  // Convert a configuration or selected bar to formatted JSON.
  function exportToJson(config, barId) {
    return JSON.stringify(createExportPayload(config, barId), null, 2);
  }

  // Parse an import payload and return normalized bars.
  function parseImportJson(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    const bars = Array.isArray(parsed && parsed.bars) ? parsed.bars : [];
    if (!bars.length) {
      throw new Error("No bars found in import file.");
    }
    return bars.map((bar, index) => normalizeBar(bar, index)).slice(0, MAX_BARS);
  }

  // Import all bars or replace a selected target bar with the first imported bar.
  function importJson(config, json, options) {
    const normalized = normalizeConfig(config);
    const importedBars = parseImportJson(json);
    const mode = options && options.mode === "bar" ? "bar" : "all";
    if (mode === "bar") {
      const targetBarId = BAR_IDS.includes(options && options.targetBarId) ? options.targetBarId : normalized.activeBarId;
      const replacement = normalizeBar(Object.assign({}, importedBars[0], { id: targetBarId }), BAR_IDS.indexOf(targetBarId));
      normalized.bars = normalized.bars.map((bar) => (bar.id === targetBarId ? replacement : bar));
      normalized.activeBarId = targetBarId;
      return normalizeConfig(normalized);
    }
    normalized.bars = BAR_IDS.map((barId, index) => normalizeBar(Object.assign({}, importedBars[index] || {}, { id: barId }), index));
    normalized.activeBarId = normalized.bars[0].id;
    return normalizeConfig(normalized);
  }

  // Expose the schema helpers.
  return {
    CONFIG_VERSION,
    MAX_BARS,
    BAR_IDS,
    ACTION_TYPES,
    MEDIA_TYPES,
    createId,
    clone,
    createButton,
    createDefaultConfig,
    normalizeConfig,
    normalizeBar,
    normalizeStack,
    getBar,
    exportToJson,
    importJson,
    parseImportJson
  };
}));
