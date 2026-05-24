(function (root) {
  "use strict";

  // Use inline SVG icons because Premiere UXP reliably applies currentColor to SVG markup.
  const icons = [
    { id: "123", label: "123", file: "123.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-123" viewBox="0 0 16 16"><path d="M2.873 11.297V4.142H1.621l-1.057.76v1.106l1.003-.756h.053v6.045zm3.213-5.09v-.063c0-.618.44-1.169 1.184-1.169.677 0 1.174.44 1.174 1.106 0 .624-.42 1.095-1.185 1.095h-.894v1.06h.927c.83 0 1.29.524 1.29 1.253 0 .779-.553 1.342-1.317 1.342-.788 0-1.267-.577-1.267-1.233v-.067H4.785v.073c0 1.33.976 2.277 2.487 2.277 1.422 0 2.52-.88 2.52-2.267 0-1.055-.62-1.82-1.598-2.027v-.057c.832-.237 1.309-.924 1.309-1.848 0-1.149-.909-2.055-2.236-2.055-1.43 0-2.36.955-2.36 2.213v.066zm6.39 5.09c.283-.454.622-.898 1.013-1.333.398-.441.82-.86 1.267-1.257.454-.404.847-.804 1.18-1.2.333-.397.597-.806.79-1.227.194-.427.29-.894.29-1.4 0-1.283-.926-2.185-2.31-2.185-.82 0-1.47.236-1.95.708-.477.468-.715 1.11-.715 1.926h1.197c.006-.472.145-.84.418-1.103.277-.263.645-.395 1.103-.395.464 0 .831.132 1.103.395.277.263.416.625.416 1.087 0 .386-.085.744-.255 1.074-.17.33-.392.647-.666.95-.273.303-.575.604-.906.902-.33.298-.658.61-.984.936-.326.326-.62.683-.88 1.071-.26.389-.46.813-.6 1.273v.678h4.75v-1.047h-3.505v-.053z"/></svg>' },
    { id: "2-square", label: "2 Square", file: "2-square.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-2-square" viewBox="0 0 16 16"><path d="M6.646 6.24v.07H5.375v-.064c0-1.213.879-2.402 2.637-2.402 1.582 0 2.613.949 2.613 2.215 0 1.002-.6 1.667-1.287 2.43l-.096.107-1.974 2.22v.077h3.498V12H5.422v-.832l2.97-3.293c.434-.475.903-1.008.903-1.705 0-.744-.557-1.236-1.313-1.236-.843 0-1.336.615-1.336 1.306"/><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z"/></svg>' },
    { id: "6-circle", label: "6 Circle", file: "6-circle.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-6-circle" viewBox="0 0 16 16"><path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0"/><path d="M8.21 3.855c-1.868 0-3.116 1.395-3.116 4.407 0 1.183.228 2.039.597 2.642.569.926 1.477 1.254 2.409 1.254 1.629 0 2.847-1.013 2.847-2.783 0-1.676-1.254-2.555-2.508-2.555-1.125 0-1.752.61-2.015 1.247h-.082c.06-1.735.895-3.004 1.969-3.004.734 0 1.168.391 1.168.98h1.212c0-1.17-.87-2.188-2.48-2.188Zm-.132 4.105c.743 0 1.345.57 1.345 1.425 0 .857-.61 1.45-1.348 1.45-.743 0-1.37-.583-1.37-1.45 0-.852.622-1.425 1.373-1.425"/></svg>' },
    { id: "7-square-fill", label: "7 Square", file: "7-square-fill.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-7-square-fill" viewBox="0 0 16 16"><path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm3.37 5.11v-1h5.393v.848L7.66 12H6.257l3.036-6.864v-.026z"/></svg>' },
    { id: "8-square-fill", label: "8 Square", file: "8-square-fill.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-8-square-fill" viewBox="0 0 16 16"><path d="M6.623 6.094c0 .738.586 1.254 1.383 1.254s1.377-.516 1.377-1.254c0-.733-.58-1.23-1.377-1.23s-1.383.497-1.383 1.23"/><path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm6.006 4c1.339 0 2.458.778 2.458 2.04 0 .876-.561 1.519-1.403 1.816v.065c1.021.247 1.776.938 1.776 2.015 0 1.356-1.19 2.282-2.83 2.282-1.643 0-2.84-.926-2.84-2.282 0-1.077.755-1.768 1.785-2.015v-.065c-.85-.297-1.412-.94-1.412-1.816C5.54 4.778 6.662 4 8.006 4"/><path d="M8.006 8.233c-.927 0-1.674.564-1.674 1.492 0 .901.719 1.502 1.674 1.502.951 0 1.665-.6 1.665-1.502 0-.928-.738-1.492-1.665-1.492"/></svg>' },
    { id: "9-circle-fill", label: "9 Circle", file: "9-circle-fill.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-9-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.223 3.855c-1.571 0-2.848 1.04-2.848 2.684 0 1.568 1.168 2.448 2.482 2.448 1.09 0 1.725-.568 2.041-1.176h.07c-.09 1.456-.768 2.662-1.975 2.662-.677 0-1.049-.354-1.149-.743H5.602c.115 1.028 1.007 1.871 2.387 1.871 1.953 0 3.126-1.896 3.126-4.576 0-1.886-.785-3.17-1.891-3.575-.378-.138-.718-.097-1.001-.097zm.062 4.016c-.784 0-1.354-.556-1.354-1.364 0-.832.593-1.388 1.354-1.388.76 0 1.353.559 1.353 1.388 0 .808-.57 1.364-1.353 1.364"/></svg>' },
    { id: "airplane-engines-fill", label: "Airplane Engines", file: "airplane-engines-fill.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-airplane-engines-fill" viewBox="0 0 16 16"><path d="M8 0c-.787 0-1.292.592-1.572 1.151A4.35 4.35 0 0 0 6 3v3.691l-2 1V7.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.191l-1.17.585A1.5 1.5 0 0 0 0 10.618V12a.5.5 0 0 0 .582.493l5.507-.918.375 2.253-1.318 1.318A.5.5 0 0 0 5.5 16h5a.5.5 0 0 0 .354-.854l-1.318-1.318.375-2.253 5.507.918A.5.5 0 0 0 16 12v-1.382a1.5 1.5 0 0 0-.83-1.342L14 8.691V7.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v.191l-2-1V3c0-.568-.14-1.271-.428-1.849C9.292.591 8.787 0 8 0"/></svg>' },
    { id: "airplane", label: "Airplane", file: "airplane.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-airplane" viewBox="0 0 16 16"><path d="M6.428 1.151C6.708.591 7.213 0 8 0s1.292.592 1.572 1.151C9.861 1.73 10 2.431 10 3v3.691l5.17 2.585a1.5 1.5 0 0 1 .83 1.342V12a.5.5 0 0 1-.582.493l-5.507-.918-.375 2.253 1.318 1.318A.5.5 0 0 1 10.5 16h-5a.5.5 0 0 1-.354-.854l1.319-1.318-.376-2.253-5.507.918A.5.5 0 0 1 0 12v-1.382a1.5 1.5 0 0 1 .83-1.342L6 6.691V3c0-.568.14-1.271.428-1.849m.894.448C7.111 2.02 7 2.569 7 3v4a.5.5 0 0 1-.276.447l-5.448 2.724a.5.5 0 0 0-.276.447v.792l5.418-.903a.5.5 0 0 1 .575.41l.5 3a.5.5 0 0 1-.14.437L6.708 15h2.586l-.647-.646a.5.5 0 0 1-.14-.436l.5-3a.5.5 0 0 1 .576-.411L15 11.41v-.792a.5.5 0 0 0-.276-.447L9.276 7.447A.5.5 0 0 1 9 7V3c0-.432-.11-.979-.322-1.401C8.458 1.159 8.213 1 8 1s-.458.158-.678.599"/></svg>' },
    { id: "alarm", label: "Alarm", file: "alarm.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-alarm" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.516l1.5-2.5A.5.5 0 0 0 8.5 9z"/><path d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.747A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.893l.746.747a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1zm1.038 3.018a6 6 0 0 1 .924 0 6 6 0 1 1-.924 0M0 3.5c0 .753.333 1.429.86 1.887A8.04 8.04 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5M13.5 1c-.753 0-1.429.333-1.887.86a8.04 8.04 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1"/></svg>' },
    { id: "align-top", label: "Align Top", file: "align-top.svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-align-top" viewBox="0 0 16 16"><rect width="4" height="12" rx="1" transform="matrix(1 0 0 -1 6 15)"/><path d="M1.5 2a.5.5 0 0 1 0-1zm13-1a.5.5 0 0 1 0 1zm-13 0h13v1h-13z"/></svg>' }
  ];

  // Keep existing saved configurations readable after switching from PNG ids to SVG ids.
  const aliases = {
    aperture: "airplane", "camera-addon": "airplane-engines-fill", "camera-addon-identification": "alarm",
    drone: "airplane", "focal-length": "align-top", lens: "6-circle", quadcopter: "airplane-engines-fill",
    "slr-large-lens": "2-square", "slr-small-lens": "7-square-fill", "small-lens": "8-square-fill",
    softbox: "9-circle-fill", viewfinder: "align-top", wire: "123",
    gear: "alarm", bolt: "airplane", spark: "align-top", crop: "align-top", frame: "2-square",
    mosaic: "8-square-fill", blur: "6-circle", sun: "9-circle-fill", moon: "9-circle-fill",
    wave: "123", audio: "airplane-engines-fill", cut: "123", dissolve: "airplane", speed: "airplane",
    key: "alarm", color: "align-top", text: "123", star: "airplane", move: "airplane-engines-fill",
    rotate: "airplane", scale: "7-square-fill", anchor: "align-top", opacity: "6-circle",
    mask: "8-square-fill", eye: "align-top", layers: "2-square", camera: "airplane-engines-fill",
    play: "airplane", pause: "9-circle-fill", stop: "8-square-fill", marker: "align-top",
    link: "123", unlink: "123", plus: "airplane-engines-fill", minus: "8-square-fill"
  };

  // Escape text before injecting it through innerHTML attributes.
  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  // Resolve old icon ids to the matching SVG entry.
  function normalizeIconId(id) {
    return aliases[id] || id;
  }

  // Find an icon definition by id.
  function getIcon(id) {
    const resolvedId = normalizeIconId(id || "");
    return icons.find((icon) => icon.id === resolvedId) || icons[0];
  }

  // Return the browser-relative SVG source for fallback use.
  function getIconSrc(id) {
    const icon = getIcon(id);
    return "./assets/SVG/" + icon.file;
  }

  // Keep the old API available while SVG icons now receive color through currentColor.
  function getIconFilter() {
    return "none";
  }

  // Return inline SVG markup that inherits color from the wrapper.
  function getIconSvg(id) {
    return getIcon(id).svg;
  }

  // Render a currentColor SVG wrapper for UXP-safe icon coloring.
  function renderIcon(id, color, title) {
    const icon = getIcon(id);
    const safeTitle = title || icon.label;
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#f0f0f0";
    return '<span class="ptb-svg-icon ptb-image-icon" role="img" aria-label="' + escapeText(safeTitle) + '" title="' + escapeText(safeTitle) + '" style="display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;color:' + safeColor + ';pointer-events:none;">' + icon.svg + "</span>";
  }

  // Expose the icon library for UI rendering.
  root.PTB_ICON_LIBRARY = {
    icons,
    aliases,
    getIcon,
    getIconSrc,
    getIconFilter,
    getIconSvg,
    normalizeIconId,
    renderIcon
  };
}(typeof window !== "undefined" ? window : globalThis));
