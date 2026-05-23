(function (root) {
  "use strict";

  // Store settings under a namespaced key to avoid conflicts with other plugins.
  const STORAGE_KEY = "com.cyrilplugin.toolbar.config.v2";
  const LEGACY_STORAGE_KEY = "com.cyrilplugin.toolbar.config.v1";
  const BACKUP_FILE_NAME = "ToolBar-config-backup.json";

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
    writeConfigBackup(normalized);
    return normalized;
  }

  // Read the localStorage payload without normalizing so the backup can restore only when needed.
  function readLocalStorageConfig() {
    const raw = root.localStorage && (root.localStorage.getItem(STORAGE_KEY) || root.localStorage.getItem(LEGACY_STORAGE_KEY));
    return raw ? JSON.parse(raw) : null;
  }

  // Access UXP's file picker APIs only when running inside Premiere.
  function getLocalFileSystem() {
    try {
      return require("uxp").storage.localFileSystem;
    } catch (error) {
      return null;
    }
  }

  // Write a mirror copy in plugin data storage so installer updates are less likely to wipe user buttons.
  async function writeConfigBackup(config) {
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem || typeof localFileSystem.getDataFolder !== "function") {
      return false;
    }
    try {
      const dataFolder = await localFileSystem.getDataFolder();
      const file = typeof dataFolder.createFile === "function"
        ? await dataFolder.createFile(BACKUP_FILE_NAME, { overwrite: true })
        : await localFileSystem.createEntryWithUrl("plugin-data:/" + BACKUP_FILE_NAME, { overwrite: true });
      await file.write(JSON.stringify(root.PTB_SCHEMA.normalizeConfig(config)));
      return true;
    } catch (error) {
      console.warn("Tool Bar config backup failed:", error);
      return false;
    }
  }

  // Restore the plugin-data backup when localStorage is empty after a reinstall/update.
  async function restoreConfigBackup() {
    try {
      if (readLocalStorageConfig()) {
        return null;
      }
    } catch (error) {
      // A corrupt localStorage payload should not block the backup restore attempt.
    }
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem || typeof localFileSystem.getDataFolder !== "function") {
      return null;
    }
    try {
      const dataFolder = await localFileSystem.getDataFolder();
      const file = typeof dataFolder.getEntry === "function"
        ? await dataFolder.getEntry(BACKUP_FILE_NAME)
        : await localFileSystem.getEntryWithUrl("plugin-data:/" + BACKUP_FILE_NAME);
      const restored = root.PTB_SCHEMA.normalizeConfig(JSON.parse(await file.read()));
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      return restored;
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
    restoreConfigBackup,
    exportJsonFile,
    importJsonFile,
    copyText
  };
}(typeof window !== "undefined" ? window : globalThis));
