(function (root) {
  "use strict";

  // Built-in icon gallery; paths are simple inline SVG shapes colored by CSS.
  const icons = [
    { id: "bolt", label: "Bolt", svg: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>' },
    { id: "spark", label: "Spark", svg: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/><path d="M5 17l.7 2.3L8 20l-2.3.7L5 23l-.7-2.3L2 20l2.3-.7L5 17z"/>' },
    { id: "crop", label: "Crop", svg: '<path d="M6 2v14h14"/><path d="M2 6h14v14"/>' },
    { id: "frame", label: "Frame", svg: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M8 9h8M8 15h8"/>' },
    { id: "mosaic", label: "Mosaic", svg: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
    { id: "blur", label: "Blur", svg: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' },
    { id: "sun", label: "Sun", svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' },
    { id: "moon", label: "Moon", svg: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8 8 0 1 0 20 15.5z"/>' },
    { id: "wave", label: "Wave", svg: '<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/>' },
    { id: "audio", label: "Audio", svg: '<path d="M4 10v4h4l5 5V5L8 10H4z"/><path d="M16 8c1.3 1.3 1.3 6.7 0 8"/><path d="M19 5c3 3.6 3 10.4 0 14"/>' },
    { id: "cut", label: "Cut", svg: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5 21 3M8.5 15.5 21 21"/>' },
    { id: "dissolve", label: "Dissolve", svg: '<path d="M4 6h8v8H4z"/><path d="M12 10h8v8h-8z"/><path d="M7 17h1M11 17h1M15 7h1M19 7h1"/>' },
    { id: "speed", label: "Speed", svg: '<path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l5-5"/><path d="M6 19h12"/>' },
    { id: "key", label: "Keyframe", svg: '<path d="M12 3 21 12 12 21 3 12 12 3z"/><path d="M12 8v8M8 12h8"/>' },
    { id: "color", label: "Color", svg: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>' },
    { id: "text", label: "Text", svg: '<path d="M4 5h16M12 5v14M8 19h8"/>' },
    { id: "star", label: "Star", svg: '<path d="m12 2 3 6 6 .9-4.5 4.3 1.1 6.1L12 16l-5.6 3.3 1.1-6.1L3 8.9 9 8l3-6z"/>' },
    { id: "gear", label: "Gear", svg: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/>' }
  ];

  // Find an icon definition by id.
  function getIcon(id) {
    return icons.find((icon) => icon.id === id) || icons[0];
  }

  // Render an SVG string for a toolbar button or icon picker item.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = color || "currentColor";
    const safeTitle = title || icon.label;
    return '<svg class="ptb-svg-icon" viewBox="0 0 24 24" fill="none" stroke="' + safeColor + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + safeTitle + '">' + icon.svg + "</svg>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
