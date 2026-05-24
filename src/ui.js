(function (root) {
  "use strict";

  // Keep render state shared across all dockable panels.
  let config = root.PTB_STORAGE.loadConfig();
  let catalogs = { videoEffects: [], audioEffects: [], videoTransitions: [] };
  let statusMessage = root.PTB_I18N.t("statusReady");
  let settingsState = {
    selectedCollectionId: config.activeCollectionId,
    selectedButtonId: config.activeButtonId,
    pendingDrag: { buttonId: "", collectionId: "" },
    dropTarget: { collectionId: "", index: -1 },
    dragActive: false,
    openColorPicker: "",
    openIconPicker: "",
    collapsed: {
      buttonGallery: false,
      buttonEditor: false,
      collections: false,
      data: true
    }
  };
  const mountedPanels = new Map();
  let globalDragEndBound = false;
  let backupRestoreStarted = false;
  const colorPalette = [
    "#d7dee8", "#8fd6ff", "#79c8ff", "#9fe3c1", "#ffd166", "#ffb986",
    "#ff9aa2", "#d7b6ff", "#f4f4f5", "#a7a7a7", "#6b7280", "#313840",
    "#263747", "#263d35", "#403724", "#342a45", "#422a2f", "#101010",
    "#ffffff", "#000000", "#e11d48", "#f97316", "#22c55e", "#3b82f6"
  ];

  // Restore a mirrored config after installer updates that clear localStorage.
  function startBackupRestore() {
    if (backupRestoreStarted || !root.PTB_STORAGE.restoreConfigBackup) {
      return;
    }
    backupRestoreStarted = true;
    root.PTB_STORAGE.restoreConfigBackup().then((restoredConfig) => {
      if (restoredConfig) {
        config = restoredConfig;
        settingsState.selectedCollectionId = config.activeCollectionId;
        settingsState.selectedButtonId = config.activeButtonId;
        statusMessage = root.PTB_I18N.t("statusRestored");
        renderAll();
      }
    }).catch((error) => {
      console.warn("Tool Bar config restore skipped:", error);
    });
  }

  // Inject only into the document head; UXP can render style tags inside panel roots as visible text.
  function ensureHeadStyles() {
    const rootStyle = document.documentElement && document.documentElement.style;
    if (rootStyle) {
      // Define theme variables imperatively so inline styles work even if UXP ignores dynamic style tags.
      rootStyle.setProperty("--ptb-bg", "var(--uxp-host-background-color, #1f1f1f)");
      rootStyle.setProperty("--ptb-panel", "var(--uxp-host-widget-background-color, #262626)");
      rootStyle.setProperty("--ptb-panel-soft", "var(--uxp-host-widget-hover-background-color, #303030)");
      rootStyle.setProperty("--ptb-line", "var(--uxp-host-border-color, #444444)");
      rootStyle.setProperty("--ptb-text", "var(--uxp-host-text-color, #f0f0f0)");
      rootStyle.setProperty("--ptb-muted", "var(--uxp-host-dimmed-text-color, #a7a7a7)");
      rootStyle.setProperty("--ptb-accent", "#79c8ff");
    }
    let style = document.getElementById("ptb-critical-styles-head");
    if (!style) {
      style = document.createElement("style");
      style.id = "ptb-critical-styles-head";
      style.textContent = `
      :root{color-scheme:dark;--ptb-bg:var(--uxp-host-background-color,#1f1f1f);--ptb-panel:var(--uxp-host-widget-background-color,#262626);--ptb-panel-soft:var(--uxp-host-widget-hover-background-color,#303030);--ptb-line:var(--uxp-host-border-color,#444);--ptb-text:var(--uxp-host-text-color,#f0f0f0);--ptb-muted:var(--uxp-host-dimmed-text-color,#a7a7a7);--ptb-accent:#79c8ff;--ptb-danger:#ff746b}
      *{box-sizing:border-box}html,body,#ptb-root{width:100%;height:100%;min-width:0;min-height:100%;margin:0;overflow:auto;background:var(--ptb-bg);color:var(--ptb-text);font-family:Arial,Helvetica,sans-serif;font-size:12px}button,input,select,textarea{font:inherit}button{appearance:none}
      .ptb-toolbar-shell{width:100%;height:100%;min-height:44px;padding:3px;overflow:auto;background:var(--ptb-bg)}.ptb-toolbar-strip{display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;justify-content:flex-start;gap:1px;width:100%;min-height:34px}.ptb-vertical .ptb-toolbar-strip{flex-direction:column;flex-wrap:wrap;align-content:flex-start;width:auto;height:100%;max-height:100%;min-width:34px}.ptb-tool-button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;min-width:34px;height:34px;min-height:34px;margin:0;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:0;color:var(--ptb-text);background:var(--ptb-panel-soft);cursor:pointer}.ptb-button-face{display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;min-width:0}.ptb-button-face.with-caption{flex-direction:column;gap:1px}.ptb-image-icon{display:block;width:22px;height:22px;object-fit:contain;border:0;background:transparent;outline:0;pointer-events:none}.ptb-svg-icon svg{display:block;width:22px;height:22px;fill:currentColor}.ptb-tool-text,.ptb-tool-caption{display:block;max-width:31px;overflow:hidden;font-size:10px;font-weight:900;letter-spacing:0;line-height:1;text-align:center;text-overflow:ellipsis;white-space:nowrap}.ptb-tool-caption{font-size:8px;line-height:8px}.ptb-empty{color:var(--ptb-muted);font-size:11px;line-height:1.2}
      .ptb-settings-shell{width:100%;height:100%;min-height:100%;overflow:auto;background:var(--ptb-bg);padding-bottom:24px}.ptb-settings-header{position:sticky;top:0;z-index:4;display:flex;width:100%;align-items:center;justify-content:flex-start;gap:10px;padding:10px 12px;border-bottom:1px solid var(--ptb-line);background:var(--ptb-bg)}.ptb-title-line{display:flex;align-items:center;gap:8px;min-width:0}.ptb-title-line h1{margin:0;font-size:16px;font-weight:800;white-space:nowrap}.ptb-version,.ptb-status-badge{display:inline-flex;align-items:center;min-height:20px;border:1px solid var(--ptb-line);border-radius:999px;padding:2px 7px;color:var(--ptb-muted);background:#1a1a1a;font-size:10px;font-weight:700;white-space:nowrap}.ptb-status-badge{color:var(--ptb-accent)}.ptb-header-actions,.ptb-action-row{display:flex;flex-wrap:wrap;gap:7px}.ptb-header-actions{margin-left:auto}
      .ptb-settings-content{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;padding:12px}.ptb-section{display:block;width:100%;min-width:0;border:1px solid var(--ptb-line);border-radius:8px;background:var(--ptb-panel)}.ptb-section-heading{display:flex;align-items:center;gap:8px;min-height:42px;padding:10px 12px;border-bottom:1px solid var(--ptb-line)}.ptb-section-body{display:block;min-width:0;min-height:18px;padding:0}.ptb-section.collapsed .ptb-section-heading{border-bottom:0}.ptb-section-heading h2{margin:0;font-size:12px;font-weight:800}.ptb-section-toggle{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:0 0 22px;border:1px solid var(--ptb-line);border-radius:6px;color:var(--ptb-text);background:var(--ptb-panel-soft);cursor:pointer;font-weight:800}
      .ptb-button,.ptb-icon-action,.ptb-bar-toggle{border:1px solid var(--ptb-line);border-radius:7px;color:var(--ptb-text);background:var(--ptb-panel-soft);cursor:pointer}.ptb-button{min-height:30px;padding:6px 10px;font-weight:700}.ptb-button.primary{border-color:rgba(121,200,255,.7);background:#224259}.ptb-button.compact{min-height:26px;padding:5px 8px;white-space:nowrap}.ptb-button.danger,.ptb-icon-action.danger{color:#ffd8d5;border-color:rgba(255,116,107,.45)}
      .ptb-gallery-grid{display:flex;flex-wrap:wrap;gap:8px;padding:12px}.ptb-gallery-card,.ptb-collection-member{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid var(--ptb-line);border-radius:7px;color:var(--ptb-text);background:var(--ptb-panel-soft);cursor:pointer;text-align:left}.ptb-gallery-card{width:150px;min-width:150px;padding:9px}.ptb-gallery-card.active,.ptb-collection-member.active,.ptb-collection-drop-card.active{border-color:var(--ptb-accent);background:#223446}
      .ptb-card-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 34px;border-radius:7px}.ptb-button-card-text{display:flex;flex-direction:column;gap:2px;min-width:0}.ptb-button-card-text strong,.ptb-button-card-text small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ptb-button-card-text strong{font-weight:900}.ptb-button-card-text small{color:var(--ptb-muted)}
      .ptb-editor-shell,.ptb-icon-editor,.ptb-import-export{display:flex;flex-direction:column;gap:12px;min-width:0;padding:12px}.ptb-form-grid{display:flex;flex-wrap:wrap;gap:10px;min-width:0}.ptb-catalog-picker{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:12px}.ptb-fieldset{display:flex;flex-direction:column;gap:10px;min-width:0}.ptb-field{display:flex;flex:1 1 190px;flex-direction:column;gap:4px;min-width:0}.ptb-field-label{color:var(--ptb-muted);font-size:10px;font-weight:700;text-transform:uppercase}.ptb-input{width:100%;min-width:0;border:1px solid var(--ptb-line);border-radius:6px;padding:7px 8px;color:var(--ptb-text);background:#101010;outline:none}.ptb-input:focus{border-color:var(--ptb-accent)}
      .ptb-picker{position:relative;display:flex;flex:1 1 220px;flex-direction:column;gap:7px;min-width:0}.ptb-icon-picker{flex:1 1 220px}.ptb-color-row{display:flex;gap:8px;align-items:center}.ptb-icon-button,.ptb-color-button{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:1px solid var(--ptb-line);border-radius:7px;padding:0;background:transparent;cursor:pointer}.ptb-color-input{width:92px;max-width:92px}.ptb-popover{display:flex;flex-direction:column;gap:8px;width:190px;margin-top:2px;border:1px solid var(--ptb-line);border-radius:8px;padding:8px;background:#181818}.ptb-icon-popover{width:100%;max-height:190px;margin:0;overflow:auto}.ptb-color-grid,.ptb-icon-grid{display:flex;flex-wrap:wrap;gap:5px}.ptb-color-choice,.ptb-icon-choice{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--ptb-line);border-radius:6px;padding:0;color:var(--ptb-text);background:transparent;cursor:pointer}.ptb-icon-choice{width:42px;height:42px}.ptb-color-choice.active,.ptb-icon-choice.active{border-color:var(--ptb-accent);box-shadow:0 0 0 1px var(--ptb-accent)}
      .ptb-collections-board{display:flex;flex-direction:column;gap:10px;padding:12px}.ptb-collection-drop-card{display:flex;flex-direction:column;gap:10px;min-width:0;border:1px solid var(--ptb-line);border-radius:8px;padding:10px;background:#242424}.ptb-collection-header-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}.ptb-collection-name-input{width:100%;min-width:160px;flex:1 1 180px;border:1px solid var(--ptb-line);border-radius:6px;padding:7px 8px;color:var(--ptb-text);background:#101010;font-weight:800;outline:none}.ptb-bar-toggles,.ptb-card-actions{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}.ptb-bar-toggle{min-width:30px;min-height:26px;font-size:10px;font-weight:800}.ptb-bar-toggle.active{color:#e9fff3;border-color:#4ade80;background:#14532d}
      .ptb-bar-control-grid{display:flex;flex-wrap:wrap;gap:8px;padding:12px}.ptb-bar-control{display:flex;align-items:end;gap:8px;min-width:210px}.ptb-collection-member-list{display:flex;flex-wrap:wrap;gap:6px;min-width:0}.ptb-collection-member{position:relative;width:150px;min-width:150px;padding:7px}.ptb-collection-member.drag-over{border-color:var(--ptb-accent);background:#223446}.ptb-collection-member.drop-before{box-shadow:-4px 0 0 #9fe3c1}.ptb-collection-member.drop-after{box-shadow:4px 0 0 #9fe3c1}.ptb-collection-member-list.drop-tail{box-shadow:inset -4px 0 0 #9fe3c1}.ptb-icon-action{min-width:26px;min-height:24px;padding:3px 6px;font-size:10px}.ptb-drop-hint{min-height:42px;width:100%;border:1px dashed var(--ptb-line);border-radius:7px;padding:12px;color:var(--ptb-muted);background:rgba(255,255,255,.02);text-align:center}.ptb-add-existing-row{max-width:280px}.ptb-muted{margin:7px 0 0;color:var(--ptb-muted);line-height:1.35}.ptb-module-error,.ptb-render-error{padding:12px;color:#ffd8d5;background:rgba(255,116,107,.08)}
      @media(max-width:620px){.ptb-settings-header{align-items:stretch;flex-direction:column}.ptb-header-actions,.ptb-card-actions,.ptb-bar-toggles{justify-content:flex-start}.ptb-gallery-card,.ptb-collection-member{width:100%;min-width:0}.ptb-collection-name-input,.ptb-field{flex-basis:100%}}
    `;
      if (document.head) {
        document.head.appendChild(style);
      }
    }
  }

  // Apply inline critical styles so controls stay usable even if UXP ignores cached CSS.
  function setStyles(node, styles) {
    Object.keys(styles).forEach((key) => {
      node.style[key] = styles[key];
    });
  }

  // Apply stable inline styling for the controls that were falling back to raw UXP defaults.
  function skinElement(node) {
    const tokens = node.className ? String(node.className).split(/\s+/) : [];
    const tag = String(node.tagName || "").toLowerCase();
    const sharedButton = {
      border: "1px solid var(--ptb-line)",
      borderRadius: "7px",
      color: "var(--ptb-text)",
      background: "var(--ptb-panel-soft)",
      cursor: "pointer"
    };
    if (tag === "button") {
      setStyles(node, { appearance: "none", font: "inherit" });
    }
    if (tag === "input" || tag === "select" || tag === "textarea") {
      setStyles(node, { font: "inherit" });
    }
    if (tag === "h1") {
      setStyles(node, { margin: "0", fontSize: "16px", fontWeight: "800", whiteSpace: "nowrap" });
    }
    if (tag === "h2" || tag === "h3") {
      setStyles(node, { margin: "0", color: "var(--ptb-text)", fontSize: "12px", fontWeight: "800" });
    }
    if (tag === "small") {
      setStyles(node, { overflow: "hidden", color: "var(--ptb-muted)", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    }
    if (tag === "strong") {
      setStyles(node, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "900" });
    }
    if (tokens.includes("ptb-toolbar-shell")) {
      setStyles(node, { width: "100%", height: "100%", minHeight: "44px", padding: "3px", overflow: "auto", background: "var(--ptb-bg)" });
    }
    if (tokens.includes("ptb-toolbar-strip")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", alignItems: "flex-start", alignContent: "flex-start", justifyContent: "flex-start", gap: "1px", width: "100%", minHeight: "34px" });
    }
    if (tokens.includes("ptb-toolbar-strip") && node.parentNode && String(node.parentNode.className || "").includes("ptb-vertical")) {
      setStyles(node, { flexDirection: "column", flexWrap: "wrap", alignContent: "flex-start", width: "auto", height: "100%", maxHeight: "100%" });
    }
    if (tokens.includes("ptb-vertical") && tokens.includes("ptb-toolbar-shell")) {
      setStyles(node, { width: "auto", minWidth: "40px" });
    }
    if (tokens.includes("ptb-tool-button")) {
      setStyles(node, Object.assign({}, sharedButton, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 34px",
        width: "34px",
        minWidth: "34px",
        height: "34px",
        minHeight: "34px",
        margin: "0",
        padding: "0"
      }));
    }
    if (tokens.includes("ptb-button-face")) {
      setStyles(node, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", minWidth: "0" });
    }
    if (tokens.includes("with-caption")) {
      setStyles(node, { flexDirection: "column", gap: "1px" });
    }
    if (tokens.includes("ptb-image-icon")) {
      setStyles(node, { display: "block", width: "22px", height: "22px", objectFit: "contain", border: "0", background: "transparent", outline: "0", pointerEvents: "none" });
    }
    if (tokens.includes("ptb-tool-text") || tokens.includes("ptb-tool-caption")) {
      setStyles(node, { display: "block", maxWidth: "31px", overflow: "hidden", fontSize: "10px", fontWeight: "900", letterSpacing: "0", lineHeight: "1", textAlign: "center", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    }
    if (tokens.includes("ptb-tool-caption")) {
      setStyles(node, { fontSize: "8px", lineHeight: "8px" });
    }
    if (tokens.includes("ptb-empty")) {
      setStyles(node, { minWidth: "0", color: "var(--ptb-muted)", fontSize: "11px", lineHeight: "1.2" });
    }
    if (tokens.includes("ptb-settings-shell")) {
      setStyles(node, { width: "100%", height: "100%", minHeight: "100%", overflow: "auto", paddingBottom: "24px", background: "var(--ptb-bg)", color: "var(--ptb-text)" });
    }
    if (tokens.includes("ptb-settings-header")) {
      setStyles(node, { position: "sticky", top: "0", zIndex: "4", display: "flex", width: "100%", alignItems: "center", justifyContent: "flex-start", gap: "10px", padding: "10px 12px", borderBottom: "1px solid var(--ptb-line)", background: "var(--ptb-bg)" });
    }
    if (tokens.includes("ptb-title-line")) {
      setStyles(node, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });
    }
    if (tokens.includes("ptb-version") || tokens.includes("ptb-status-badge")) {
      setStyles(node, { display: "inline-flex", alignItems: "center", minHeight: "20px", border: "1px solid var(--ptb-line)", borderRadius: "999px", padding: "2px 7px", color: "var(--ptb-muted)", background: "#1a1a1a", fontSize: "10px", fontWeight: "700", whiteSpace: "nowrap" });
    }
    if (tokens.includes("ptb-status-badge")) {
      setStyles(node, { color: "var(--ptb-accent)" });
    }
    if (tokens.includes("ptb-header-actions") || tokens.includes("ptb-action-row") || tokens.includes("ptb-card-actions") || tokens.includes("ptb-bar-toggles")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "7px" });
    }
    if (tokens.includes("ptb-header-actions")) {
      setStyles(node, { marginLeft: "auto" });
    }
    if (tokens.includes("ptb-card-actions") || tokens.includes("ptb-bar-toggles")) {
      setStyles(node, { gap: "4px", justifyContent: "flex-end" });
    }
    if (tokens.includes("ptb-settings-content")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "12px", width: "100%", minWidth: "0", padding: "12px" });
    }
    if (tokens.includes("ptb-section")) {
      setStyles(node, { display: "block", width: "100%", minWidth: "0", border: "1px solid var(--ptb-line)", borderRadius: "8px", background: "var(--ptb-panel)" });
    }
    if (tokens.includes("ptb-section-heading")) {
      setStyles(node, { display: "flex", alignItems: "center", gap: "8px", minHeight: "42px", padding: "10px 12px", borderBottom: "1px solid var(--ptb-line)" });
    }
    if (tokens.includes("ptb-section-body")) {
      setStyles(node, { display: "block", minWidth: "0", minHeight: "18px", padding: "0" });
    }
    if (tokens.includes("collapsed")) {
      setStyles(node, { borderBottom: "0" });
    }
    if (tokens.includes("ptb-section-toggle")) {
      setStyles(node, Object.assign({}, sharedButton, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", flex: "0 0 22px", fontWeight: "800" }));
    }
    if (tokens.includes("ptb-button")) {
      setStyles(node, Object.assign({}, sharedButton, { minHeight: "30px", padding: "6px 10px", fontWeight: "700" }));
    }
    if (tokens.includes("primary")) {
      setStyles(node, { borderColor: "rgba(121, 200, 255, 0.7)", background: "#224259" });
    }
    if (tokens.includes("compact")) {
      setStyles(node, { minHeight: "26px", padding: "5px 8px", whiteSpace: "nowrap" });
    }
    if (tokens.includes("danger")) {
      setStyles(node, { color: "#ffd8d5", borderColor: "rgba(255, 116, 107, 0.45)" });
    }
    if (tokens.includes("ptb-gallery-grid")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px" });
    }
    if (tokens.includes("ptb-gallery-card") || tokens.includes("ptb-collection-member")) {
      setStyles(node, Object.assign({}, sharedButton, { display: "flex", alignItems: "center", gap: "9px", minWidth: "0", textAlign: "left" }));
    }
    if (tokens.includes("ptb-gallery-card")) {
      setStyles(node, { width: "150px", minWidth: "150px", padding: "9px" });
    }
    if (tokens.includes("active")) {
      setStyles(node, { borderColor: "var(--ptb-accent)", background: "#223446" });
    }
    if (tokens.includes("ptb-card-icon")) {
      setStyles(node, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", flex: "0 0 34px", borderRadius: "7px" });
    }
    if (tokens.includes("ptb-button-card-text")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" });
    }
    if (tokens.includes("ptb-editor-shell") || tokens.includes("ptb-icon-editor") || tokens.includes("ptb-import-export")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "12px", minWidth: "0", padding: "12px" });
    }
    if (tokens.includes("ptb-form-grid")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "10px", minWidth: "0" });
    }
    if (tokens.includes("ptb-catalog-picker")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end", marginTop: "12px" });
    }
    if (tokens.includes("ptb-fieldset")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" });
    }
    if (tokens.includes("ptb-field")) {
      setStyles(node, { display: "flex", flex: "1 1 190px", flexDirection: "column", gap: "4px", minWidth: "0" });
    }
    if (tokens.includes("ptb-field-label")) {
      setStyles(node, { color: "var(--ptb-muted)", fontSize: "10px", fontWeight: "700", textTransform: "uppercase" });
    }
    if (tokens.includes("ptb-input")) {
      setStyles(node, { width: "100%", minWidth: "0", border: "1px solid var(--ptb-line)", borderRadius: "6px", padding: "7px 8px", color: "var(--ptb-text)", background: "#101010", outline: "none" });
    }
    if (tokens.includes("ptb-picker")) {
      setStyles(node, { position: "relative", display: "flex", flex: "1 1 220px", flexDirection: "column", gap: "7px", minWidth: "0" });
    }
    if (tokens.includes("ptb-icon-picker")) {
      setStyles(node, { flex: "1 1 220px" });
    }
    if (tokens.includes("ptb-color-row")) {
      setStyles(node, { display: "flex", gap: "8px", alignItems: "center" });
    }
    if (tokens.includes("ptb-color-button") || tokens.includes("ptb-icon-button")) {
      setStyles(node, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "42px", height: "42px", border: "1px solid var(--ptb-line)", borderRadius: "7px", padding: "0", background: "transparent", cursor: "pointer" });
    }
    if (tokens.includes("ptb-icon-button")) {
      setStyles(node, { background: "var(--ptb-panel-soft)", backgroundColor: "var(--ptb-panel-soft)" });
    }
    if (tokens.includes("ptb-popover")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "8px", width: "190px", marginTop: "2px", border: "1px solid var(--ptb-line)", borderRadius: "8px", padding: "8px", background: "#181818" });
    }
    if (tokens.includes("ptb-icon-popover")) {
      setStyles(node, { width: "100%", maxHeight: "190px", margin: "0", overflow: "auto" });
    }
    if (tokens.includes("ptb-color-grid") || tokens.includes("ptb-icon-grid")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "5px" });
    }
    if (tokens.includes("ptb-color-choice") || tokens.includes("ptb-icon-choice")) {
      setStyles(node, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", border: "1px solid var(--ptb-line)", borderRadius: "6px", padding: "0", background: "transparent", cursor: "pointer" });
    }
    if (tokens.includes("ptb-icon-choice")) {
      setStyles(node, { width: "42px", height: "42px", background: "var(--ptb-panel-soft)", backgroundColor: "var(--ptb-panel-soft)" });
    }
    if (tokens.includes("ptb-color-input")) {
      setStyles(node, { width: "92px", maxWidth: "92px" });
    }
    if (tokens.includes("active") && (tokens.includes("ptb-color-choice") || tokens.includes("ptb-icon-choice"))) {
      setStyles(node, { borderColor: "var(--ptb-accent)", boxShadow: "0 0 0 1px var(--ptb-accent)" });
    }
    if (tokens.includes("ptb-collections-board")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "10px", padding: "12px" });
    }
    if (tokens.includes("ptb-collection-drop-card")) {
      setStyles(node, { display: "flex", flexDirection: "column", gap: "10px", minWidth: "0", border: "1px solid var(--ptb-line)", borderRadius: "8px", padding: "10px", background: "#242424" });
    }
    if (tokens.includes("ptb-bar-control-grid")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px" });
    }
    if (tokens.includes("ptb-bar-control")) {
      setStyles(node, { display: "flex", alignItems: "end", gap: "8px", minWidth: "210px" });
    }
    if (tokens.includes("ptb-collection-header-row")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", minWidth: "0" });
    }
    if (tokens.includes("ptb-collection-name-input")) {
      setStyles(node, { width: "100%", minWidth: "160px", flex: "1 1 180px", border: "1px solid var(--ptb-line)", borderRadius: "6px", padding: "7px 8px", color: "var(--ptb-text)", background: "#101010", fontWeight: "800", outline: "none" });
    }
    if (tokens.includes("ptb-bar-toggle")) {
      setStyles(node, Object.assign({}, sharedButton, { minWidth: "30px", minHeight: "26px", fontSize: "10px", fontWeight: "800" }));
    }
    if (tokens.includes("ptb-bar-toggle") && tokens.includes("active")) {
      setStyles(node, { color: "#e9fff3", borderColor: "#4ade80", background: "#14532d" });
    }
    if (tokens.includes("ptb-collection-member-list")) {
      setStyles(node, { display: "flex", flexWrap: "wrap", gap: "6px", minWidth: "0" });
    }
    if (tokens.includes("ptb-collection-member")) {
      setStyles(node, { position: "relative", width: "150px", minWidth: "150px", padding: "7px" });
    }
    if (tokens.includes("drop-before")) {
      setStyles(node, { boxShadow: "-4px 0 0 #9fe3c1" });
    }
    if (tokens.includes("drop-after")) {
      setStyles(node, { boxShadow: "4px 0 0 #9fe3c1" });
    }
    if (tokens.includes("drop-tail")) {
      setStyles(node, { boxShadow: "inset -4px 0 0 #9fe3c1" });
    }
    if (tokens.includes("ptb-icon-action")) {
      setStyles(node, Object.assign({}, sharedButton, { minWidth: "26px", minHeight: "24px", padding: "3px 6px", fontSize: "10px" }));
    }
    if (tokens.includes("ptb-drop-hint")) {
      setStyles(node, { minHeight: "42px", border: "1px dashed var(--ptb-line)", borderRadius: "7px", padding: "12px", color: "var(--ptb-muted)", background: "rgba(255,255,255,0.02)", textAlign: "center" });
    }
    if (tokens.includes("ptb-add-existing-row")) {
      setStyles(node, { maxWidth: "280px" });
    }
    if (tokens.includes("ptb-muted")) {
      setStyles(node, { margin: "7px 0 0", color: "var(--ptb-muted)", lineHeight: "1.35" });
    }
    if (tokens.includes("ptb-module-error") || tokens.includes("ptb-render-error")) {
      setStyles(node, { padding: "12px", color: "#ffd8d5", background: "rgba(255, 116, 107, 0.08)" });
    }
  }

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
    skinElement(node);
    return node;
  }

  // Create a button with a click handler.
  function actionButton(label, className, onClick) {
    const button = el("button", className || "ptb-button", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  // Create a custom clickable control when UXP native buttons draw unwanted gray inner panels.
  function clickControl(className, onClick) {
    const control = el("div", className || "ptb-button");
    control.setAttribute("role", "button");
    control.tabIndex = 0;
    control.addEventListener("click", onClick);
    control.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick(event);
      }
    });
    return control;
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

  // Return the user-facing button name shown in galleries, collections, and tooltips.
  function getButtonName(button) {
    return button ? (button.textOverride || button.label || "Button") : "Button";
  }

  // Return the three-character label used only when the user chooses text mode.
  function getButtonShortText(button) {
    return getButtonName(button).replace(/\s+/g, "").slice(0, 3).toUpperCase() || "BTN";
  }

  // Return the saved display mode with a safe fallback for older configs.
  function getButtonDisplayMode(button) {
    if (button && button.displayMode === "text") {
      return "text";
    }
    if (button && button.displayMode === "both") {
      return "both";
    }
    return "icon";
  }

  // Read the unified effect identifier field shown in the editor.
  function getEffectLookupValue(button) {
    return button && button.effect ? (button.effect.displayName || button.effect.matchName || "") : "";
  }

  // Store a manual effect entry as both display lookup and direct match-name candidate.
  function setEffectLookupValue(button, value) {
    const lookup = value && value.trim ? value.trim() : "";
    button.effect.displayName = lookup;
    button.effect.matchName = lookup;
  }

  // Return a valid hex color for text and icon rendering.
  function getSafeIconColor(button) {
    return /^#[0-9a-f]{6}$/i.test(button && button.iconColor || "") ? button.iconColor : "#f0f0f0";
  }

  // Create an inline SVG icon that inherits the selected icon color.
  function createIconImage(iconId, color, title) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#f0f0f0";
    const icon = root.PTB_ICON_LIBRARY.getIcon(iconId);
    const node = el("span", "ptb-svg-icon ptb-image-icon");
    node.title = title || icon.label;
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", title || icon.label);
    setStyles(node, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", color: safeColor, background: "transparent", pointerEvents: "none" });
    node.innerHTML = root.PTB_ICON_LIBRARY.getIconSvg(icon.id);
    return node;
  }

  // Render the actual button face as icon, short text, or icon plus short text.
  function renderButtonFace(button) {
    const mode = getButtonDisplayMode(button);
    const shortText = escapeHtml(getButtonShortText(button));
    const textColor = getSafeIconColor(button);
    const textStyle = ' style="color:' + textColor + ';-webkit-text-fill-color:' + textColor + ';"';
    if (mode === "text") {
      return '<span class="ptb-button-face"><span class="ptb-tool-text"' + textStyle + ">" + shortText + "</span></span>";
    }
    if (mode === "both") {
      return '<span class="ptb-button-face with-caption">' + root.PTB_ICON_LIBRARY.renderIcon(button.icon, button.iconColor, getButtonName(button)) + '<span class="ptb-tool-caption"' + textStyle + ">" + shortText + "</span></span>";
    }
    return '<span class="ptb-button-face">' + root.PTB_ICON_LIBRARY.renderIcon(button.icon, button.iconColor, getButtonName(button)) + "</span>";
  }

  // Render the actual button face as DOM nodes so UXP receives color styles directly.
  function renderButtonFaceElement(button) {
    const mode = getButtonDisplayMode(button);
    const textColor = getSafeIconColor(button);
    const face = el("span", mode === "both" ? "ptb-button-face with-caption" : "ptb-button-face");
    setStyles(face, { color: textColor });
    if (mode === "icon" || mode === "both") {
      face.appendChild(createIconImage(button.icon, textColor, getButtonName(button)));
    }
    if (mode === "text" || mode === "both") {
      const text = el("span", mode === "both" ? "ptb-tool-caption" : "ptb-tool-text", getButtonShortText(button));
      setStyles(text, { color: textColor, webkitTextFillColor: textColor });
      face.appendChild(text);
    }
    return face;
  }

  // Escape short text before assigning it through innerHTML.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  // Keep the stored label and visible button name in sync.
  function setButtonName(button, value) {
    const name = value && value.trim() ? value.trim() : "Button";
    button.textOverride = name;
    button.label = name;
  }

  // Generate the default name for the next created button.
  function nextButtonName() {
    return "Button " + (config.buttons.length + 1);
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
      if (rootNode && rootNode.ownerDocument) {
        renderPanel(rootNode, panelId);
      }
    });
  }

  // Keep every dockable bar on the same compact horizontal layout.
  function shouldRenderVertical(rootNode, bar) {
    return Boolean(bar && bar.orientation === "vertical");
  }

  // Save the active editor selection without changing the visible status.
  function persistSelection() {
    config.activeCollectionId = settingsState.selectedCollectionId;
    config.activeButtonId = settingsState.selectedButtonId;
    config = root.PTB_STORAGE.saveConfig(config);
  }

  // Select a button from the gallery or a collection card.
  function selectButton(buttonId, collectionId) {
    if (collectionId) {
      settingsState.selectedCollectionId = collectionId;
    }
    settingsState.selectedButtonId = buttonId;
    persistSelection();
    renderAll();
  }

  // Select a collection for import/export and visual focus.
  function selectCollection(collectionId) {
    settingsState.selectedCollectionId = collectionId;
    const firstButton = getCollectionButtons(collectionId)[0];
    if (firstButton) {
      settingsState.selectedButtonId = firstButton.id;
    }
    persistSelection();
    renderAll();
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

  // Create a compact inline input for collection names.
  function inlineTextInput(value, title, onInput) {
    const input = el("input", "ptb-collection-name-input");
    input.title = title;
    input.value = value || "";
    input.addEventListener("focus", () => {
      settingsState.selectedCollectionId = input.dataset.collectionId || settingsState.selectedCollectionId;
    });
    input.addEventListener("input", () => {
      // Keep the current DOM stable while the user types.
      onInput(input.value);
      statusMessage = root.PTB_I18N.t("statusSaved");
    });
    input.addEventListener("change", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
    input.addEventListener("blur", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
    return input;
  }

  // Normalize a color value to a valid hex color.
  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  }

  // Create a compact custom color picker because native type=color is unreliable in Premiere UXP.
  function colorPicker(id, label, value, onChange) {
    const current = normalizeColor(value, "#8fd6ff");
    const wrap = el("div", "ptb-picker");
    wrap.appendChild(el("span", "ptb-field-label", label));
    const row = el("div", "ptb-color-row");
    const pickerKey = id + ":" + label;
    const preview = clickControl("ptb-color-button", () => {
      settingsState.openColorPicker = settingsState.openColorPicker === pickerKey ? "" : pickerKey;
      renderAll();
    });
    preview.title = label;
    preview.style.background = current;
    row.appendChild(preview);
    const input = el("input", "ptb-input ptb-color-input");
    input.value = current;
    input.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(input.value)) {
        const next = input.value;
        preview.style.background = next;
        onChange(next);
        statusMessage = root.PTB_I18N.t("statusSaved");
      }
    });
    input.addEventListener("change", () => saveAndRender(root.PTB_I18N.t("statusSaved")));
    row.appendChild(input);
    wrap.appendChild(row);
    if (settingsState.openColorPicker === pickerKey) {
      const popover = el("div", "ptb-popover");
      const grid = el("div", "ptb-color-grid");
      colorPalette.forEach((color) => {
        const swatch = clickControl(color.toLowerCase() === current.toLowerCase() ? "ptb-color-choice active" : "ptb-color-choice", () => {
          onChange(color);
          settingsState.openColorPicker = "";
          saveAndRender(root.PTB_I18N.t("statusSaved"));
        });
        swatch.title = color;
        swatch.style.background = color;
        grid.appendChild(swatch);
      });
      popover.appendChild(grid);
      wrap.appendChild(popover);
    }
    return wrap;
  }

  // Create an icon picker that opens only when requested, matching the color picker behavior.
  function iconPicker(button) {
    const wrap = el("div", "ptb-picker ptb-icon-picker");
    wrap.appendChild(el("span", "ptb-field-label", root.PTB_I18N.t("icon")));
    const pickerKey = button.id + ":icon";
    const row = el("div", "ptb-color-row");
    const preview = clickControl("ptb-icon-button", () => {
      settingsState.openIconPicker = settingsState.openIconPicker === pickerKey ? "" : pickerKey;
      renderAll();
    });
    preview.title = root.PTB_I18N.t("icon");
    preview.style.background = button.accentColor || "#2b3037";
    preview.style.backgroundColor = button.accentColor || "#2b3037";
    preview.style.borderColor = "var(--ptb-line)";
    preview.appendChild(createIconImage(button.icon, button.iconColor, getButtonName(button)));
    row.appendChild(preview);
    wrap.appendChild(row);
    return wrap;
  }

  // Render the full-width icon gallery below the icon and color controls.
  function renderIconPickerPopover(button) {
    if (settingsState.openIconPicker !== button.id + ":icon") {
      return null;
    }
    const popover = el("div", "ptb-popover ptb-icon-popover");
    const grid = el("div", "ptb-icon-grid");
    const activeIconId = root.PTB_ICON_LIBRARY.normalizeIconId(button.icon);
    root.PTB_ICON_LIBRARY.icons.forEach((icon) => {
      const item = clickControl(icon.id === activeIconId ? "ptb-icon-choice active" : "ptb-icon-choice", () => {
        button.icon = icon.id;
        settingsState.openIconPicker = "";
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      });
      item.title = icon.label;
      item.style.background = button.accentColor || "#2b3037";
      item.style.backgroundColor = button.accentColor || "#2b3037";
      item.appendChild(createIconImage(icon.id, button.iconColor, icon.label));
      grid.appendChild(item);
    });
    popover.appendChild(grid);
    return popover;
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

  // Create a select input with options.
  function createSelect(value, options, className, onChange) {
    const select = el("select", className || "ptb-input");
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
    return select;
  }

  // Create a labeled select input.
  function selectField(label, value, options, onChange) {
    const wrap = el("label", "ptb-field");
    wrap.appendChild(el("span", "ptb-field-label", label));
    wrap.appendChild(createSelect(value, options, "ptb-input", onChange));
    return wrap;
  }

  // Open a declared UXP panel from another panel.
  function openPanel(context, panelId) {
    try {
      const pluginId = context && context.getPluginId ? context.getPluginId() : "";
      const plugins = context && context.pluginManager ? Array.from(context.pluginManager.plugins) : [];
      const plugin = plugins.find((item) => item.id === pluginId);
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
    ensureHeadStyles();
    try {
      if (panelId === "ptb-settings") {
        renderSettingsPanel(rootNode);
        return;
      }
      renderBarPanel(rootNode, panelId);
    } catch (error) {
      rootNode.appendChild(renderErrorPanel(error));
    }
  }

  // Render one compact dockable toolbar panel.
  function renderBarPanel(rootNode, panelId) {
    const bar = getBar(panelIdToBarId(panelId));
    const collection = bar ? getCollection(bar.collectionId) : null;
    const buttons = collection && bar.enabled ? getCollectionButtons(collection.id) : [];
    const isVertical = bar && shouldRenderVertical(rootNode, bar);
    const shell = el("section", "ptb-toolbar-shell " + (isVertical ? "ptb-vertical" : ""));
    const strip = el("div", "ptb-toolbar-strip");
    if (isVertical) {
      // Apply the vertical layout inline too because docked UXP panels can miss descendant CSS rules.
      setStyles(shell, { width: "auto", minWidth: "40px" });
      setStyles(strip, { flexDirection: "column", flexWrap: "wrap", alignContent: "flex-start", width: "auto", height: "100%", maxHeight: "100%", minWidth: "34px" });
    }
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
    const toolButton = clickControl("ptb-tool-button", async () => {
      if (button.actionType === "settings") {
        openPanel(context, "ptb-settings");
        return;
      }
      await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
        await root.PTB_PREMIERE.applyButton(button);
      });
    });
    toolButton.title = getButtonName(button);
    toolButton.style.background = button.accentColor || "#2b3037";
    toolButton.style.backgroundColor = button.accentColor || "#2b3037";
    toolButton.style.color = button.iconColor || "#f0f0f0";
    toolButton.style.borderColor = "rgba(255,255,255,0.12)";
    toolButton.appendChild(renderButtonFaceElement(button));
    return toolButton;
  }

  // Run an async operation and render status or errors.
  async function runWithStatus(workingMessage, operation) {
    statusMessage = workingMessage;
    renderAll();
    try {
      await operation();
      if (statusMessage === workingMessage) {
        statusMessage = root.PTB_I18N.t("statusReady");
      }
    } catch (error) {
      statusMessage = error && error.message ? error.message : String(error);
    }
    renderAll();
  }

  // Render the full settings workspace.
  function renderSettingsPanel(rootNode) {
    startBackupRestore();
    ensureSettingsSelection();
    const shell = el("div", "ptb-settings-shell");
    shell.appendChild(renderSettingsHeader());
    const content = el("div", "ptb-settings-content");
    shell.appendChild(content);
    rootNode.appendChild(shell);
    // Append every module after the shell is visible so UXP never leaves the settings panel blank.
    appendSettingsModule(content, root.PTB_I18N.t("buttonGallery"), fillButtonGallery);
    appendSettingsModule(content, root.PTB_I18N.t("buttonEditor"), fillButtonEditor);
    appendSettingsModule(content, root.PTB_I18N.t("barControls"), fillBarControls);
    appendSettingsModule(content, root.PTB_I18N.t("collections"), fillCollectionsBoard);
    appendSettingsModule(content, root.PTB_I18N.t("data"), fillImportExportSettings);
  }

  // Render the compact settings header with version and top actions.
  function renderSettingsHeader() {
    const header = el("header", "ptb-settings-header");
    const title = el("div", "ptb-title-line");
    title.appendChild(el("h1", "", root.PTB_I18N.t("appName")));
    title.appendChild(el("span", "ptb-version", "v" + (root.PTB_VERSION || "")));
    const status = renderStatusBadge();
    if (status) {
      title.appendChild(status);
    }
    header.appendChild(title);
    header.appendChild(renderHeaderActions());
    return header;
  }

  // Render status only when it carries useful information.
  function renderStatusBadge() {
    if (!statusMessage || statusMessage === root.PTB_I18N.t("statusReady") || statusMessage === root.PTB_I18N.t("statusSaved")) {
      return null;
    }
    return el("span", "ptb-status-badge", statusMessage);
  }

  // Render always-visible settings actions in the header.
  function renderHeaderActions() {
    const actions = el("div", "ptb-header-actions");
    actions.appendChild(actionButton(root.PTB_I18N.t("backupButtons"), "ptb-button compact", () => exportPayload(false, "ToolBar-buttons-backup.json")));
    actions.appendChild(actionButton(root.PTB_I18N.t("restoreButtons"), "ptb-button compact", () => importPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("addButton"), "ptb-button primary compact", () => createLibraryButton()));
    actions.appendChild(actionButton(root.PTB_I18N.t("addCollection"), "ptb-button compact", () => createNewCollection()));
    return actions;
  }

  // Render one always-visible settings module.
  function renderSettingsModule(title) {
    const section = el("div", "ptb-section");
    const header = el("div", "ptb-section-heading");
    const body = el("div", "ptb-section-body");
    header.appendChild(el("h2", "", title));
    section.appendChild(header);
    section.appendChild(body);
    return { section, body };
  }

  // Add one settings module first, then fill it while it is already attached to the UXP DOM.
  function appendSettingsModule(content, title, fillBody) {
    const module = renderSettingsModule(title);
    content.appendChild(module.section);
    try {
      fillBody(module.body);
    } catch (error) {
      clearNode(module.body);
      fillModuleError(module.body, error);
    }
  }

  // Empty a node without replacing the node itself, which is safer in UXP panels.
  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    node.innerHTML = "";
  }

  // Fill an inline module error instead of silently dropping the whole settings workspace.
  function fillModuleError(target, error) {
    const errorNode = el("div", "ptb-module-error");
    errorNode.appendChild(el("strong", "", "This module could not render."));
    errorNode.appendChild(el("p", "ptb-muted", error && error.message ? error.message : String(error)));
    target.appendChild(errorNode);
  }

  // Render a visible error block instead of leaving the panel blank.
  function renderErrorPanel(error) {
    const section = el("div", "ptb-panel ptb-render-error");
    section.appendChild(el("h2", "", "Render Error"));
    section.appendChild(el("p", "ptb-muted", error && error.message ? error.message : String(error)));
    return section;
  }

  // Render the draggable global button gallery.
  function renderButtonGallery() {
    const gallery = el("div", "ptb-gallery-grid");
    if (!config.buttons.length) {
      gallery.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonSelected")));
      return gallery;
    }
    config.buttons.forEach((button) => {
      gallery.appendChild(renderGalleryButtonCard(button));
    });
    return gallery;
  }

  // Fill the button gallery after its module body is already mounted.
  function fillButtonGallery(target) {
    target.appendChild(renderButtonGallery());
  }

  // Render one draggable gallery item.
  function renderGalleryButtonCard(button) {
    const card = el("div", button.id === settingsState.selectedButtonId ? "ptb-gallery-card active" : "ptb-gallery-card");
    card.addEventListener("click", () => {
      selectButton(button.id);
      clearPendingDrag();
    });
    card.addEventListener("mousedown", () => beginButtonDrag(button.id, ""));
    card.addEventListener("pointerdown", () => beginButtonDrag(button.id, ""));
    card.title = getButtonName(button);
    card.draggable = true;
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (event) => {
      // Share the button id with collection drop zones.
      writeDraggedButton(event, button.id, "");
    });
    card.addEventListener("dragend", () => {
      applyPendingDragTarget();
    });
    card.appendChild(renderButtonSwatch(button));
    const text = el("span", "ptb-button-card-text");
    text.appendChild(el("strong", "", getButtonName(button)));
    text.style.color = button.iconColor || "var(--ptb-text)";
    card.appendChild(text);
    return card;
  }

  // Render a compact visual swatch for a button.
  function renderButtonSwatch(button) {
    const icon = el("span", "ptb-card-icon");
    icon.style.background = button.accentColor || "#2b3037";
    icon.style.backgroundColor = button.accentColor || "#2b3037";
    icon.style.border = "1px solid rgba(255,255,255,0.12)";
    icon.appendChild(renderButtonFaceElement(button));
    return icon;
  }

  // Render all editable properties for a selected button.
  function renderButtonEditor(button) {
    const editor = el("div", "ptb-editor-shell");
    if (!button) {
      editor.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("noButtonSelected")));
      return editor;
    }
    const form = el("div", "ptb-form-grid");
    form.appendChild(textField(root.PTB_I18N.t("buttonName"), getButtonName(button), (value) => {
      setButtonName(button, value);
    }));
    form.appendChild(selectField(root.PTB_I18N.t("displayMode"), getButtonDisplayMode(button), [
      { value: "icon", label: root.PTB_I18N.t("displayModeIcon") },
      { value: "text", label: root.PTB_I18N.t("displayModeText") },
      { value: "both", label: root.PTB_I18N.t("displayModeBoth") }
    ], (value) => {
      button.displayMode = value === "text" || value === "both" ? value : "icon";
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    form.appendChild(selectField(root.PTB_I18N.t("action"), button.actionType, [
      { value: "settings", label: root.PTB_I18N.t("settings") },
      { value: "effect", label: root.PTB_I18N.t("nativeEffect") },
      { value: "transition", label: root.PTB_I18N.t("videoTransition") },
      { value: "preset", label: root.PTB_I18N.t("presetAction") }
    ], (value) => {
      button.actionType = value;
      if (value === "preset" && !button.preset.name) {
        button.preset.name = getButtonName(button);
      }
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    editor.appendChild(form);
    editor.appendChild(renderActionFields(button));
    editor.appendChild(renderIconEditor(button));
    const actions = el("div", "ptb-action-row tight");
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateButton"), "ptb-button compact", () => duplicateLibraryButton(button.id)));
    actions.appendChild(actionButton(root.PTB_I18N.t("deleteButton"), "ptb-button compact danger", () => deleteLibraryButton(button.id)));
    editor.appendChild(actions);
    return editor;
  }

  // Fill the selected button editor after its module body is already mounted.
  function fillButtonEditor(target) {
    target.appendChild(renderButtonEditor(getButton(settingsState.selectedButtonId)));
  }

  // Render compact controls for each dockable toolbar orientation.
  function renderBarControls() {
    const wrap = el("div", "ptb-bar-control-grid");
    config.bars.forEach((bar, index) => {
      const row = el("div", "ptb-bar-control");
      row.appendChild(el("strong", "", "B" + (index + 1)));
      row.appendChild(selectField(root.PTB_I18N.t("barOrientation"), bar.orientation === "vertical" ? "vertical" : "horizontal", [
        { value: "horizontal", label: root.PTB_I18N.t("barHorizontal") },
        { value: "vertical", label: root.PTB_I18N.t("barVertical") }
      ], (value) => {
        bar.orientation = value === "vertical" ? "vertical" : "horizontal";
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Fill the compact bar controls module.
  function fillBarControls(target) {
    target.appendChild(renderBarControls());
  }

  // Render action-specific button fields.
  function renderActionFields(button) {
    const wrap = el("div", "ptb-fieldset");
    if (button.actionType === "settings") {
      wrap.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("settingsButtonDescription")));
      return wrap;
    }
    if (button.actionType === "transition") {
      const grid = el("div", "ptb-form-grid");
      grid.appendChild(textField(root.PTB_I18N.t("transitionMatchName"), button.transition.matchName, (value) => {
        button.transition.matchName = value;
      }));
      grid.appendChild(selectField(root.PTB_I18N.t("transitionPosition"), button.transition.applyTo, [
        { value: "start", label: root.PTB_I18N.t("transitionStart") },
        { value: "end", label: root.PTB_I18N.t("transitionEnd") },
        { value: "both", label: root.PTB_I18N.t("transitionBoth") }
      ], (value) => {
        button.transition.applyTo = value;
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }));
      grid.appendChild(numberField(root.PTB_I18N.t("transitionDuration"), button.transition.durationSeconds, (value) => {
        button.transition.durationSeconds = value;
      }));
      wrap.appendChild(grid);
      const catalogPicker = renderCatalogPicker("transition", button);
      if (catalogPicker) {
        wrap.appendChild(catalogPicker);
      }
      return wrap;
    }
    if (button.actionType === "preset") {
      const summary = button.stack.components.length
        ? button.stack.components.map((component) => component.displayName).join(", ")
        : root.PTB_I18N.t("noPresetCaptured");
      wrap.appendChild(textField(root.PTB_I18N.t("presetName"), button.preset.name || getButtonName(button), (value) => {
        button.preset.name = value;
        if (value) {
          setButtonName(button, value);
        }
      }));
      wrap.appendChild(el("p", "ptb-muted", root.PTB_I18N.t("presetHelp")));
      wrap.appendChild(el("p", "ptb-muted", summary));
      wrap.appendChild(actionButton(root.PTB_I18N.t("capturePreset"), "ptb-button primary", async () => {
        await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
          const presetName = button.preset.name || getButtonName(button);
          button.preset.name = presetName;
          button.stack = await root.PTB_PREMIERE.captureSelectedStack();
          button.stack.sourceName = presetName;
          if (!presetName && button.stack.components[0]) {
            setButtonName(button, button.stack.components[0].displayName);
          }
          saveAndRender(root.PTB_I18N.t("statusSaved"));
        });
      }));
      return wrap;
    }
    const grid = el("div", "ptb-form-grid");
    grid.appendChild(selectField(root.PTB_I18N.t("mediaType"), button.mediaType, [
      { value: "video", label: root.PTB_I18N.t("video") },
      { value: "audio", label: root.PTB_I18N.t("audio") }
    ], (value) => {
      button.mediaType = value;
      saveAndRender(root.PTB_I18N.t("statusSaved"));
    }));
    grid.appendChild(textField(root.PTB_I18N.t("effectLookupName"), getEffectLookupValue(button), (value) => {
      setEffectLookupValue(button, value);
    }));
    wrap.appendChild(grid);
    const catalogPicker = renderCatalogPicker("effect", button);
    if (catalogPicker) {
      wrap.appendChild(catalogPicker);
    }
    return wrap;
  }

  // Render a catalog picker populated from Premiere API discovery.
  function renderCatalogPicker(kind, button) {
    const wrap = el("div", "ptb-catalog-picker");
    const options = [{ value: "", label: root.PTB_I18N.t("chooseFromPremiere") }];
    const source = kind === "transition"
      ? catalogs.videoTransitions
      : (button.mediaType === "audio" ? catalogs.audioEffects : catalogs.videoEffects);
    if (!source.length) {
      return null;
    }
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
    return wrap;
  }

  // Render icon and color controls for the selected button.
  function renderIconEditor(button) {
    const section = el("div", "ptb-icon-editor");
    const fields = el("div", "ptb-form-grid");
    fields.appendChild(iconPicker(button));
    fields.appendChild(colorPicker(button.id, root.PTB_I18N.t("iconColor"), button.iconColor, (value) => {
      button.iconColor = value;
    }));
    fields.appendChild(colorPicker(button.id, root.PTB_I18N.t("accentColor"), button.accentColor, (value) => {
      button.accentColor = value;
    }));
    section.appendChild(fields);
    const iconPopover = renderIconPickerPopover(button);
    if (iconPopover) {
      section.appendChild(iconPopover);
    }
    return section;
  }

  // Render collection cards that accept dragged gallery buttons.
  function renderCollectionsBoard() {
    const board = el("div", "ptb-collections-board");
    config.collections.forEach((collection) => {
      board.appendChild(renderCollectionDropCard(collection));
    });
    return board;
  }

  // Fill the collections board after its module body is already mounted.
  function fillCollectionsBoard(target) {
    target.appendChild(renderCollectionsBoard());
  }

  // Render one collection with name editing, bar assignment, and drop handling.
  function renderCollectionDropCard(collection) {
    const card = el("div", collection.id === settingsState.selectedCollectionId ? "ptb-collection-drop-card active" : "ptb-collection-drop-card");
    card.addEventListener("click", (event) => {
      if (!isInteractiveTarget(event.target, card)) {
        selectCollection(collection.id);
      }
    });
    card.addEventListener("mouseup", (event) => {
      if (!isInteractiveTarget(event.target, card)) {
        applyPendingDragToCollection(collection);
      }
    });
    card.addEventListener("mouseenter", () => {
      if (hasPendingDrag()) {
        setDropTarget(collection.id, collection.buttonIds.length, card);
      }
    });
    card.addEventListener("mousemove", () => {
      if (hasPendingDrag()) {
        setDropTarget(collection.id, collection.buttonIds.length, card);
      }
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("drag-over");
      setDropTarget(collection.id, collection.buttonIds.length, card);
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
      card.classList.remove("drop-before");
      card.classList.remove("drop-after");
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("drag-over");
      applyDropEvent(collection, collection.buttonIds.length, event);
    });
    card.appendChild(renderCollectionHeader(collection));
    const list = el("div", "ptb-collection-member-list");
    const setTailTarget = () => {
      if (hasPendingDrag()) {
        setDropTarget(collection.id, collection.buttonIds.length, list);
      }
    };
    list.addEventListener("mouseenter", setTailTarget);
    list.addEventListener("mousemove", setTailTarget);
    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      setDropTarget(collection.id, collection.buttonIds.length, list);
    });
    list.addEventListener("mouseup", (event) => {
      if (!isInteractiveTarget(event.target, list)) {
        applyPendingDragToCollection(collection, collection.buttonIds.length);
      }
    });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      applyDropEvent(collection, collection.buttonIds.length, event);
    });
    const buttons = getCollectionButtons(collection.id);
    if (!buttons.length) {
      list.appendChild(el("div", "ptb-drop-hint", root.PTB_I18N.t("dropButtonsHere")));
    }
    buttons.forEach((button, index) => {
      list.appendChild(renderCollectionMember(collection, button, index));
    });
    card.appendChild(list);
    card.appendChild(renderCollectionAddFallback(collection));
    return card;
  }

  // Return whether a click began on an input or action control.
  function isInteractiveTarget(target, boundary) {
    let node = target;
    while (node && node !== boundary) {
      const tagName = node.tagName ? node.tagName.toLowerCase() : "";
      if (["button", "input", "select", "textarea", "option"].includes(tagName)) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  // Store a button drag payload that can come from the gallery or a collection.
  function writeDraggedButton(event, buttonId, collectionId) {
    beginButtonDrag(buttonId, collectionId || "");
    if (!event.dataTransfer) {
      return;
    }
    const payload = JSON.stringify({ buttonId, collectionId: collectionId || "" });
    event.dataTransfer.effectAllowed = "copyMove";
    try {
      event.dataTransfer.setData("application/x-ptb-button", payload);
    } catch (error) {
      // Some UXP builds only accept text/plain drag payloads.
    }
    try {
      event.dataTransfer.setData("text/plain", payload);
    } catch (error) {
      // Pointer fallback keeps drag available when dataTransfer is restricted.
    }
  }

  // Read the dragged button payload from a drop event.
  function readDraggedButton(event) {
    if (!event.dataTransfer) {
      return getPendingDrag();
    }
    const raw = event.dataTransfer.getData("application/x-ptb-button") || event.dataTransfer.getData("text/plain");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          buttonId: parsed.buttonId || "",
          collectionId: parsed.collectionId || ""
        };
      } catch (error) {
        return { buttonId: raw, collectionId: "" };
      }
    }
    return getPendingDrag();
  }

  // Remember the latest dragged button because some UXP builds expose only partial dataTransfer support.
  function beginButtonDrag(buttonId, collectionId) {
    settingsState.pendingDrag = { buttonId: buttonId || "", collectionId: collectionId || "" };
    settingsState.dragActive = Boolean(buttonId);
    bindGlobalDragEnd();
  }

  // Bind one global mouseup fallback so UXP does not need to fire a native drop event.
  function bindGlobalDragEnd() {
    if (globalDragEndBound || !document || !document.addEventListener) {
      return;
    }
    globalDragEndBound = true;
    document.addEventListener("mouseup", handleGlobalDragEnd);
    document.addEventListener("pointerup", handleGlobalDragEnd);
  }

  // Apply the hovered target on mouseup when native drag/drop skipped the drop event.
  function handleGlobalDragEnd() {
    if (!settingsState.dragActive) {
      return;
    }
    if (!applyPendingDragTarget()) {
      settingsState.dragActive = false;
    }
  }

  // Return the pending drag payload without exposing the mutable state object.
  function getPendingDrag() {
    const payload = settingsState.pendingDrag || {};
    return { buttonId: payload.buttonId || "", collectionId: payload.collectionId || "" };
  }

  // Clear stale drag state after clicks and completed drops.
  function clearPendingDrag() {
    settingsState.pendingDrag = { buttonId: "", collectionId: "" };
    settingsState.dropTarget = { collectionId: "", index: -1 };
    settingsState.dragActive = false;
  }

  // Return whether a pointer drag fallback is currently armed.
  function hasPendingDrag() {
    return Boolean(getPendingDrag().buttonId);
  }

  // Remember where the dragged button will be inserted and update the visual guide.
  function setDropTarget(collectionId, index, node, position) {
    settingsState.dropTarget = { collectionId: collectionId || "", index: typeof index === "number" ? index : -1 };
    clearDropMarkers();
    if (node && node.classList) {
      if (node.className && String(node.className).includes("ptb-collection-member-list")) {
        node.classList.add("drop-tail");
      } else if (position === "after") {
        node.classList.add("drop-after");
      } else {
        node.classList.add("drop-before");
      }
    }
  }

  // Remove stale insertion markers before showing the current target.
  function clearDropMarkers() {
    if (!document || !document.querySelectorAll) {
      return;
    }
    Array.from(document.querySelectorAll(".drop-before,.drop-after,.drop-tail")).forEach((node) => {
      if (node.classList) {
        node.classList.remove("drop-before");
        node.classList.remove("drop-after");
        node.classList.remove("drop-tail");
      }
    });
  }

  // Choose before/after by pointer position so collection reordering previews the real insertion point.
  function getPointerInsertion(event, node, index) {
    if (!event || !node || typeof node.getBoundingClientRect !== "function") {
      return { index, position: "before" };
    }
    const rect = node.getBoundingClientRect();
    const after = typeof event.clientX === "number" && event.clientX > rect.left + rect.width / 2;
    return { index: after ? index + 1 : index, position: after ? "after" : "before" };
  }

  // Apply the latest native drop payload to the requested collection/index.
  function applyDropEvent(collection, targetIndex, event) {
    const payload = readDraggedButton(event);
    if (!payload.buttonId) {
      clearPendingDrag();
      return;
    }
    const preview = settingsState.dropTarget || {};
    const resolvedIndex = preview.collectionId === collection.id && preview.index >= 0 ? preview.index : targetIndex;
    if (payload.collectionId === collection.id) {
      moveButtonToCollectionIndex(collection.id, payload.buttonId, resolvedIndex);
    } else {
      addButtonToCollection(collection.id, payload.buttonId, true);
      moveButtonToCollectionIndex(collection.id, payload.buttonId, resolvedIndex);
    }
    clearPendingDrag();
  }

  // Apply the last hovered drop target when UXP fires dragend without a reliable drop event.
  function applyPendingDragTarget() {
    const target = settingsState.dropTarget || {};
    const collection = getCollection(target.collectionId);
    if (collection && target.index >= 0) {
      return applyPendingDragToCollection(collection, target.index);
    }
    clearPendingDrag();
    return false;
  }

  // Add or move the pending payload into a collection when native drop events are not fired.
  function applyPendingDragToCollection(collection, targetIndex) {
    const payload = getPendingDrag();
    if (!collection || !payload.buttonId) {
      return false;
    }
    if (payload.collectionId === collection.id) {
      const currentIndex = collection.buttonIds.indexOf(payload.buttonId);
      if (typeof targetIndex === "number" && currentIndex === targetIndex) {
        clearPendingDrag();
        return false;
      }
      moveButtonToCollectionIndex(collection.id, payload.buttonId, typeof targetIndex === "number" ? targetIndex : collection.buttonIds.length);
    } else {
      addButtonToCollection(collection.id, payload.buttonId, true);
      if (typeof targetIndex === "number") {
        moveButtonToCollectionIndex(collection.id, payload.buttonId, targetIndex);
      } else {
        saveAndRender(root.PTB_I18N.t("statusSaved"));
      }
    }
    clearPendingDrag();
    return true;
  }

  // Render the top row for a collection card.
  function renderCollectionHeader(collection) {
    const header = el("div", "ptb-collection-header-row");
    const name = inlineTextInput(collection.name, root.PTB_I18N.t("collectionName"), (value) => {
      collection.name = value || "Collection";
    });
    name.dataset.collectionId = collection.id;
    header.appendChild(name);
    header.appendChild(renderBarToggles(collection));
    const actions = el("div", "ptb-card-actions");
    actions.appendChild(actionButton(root.PTB_I18N.t("duplicateButton"), "ptb-icon-action", () => duplicateCollection(collection.id)));
    const deleteButton = actionButton(root.PTB_I18N.t("deleteButton"), "ptb-icon-action danger", () => deleteCollection(collection.id));
    deleteButton.disabled = config.collections.length <= 1;
    actions.appendChild(deleteButton);
    header.appendChild(actions);
    return header;
  }

  // Render four compact toggles that assign this collection to bars 1-4.
  function renderBarToggles(collection) {
    const toggles = el("div", "ptb-bar-toggles");
    config.bars.forEach((bar, index) => {
      const active = bar.collectionId === collection.id;
      toggles.appendChild(actionButton("B" + (index + 1), active ? "ptb-bar-toggle active" : "ptb-bar-toggle", () => {
        toggleBarCollection(bar.id, collection.id);
      }));
    });
    return toggles;
  }

  // Render one button inside a collection.
  function renderCollectionMember(collection, button, index) {
    const row = el("div", button.id === settingsState.selectedButtonId ? "ptb-collection-member active" : "ptb-collection-member");
    row.title = getButtonName(button) + " - right click to remove";
    row.draggable = true;
    row.setAttribute("draggable", "true");
    row.addEventListener("click", () => selectButton(button.id, collection.id));
    row.addEventListener("mousedown", () => beginButtonDrag(button.id, collection.id));
    row.addEventListener("pointerdown", () => beginButtonDrag(button.id, collection.id));
    row.addEventListener("mouseup", (event) => {
      event.stopPropagation();
      const preview = settingsState.dropTarget || {};
      applyPendingDragToCollection(collection, preview.collectionId === collection.id && preview.index >= 0 ? preview.index : index);
    });
    row.addEventListener("mouseenter", (event) => {
      if (hasPendingDrag()) {
        const target = getPointerInsertion(event, row, index);
        setDropTarget(collection.id, target.index, row, target.position);
      }
    });
    row.addEventListener("mousemove", (event) => {
      if (hasPendingDrag()) {
        const target = getPointerInsertion(event, row, index);
        setDropTarget(collection.id, target.index, row, target.position);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      removeButtonFromCollection(collection.id, button.id);
    });
    row.addEventListener("dragstart", (event) => {
      writeDraggedButton(event, button.id, collection.id);
    });
    row.addEventListener("dragend", () => {
      applyPendingDragTarget();
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
      const target = getPointerInsertion(event, row, index);
      setDropTarget(collection.id, target.index, row, target.position);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
      row.classList.remove("drop-before");
      row.classList.remove("drop-after");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      row.classList.remove("drop-before");
      row.classList.remove("drop-after");
      applyDropEvent(collection, index, event);
    });
    row.appendChild(renderButtonSwatch(button));
    const text = el("span", "ptb-button-card-text");
    text.appendChild(el("strong", "", getButtonName(button)));
    text.style.color = button.iconColor || "var(--ptb-text)";
    row.appendChild(text);
    return row;
  }

  // Render a select fallback for users when drag and drop is unavailable.
  function renderCollectionAddFallback(collection) {
    const row = el("div", "ptb-add-existing-row");
    const options = [{ value: "", label: root.PTB_I18N.t("addExistingButton") }];
    config.buttons.forEach((button) => {
      options.push({ value: button.id, label: getButtonName(button) });
    });
    row.appendChild(createSelect("", options, "ptb-input", (buttonId) => {
      if (buttonId) {
        addButtonToCollection(collection.id, buttonId);
      }
    }));
    return row;
  }

  // Render import/export controls.
  function renderImportExportSettings() {
    const section = el("div", "ptb-import-export");
    const actions = el("div", "ptb-action-row");
    actions.appendChild(actionButton(root.PTB_I18N.t("exportAll"), "ptb-button", async () => exportPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("exportBar"), "ptb-button", async () => exportPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importAll"), "ptb-button", async () => importPayload(false)));
    actions.appendChild(actionButton(root.PTB_I18N.t("importBar"), "ptb-button", async () => importPayload(true)));
    actions.appendChild(actionButton(root.PTB_I18N.t("copyJson"), "ptb-button", async () => copyCurrentJson()));
    section.appendChild(actions);
    return section;
  }

  // Fill import and export actions after their module body is already mounted.
  function fillImportExportSettings(target) {
    target.appendChild(renderImportExportSettings());
  }

  // Create a standalone library button and optionally add it to a collection.
  function createLibraryButton(collectionId) {
    const name = nextButtonName();
    const button = root.PTB_SCHEMA.createButton({
      label: name,
      icon: "aperture",
      iconColor: "#8fd6ff",
      accentColor: "#313840",
      textOverride: name
    });
    config.buttons.push(button);
    if (collectionId) {
      addButtonToCollection(collectionId, button.id, true);
    }
    settingsState.selectedButtonId = button.id;
    settingsState.collapsed.buttonGallery = false;
    settingsState.collapsed.buttonEditor = false;
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
      label: getButtonName(button) + " Copy",
      textOverride: getButtonName(button) + " Copy"
    }));
    config.buttons.push(copy);
    settingsState.selectedButtonId = copy.id;
    settingsState.collapsed.buttonGallery = false;
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
    settingsState.collapsed.collections = false;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Duplicate a specific collection.
  function duplicateCollection(collectionId) {
    const collection = getCollection(collectionId);
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

  // Delete a specific collection and reassign affected bars to the first remaining collection.
  function deleteCollection(collectionId) {
    if (config.collections.length <= 1) {
      return;
    }
    config.collections = config.collections.filter((collection) => collection.id !== collectionId);
    const fallbackId = config.collections[0].id;
    config.bars.forEach((bar) => {
      if (bar.collectionId === collectionId) {
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

  // Move a button to a specific visual position inside a collection.
  function moveButtonToCollectionIndex(collectionId, buttonId, targetIndex) {
    const collection = getCollection(collectionId);
    if (!collection) {
      return;
    }
    const currentIndex = collection.buttonIds.indexOf(buttonId);
    if (currentIndex < 0) {
      return;
    }
    const item = collection.buttonIds.splice(currentIndex, 1)[0];
    const adjustedIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const clampedIndex = Math.min(collection.buttonIds.length, Math.max(0, adjustedIndex));
    collection.buttonIds.splice(clampedIndex, 0, item);
    settingsState.selectedCollectionId = collection.id;
    settingsState.selectedButtonId = buttonId;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Toggle whether a collection is assigned to a given bar.
  function toggleBarCollection(barId, collectionId) {
    const bar = getBar(barId);
    if (!bar) {
      return;
    }
    if (bar.collectionId === collectionId && config.collections.length > 1) {
      const fallback = config.collections.find((collection) => collection.id !== collectionId);
      bar.collectionId = fallback ? fallback.id : collectionId;
    } else {
      bar.collectionId = collectionId;
    }
    settingsState.selectedCollectionId = collectionId;
    saveAndRender(root.PTB_I18N.t("statusSaved"));
  }

  // Export all collections or the selected collection to JSON.
  async function exportPayload(selectedOnly, suggestedName) {
    await runWithStatus(root.PTB_I18N.t("statusApplying"), async () => {
      const json = root.PTB_SCHEMA.exportToJson(config, selectedOnly ? settingsState.selectedCollectionId : null);
      await root.PTB_STORAGE.exportJsonFile(json, suggestedName || (selectedOnly ? "ToolBar-" + settingsState.selectedCollectionId + ".json" : "ToolBar-all-collections.json"));
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
      settingsState.collapsed.collections = false;
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
    startBackupRestore();
    rootNode.ptbContext = context;
    document.body.ptbContext = context;
    mountedPanels.set(rootNode, panelId);
    renderPanel(rootNode, panelId);
    if (typeof setTimeout === "function") {
      // Premiere can report a panel root before layout is stable; redraw once after it settles.
      setTimeout(() => renderPanel(rootNode, panelId), 0);
    }
  }

  // Expose UI mounting for the UXP entrypoint file.
  root.PTB_UI = {
    mountPanel
  };
}(typeof window !== "undefined" ? window : globalThis));
