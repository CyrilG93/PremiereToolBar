(function (root) {
  "use strict";

  // Built-in icon gallery with glyph fallbacks that render reliably in Premiere UXP.
  const icons = [
    { id: "bolt", label: "Bolt", glyph: "⚡" },
    { id: "spark", label: "Spark", glyph: "✦" },
    { id: "crop", label: "Crop", glyph: "⌗" },
    { id: "frame", label: "Frame", glyph: "▣" },
    { id: "mosaic", label: "Mosaic", glyph: "▦" },
    { id: "blur", label: "Blur", glyph: "◌" },
    { id: "sun", label: "Sun", glyph: "☼" },
    { id: "moon", label: "Moon", glyph: "◐" },
    { id: "wave", label: "Wave", glyph: "≋" },
    { id: "audio", label: "Audio", glyph: "♪" },
    { id: "cut", label: "Cut", glyph: "✂" },
    { id: "dissolve", label: "Dissolve", glyph: "◫" },
    { id: "speed", label: "Speed", glyph: "⏩" },
    { id: "key", label: "Key", glyph: "◆" },
    { id: "color", label: "Color", glyph: "◈" },
    { id: "text", label: "Text", glyph: "T" },
    { id: "star", label: "Star", glyph: "★" },
    { id: "move", label: "Move", glyph: "✥" },
    { id: "rotate", label: "Rotate", glyph: "↻" },
    { id: "scale", label: "Scale", glyph: "⤢" },
    { id: "anchor", label: "Anchor", glyph: "⌖" },
    { id: "opacity", label: "Opacity", glyph: "◒" },
    { id: "mask", label: "Mask", glyph: "⬟" },
    { id: "eye", label: "Eye", glyph: "◉" },
    { id: "layers", label: "Layers", glyph: "▤" },
    { id: "camera", label: "Camera", glyph: "▰" },
    { id: "play", label: "Play", glyph: "▶" },
    { id: "pause", label: "Pause", glyph: "Ⅱ" },
    { id: "stop", label: "Stop", glyph: "■" },
    { id: "marker", label: "Marker", glyph: "♦" },
    { id: "link", label: "Link", glyph: "∞" },
    { id: "unlink", label: "Unlink", glyph: "⧉" },
    { id: "plus", label: "Plus", glyph: "+" },
    { id: "minus", label: "Minus", glyph: "−" },
    { id: "gear", label: "Settings", glyph: "⚙" }
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

  // Render a graphic glyph instead of SVG because Premiere UXP can hide injected SVGs.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    return '<span class="ptb-glyph-icon" style="color:' + safeColor + ';" role="img" aria-label="' + escapeText(safeTitle) + '">' + escapeText(icon.glyph) + "</span>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
