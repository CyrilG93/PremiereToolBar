(function (root) {
  "use strict";

  // Use real PNG files because Premiere UXP is more reliable with img tags than glyphs, SVG masks, or pseudo-elements.
  const iconBasePath = "./assets/Icons/";
  const icons = [
    { id: "aperture", label: "Aperture", file: "icons8-aperture-100.png" },
    { id: "camera-addon", label: "Camera Addon", file: "icons8-camera-addon-100.png" },
    { id: "camera-addon-identification", label: "Camera ID", file: "icons8-camera-addon-identification-100.png" },
    { id: "drone", label: "Drone", file: "icons8-drone-100.png" },
    { id: "focal-length", label: "Focal Length", file: "icons8-focal-length-100.png" },
    { id: "lens", label: "Lens", file: "icons8-lens-100.png" },
    { id: "quadcopter", label: "Quadcopter", file: "icons8-quadcopter-100.png" },
    { id: "slr-large-lens", label: "SLR Large Lens", file: "icons8-slr-large-lens-100.png" },
    { id: "slr-small-lens", label: "SLR Small Lens", file: "icons8-slr-small-lens-100.png" },
    { id: "small-lens", label: "Small Lens", file: "icons8-small-lens-100.png" },
    { id: "softbox", label: "Softbox", file: "icons8-softbox-100.png" },
    { id: "viewfinder", label: "Viewfinder", file: "icons8-viewfinder-100.png" },
    { id: "wire", label: "Wire", file: "icons8-wire-100.png" }
  ];

  // Keep existing saved beta configurations readable after switching from built-in glyph ids to PNG ids.
  const aliases = {
    gear: "camera-addon-identification",
    bolt: "aperture",
    spark: "focal-length",
    crop: "viewfinder",
    frame: "slr-large-lens",
    mosaic: "small-lens",
    blur: "lens",
    sun: "softbox",
    moon: "softbox",
    wave: "wire",
    audio: "camera-addon",
    cut: "wire",
    dissolve: "aperture",
    speed: "drone",
    key: "camera-addon-identification",
    color: "focal-length",
    text: "camera-addon",
    star: "aperture",
    move: "quadcopter",
    rotate: "drone",
    scale: "slr-small-lens",
    anchor: "viewfinder",
    opacity: "lens",
    mask: "small-lens",
    eye: "viewfinder",
    layers: "slr-large-lens",
    camera: "camera-addon",
    play: "drone",
    pause: "softbox",
    stop: "small-lens",
    marker: "focal-length",
    link: "wire",
    unlink: "wire",
    plus: "camera-addon",
    minus: "small-lens"
  };

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

  // Resolve old icon ids to the matching PNG entry.
  function normalizeIconId(id) {
    return aliases[id] || id;
  }

  // Find an icon definition by id.
  function getIcon(id) {
    const resolvedId = normalizeIconId(id || "");
    return icons.find((icon) => icon.id === resolvedId) || icons[0];
  }

  // Return the browser-relative PNG source for the selected icon.
  function getIconSrc(id) {
    const icon = getIcon(id);
    return iconBasePath + icon.file;
  }

  // Render an image icon without text fallback so no missing-glyph box can appear.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeTitle = title || icon.label;
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    return '<img class="ptb-image-icon" src="' + escapeText(getIconSrc(icon.id)) + '" alt="" role="img" aria-label="' + escapeText(safeTitle) + '" style="display:block;width:22px;height:22px;object-fit:contain;border:0;background:transparent;outline:0;color:' + safeColor + ';pointer-events:none;" />';
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    aliases,
    getIcon,
    getIconSrc,
    normalizeIconId,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
