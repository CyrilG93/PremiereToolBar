(function (root) {
  "use strict";

  // Store settings under a namespaced key to avoid conflicts with other plugins.
  const STORAGE_KEY = "com.cyrilplugin.toolbar.config.v2";
  const LEGACY_STORAGE_KEY = "com.cyrilplugin.toolbar.config.v1";
  const UI_STATE_KEY = "com.cyrilplugin.toolbar.uiState.v1";
  const BACKUP_FILE_NAME = "ToolBar-config-backup.json";
  const EXTERNAL_CONFIG_FOLDER_NAME = "Tool Bar";
  const EXTERNAL_CONFIG_FILE_NAME = "ToolBar-config.json";

  // Return plain objects only so corrupted localStorage values cannot leak into UI state.
  function asPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

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
    writeExternalConfig(normalized);
    return normalized;
  }

  // Read the localStorage payload without normalizing so the backup can restore only when needed.
  function readLocalStorageConfig() {
    const raw = root.localStorage && (root.localStorage.getItem(STORAGE_KEY) || root.localStorage.getItem(LEGACY_STORAGE_KEY));
    return raw ? JSON.parse(raw) : null;
  }

  // Load Settings panel UI preferences that should follow the user across projects.
  function loadUiState() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(UI_STATE_KEY);
      const parsed = raw ? asPlainObject(JSON.parse(raw)) : {};
      return {
        collapsed: asPlainObject(parsed.collapsed),
        scrollState: asPlainObject(parsed.scrollState)
      };
    } catch (error) {
      console.warn("Tool Bar UI state load failed:", error);
      return { collapsed: {}, scrollState: {} };
    }
  }

  // Save Settings panel UI preferences separately from user buttons and collections.
  function saveUiState(uiState) {
    const existing = loadUiState();
    const incoming = asPlainObject(uiState);
    const next = {
      collapsed: Object.assign({}, existing.collapsed, asPlainObject(incoming.collapsed)),
      scrollState: Object.assign({}, existing.scrollState, asPlainObject(incoming.scrollState))
    };
    root.localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
    return next;
  }

  // Access UXP's file picker APIs only when running inside Premiere.
  function getLocalFileSystem() {
    try {
      return require("uxp").storage.localFileSystem;
    } catch (error) {
      return null;
    }
  }

  // Access the full UXP storage module when fullAccess path operations are available.
  function getStorageModule() {
    try {
      return require("uxp").storage;
    } catch (error) {
      return null;
    }
  }

  // Convert a native path to the file:/ URL format expected by UXP.
  function toFileUrl(nativePath) {
    const normalized = String(nativePath || "").replace(/\\/g, "/");
    return encodeURI(normalized.charAt(0) === "/" ? "file:" + normalized : "file:/" + normalized);
  }

  // Derive the user's Adobe app data root from UXP's data folder, then move outside Adobe's plugin storage.
  async function getExternalConfigLocation() {
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem || typeof localFileSystem.getDataFolder !== "function") {
      return null;
    }
    const dataFolder = await localFileSystem.getDataFolder();
    const nativePath = String(dataFolder && dataFolder.nativePath ? dataFolder.nativePath : "");
    const windowsMarker = "\\Adobe\\UXP\\";
    const macMarker = "/Adobe/UXP/";
    const windowsIndex = nativePath.indexOf(windowsMarker);
    const macIndex = nativePath.indexOf(macMarker);
    if (windowsIndex > 0) {
      const appDataRoot = nativePath.slice(0, windowsIndex);
      const folderPath = appDataRoot + "\\" + EXTERNAL_CONFIG_FOLDER_NAME;
      return { folderPath, filePath: folderPath + "\\" + EXTERNAL_CONFIG_FILE_NAME };
    }
    if (macIndex > 0) {
      const appSupportRoot = nativePath.slice(0, macIndex);
      const folderPath = appSupportRoot + "/" + EXTERNAL_CONFIG_FOLDER_NAME;
      return { folderPath, filePath: folderPath + "/" + EXTERNAL_CONFIG_FILE_NAME };
    }
    return null;
  }

  // Read the user-level config copy that should survive UXP plugin reinstallations.
  async function readExternalConfig() {
    const storage = getStorageModule();
    if (!storage || !storage.localFileSystem || typeof storage.localFileSystem.getEntryWithUrl !== "function") {
      return null;
    }
    try {
      const location = await getExternalConfigLocation();
      if (!location) {
        return null;
      }
      const file = await storage.localFileSystem.getEntryWithUrl(toFileUrl(location.filePath));
      const raw = await file.read();
      return root.PTB_SCHEMA.normalizeConfig(JSON.parse(raw));
    } catch (error) {
      return null;
    }
  }

  // Write a user-level config copy outside Adobe's UXP plugin storage when fullAccess is granted.
  async function writeExternalConfig(config) {
    const storage = getStorageModule();
    if (!storage || !storage.localFileSystem || !storage.types || typeof storage.localFileSystem.createEntryWithUrl !== "function") {
      return false;
    }
    try {
      const location = await getExternalConfigLocation();
      if (!location) {
        return false;
      }
      let folder;
      try {
        folder = await storage.localFileSystem.createEntryWithUrl(toFileUrl(location.folderPath), { type: storage.types.folder });
      } catch (error) {
        folder = await storage.localFileSystem.getEntryWithUrl(toFileUrl(location.folderPath));
      }
      const file = await folder.createFile(EXTERNAL_CONFIG_FILE_NAME, { overwrite: true });
      await file.write(JSON.stringify(root.PTB_SCHEMA.normalizeConfig(config)));
      return true;
    } catch (error) {
      console.warn("Tool Bar external config backup failed:", error);
      return false;
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
      const existingConfig = readLocalStorageConfig();
      if (existingConfig) {
        const normalizedExisting = root.PTB_SCHEMA.normalizeConfig(existingConfig);
        writeConfigBackup(normalizedExisting);
        writeExternalConfig(normalizedExisting);
        return null;
      }
    } catch (error) {
      // A corrupt localStorage payload should not block the backup restore attempt.
    }
    const externalConfig = await readExternalConfig();
    if (externalConfig) {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(externalConfig));
      writeConfigBackup(externalConfig);
      return externalConfig;
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

  // Import any text file selected by the user, such as an experimental .prfpset XML preset.
  async function importTextFile(types) {
    const localFileSystem = getLocalFileSystem();
    if (!localFileSystem) {
      throw new Error("UXP local file system is unavailable.");
    }
    const file = await localFileSystem.getFileForOpening({ types: types || ["txt"] });
    if (!file) {
      return null;
    }
    const content = await file.read();
    return {
      name: file.name || "Imported file",
      path: file.nativePath || file.fsName || file.fullName || file.url || "",
      text: typeof content === "string" ? content : (root.TextDecoder ? new root.TextDecoder("utf-8").decode(content) : String(content))
    };
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
    loadUiState,
    saveUiState,
    restoreConfigBackup,
    exportJsonFile,
    importJsonFile,
    importTextFile,
    copyText
  };
}(typeof window !== "undefined" ? window : globalThis));
