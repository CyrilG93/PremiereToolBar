(function (root) {
  "use strict";

  // Built-in icon gallery; short labels render reliably in Premiere UXP panels.
  const icons = [
    { id: "bolt", label: "Bolt", abbr: "BT" },
    { id: "spark", label: "Spark", abbr: "SP" },
    { id: "crop", label: "Crop", abbr: "CR" },
    { id: "frame", label: "Frame", abbr: "FR" },
    { id: "mosaic", label: "Mosaic", abbr: "MO" },
    { id: "blur", label: "Blur", abbr: "BL" },
    { id: "sun", label: "Sun", abbr: "SU" },
    { id: "moon", label: "Moon", abbr: "MN" },
    { id: "wave", label: "Wave", abbr: "WV" },
    { id: "audio", label: "Audio", abbr: "AU" },
    { id: "cut", label: "Cut", abbr: "CT" },
    { id: "dissolve", label: "Dissolve", abbr: "DS" },
    { id: "speed", label: "Speed", abbr: "SD" },
    { id: "key", label: "Keyframe", abbr: "KF" },
    { id: "color", label: "Color", abbr: "CO" },
    { id: "text", label: "Text", abbr: "TX" },
    { id: "star", label: "Star", abbr: "ST" },
    { id: "gear", label: "Settings", abbr: "SET" }
  ];

  // Find an icon definition by id.
  function getIcon(id) {
    return icons.find((icon) => icon.id === id) || icons[0];
  }

  // Escape text before injecting it through innerHTML.
  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  // Render a text-based icon string for a toolbar button or icon picker item.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    return '<span class="ptb-fallback-icon" style="color:' + safeColor + ';" role="img" aria-label="' + escapeText(safeTitle) + '">' + escapeText(icon.abbr) + "</span>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
