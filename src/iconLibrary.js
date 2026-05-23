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

  // Convert a hex color into a CSS filter that tints black PNG icons.
  function getIconFilter(color) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#f0f0f0";
    const red = parseInt(safeColor.slice(1, 3), 16);
    const green = parseInt(safeColor.slice(3, 5), 16);
    const blue = parseInt(safeColor.slice(5, 7), 16);
    if (red === 0 && green === 0 && blue === 0) {
      return "brightness(0)";
    }
    const brightness = Math.max(red, green, blue) / 255;
    const average = (red + green + blue) / 3;
    const saturation = average ? Math.max(red, green, blue) / average : 1;
    const hue = Math.round(Math.atan2(Math.sqrt(3) * (green - blue), 2 * red - green - blue) * 180 / Math.PI);
    return "brightness(0) saturate(100%) invert(1) sepia(1) saturate(" + Math.round(saturation * 180) + "%) hue-rotate(" + hue + "deg) brightness(" + Math.round((0.45 + brightness * 0.7) * 100) + "%)";
  }

  // Render a tinted icon from the black transparent PNG using CSS masks when available.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeTitle = title || icon.label;
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#f0f0f0";
    const safeSrc = escapeText(getIconSrc(icon.id));
    return '<span class="ptb-image-icon ptb-mask-icon" role="img" aria-label="' + escapeText(safeTitle) + '" style="display:block;width:22px;height:22px;background:' + safeColor + ';background-color:' + safeColor + ';-webkit-mask:url(' + safeSrc + ') center / contain no-repeat;mask:url(' + safeSrc + ') center / contain no-repeat;color:' + safeColor + ';pointer-events:none;"><img src="' + safeSrc + '" alt="" style="display:block;width:22px;height:22px;object-fit:contain;border:0;filter:' + getIconFilter(safeColor) + ';opacity:0;" /></span>';
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    aliases,
    getIcon,
    getIconSrc,
    getIconFilter,
    normalizeIconId,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
