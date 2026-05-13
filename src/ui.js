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

  // Return the real mutable bar inside the current config.
  function getConfigBar(barId) {
    const id = barId || settingsState.selectedBarId || config.activeBarId;
    return config.bars.find((bar) => bar.id === id) || config.bars[0];
  }

  // Keep settings focused on a real bar and button so editing is visible immediately.
  function ensureSettingsSelection() {
    const selectedBar = getConfigBar(settingsState.selectedBarId);
    settingsState.selectedBarId = selectedBar.id;
    config.activeBarId = selectedBar.id;
    if (!settingsState.selectedButtonId && selectedBar.buttons.length) {
      settingsState.selectedButtonId = selectedBar.buttons[0].id;
      return;
    }
    if (settingsState.selectedButtonId && !selectedBar.buttons.some((button) => button.id === settingsState.selectedButtonId)) {
      settingsState.selectedButtonId = selectedBar.buttons[0] ? selectedBar.buttons[0].id : "";
    }
  }

  // Find the selected button in the selected bar.
  function getSelectedButton() {
    ensureSettingsSelection();
    return getConfigBar().buttons.find((button) => button.id === settingsState.selectedButtonId) || null;
  }

  // Persist config without rerendering so typing in inputs does not reset focus.
  function persistConfig(message) {
    config = root.PTB_STORAGE.saveConfig(config);
    statusMessage = message || root.PTB_I18N.t("statusSaved");
  }

  // Save config and refresh every open panel.
  function saveAndRender(message) {
    persistConfig(message);
    renderAll();
  }

  // Refresh every currently mounted UXP panel.
  function renderAll() {
    mountedPanels.forEach((panelId, rootNode) => {
      renderPanel(rootNode, panelId);
    });
  }

  // Create a labeled text input that saves while typing and rerenders on commit.
  function textField(label, value, onInput) {
    const wrap = el("label", "ptb-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const input = el("input", "ptb-input");
    input.value = value || "";
    input.addEventListener("input", () => {
      // Update the model without rebuilding the DOM on every keystroke.
      onInput(input.value);
      statusMessage = root.PTB_I18N.t("statusSaved");
    });
    input.addEventListener("change", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
    input.addEventListener("blur", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
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
    input.addEventListener("input", () => {
      onChange(input.value);
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    });
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
    input.addEventListener("input", () => {
      onChange(Number(input.value));
      statusMessage = root.PTB_I18N.t("statusSaved");
    });
    input.addEventListener("change", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
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
    const bar = getConfigBar(panelIdToBarId(panelId));
    const shell = el("section", "ptb-toolbar-shell " + (bar.orientation === "vertical" ? "ptb-vertical" : ""));
    const strip = el("div", "ptb-toolbar-strip");
    const gear = actionButton("", "ptb-tool-button ptb-gear-button", () => openPanel(rootNode.ptbContext, "ptb-settings"));
    gear.title = root.PTB_I18N.t("settings");
    gear.innerHTML = root.PTB_ICON_LIBRARY.renderIcon("gear", "#d7dee8", root.PTB_I18N.t("settings"));
    const label = actionButton(bar.name, "ptb-bar-label", () => openPanel(rootNode.ptbContext, "ptb-settings"));
    label.title = bar.name;
    strip.appendChild(gear);
    strip.appendChild(label);
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
      toolButton.appendChild(el("span", "ptb-tool-text", button.textOverride));
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

  // Render the full settings workspace.
  function renderSettingsPanel(rootNode) {
    ensureSettingsSelection();
    const shell = el("main", "ptb-settings-shell");
    const header = el("header", "ptb-settings-header");
    const title = el("div", "ptb-settings-title");
    title.appendChild(el("h1", "", root.PTB_I18N.t("appName")));
    title.appendChild(el("p", "ptb-status", statusMessage));
    header.appendChild(title);
    header.appendChild(renderHeaderActions());
    shell.appendChild(header);
    const layout = el("div", "ptb-settings-layout");
    try {
      // Use three visible regions on wide panels and collapse cleanly on narrow panels.
      layout.appendChild(renderBarSidebar());
      layout.appendChild(renderMainWorkspace());
      layout.appendChild(renderRightInspector());
    } catch (error) {
      layout.appendChild(renderErrorPanel(error));
    }
    shell.appendChild(layout);
    rootNode.appendChild(shell);
  }

  // Render always-visible settings actions in the header.
  function renderHeaderActions() {
    const actions = el("div", "ptb-header-actions");
    actions.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button primary compact", () => createButtonInSelectedBar()));
    actions.appendChild(actionButton(root.PTB_I18N.t("refreshCatalog"), "ptb-button compact", refreshCatalogs));
    return actions;
  }

  // Render a visible error block instead of leaving the panel blank.
  function renderErrorPanel(error) {
    const section = el("section", "ptb-panel ptb-span-all");
    section.appendChild(el("h2", "", "Render Error"));
    section.appendChild(el("p", "ptb-muted", error && error.message ? error.message : String(error)));
    return section;
  }

  // Render the left bar selector.
  function renderBarSidebar() {
    const section = el("aside", "ptb-panel ptb-sidebar");
    section.appendChild(el("h2", "", root.PTB_I18N.t("bars")));
    const list = el("div", "ptb-bar-card-list");
    config.bars.forEach((bar, index) => {
      const card = actionButton("", bar.id === settingsState.selectedBarId ? "ptb-bar-card active" : "ptb-bar-card", () => {
        settingsState.selectedBarId = bar.id;
        settingsState.selectedButtonId = bar.buttons[0] ? bar.buttons[0].id : "";
        config.activeBarId = bar.id;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      });
      card.appendChild(el("span", "ptb-bar-number", String(index + 1)));
      const text = el("span", "ptb-bar-card-text");
      text.appendChild(el("strong", "", bar.name));
      text.appendChild(el("small", "", bar.buttons.length + " buttons"));
      card.appendChild(text);
      if (!bar.enabled) {
        card.appendChild(el("span", "ptb-pill muted", "Off"));
      }
      list.appendChild(card);
    });
    section.appendChild(list);
    return section;
  }

  // Render the center workspace for the selected bar and button.
  function renderMainWorkspace() {
    const bar = getConfigBar();
    const section = el("section", "ptb-panel ptb-main-workspace");
    const header = el("div", "ptb-section-header");
    const title = el("div");
    title.appendChild(el("h2", "", bar.name));
    title.appendChild(el("p", "ptb-muted compact", "Bar " + bar.id.replace("bar-", "")));
    header.appendChild(title);
    header.appendChild(actionButton(root.PTB_I18N.t("openBar"), "ptb-button compact", () => openPanel(document.body.ptbContext || {}, "ptb-bar-" + bar.id.split("-")[1])));
    section.appendChild(header);
    section.appendChild(renderBarControls(bar));
    section.appendChild(renderButtonList(bar));
    const button = getSelectedButton();
    if (button) {
      section.appendChild(renderButtonEditor(button));
    } else {
      const empty = el("div", "ptb-empty-state");
      empty.appendChild(el("h3", "", root.PTB_I18N.t("noButtonSelected")));
      empty.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button primary", () => createButtonInSelectedBar()));
      section.appendChild(empty);
    }
    return section;
  }

  // Render bar-level controls.
  function renderBarControls(bar) {
    const wrap = el("div", "ptb-control-grid");
    wrap.appendChild(textField(root.PTB_I18N.t("barName"), bar.name, (value) => {
      bar.name = value || "Tool Bar";
    }));
    wrap.appendChild(selectField(root.PTB_I18N.t("orientation"), bar.orientation, [
      { value: "auto", label: root.PTB_I18N.t("auto") },
      { value: "horizontal", label: root.PTB_I18N.t("horizontal") },
      { value: "vertical", label: root.PTB_I18N.t("vertical") }
    ], (value) => {
      bar.orientation = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    const enabledRow = el("label", "ptb-check-row inline");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.checked = bar.enabled;
    checkbox.addEventListener("change", () => {
      bar.enabled = checkbox.checked;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    });
    enabledRow.appendChild(checkbox);
    enabledRow.appendChild(el("span", "", root.PTB_I18N.t("enabled")));
    wrap.appendChild(enabledRow);
    return wrap;
  }

  // Render selectable buttons for the selected bar.
  function renderButtonList(bar) {
    const wrap = el("div", "ptb-button-workspace");
    const header = el("div", "ptb-section-header mini");
    header.appendChild(el("h3", "", root.PTB_I18N.t("buttons")));
    const actions = el("div", "ptb-action-row tight");
    actions.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button compact primary", () => createButtonInSelectedBar()));
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateButton"), "ptb-button compact", () => duplicateSelectedButton()));
    actions.appendChild(actionButton(root.PTB_I18N.t("deleteButton"), "ptb-button compact danger", () => deleteSelectedButton()));
    header.appendChild(actions);
    wrap.appendChild(header);
    const list = el("div", "ptb-button-card-list");
    bar.buttons.forEach((button) => list.appendChild(renderButtonCard(button)));
    wrap.appendChild(list);
    return wrap;
  }

  // Render one selectable button card.
  function renderButtonCard(button) {
    const card = actionButton("", button.id === settingsState.selectedButtonId ? "ptb-button-card active" : "ptb-button-card", () => {
      settingsState.selectedButtonId = button.id;
      renderAll();
    });
    const icon = el("span", "ptb-card-icon");
    icon.style.background = button.accentColor || "#1f2937";
    if (button.textOverride) {
      icon.appendChild(el("span", "ptb-tool-text", button.textOverride));
    } else {
      icon.innerHTML = root.PTB_ICON_LIBRARY.renderIcon(button.icon, button.iconColor, button.label);
    }
    card.appendChild(icon);
    const text = el("span", "ptb-button-card-text");
    text.appendChild(el("strong", "", button.label));
    text.appendChild(el("small", "", describeButtonAction(button)));
    card.appendChild(text);
    return card;
  }

  // Describe a button action for cards and headers.
  function describeButtonAction(button) {
    if (button.actionType === "transition") {
      return "Transition: " + (button.transition.matchName || "Not set");
    }
    if (button.actionType === "stack") {
      return "Stack: " + button.stack.components.length + " effects";
    }
    return (button.mediaType === "audio" ? "Audio" : "Video") + ": " + (button.effect.displayName || button.effect.matchName);
  }

  // Render all editable properties for a selected button.
  function renderButtonEditor(button) {
    const editor = el("div", "ptb-editor");
    const header = el("div", "ptb-section-header mini");
    const title = el("div");
    title.appendChild(el("h3", "", button.label));
    title.appendChild(el("p", "ptb-muted compact", describeButtonAction(button)));
    header.appendChild(title);
    const order = el("div", "ptb-action-row tight");
    order.appendChild(actionButton(root.PTB_I18N.t("moveUp"), "ptb-button compact", () => moveSelectedButton(-1)));
    order.appendChild(actionButton(root.PTB_I18N.t("moveDown"), "ptb-button compact", () => moveSelectedButton(1)));
    header.appendChild(order);
    editor.appendChild(header);
    const basics = el("div", "ptb-control-grid");
    basics.appendChild(textField(root.PTB_I18N.t("label"), button.label, (value) => {
      button.label = value || "Button";
    }));
    basics.appendChild(selectField(root.PTB_I18N.t("action"), button.actionType, [
      { value: "effect", label: root.PTB_I18N.t("nativeEffect") },
      { value: "transition", label: root.PTB_I18N.t("videoTransition") },
      { value: "stack", label: root.PTB_I18N.t("capturedStack") }
    ], (value) => {
      button.actionType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    editor.appendChild(basics);
    editor.appendChild(renderActionFields(button));
    return editor;
  }

  // Render action-specific button fields.
  function renderActionFields(button) {
    const wrap = el("div", "ptb-fieldset");
    if (button.actionType === "transition") {
      const grid = el("div", "ptb-control-grid");
      grid.appendChild(textField(root.PTB_I18N.t("transitionMatchName"), button.transition.matchName, (value) => {
        button.transition.matchName = value;
      }));
      grid.appendChild(selectField(root.PTB_I18N.t("transitionPosition"), button.transition.applyTo, [
        { value: "start", label: root.PTB_I18N.t("transitionStart") },
        { value: "end", label: root.PTB_I18N.t("transitionEnd") }
      ], (value) => {
        button.transition.applyTo = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      grid.appendChild(numberField(root.PTB_I18N.t("transitionDuration"), button.transition.durationSeconds, (value) => {
        button.transition.durationSeconds = value;
      }));
      wrap.appendChild(grid);
      wrap.appendChild(renderCatalogPicker("transition", button));
      return wrap;
    }
    if (button.actionType === "stack") {
      const summary = button.stack.components.length
        ? button.stack.components.map((component) => component.displayName).join(", ")
        : root.PTB_I18N.t("noStackCaptured");
      wrap.appendChild(el("p", "ptb-muted", summary));
      wrap.appendChild(actionButton(root.PTB_I18N.t("captureStack"), "ptb-button primary", async () => {
        await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
          button.stack = await root.PTB_PREMIERE.captureSelectedStack();
          button.label = button.stack.components[0] ? button.stack.components[0].displayName : button.label;
          saveAndRender(root.PTB_I18N.t("statusSaved"));
        });
      }));
      return wrap;
    }
    const grid = el("div", "ptb-control-grid");
    grid.appendChild(selectField(root.PTB_I18N.t("mediaType"), button.mediaType, [
      { value: "video", label: root.PTB_I18N.t("video") },
      { value: "audio", label: root.PTB_I18N.t("audio") }
    ], (value) => {
      button.mediaType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    grid.appendChild(textField(root.PTB_I18N.t("effectDisplayName"), button.effect.displayName, (value) => {
      button.effect.displayName = value;
    }));
    grid.appendChild(textField(root.PTB_I18N.t("effectMatchName"), button.effect.matchName, (value) => {
      button.effect.matchName = value;
    }));
    wrap.appendChild(grid);
    wrap.appendChild(renderCatalogPicker("effect", button));
    return wrap;
  }

  // Render a catalog picker populated from Premiere API discovery.
  function renderCatalogPicker(kind, button) {
    const wrap = el("div", "ptb-catalog-picker");
    const options = [{ value: "", label: "Choose from refreshed Premiere list" }];
    const source = kind === "transition"
      ? catalogs.videoTransitions
      : (button.mediaType === "audio" ? catalogs.audioEffects : catalogs.videoEffects);
    source.forEach((item) => {
      options.push({ value: item.matchName + "||" + item.displayName, label: item.displayName + (item.matchName ? " - " + item.matchName : "") });
    });
    wrap.appendChild(selectField(kind === "transition" ? root.PTB_I18N.t("videoTransition") : root.PTB_I18N.t("nativeEffect"), "", options, (value) => {
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
    }));
    wrap.appendChild(actionButton(root.PTB_I18N.t("refreshCatalog"), "ptb-button compact", refreshCatalogs));
    return wrap;
  }

  // Render icon, custom text, and data controls in the right inspector.
  function renderRightInspector() {
    const section = el("aside", "ptb-panel ptb-inspector");
    const button = getSelectedButton();
    if (button) {
      section.appendChild(renderIconEditor(button));
    } else {
      section.appendChild(el("h2", "", root.PTB_I18N.t("iconGallery")));
      section.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonSelected")));
    }
    section.appendChild(renderImportExportSettings());
    return section;
  }

  // Render icon and color controls for the selected button.
  function renderIconEditor(button) {
    const section = el("div", "ptb-inspector-block");
    section.appendChild(el("h2", "", root.PTB_I18N.t("iconGallery")));
    section.appendChild(textField(root.PTB_I18N.t("textOverride"), button.textOverride, (value) => {
      button.textOverride = value.slice(0, 4);
    }));
    const colors = el("div", "ptb-control-grid compact");
    colors.appendChild(colorField(root.PTB_I18N.t("iconColor"), button.iconColor, (value) => {
      button.iconColor = value;
    }));
    colors.appendChild(colorField(root.PTB_I18N.t("accentColor"), button.accentColor, (value) => {
      button.accentColor = value;
    }));
    section.appendChild(colors);
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
    const section = el("div", "ptb-inspector-block");
    section.appendChild(el("h2", "", root.PTB_I18N.t("data")));
    const actions = el("div", "ptb-action-row stack");
    actions.appendChild(actionButton(root.PTB_I18N.t("exportAll"), "ptb-button", async () => exportPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("exportBar"), "ptb-button", async () => exportPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importAll"), "ptb-button", async () => importPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importBar"), "ptb-button", async () => importPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("copyJson"), "ptb-button", async () => copyCurrentJson()));
    section.appendChild(actions);
    return section;
  }

  // Create a new editable button in the currently selected bar.
  function createButtonInSelectedBar() {
    const bar = getConfigBar();
    const button = root.PTB_SCHEMA.createButton({
      label: "New Button",
      icon: "bolt",
      iconColor: "#8fd6ff",
      accentColor: "#24394a"
    });
    bar.buttons.push(button);
    settingsState.selectedButtonId = button.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Duplicate the selected button.
  function duplicateSelectedButton() {
    const bar = getConfigBar();
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
  function deleteSelectedButton() {
    const bar = getConfigBar();
    const button = getSelectedButton();
    if (!button) {
      return;
    }
    bar.buttons = bar.buttons.filter((item) => item.id !== button.id);
    settingsState.selectedButtonId = bar.buttons[0] ? bar.buttons[0].id : "";
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Move the selected button inside its bar.
  function moveSelectedButton(direction) {
    const bar = getConfigBar();
    const index = bar.buttons.findIndex((button) => button.id === settingsState.selectedButtonId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= bar.buttons.length) {
      return;
    }
    const button = bar.buttons.splice(index, 1)[0];
    bar.buttons.splice(nextIndex, 0, button);
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Refresh available Premiere effects and transitions.
  async function refreshCatalogs() {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      catalogs = await root.PTB_PREMIERE.loadCatalogs();
      statusMessage = root.PTB_I18N.t("statusCatalog");
    });
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
