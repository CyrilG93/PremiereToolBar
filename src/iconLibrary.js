(function (root) {
  "use strict";

  // Built-in icon gallery rendered with CSS shapes for Premiere UXP reliability.
  const icons = [
    { id: "bolt", label: "Bolt" },
    { id: "spark", label: "Spark" },
    { id: "crop", label: "Crop" },
    { id: "frame", label: "Frame" },
    { id: "mosaic", label: "Mosaic" },
    { id: "blur", label: "Blur" },
    { id: "sun", label: "Sun" },
    { id: "moon", label: "Moon" },
    { id: "wave", label: "Wave" },
    { id: "audio", label: "Audio" },
    { id: "cut", label: "Cut" },
    { id: "dissolve", label: "Dissolve" },
    { id: "speed", label: "Speed" },
    { id: "key", label: "Key" },
    { id: "color", label: "Color" },
    { id: "text", label: "Text" },
    { id: "star", label: "Star" },
    { id: "move", label: "Move" },
    { id: "rotate", label: "Rotate" },
    { id: "scale", label: "Scale" },
    { id: "anchor", label: "Anchor" },
    { id: "opacity", label: "Opacity" },
    { id: "mask", label: "Mask" },
    { id: "eye", label: "Eye" },
    { id: "layers", label: "Layers" },
    { id: "camera", label: "Camera" },
    { id: "play", label: "Play" },
    { id: "pause", label: "Pause" },
    { id: "stop", label: "Stop" },
    { id: "marker", label: "Marker" },
    { id: "link", label: "Link" },
    { id: "unlink", label: "Unlink" },
    { id: "plus", label: "Plus" },
    { id: "minus", label: "Minus" },
    { id: "gear", label: "Settings" }
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

  // Render a CSS-shape icon with no text fallback, so no font tofu square can appear.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    return '<span class="ptb-shape-icon ptb-shape-' + escapeText(icon.id) + '" style="color:' + safeColor + ';" role="img" aria-label="' + escapeText(safeTitle) + '"></span>';
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
