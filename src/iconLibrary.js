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

  // Render a graphic SVG icon with a text fallback label for UXP builds that reject SVG.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "currentColor";
    const safeTitle = title || icon.label;
    return '<span class="ptb-svg-icon" style="color:' + safeColor + ';" role="img" aria-label="' + escapeText(safeTitle) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon.svg + '</svg><span class="ptb-fallback-icon">' + escapeText(icon.abbr) + "</span></span>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    getIcon,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
