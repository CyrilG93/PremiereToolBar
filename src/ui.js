(function (root) {
  "use strict";

  // Keep render state shared across all dockable panels.
  let config = root.PTB_STORAGE.loadConfig();
  let catalogs = { videoEffects: [], audioEffects: [], videoTransitions: [] };
  let statusMessage = root.PTB_I18N.t("statusReady");
  let settingsState = { selectedBarId: config.activeBarId, selectedButtonId: "" };
  const mountedPanels = new Map();

  // Convert a manifest entrypoint id to a toolbar bar id.
  function panelIdToBarId(panelId) {
    const match = String(panelId).match(/ptb-bar-(\d)/);
    return match ? "bar-" + match[1] : config.activeBarId;
  }

  // Create a DOM element with optional class and text.
  function el(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (typeof text === "string") {
      node.textContent = text;
    }
    return node;
  }

  // Create a button with a click handler.
  function actionButton(label, className, onClick) {
    const button = el("button", className || "ptb-button", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  // Create a labeled text input.
  function textField(label, value, onChange) {
    const wrap = el("label", "ptb-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const input = el("input", "ptb-input");
    input.value = value || "";
    input.addEventListener("input", () => onChange(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  // Create a labeled color input.
  function colorField(label, value, onChange) {
    const wrap = el("label", "ptb-field ptb-color-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const input = el("input", "ptb-color-input");
    input.type = "color";
    input.value = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#8fd6ff";
    input.addEventListener("input", () => onChange(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  // Create a labeled number input.
  function numberField(label, value, onChange) {
    const wrap = el("label", "ptb-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const input = el("input", "ptb-input");
    input.type = "number";
    input.step = "0.1";
    input.min = "0.01";
    input.value = String(value || 1);
    input.addEventListener("input", () => onChange(Number(input.value)));
    wrap.appendChild(input);
    return wrap;
  }

  // Create a labeled select input.
  function selectField(label, value, options, onChange) {
    const wrap = el("label", "ptb-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const select = el("select", "ptb-input");
    options.forEach((option) => {
      const item = el("option");
      item.value = option.value;
      item.textContent = option.label;
      if (option.value === value) {
        item.selected = true;
      }
      select.appendChild(item);
    });
    select.addEventListener("change", () => onChange(select.value));
    wrap.appendChild(select);
    return wrap;
  }

  // Save config and refresh every open panel.
  function saveAndRender(message) {
    config = root.PTB_STORAGE.saveConfig(config);
    statusMessage = message || root.PTB_I18N.t("statusSaved");
    renderAll();
  }

  // Refresh every currently mounted UXP panel.
  function renderAll() {
    mountedPanels.forEach((panelId, rootNode) => {
      renderPanel(rootNode, panelId);
    });
  }

  // Find the selected settings bar.
  function getSelectedBar() {
    return root.PTB_SCHEMA.getBar(config, settingsState.selectedBarId);
  }

  // Find the selected button in the selected bar.
  function getSelectedButton() {
    const bar = getSelectedBar();
    return bar.buttons.find((button) => button.id === settingsState.selectedButtonId) || null;
  }

  // Open a declared UXP panel from another panel.
  function openPanel(context, panelId) {
    try {
      const pluginId = context.getPluginId();
      const plugin = Array.from(context.pluginManager.plugins).find((item) => item.id === pluginId);
      if (plugin && typeof plugin.showPanel === "function") {
        plugin.showPanel(panelId);
      }
    } catch (error) {
      console.warn("Tool Bar could not open panel:", error);
    }
  }

  // Render either a compact toolbar or the settings UI.
  function renderPanel(rootNode, panelId) {
    rootNode.innerHTML = "";
    if (panelId === "ptb-settings") {
      renderSettingsPanel(rootNode);
      return;
    }
    renderBarPanel(rootNode, panelId);
  }

  // Render one compact dockable toolbar panel.
  function renderBarPanel(rootNode, panelId) {
    const barId = panelIdToBarId(panelId);
    const bar = root.PTB_SCHEMA.getBar(config, barId);
    const shell = el("section", "ptb-toolbar-shell " + (bar.orientation === "vertical" ? "ptb-vertical" : ""));
    const strip = el("div", "ptb-toolbar-strip");
    const gear = actionButton("", "ptb-tool-button ptb-gear-button", () => openPanel(rootNode.ptbContext, "ptb-settings"));
    gear.title = root.PTB_I18N.t("settings");
    gear.innerHTML = root.PTB_ICON_LIBRARY.renderIcon("gear", "#d7dee8", root.PTB_I18N.t("settings"));
    strip.appendChild(gear);
    if (!bar.enabled) {
      strip.appendChild(el("div", "ptb-empty", root.PTB_I18N.t("disabledBar")));
    } else if (!bar.buttons.length) {
      strip.appendChild(el("div", "ptb-empty", root.PTB_I18N.t("emptyBar")));
    } else {
      bar.buttons.forEach((button) => strip.appendChild(renderToolButton(button)));
    }
    shell.appendChild(strip);
    rootNode.appendChild(shell);
  }

  // Render one clickable toolbar effect button.
  function renderToolButton(button) {
    const toolButton = actionButton("", "ptb-tool-button", async () => {
      await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
        await root.PTB_PREMIERE.applyButton(button);
      });
    });
    toolButton.title = button.label;
    toolButton.style.background = button.accentColor || "#1f2937";
    if (button.textOverride) {
      const text = el("span", "ptb-tool-text", button.textOverride);
      toolButton.appendChild(text);
    } else {
      toolButton.innerHTML = root.PTB_ICON_LIBRARY.renderIcon(button.icon, button.iconColor, button.label);
    }
    return toolButton;
  }

  // Run an async operation and render status or errors.
  async function runWithStatus(workingMessage, operation) {
    statusMessage = workingMessage;
    renderAll();
    try {
      await operation();
      statusMessage = root.PTB_I18N.t("statusReady");
    } catch (error) {
      statusMessage = error && error.message ? error.message : String(error);
    }
    renderAll();
  }

  // Render the full settings panel.
  function renderSettingsPanel(rootNode) {
    const shell = el("main", "ptb-settings-shell");
    const header = el("header", "ptb-settings-header");
    header.appendChild(el("h1", "", root.PTB_I18N.t("appName")));
    header.appendChild(el("p", "ptb-status", statusMessage));
    shell.appendChild(header);
    const layout = el("div", "ptb-settings-layout");
    layout.appendChild(renderBarSettings());
    layout.appendChild(renderButtonSettings());
    layout.appendChild(renderImportExportSettings());
    shell.appendChild(layout);
    rootNode.appendChild(shell);
  }

  // Render bar selection and bar-level options.
  function renderBarSettings() {
    const section = el("section", "ptb-settings-section");
    section.appendChild(el("h2", "", root.PTB_I18N.t("bars")));
    const barOptions = config.bars.map((bar) => ({ value: bar.id, label: bar.name }));
    section.appendChild(selectField(root.PTB_I18N.t("bars"), settingsState.selectedBarId, barOptions, (value) => {
      settingsState.selectedBarId = value;
      config.activeBarId = value;
      settingsState.selectedButtonId = "";
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    const bar = getSelectedBar();
    section.appendChild(textField(root.PTB_I18N.t("barName"), bar.name, (value) => {
      bar.name = value || bar.name;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    section.appendChild(selectField(root.PTB_I18N.t("orientation"), bar.orientation, [
      { value: "auto", label: root.PTB_I18N.t("auto") },
      { value: "horizontal", label: root.PTB_I18N.t("horizontal") },
      { value: "vertical", label: root.PTB_I18N.t("vertical") }
    ], (value) => {
      bar.orientation = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    const enabledRow = el("label", "ptb-check-row");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.checked = bar.enabled;
    checkbox.addEventListener("change", () => {
      bar.enabled = checkbox.checked;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    });
    enabledRow.appendChild(checkbox);
    enabledRow.appendChild(el("span", "", root.PTB_I18N.t("enabled")));
    section.appendChild(enabledRow);
    const openRow = el("div", "ptb-action-row");
    openRow.appendChild(actionButton(root.PTB_I18N.t("openBar"), "ptb-button", () => openPanel(document.body.ptbContext || {}, "ptb-bar-" + bar.id.split("-")[1])));
    section.appendChild(openRow);
    return section;
  }

  // Render button list and current button editor.
  function renderButtonSettings() {
    const section = el("section", "ptb-settings-section ptb-wide-section");
    section.appendChild(el("h2", "", root.PTB_I18N.t("buttons")));
    const bar = getSelectedBar();
    const list = el("div", "ptb-button-list");
    bar.buttons.forEach((button) => {
      const item = actionButton(button.label, button.id === settingsState.selectedButtonId ? "ptb-list-item active" : "ptb-list-item", () => {
        settingsState.selectedButtonId = button.id;
        renderAll();
      });
      list.appendChild(item);
    });
    section.appendChild(list);
    const actions = el("div", "ptb-action-row");
    actions.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button", () => {
      const button = root.PTB_SCHEMA.createButton({ label: "New Button" });
      bar.buttons.push(button);
      settingsState.selectedButtonId = button.id;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateButton"), "ptb-button", () => duplicateSelectedButton(bar)));
    actions.appendChild(actionButton(root.PTB_I18N.t("deleteButton"), "ptb-button danger", () => deleteSelectedButton(bar)));
    actions.appendChild(actionButton(root.PTB_I18N.t("moveUp"), "ptb-button", () => moveSelectedButton(bar, -1)));
    actions.appendChild(actionButton(root.PTB_I18N.t("moveDown"), "ptb-button", () => moveSelectedButton(bar, 1)));
    section.appendChild(actions);
    const button = getSelectedButton();
    if (!button) {
      section.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonSelected")));
      return section;
    }
    section.appendChild(renderButtonEditor(button));
    return section;
  }

  // Duplicate the selected button.
  function duplicateSelectedButton(bar) {
    const button = getSelectedButton();
    if (!button) {
      return;
    }
    const copy = root.PTB_SCHEMA.createButton(Object.assign(root.PTB_SCHEMA.clone(button), {
      id: root.PTB_SCHEMA.createId("button"),
      label: button.label + " Copy"
    }));
    bar.buttons.push(copy);
    settingsState.selectedButtonId = copy.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Delete the selected button.
  function deleteSelectedButton(bar) {
    const button = getSelectedButton();
    if (!button) {
      return;
    }
    bar.buttons = bar.buttons.filter((item) => item.id !== button.id);
    settingsState.selectedButtonId = bar.buttons[0] ? bar.buttons[0].id : "";
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Move the selected button inside its bar.
  function moveSelectedButton(bar, direction) {
    const index = bar.buttons.findIndex((button) => button.id === settingsState.selectedButtonId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= bar.buttons.length) {
      return;
    }
    const button = bar.buttons.splice(index, 1)[0];
    bar.buttons.splice(nextIndex, 0, button);
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Render all editable properties for a selected button.
  function renderButtonEditor(button) {
    const editor = el("div", "ptb-editor");
    editor.appendChild(textField(root.PTB_I18N.t("label"), button.label, (value) => {
      button.label = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    editor.appendChild(selectField(root.PTB_I18N.t("action"), button.actionType, [
      { value: "effect", label: root.PTB_I18N.t("nativeEffect") },
      { value: "transition", label: root.PTB_I18N.t("videoTransition") },
      { value: "stack", label: root.PTB_I18N.t("capturedStack") }
    ], (value) => {
      button.actionType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    editor.appendChild(renderActionFields(button));
    editor.appendChild(renderIconEditor(button));
    return editor;
  }

  // Render action-specific button fields.
  function renderActionFields(button) {
    const wrap = el("div", "ptb-fieldset");
    if (button.actionType === "transition") {
      wrap.appendChild(textField(root.PTB_I18N.t("transitionMatchName"), button.transition.matchName, (value) => {
        button.transition.matchName = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      wrap.appendChild(selectField(root.PTB_I18N.t("transitionPosition"), button.transition.applyTo, [
        { value: "start", label: root.PTB_I18N.t("transitionStart") },
        { value: "end", label: root.PTB_I18N.t("transitionEnd") }
      ], (value) => {
        button.transition.applyTo = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      wrap.appendChild(numberField(root.PTB_I18N.t("transitionDuration"), button.transition.durationSeconds, (value) => {
        button.transition.durationSeconds = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      wrap.appendChild(renderCatalogPicker("transition", button));
      return wrap;
    }
    if (button.actionType === "stack") {
      const summary = button.stack.components.length
        ? button.stack.components.map((component) => component.displayName).join(", ")
        : root.PTB_I18N.t("noStackCaptured");
      wrap.appendChild(el("p", "ptb-muted", summary));
      wrap.appendChild(actionButton(root.PTB_I18N.t("captureStack"), "ptb-button", async () => {
        await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
          button.stack = await root.PTB_PREMIERE.captureSelectedStack();
          button.label = button.stack.components[0] ? button.stack.components[0].displayName : button.label;
          saveAndRender(root.PTB_I18N.t("statusSaved"));
        });
      }));
      return wrap;
    }
    wrap.appendChild(selectField(root.PTB_I18N.t("mediaType"), button.mediaType, [
      { value: "video", label: root.PTB_I18N.t("video") },
      { value: "audio", label: root.PTB_I18N.t("audio") }
    ], (value) => {
      button.mediaType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    wrap.appendChild(textField(root.PTB_I18N.t("effectMatchName"), button.effect.matchName, (value) => {
      button.effect.matchName = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    wrap.appendChild(textField(root.PTB_I18N.t("effectDisplayName"), button.effect.displayName, (value) => {
      button.effect.displayName = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    wrap.appendChild(renderCatalogPicker("effect", button));
    return wrap;
  }

  // Render a catalog picker populated from Premiere API discovery.
  function renderCatalogPicker(kind, button) {
    const options = [{ value: "", label: "Choose from refreshed Premiere list" }];
    const source = kind === "transition"
      ? catalogs.videoTransitions
      : (button.mediaType === "audio" ? catalogs.audioEffects : catalogs.videoEffects);
    source.forEach((item) => {
      options.push({ value: item.matchName + "||" + item.displayName, label: item.displayName + (item.matchName ? " - " + item.matchName : "") });
    });
    const picker = selectField(kind === "transition" ? root.PTB_I18N.t("videoTransition") : root.PTB_I18N.t("nativeEffect"), "", options, (value) => {
      if (!value) {
        return;
      }
      const parts = value.split("||");
      if (kind === "transition") {
        button.transition.matchName = parts[0];
      } else {
        button.effect.matchName = parts[0];
        button.effect.displayName = parts[1] || parts[0];
      }
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    });
    picker.appendChild(actionButton(root.PTB_I18N.t("refreshCatalog"), "ptb-button inline", async () => {
      await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
        catalogs = await root.PTB_PREMIERE.loadCatalogs();
        statusMessage = root.PTB_I18N.t("statusCatalog");
      });
    }));
    return picker;
  }

  // Render icon, custom text, and color controls.
  function renderIconEditor(button) {
    const section = el("div", "ptb-fieldset");
    section.appendChild(textField(root.PTB_I18N.t("textOverride"), button.textOverride, (value) => {
      button.textOverride = value.slice(0, 4);
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    section.appendChild(colorField(root.PTB_I18N.t("iconColor"), button.iconColor, (value) => {
      button.iconColor = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    section.appendChild(colorField(root.PTB_I18N.t("accentColor"), button.accentColor, (value) => {
      button.accentColor = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    section.appendChild(el("h3", "", root.PTB_I18N.t("iconGallery")));
    const gallery = el("div", "ptb-icon-grid");
    root.PTB_ICON_LIBRARY.icons.forEach((icon) => {
      const item = actionButton("", icon.id === button.icon ? "ptb-icon-choice active" : "ptb-icon-choice", () => {
        button.icon = icon.id;
        button.textOverride = "";
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      });
      item.title = icon.label;
      item.innerHTML = root.PTB_ICON_LIBRARY.renderIcon(icon.id, button.iconColor, icon.label);
      gallery.appendChild(item);
    });
    section.appendChild(gallery);
    return section;
  }

  // Render import/export controls.
  function renderImportExportSettings() {
    const section = el("section", "ptb-settings-section");
    section.appendChild(el("h2", "", root.PTB_I18N.t("data")));
    section.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("replacementWarning")));
    const actions = el("div", "ptb-action-row stack");
    actions.appendChild(actionButton(root.PTB_I18N.t("exportAll"), "ptb-button", async () => exportPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("exportBar"), "ptb-button", async () => exportPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importAll"), "ptb-button", async () => importPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importBar"), "ptb-button", async () => importPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("copyJson"), "ptb-button", async () => copyCurrentJson()));
    section.appendChild(actions);
    const preview = el("textarea", "ptb-json-preview");
    preview.readOnly = true;
    preview.value = root.PTB_SCHEMA.exportToJson(config, settingsState.selectedBarId);
    section.appendChild(preview);
    return section;
  }

  // Export all bars or the selected bar to JSON.
  async function exportPayload(selectedOnly) {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = root.PTB_SCHEMA.exportToJson(config, selectedOnly ? settingsState.selectedBarId : null);
      await root.PTB_STORAGE.exportJsonFile(json, selectedOnly ? "ToolBar-" + settingsState.selectedBarId + ".json" : "ToolBar-all-bars.json");
      statusMessage = root.PTB_I18N.t("statusExported");
    });
  }

  // Import all bars or replace the selected bar from JSON.
  async function importPayload(selectedOnly) {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = await root.PTB_STORAGE.importJsonFile();
      if (!json) {
        return;
      }
      config = root.PTB_SCHEMA.importJson(config, json, {
        mode: selectedOnly ? "bar" : "all",
        targetBarId: settingsState.selectedBarId
      });
      root.PTB_STORAGE.saveConfig(config);
      statusMessage = root.PTB_I18N.t("statusImported");
    });
  }

  // Copy the selected bar JSON for quick backup or sharing.
  async function copyCurrentJson() {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = root.PTB_SCHEMA.exportToJson(config, settingsState.selectedBarId);
      await root.PTB_STORAGE.copyText(json);
      statusMessage = root.PTB_I18N.t("statusCopied");
    });
  }

  // Public mount entry used by index.js lifecycle hooks.
  function mountPanel(rootNode, panelId, context) {
    rootNode.ptbContext = context;
    document.body.ptbContext = context;
    mountedPanels.set(rootNode, panelId);
    renderPanel(rootNode, panelId);
  }

  // Expose UI mounting for the UXP entrypoint file.
  root.PTB_UI = {
    mountPanel
  };
}(typeof window !== "undefined" ? window : globalThis));
