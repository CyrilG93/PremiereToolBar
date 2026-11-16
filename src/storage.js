(function (root) {
  "use strict";

  // Store settings under a namespaced key to avoid conflicts with other plugins.
  const STORAGE_KEY = "com.cyrilplugin.toolbar.config.v2";
  const LEGACY_STORAGE_KEY = "com.cyrilplugin.toolbar.config.v1";
  const UI_STATE_KEY = "com.cyrilplugin.toolbar.uiState.v1";
  const BACKUP_FILE_NAME = "ToolBar-config-backup.json";
  const EXTERNAL_CONFIG_FOLDER_NAME = "Tool Bar";
  const EXTERNAL_CONFIG_FILE_NAME = "ToolBar-config.json";
  // Track user saves so a slow startup search cannot replace a newer edit.
  let configRevision = 0;

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
    configRevision += 1;
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    // Never let a pristine first-run configuration overwrite useful backups.
    if (!isDefaultConfig(normalized)) {
      writeConfigBackup(normalized);
      writeExternalConfig(normalized);
    }
    return normalized;
  }

  // Treat only the unchanged bundled configuration as safe to replace automatically.
  function isDefaultConfig(config) {
    const normalized = root.PTB_SCHEMA.normalizeConfig(config);
    const bundled = root.PTB_SCHEMA.normalizeConfig(root.PTB_SCHEMA.createDefaultConfig());
    normalized.activeCollectionId = bundled.activeCollectionId;
    normalized.activeButtonId = bundled.activeButtonId;
    return JSON.stringify(normalized) === JSON.stringify(bundled);
  }

  // Reject incomplete or unknown schemas instead of silently restoring defaults.
  function parseBackup(raw) {
    const config = JSON.parse(raw);
    if (!config || config.schemaVersion !== root.PTB_SCHEMA.CONFIG_VERSION || !Array.isArray(config.buttons) || !Array.isArray(config.collections) || !Array.isArray(config.bars) || !config.collections.length) {
      return null;
    }
    return root.PTB_SCHEMA.normalizeConfig(config);
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
      return parseBackup(raw);
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

  // Search older versions of the same Premiere channel for this plugin's backup only.
  async function readPreviousVersionConfig() {
    const fs = getLocalFileSystem();
    if (!fs || typeof fs.getDataFolder !== "function" || typeof fs.getEntryWithUrl !== "function") {
      return null;
    }
    try {
      const dataFolder = await fs.getDataFolder();
      const nativePath = String(dataFolder.nativePath || "").replace(/\\/g, "/");
      const match = nativePath.match(/^(.*\/Adobe\/UXP\/PluginsStorage\/(?:PPRO|PPROBETA))\/(\d+)(\/External\/com\.cyrilplugin\.toolbar\/PluginData)\/?$/i);
      if (!match) {
        return null;
      }
      const versionsFolder = await fs.getEntryWithUrl(toFileUrl(match[1]));
      const versions = (await versionsFolder.getEntries())
        .filter((entry) => entry.isFolder && /^\d+$/.test(entry.name) && Number(entry.name) < Number(match[2]))
        .sort((a, b) => Number(b.name) - Number(a.name));
      for (const version of versions) {
        try {
          const file = await fs.getEntryWithUrl(toFileUrl(match[1] + "/" + version.name + match[3] + "/" + BACKUP_FILE_NAME));
          const config = parseBackup(await file.read());
          if (config && !isDefaultConfig(config)) {
            return config;
          }
        } catch (error) {
          // An older version may have no backup or contain invalid JSON.
        }
      }
    } catch (error) {
      console.warn("Tool Bar previous version backup search failed:", error);
    }
    return null;
  }

  // Recover a custom configuration only when the current one is still untouched.
  async function restoreConfigBackup() {
    const initialRevision = configRevision;
    let existingConfig = null;
    try {
      existingConfig = readLocalStorageConfig();
      if (existingConfig && !isDefaultConfig(existingConfig)) {
        return null;
      }
    } catch (error) {
      // A corrupt localStorage payload should not block the backup restore attempt.
    }
    const localFileSystem = getLocalFileSystem();
    let restored = null;
    try {
      if (localFileSystem && typeof localFileSystem.getDataFolder === "function") {
        const dataFolder = await localFileSystem.getDataFolder();
        const file = await dataFolder.getEntry(BACKUP_FILE_NAME);
        const localBackup = parseBackup(await file.read());
        if (localBackup && !isDefaultConfig(localBackup)) {
          restored = localBackup;
        }
      }
    } catch (error) {
      // Continue with the shared and previous-version backups.
    }
    const externalConfig = restored ? null : await readExternalConfig();
    if (!restored && externalConfig && !isDefaultConfig(externalConfig)) {
      restored = externalConfig;
    }
    if (!restored) {
      restored = await readPreviousVersionConfig();
    }
    // Recheck localStorage after asynchronous reads in case another panel saved meanwhile.
    if (!restored || configRevision !== initialRevision) {
      return null;
    }
    try {
      const current = readLocalStorageConfig();
      if (current && !isDefaultConfig(current)) {
        return null;
      }
    } catch (error) {
      // A damaged current configuration can still be recovered from a valid backup.
    }
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    return restored;
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
