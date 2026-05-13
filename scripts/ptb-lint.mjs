import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the repository root from this script location.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Read and parse a JSON file with a useful error message.
function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Assert a condition and fail linting when it is not met.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Parse a JavaScript file to catch syntax errors without executing it.
function assertJavaScriptSyntax(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  assert(source.includes("//"), `${relativePath} should include explanatory // comments.`);
  new Function(source);
}

// Validate package and manifest metadata.
const packageJson = readJson("package.json");
const manifestJson = readJson("manifest.json");
const versionSource = fs.readFileSync(path.join(repoRoot, "src/version.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
assert(packageJson.version === manifestJson.version, "package.json and manifest.json versions must match.");
assert(versionSource.includes(`"${packageJson.version}"`), "src/version.js must match package.json version.");
assert(indexHtml.includes(`styles.css?v=${packageJson.version}`), "index.html must cache-bust styles.css with the current version.");
assert(indexHtml.includes(`src/ui.js?v=${packageJson.version}`), "index.html must cache-bust src/ui.js with the current version.");
assert(manifestJson.id === "com.cyrilplugin.toolbar", "manifest id must use the Cyril plugin namespace.");
assert(manifestJson.host && manifestJson.host.app === "premierepro", "manifest must target Premiere Pro.");
assert(Array.isArray(manifestJson.entrypoints) && manifestJson.entrypoints.length === 5, "manifest must declare four bars plus settings.");

// Validate project-specific npm script naming.
Object.keys(packageJson.scripts || {}).forEach((scriptName) => {
  assert(scriptName.startsWith("ptb:"), `npm script ${scriptName} must use the ptb: prefix.`);
});

// Validate all runtime JavaScript files parse correctly.
[
  "index.js",
  "src/version.js",
  "src/i18n.js",
  "src/iconLibrary.js",
  "src/schema.js",
  "src/storage.js",
  "src/premiereBridge.js",
  "src/ui.js"
].forEach(assertJavaScriptSyntax);

// Validate required user-facing and installer files exist.
[
  "README.md",
  "index.html",
  "styles.css",
  "installers/ptb_install_macos.sh",
  "installers/ptb_install_windows.bat"
].forEach((relativePath) => {
  assert(fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} is required.`);
});

// Validate installers use project-prefixed names and keep explicit install comments.
["installers/ptb_install_macos.sh", "installers/ptb_install_windows.bat"].forEach((relativePath) => {
  const contents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  assert(path.basename(relativePath).startsWith("ptb_"), `${relativePath} must use the ptb_ prefix.`);
  assert(contents.includes("//"), `${relativePath} should include // comments.`);
  assert(contents.includes("UnifiedPluginInstallerAgent"), `${relativePath} must use Adobe UPIA for installation.`);
});

// Report success for CI and local verification.
console.log("ptb:lint passed");
