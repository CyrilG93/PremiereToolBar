(function (root) {
  "use strict";

  // Keep render state shared across all dockable panels.
  let config = root.PTB_STORAGE.loadConfig();
  let catalogs = { videoEffects: [], audioEffects: [], videoTransitions: [] };
  let statusMessage = root.PTB_I18N.t("statusReady");
  let settingsState = {
    selectedBarId: "bar-1",
    selectedCollectionId: config.activeCollectionId,
    selectedButtonId: config.activeButtonId
  };
  const mountedPanels = new Map();

  // Convert a manifest entrypoint id to a toolbar bar id.
  function panelIdToBarId(panelId) {
    const match = String(panelId).match(/ptb-bar-(\d)/);
    return match ? "bar-" + match[1] : "bar-1";
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

  // Return the real mutable button inside the current config.
  function getButton(buttonId) {
    return config.buttons.find((button) => button.id === buttonId) || null;
  }

  // Return the real mutable collection inside the current config.
  function getCollection(collectionId) {
    return config.collections.find((collection) => collection.id === collectionId) || config.collections[0] || null;
  }

  // Return the real mutable bar assignment inside the current config.
  function getBar(barId) {
    return config.bars.find((bar) => bar.id === barId) || config.bars[0] || null;
  }

  // Return buttons in collection order.
  function getCollectionButtons(collectionId) {
    const collection = getCollection(collectionId);
    if (!collection) {
      return [];
    }
    return collection.buttonIds.map(getButton).filter(Boolean);
  }

  // Keep settings focused on valid entities.
  function ensureSettingsSelection() {
    const collection = getCollection(settingsState.selectedCollectionId);
    settingsState.selectedCollectionId = collection ? collection.id : "";
    config.activeCollectionId = settingsState.selectedCollectionId;
    if (!getButton(settingsState.selectedButtonId)) {
      const firstCollectionButton = getCollectionButtons(settingsState.selectedCollectionId)[0];
      settingsState.selectedButtonId = firstCollectionButton ? firstCollectionButton.id : (config.buttons[0] ? config.buttons[0].id : "");
    }
    config.activeButtonId = settingsState.selectedButtonId;
    if (!getBar(settingsState.selectedBarId)) {
      settingsState.selectedBarId = "bar-1";
    }
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

  // Create a labeled text input that updates the model while typing and saves on commit.
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
    const bar = getBar(panelIdToBarId(panelId));
    const collection = bar ? getCollection(bar.collectionId) : null;
    const buttons = collection && bar.enabled ? getCollectionButtons(collection.id) : [];
    const shell = el("section", "ptb-toolbar-shell " + (bar && bar.orientation === "vertical" ? "ptb-vertical" : ""));
    const strip = el("div", "ptb-toolbar-strip");
    if (!bar || !bar.enabled) {
      strip.appendChild(el("div", "ptb-empty", root.PTB_I18N.t("disabledBar")));
    } else if (!collection) {
      strip.appendChild(el("div", "ptb-empty", root.PTB_I18N.t("noAssignedCollection")));
    } else if (!buttons.length) {
      strip.appendChild(el("div", "ptb-empty", root.PTB_I18N.t("emptyBar")));
    } else {
      buttons.forEach((button) => strip.appendChild(renderToolButton(button, rootNode.ptbContext)));
    }
    shell.appendChild(strip);
    rootNode.appendChild(shell);
  }

  // Render one clickable toolbar button.
  function renderToolButton(button, context) {
    const toolButton = actionButton("", "ptb-tool-button", async () => {
      if (button.actionType === "settings") {
        openPanel(context, "ptb-settings");
        return;
      }
      await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
        await root.PTB_PREMIERE.applyButton(button);
      });
    });
    toolButton.title = button.label;
    toolButton.style.background = button.accentColor || "#2b3037";
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
      // Render three stable regions so the current bar, collection, and button are always obvious.
      layout.appendChild(renderBarAssignments());
      layout.appendChild(renderCollectionsWorkspace());
      layout.appendChild(renderButtonWorkspace());
    } catch (error) {
      layout.appendChild(renderErrorPanel(error));
    }
    shell.appendChild(layout);
    rootNode.appendChild(shell);
  }

  // Render always-visible settings actions in the header.
  function renderHeaderActions() {
    const actions = el("div", "ptb-header-actions");
    actions.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button primary compact", () => createLibraryButton()));
    actions.appendChild(actionButton(root.PTB_I18N.t("addCollection"), "ptb-button compact", () => createNewCollection()));
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

  // Render bar-to-collection assignments.
  function renderBarAssignments() {
    const section = el("aside", "ptb-panel ptb-sidebar");
    section.appendChild(el("h2", "", root.PTB_I18N.t("bars")));
    const collectionOptions = config.collections.map((collection) => ({ value: collection.id, label: collection.name }));
    config.bars.forEach((bar, index) => {
      const card = el("div", bar.id === settingsState.selectedBarId ? "ptb-assignment-card active" : "ptb-assignment-card");
      const header = actionButton("Bar " + (index + 1), "ptb-card-heading", () => {
        settingsState.selectedBarId = bar.id;
        renderAll();
      });
      card.appendChild(header);
      card.appendChild(selectField(root.PTB_I18N.t("assignedCollection"), bar.collectionId, collectionOptions, (value) => {
        bar.collectionId = value;
        settingsState.selectedBarId = bar.id;
        settingsState.selectedCollectionId = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      card.appendChild(selectField(root.PTB_I18N.t("orientation"), bar.orientation, [
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
      card.appendChild(enabledRow);
      section.appendChild(card);
    });
    return section;
  }

  // Render collection management and collection membership.
  function renderCollectionsWorkspace() {
    const section = el("section", "ptb-panel ptb-main-workspace");
    const header = el("div", "ptb-section-header");
    const title = el("div");
    title.appendChild(el("h2", "", root.PTB_I18N.t("collections")));
    title.appendChild(el("p", "ptb-muted compact", "Assign buttons to collections, then assign collections to bars."));
    header.appendChild(title);
    const actions = el("div", "ptb-action-row tight");
    actions.appendChild(actionButton(root.PTB_I18N.t("addCollection"), "ptb-button compact primary", () => createNewCollection()));
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateCollection"), "ptb-button compact", () => duplicateSelectedCollection()));
    actions.appendChild(actionButton(root.PTB_I18N.t("deleteCollection"), "ptb-button compact danger", () => deleteSelectedCollection()));
    header.appendChild(actions);
    section.appendChild(header);
    const selectedCollection = getCollection(settingsState.selectedCollectionId);
    const list = el("div", "ptb-collection-list");
    config.collections.forEach((collection) => list.appendChild(renderCollectionCard(collection)));
    section.appendChild(list);
    if (selectedCollection) {
      section.appendChild(renderCollectionEditor(selectedCollection));
    } else {
      section.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noCollectionSelected")));
    }
    return section;
  }

  // Render one collection selector card.
  function renderCollectionCard(collection) {
    const card = actionButton("", collection.id === settingsState.selectedCollectionId ? "ptb-collection-card active" : "ptb-collection-card", () => {
      settingsState.selectedCollectionId = collection.id;
      config.activeCollectionId = collection.id;
      const firstButton = getCollectionButtons(collection.id)[0];
      if (firstButton) {
        settingsState.selectedButtonId = firstButton.id;
      }
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    });
    card.appendChild(el("strong", "", collection.name));
    card.appendChild(el("small", "", collection.buttonIds.length + " buttons"));
    return card;
  }

  // Render selected collection details.
  function renderCollectionEditor(collection) {
    const editor = el("div", "ptb-collection-editor");
    editor.appendChild(textField(root.PTB_I18N.t("collectionName"), collection.name, (value) => {
      collection.name = value || "Collection";
    }));
    const addRow = el("div", "ptb-catalog-picker");
    const availableOptions = config.buttons.map((button) => ({ value: button.id, label: button.label }));
    addRow.appendChild(selectField(root.PTB_I18N.t("buttonLibrary"), "", [{ value: "", label: "Choose button" }].concat(availableOptions), (value) => {
      if (value) {
        addButtonToCollection(collection.id, value);
      }
    }));
    addRow.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button compact primary", () => createLibraryButton(collection.id)));
    editor.appendChild(addRow);
    const buttons = getCollectionButtons(collection.id);
    const list = el("div", "ptb-button-card-list");
    if (!buttons.length) {
      list.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonsInCollection")));
    }
    buttons.forEach((button) => list.appendChild(renderCollectionButtonCard(collection, button)));
    editor.appendChild(list);
    return editor;
  }

  // Render one button as it appears inside a collection.
  function renderCollectionButtonCard(collection, button) {
    const card = el("div", button.id === settingsState.selectedButtonId ? "ptb-button-card active" : "ptb-button-card");
    const select = actionButton("", "ptb-button-card-main", () => {
      settingsState.selectedButtonId = button.id;
      config.activeButtonId = button.id;
      renderAll();
    });
    select.appendChild(renderButtonSwatch(button));
    const text = el("span", "ptb-button-card-text");
    text.appendChild(el("strong", "", button.label));
    text.appendChild(el("small", "", describeButtonAction(button)));
    select.appendChild(text);
    card.appendChild(select);
    const actions = el("div", "ptb-card-actions");
    actions.appendChild(actionButton(root.PTB_I18N.t("moveUp"), "ptb-icon-action", () => moveButtonInCollection(collection.id, button.id, -1)));
    actions.appendChild(actionButton(root.PTB_I18N.t("moveDown"), "ptb-icon-action", () => moveButtonInCollection(collection.id, button.id, 1)));
    actions.appendChild(actionButton(root.PTB_I18N.t("removeFromCollection"), "ptb-icon-action danger", () => removeButtonFromCollection(collection.id, button.id)));
    card.appendChild(actions);
    return card;
  }

  // Render the global button library and selected button editor.
  function renderButtonWorkspace() {
    const section = el("aside", "ptb-panel ptb-inspector");
    const header = el("div", "ptb-section-header mini");
    header.appendChild(el("h2", "", root.PTB_I18N.t("buttonLibrary")));
    header.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button compact primary", () => createLibraryButton()));
    section.appendChild(header);
    const library = el("div", "ptb-library-list");
    config.buttons.forEach((button) => library.appendChild(renderLibraryButtonCard(button)));
    section.appendChild(library);
    const selectedButton = getButton(settingsState.selectedButtonId);
    if (selectedButton) {
      section.appendChild(renderButtonEditor(selectedButton));
    } else {
      section.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonSelected")));
    }
    section.appendChild(renderImportExportSettings());
    return section;
  }

  // Render one library button.
  function renderLibraryButtonCard(button) {
    const card = actionButton("", button.id === settingsState.selectedButtonId ? "ptb-library-card active" : "ptb-library-card", () => {
      settingsState.selectedButtonId = button.id;
      config.activeButtonId = button.id;
      renderAll();
    });
    card.appendChild(renderButtonSwatch(button));
    const text = el("span", "ptb-button-card-text");
    text.appendChild(el("strong", "", button.label));
    text.appendChild(el("small", "", describeButtonAction(button)));
    card.appendChild(text);
    return card;
  }

  // Render a compact visual swatch for a button.
  function renderButtonSwatch(button) {
    const icon = el("span", "ptb-card-icon");
    icon.style.background = button.accentColor || "#2b3037";
    if (button.textOverride) {
      icon.appendChild(el("span", "ptb-tool-text", button.textOverride));
    } else {
      icon.innerHTML = root.PTB_ICON_LIBRARY.renderIcon(button.icon, button.iconColor, button.label);
    }
    return icon;
  }

  // Describe a button action for cards and headers.
  function describeButtonAction(button) {
    if (button.actionType === "settings") {
      return "Open settings";
    }
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
    editor.appendChild(el("h2", "", root.PTB_I18N.t("buttonEditor")));
    editor.appendChild(textField(root.PTB_I18N.t("label"), button.label, (value) => {
      button.label = value || "Button";
    }));
    editor.appendChild(selectField(root.PTB_I18N.t("action"), button.actionType, [
      { value: "settings", label: root.PTB_I18N.t("settings") },
      { value: "effect", label: root.PTB_I18N.t("nativeEffect") },
      { value: "transition", label: root.PTB_I18N.t("videoTransition") },
      { value: "stack", label: root.PTB_I18N.t("capturedStack") }
    ], (value) => {
      button.actionType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    editor.appendChild(renderActionFields(button));
    editor.appendChild(renderIconEditor(button));
    const actions = el("div", "ptb-action-row tight");
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateButton"), "ptb-button compact", () => duplicateLibraryButton(button.id)));
    actions.appendChild(actionButton(root.PTB_I18N.t("deleteButton"), "ptb-button compact danger", () => deleteLibraryButton(button.id)));
    editor.appendChild(actions);
    return editor;
  }

  // Render action-specific button fields.
  function renderActionFields(button) {
    const wrap = el("div", "ptb-fieldset");
    if (button.actionType === "settings") {
      wrap.appendChild(el("p", "ptb-muted", "This button opens the Tool Bar Settings panel."));
      return wrap;
    }
    if (button.actionType === "transition") {
      wrap.appendChild(textField(root.PTB_I18N.t("transitionMatchName"), button.transition.matchName, (value) => {
        button.transition.matchName = value;
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
      }));
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
    wrap.appendChild(selectField(root.PTB_I18N.t("mediaType"), button.mediaType, [
      { value: "video", label: root.PTB_I18N.t("video") },
      { value: "audio", label: root.PTB_I18N.t("audio") }
    ], (value) => {
      button.mediaType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    wrap.appendChild(textField(root.PTB_I18N.t("effectDisplayName"), button.effect.displayName, (value) => {
      button.effect.displayName = value;
    }));
    wrap.appendChild(textField(root.PTB_I18N.t("effectMatchName"), button.effect.matchName, (value) => {
      button.effect.matchName = value;
    }));
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

  // Render icon and color controls for the selected button.
  function renderIconEditor(button) {
    const section = el("div", "ptb-inspector-block");
    section.appendChild(el("h3", "", root.PTB_I18N.t("iconGallery")));
    section.appendChild(textField(root.PTB_I18N.t("textOverride"), button.textOverride, (value) => {
      button.textOverride = value.slice(0, 4);
    }));
    section.appendChild(colorField(root.PTB_I18N.t("iconColor"), button.iconColor, (value) => {
      button.iconColor = value;
    }));
    section.appendChild(colorField(root.PTB_I18N.t("accentColor"), button.accentColor, (value) => {
      button.accentColor = value;
    }));
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

  // Create a standalone library button and optionally add it to a collection.
  function createLibraryButton(collectionId) {
    const button = root.PTB_SCHEMA.createButton({
      label: "New Button",
      icon: "bolt",
      iconColor: "#8fd6ff",
      accentColor: "#313840"
    });
    config.buttons.push(button);
    if (collectionId) {
      addButtonToCollection(collectionId, button.id, true);
    }
    settingsState.selectedButtonId = button.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Duplicate a library button.
  function duplicateLibraryButton(buttonId) {
    const button = getButton(buttonId);
    if (!button) {
      return;
    }
    const copy = root.PTB_SCHEMA.createButton(Object.assign(root.PTB_SCHEMA.clone(button), {
      id: root.PTB_SCHEMA.createId("button"),
      label: button.label + " Copy"
    }));
    config.buttons.push(copy);
    settingsState.selectedButtonId = copy.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Delete a library button and remove it from every collection.
  function deleteLibraryButton(buttonId) {
    config.buttons = config.buttons.filter((button) => button.id !== buttonId);
    config.collections.forEach((collection) => {
      collection.buttonIds = collection.buttonIds.filter((id) => id !== buttonId);
    });
    settingsState.selectedButtonId = config.buttons[0] ? config.buttons[0].id : "";
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Create a new collection.
  function createNewCollection() {
    const collection = root.PTB_SCHEMA.createCollection({ name: "New Collection", buttonIds: [] });
    config.collections.push(collection);
    settingsState.selectedCollectionId = collection.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Duplicate the selected collection.
  function duplicateSelectedCollection() {
    const collection = getCollection(settingsState.selectedCollectionId);
    if (!collection) {
      return;
    }
    const copy = root.PTB_SCHEMA.createCollection(Object.assign(root.PTB_SCHEMA.clone(collection), {
      id: root.PTB_SCHEMA.createId("collection"),
      name: collection.name + " Copy"
    }));
    config.collections.push(copy);
    settingsState.selectedCollectionId = copy.id;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Delete the selected collection and reassign bars to the first remaining collection.
  function deleteSelectedCollection() {
    if (config.collections.length <= 1) {
      return;
    }
    const deletedId = settingsState.selectedCollectionId;
    config.collections = config.collections.filter((collection) => collection.id !== deletedId);
    const fallbackId = config.collections[0].id;
    config.bars.forEach((bar) => {
      if (bar.collectionId === deletedId) {
        bar.collectionId = fallbackId;
      }
    });
    settingsState.selectedCollectionId = fallbackId;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Add a button to a collection if it is not already present.
  function addButtonToCollection(collectionId, buttonId, skipRender) {
    const collection = getCollection(collectionId);
    if (!collection || !getButton(buttonId)) {
      return;
    }
    if (!collection.buttonIds.includes(buttonId)) {
      collection.buttonIds.push(buttonId);
    }
    settingsState.selectedCollectionId = collection.id;
    settingsState.selectedButtonId = buttonId;
    if (!skipRender) {
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }
  }

  // Remove a button from a collection.
  function removeButtonFromCollection(collectionId, buttonId) {
    const collection = getCollection(collectionId);
    if (!collection) {
      return;
    }
    collection.buttonIds = collection.buttonIds.filter((id) => id !== buttonId);
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Move a button inside one collection.
  function moveButtonInCollection(collectionId, buttonId, direction) {
    const collection = getCollection(collectionId);
    if (!collection) {
      return;
    }
    const index = collection.buttonIds.indexOf(buttonId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= collection.buttonIds.length) {
      return;
    }
    const item = collection.buttonIds.splice(index, 1)[0];
    collection.buttonIds.splice(nextIndex, 0, item);
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Refresh available Premiere effects and transitions.
  async function refreshCatalogs() {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      catalogs = await root.PTB_PREMIERE.loadCatalogs();
      statusMessage = root.PTB_I18N.t("statusCatalog");
    });
  }

  // Export all collections or the selected collection to JSON.
  async function exportPayload(selectedOnly) {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = root.PTB_SCHEMA.exportToJson(config, selectedOnly ? settingsState.selectedCollectionId : null);
      await root.PTB_STORAGE.exportJsonFile(json, selectedOnly ? "ToolBar-" + settingsState.selectedCollectionId + ".json" : "ToolBar-all-collections.json");
      statusMessage = root.PTB_I18N.t("statusExported");
    });
  }

  // Import all collections or replace the selected collection from JSON.
  async function importPayload(selectedOnly) {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = await root.PTB_STORAGE.importJsonFile();
      if (!json) {
        return;
      }
      config = root.PTB_SCHEMA.importJson(config, json, {
        mode: selectedOnly ? "collection" : "all",
        targetCollectionId: settingsState.selectedCollectionId
      });
      root.PTB_STORAGE.saveConfig(config);
      settingsState.selectedCollectionId = config.activeCollectionId;
      statusMessage = root.PTB_I18N.t("statusImported");
    });
  }

  // Copy the selected collection JSON for quick backup or sharing.
  async function copyCurrentJson() {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = root.PTB_SCHEMA.exportToJson(config, settingsState.selectedCollectionId);
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
