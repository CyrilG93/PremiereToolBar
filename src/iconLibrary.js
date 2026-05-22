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

  // Create one real child element so the icon does not depend on pseudo-elements.
  function part(style) {
    return '<span class="ptb-built-part" style="' + style + '"></span>';
  }

  // Return simple HTML shape parts for one icon id.
  function getShapeParts(id) {
    const borderSquare = part("position:absolute;left:4px;top:4px;width:10px;height:10px;border:2px solid currentColor;border-radius:2px;");
    if (id === "bolt") {
      return part("position:absolute;left:7px;top:1px;width:5px;height:16px;border-radius:1px;background:currentColor;transform:skew(-24deg);");
    }
    if (id === "spark" || id === "move") {
      return part("position:absolute;left:8px;top:2px;width:2px;height:14px;background:currentColor;") + part("position:absolute;left:2px;top:8px;width:14px;height:2px;background:currentColor;");
    }
    if (id === "crop") {
      return part("position:absolute;left:3px;top:3px;width:12px;height:12px;border:0 solid currentColor;border-left-width:2px;border-bottom-width:2px;") + part("position:absolute;left:7px;top:7px;width:8px;height:8px;border:0 solid currentColor;border-top-width:2px;border-right-width:2px;");
    }
    if (id === "mosaic" || id === "layers") {
      return part("position:absolute;left:2px;top:2px;width:5px;height:5px;background:currentColor;box-shadow:9px 0 0 currentColor,0 9px 0 currentColor,9px 9px 0 currentColor;");
    }
    if (id === "blur") {
      return part("position:absolute;left:3px;top:3px;width:4px;height:4px;border-radius:999px;background:currentColor;box-shadow:7px 0 0 currentColor,3px 6px 0 currentColor,10px 8px 0 currentColor,1px 12px 0 currentColor;");
    }
    if (["sun", "moon", "color", "opacity", "eye", "gear", "anchor"].includes(id)) {
      const dot = id === "gear" ? part("position:absolute;left:7px;top:7px;width:4px;height:4px;border-radius:999px;background:currentColor;") : "";
      return part("position:absolute;left:3px;top:3px;width:12px;height:12px;border:2px solid currentColor;border-radius:999px;") + dot;
    }
    if (id === "wave") {
      return part("position:absolute;left:2px;top:8px;width:14px;height:6px;border:0 solid currentColor;border-top-width:2px;border-radius:999px;transform:skewX(-25deg);");
    }
    if (id === "audio") {
      return part("position:absolute;left:2px;top:6px;width:6px;height:6px;background:currentColor;") + part("position:absolute;left:9px;top:4px;width:6px;height:10px;border:0 solid currentColor;border-top-width:2px;border-right-width:2px;border-bottom-width:2px;border-radius:0 999px 999px 0;");
    }
    if (id === "cut" || id === "unlink") {
      return part("position:absolute;left:2px;top:8px;width:14px;height:2px;background:currentColor;transform:rotate(35deg);") + part("position:absolute;left:2px;top:8px;width:14px;height:2px;background:currentColor;transform:rotate(-35deg);");
    }
    if (id === "speed" || id === "rotate") {
      return part("position:absolute;left:2px;top:6px;width:14px;height:10px;border:0 solid currentColor;border-top-width:2px;border-left-width:2px;border-right-width:2px;border-radius:999px 999px 0 0;") + part("position:absolute;left:9px;top:8px;width:7px;height:2px;background:currentColor;transform:rotate(-38deg);transform-origin:left center;");
    }
    if (id === "play") {
      return part("position:absolute;left:5px;top:3px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:9px solid currentColor;");
    }
    if (id === "pause") {
      return part("position:absolute;left:5px;top:3px;width:3px;height:12px;background:currentColor;box-shadow:6px 0 0 currentColor;");
    }
    if (id === "stop") {
      return part("position:absolute;left:4px;top:4px;width:10px;height:10px;background:currentColor;");
    }
    if (id === "plus") {
      return part("position:absolute;left:8px;top:3px;width:2px;height:12px;background:currentColor;") + part("position:absolute;left:3px;top:8px;width:12px;height:2px;background:currentColor;");
    }
    if (id === "minus") {
      return part("position:absolute;left:3px;top:8px;width:12px;height:2px;background:currentColor;");
    }
    if (id === "text") {
      return part("position:absolute;left:3px;top:2px;width:12px;height:2px;background:currentColor;box-shadow:5px 2px 0 currentColor,5px 4px 0 currentColor,5px 6px 0 currentColor,5px 8px 0 currentColor,2px 12px 0 currentColor,8px 12px 0 currentColor;");
    }
    if (id === "play" || id === "marker") {
      return part("position:absolute;left:5px;top:3px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:9px solid currentColor;");
    }
    if (id === "key" || id === "mask" || id === "star" || id === "link" || id === "scale" || id === "camera" || id === "dissolve") {
      return part("position:absolute;left:4px;top:4px;width:10px;height:10px;border:2px solid currentColor;transform:rotate(45deg);");
    }
    return borderSquare;
  }

  // Render a built HTML icon with no text fallback, so no font tofu square can appear.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    return '<span class="ptb-built-icon ptb-built-' + escapeText(icon.id) + '" style="position:relative;display:inline-block;width:18px;height:18px;color:' + safeColor + ';pointer-events:none;" role="img" aria-label="' + escapeText(safeTitle) + '">' + getShapeParts(icon.id) + "</span>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
