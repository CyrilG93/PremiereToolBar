(function (root) {
  "use strict";

  // Built-in SVG icon gallery based on simple open line-icon shapes.
  const icons = [
    { id: "bolt", label: "Bolt", abbr: "BT", svg: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>' },
    { id: "spark", label: "Spark", abbr: "SP", svg: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>' },
    { id: "crop", label: "Crop", abbr: "CR", svg: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>' },
    { id: "frame", label: "Frame", abbr: "FR", svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/><path d="M4 9h16"/><path d="M4 15h16"/>' },
    { id: "mosaic", label: "Mosaic", abbr: "MO", svg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
    { id: "blur", label: "Blur", abbr: "BL", svg: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="17" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="7" cy="17" r="1"/>' },
    { id: "sun", label: "Sun", abbr: "SU", svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>' },
    { id: "moon", label: "Moon", abbr: "MN", svg: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>' },
    { id: "wave", label: "Wave", abbr: "WV", svg: '<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/>' },
    { id: "audio", label: "Audio", abbr: "AU", svg: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M19 7a8 8 0 0 1 0 10"/>' },
    { id: "cut", label: "Cut", abbr: "CT", svg: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>' },
    { id: "dissolve", label: "Dissolve", abbr: "DS", svg: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M14 4h1"/><path d="M18 4h2"/><path d="M4 14h1"/><path d="M4 18h2"/>' },
    { id: "speed", label: "Speed", abbr: "SD", svg: '<path d="M20 13a8 8 0 1 0-16 0"/><path d="m12 13 5-5"/><path d="M4 17h16"/>' },
    { id: "key", label: "Key", abbr: "KF", svg: '<circle cx="7.5" cy="14.5" r="3.5"/><path d="M10 12 21 1"/><path d="m16 6 2 2"/><path d="m14 8 2 2"/>' },
    { id: "color", label: "Color", abbr: "CO", svg: '<path d="M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z"/>' },
    { id: "text", label: "Text", abbr: "TX", svg: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>' },
    { id: "star", label: "Star", abbr: "ST", svg: '<path d="m12 2 2.9 6 6.6.9-4.8 4.7 1.1 6.6L12 17l-5.8 3.2 1.1-6.6-4.8-4.7 6.6-.9L12 2Z"/>' },
    { id: "move", label: "Move", abbr: "MV", svg: '<path d="M12 2v20"/><path d="m15 5-3-3-3 3"/><path d="m15 19-3 3-3-3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m19 9 3 3-3 3"/>' },
    { id: "rotate", label: "Rotate", abbr: "RT", svg: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>' },
    { id: "scale", label: "Scale", abbr: "SC", svg: '<path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="m14 10 6-6"/><path d="m4 20 6-6"/>' },
    { id: "anchor", label: "Anchor", abbr: "AN", svg: '<circle cx="12" cy="5" r="3"/><path d="M12 8v13"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="m5 16 3-3 3 3"/><path d="m13 16 3-3 3 3"/>' },
    { id: "opacity", label: "Opacity", abbr: "OP", svg: '<path d="M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z"/><path d="M5 15h14"/>' },
    { id: "mask", label: "Mask", abbr: "MS", svg: '<path d="M4 7c4-3 12-3 16 0v5c0 5-4 8-8 8s-8-3-8-8V7Z"/><path d="M8 12h3"/><path d="M13 12h3"/><path d="M9 16c2 1 4 1 6 0"/>' },
    { id: "eye", label: "Eye", abbr: "EY", svg: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' },
    { id: "layers", label: "Layers", abbr: "LY", svg: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>' },
    { id: "camera", label: "Camera", abbr: "CM", svg: '<path d="M4 7h3l2-3h6l2 3h3v13H4V7Z"/><circle cx="12" cy="13" r="4"/>' },
    { id: "play", label: "Play", abbr: "PL", svg: '<path d="M8 5v14l11-7-11-7Z"/>' },
    { id: "pause", label: "Pause", abbr: "PA", svg: '<path d="M8 5v14"/><path d="M16 5v14"/>' },
    { id: "stop", label: "Stop", abbr: "STP", svg: '<rect x="6" y="6" width="12" height="12" rx="1"/>' },
    { id: "marker", label: "Marker", abbr: "MK", svg: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>' },
    { id: "link", label: "Link", abbr: "LK", svg: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>' },
    { id: "unlink", label: "Unlink", abbr: "UL", svg: '<path d="M18.8 12.1a5 5 0 0 0 .2-7.1 5 5 0 0 0-7 0l-1 1"/><path d="M5.2 11.9a5 5 0 0 0-.2 7.1 5 5 0 0 0 7 0l1-1"/><path d="m4 4 16 16"/>' },
    { id: "plus", label: "Plus", abbr: "PLS", svg: '<path d="M12 5v14"/><path d="M5 12h14"/>' },
    { id: "minus", label: "Minus", abbr: "MIN", svg: '<path d="M5 12h14"/>' },
    { id: "gear", label: "Settings", abbr: "SET", svg: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/>' }
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

  // Render icons as a background image so UXP does not expose fallback initials as visible text.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + safeColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon.svg + "</svg>";
    return '<span class="ptb-svg-icon" style="background-image:url(data:image/svg+xml,' + encodeURIComponent(svg) + ');" role="img" aria-label="' + escapeText(safeTitle) + '"></span>';
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
