(function (root) {
  "use strict";

  // Store settings under a namespaced key to avoid conflicts with other plugins.
  const STORAGE_KEY = "com.cyrilplugin.toolbar.config.v2";
  const LEGACY_STORAGE_KEY = "com.cyrilplugin.toolbar.config.v1";

  // Load the toolbar configuration from persistent UXP localStorage.
  function loadConfig() {
    try {
      const raw = root.localStorage && (root.localStorage.getItem(STORAGE_KEY) || root.localStorage.getItem(LEGACY_STORAGE_KEY));
      return root.PTB_SCHEMA.normalizeConfig(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn("Tool Bar config load failed:", error);
      return root.PTB_SCHEMA.createDefaultConfig();
    }
  }

  // Save the toolbar configuration to persistent UXP localStorage.
  function saveConfig(config) {
    const normalized = root.PTB_SCHEMA.normalizeConfig(config);
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  // Access UXP's file picker APIs only when running inside Premiere.
  function getLocalFileSystem() {
    try {
      return require("uxp").storage.localFileSystem;
    } catch (error) {
      return null;
    }
  }

  // Export JSON to a user-selected file.
  async function exportJsonFile(json, suggestedName) {
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem) {
      throw new Error("UXP local file system is unavailable.");
    }
    const file = await localFileSystem.getFileForSaving(suggestedName || "ToolBar.json", { types: ["json"] });
    if (!file) {
      return false;
    }
    await file.write(json);
    return true;
  }

  // Import JSON from a user-selected file.
  async function importJsonFile() {
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem) {
      throw new Error("UXP local file system is unavailable.");
    }
    const file = await localFileSystem.getFileForOpening({ types: ["json"] });
    if (!file) {
      return "";
    }
    return file.read();
  }

  // Copy JSON to the system clipboard when UXP exposes clipboard support.
  async function copyText(text) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      await root.navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  // Expose persistence helpers for the UI.
  root.PTB_STORAGE = {
    loadConfig,
    saveConfig,
    exportJsonFile,
    importJsonFile,
    copyText
  };
}(typeof window !== "undefined" ? window : globalThis));
