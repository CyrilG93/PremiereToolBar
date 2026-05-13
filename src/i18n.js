(function (root) {
  "use strict";

  // Keep all visible strings in one dictionary so later translations are localized here.
  const messages = {
    appName: "Tool Bar",
    settings: "Settings",
    emptyBar: "No buttons yet",
    disabledBar: "This bar is disabled",
    addButton: "Add Button",
    duplicateButton: "Duplicate",
    deleteButton: "Delete",
    moveUp: "Move Up",
    moveDown: "Move Down",
    refreshCatalog: "Refresh Premiere Lists",
    captureStack: "Capture Selected Stack",
    exportAll: "Export All Bars",
    exportBar: "Export Selected Bar",
    importAll: "Import All Bars",
    importBar: "Import Into Selected Bar",
    copyJson: "Copy JSON",
    bars: "Bars",
    buttons: "Buttons",
    iconGallery: "Icon Gallery",
    data: "Import / Export",
    label: "Label",
    action: "Action",
    nativeEffect: "Native Effect",
    videoTransition: "Video Transition",
    capturedStack: "Captured Stack",
    mediaType: "Media Type",
    video: "Video",
    audio: "Audio",
    effectMatchName: "Effect Match Name",
    effectDisplayName: "Effect Display Name",
    transitionMatchName: "Transition Match Name",
    transitionPosition: "Apply To",
    transitionStart: "Clip Start",
    transitionEnd: "Clip End",
    transitionDuration: "Duration Seconds",
    icon: "Icon",
    iconColor: "Icon Color",
    accentColor: "Button Color",
    textOverride: "Text Override",
    enabled: "Enabled",
    barName: "Bar Name",
    orientation: "Orientation",
    auto: "Auto",
    horizontal: "Horizontal",
    vertical: "Vertical",
    openBar: "Open Bar",
    statusReady: "Ready",
    statusApplying: "Applying...",
    statusSaved: "Saved",
    statusImported: "Imported",
    statusExported: "Exported",
    statusCopied: "Copied",
    statusCatalog: "Catalog loaded",
    noSelection: "Select at least one timeline clip.",
    noPremiereApi: "Premiere API is unavailable in this context.",
    noButtonSelected: "Select or create a button.",
    noStackCaptured: "No capturable effect stack found on the selected clip.",
    unsupportedPresetFile: "Direct .prfpset application is not exposed by the documented UXP API.",
    exportPreview: "JSON Preview",
    replacementWarning: "Import replaces the selected target."
  };

  // Return a translated string and fall back to the key for missing entries.
  function t(key) {
    return messages[key] || key;
  }

  // Expose the translation helper for the UI module.
  root.PTB_I18N = {
    messages,
    t
  };
}(typeof window !== "undefined" ? window : globalThis));
