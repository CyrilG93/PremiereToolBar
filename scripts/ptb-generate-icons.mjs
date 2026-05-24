import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Generate the inline SVG icon library from the bundled SVG folder.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgDir = path.join(repoRoot, "assets", "SVG");
const outputPath = path.join(repoRoot, "src", "iconLibrary.js");

// Convert a file stem to a readable picker label.
function toLabel(id) {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

// Keep SVG markup compact and force color inheritance where the pack allows it.
function normalizeSvg(svg) {
  return svg
    .replace(/\r?\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sfill="(?!none)[^"]*"/g, ' fill="currentColor"')
    .replace(/\sstroke="(?!none)[^"]*"/g, ' stroke="currentColor"')
    .trim();
}

const icons = fs.readdirSync(svgDir)
  .filter((file) => file.toLowerCase().endsWith(".svg"))
  .sort((left, right) => left.localeCompare(right))
  .map((file) => {
    const id = path.basename(file, ".svg");
    return {
      id,
      label: toLabel(id),
      file,
      svg: normalizeSvg(fs.readFileSync(path.join(svgDir, file), "utf8"))
    };
  });

const aliases = {
  aperture: "airplane",
  "camera-addon": "camera-video",
  "camera-addon-identification": "gear",
  drone: "airplane",
  "focal-length": "align-top",
  lens: "circle",
  quadcopter: "airplane-engines",
  "slr-large-lens": "camera",
  "slr-small-lens": "camera2",
  "small-lens": "circle-square",
  softbox: "brightness-high",
  viewfinder: "bounding-box",
  wire: "link",
  gear: "gear",
  bolt: "lightning",
  spark: "stars",
  crop: "crop",
  frame: "bounding-box",
  mosaic: "grid-3x3",
  blur: "circle",
  sun: "sun",
  moon: "moon",
  wave: "soundwave",
  audio: "volume-up",
  cut: "scissors",
  dissolve: "shuffle",
  speed: "speedometer2",
  key: "key",
  color: "palette",
  text: "type",
  star: "star",
  move: "arrows-move",
  rotate: "arrow-clockwise",
  scale: "arrows-angle-expand",
  anchor: "pin",
  opacity: "circle-half",
  mask: "bounding-box-circles",
  eye: "eye",
  layers: "stack",
  camera: "camera",
  play: "play",
  pause: "pause",
  stop: "stop",
  marker: "bookmark",
  link: "link",
  unlink: "unlink",
  plus: "plus",
  minus: "dash"
};

const source = `(function (root) {
  "use strict";

  // Use inline SVG icons because Premiere UXP reliably applies currentColor to SVG markup.
  const icons = ${JSON.stringify(icons)};

  // Keep existing saved configurations readable after switching between icon packs.
  const aliases = ${JSON.stringify(aliases, null, 2)};

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
    const alias = aliases[id] || id;
    return icons.some((icon) => icon.id === alias) ? alias : icons[0].id;
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
`;

fs.writeFileSync(outputPath, source);
console.log(`Generated ${icons.length} SVG icons.`);
