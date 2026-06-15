import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Build the bundled rectangle and circle Graphics from an editable source MOGRT.
const sourcePath = process.argv[2];
const outputDirectory = path.resolve(process.argv[3] || "assets/MOGRT");
if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error("Usage: node scripts/ptb-generate-shape-mogrts.mjs <source.mogrt> [output-directory]");
}

// Run a native archive command and surface any packaging failure.
function run(command, args, options) {
  const result = spawnSync(command, args, Object.assign({ encoding: "utf8" }, options));
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
}

// Return the English UI label stored on one exposed MOGRT control.
function getControlName(control) {
  const strings = control && control.uiName && Array.isArray(control.uiName.strDB) ? control.uiName.strDB : [];
  const english = strings.find((item) => item.localeString === "en_US") || strings[0];
  return english ? String(english.str || "") : "";
}

// Replace the localized template name without changing unrelated metadata.
function setLocalizedName(container, name) {
  if (!container || !Array.isArray(container.strDB)) {
    return;
  }
  container.strDB.forEach((item) => {
    item.str = name;
  });
}

// Convert the editable source defaults into one text-free rectangle or circle.
function configureDefinition(definition, name, shapeType) {
  definition.capsuleID = crypto.randomUUID();
  definition.capsuleName = name;
  setLocalizedName(definition.capsuleNameLocalized, name);
  definition.capsuleTags = ["tool-bar", "graphic", shapeType];
  // Empty exposed text values remove the source template's runtime font dependency.
  definition.usedFontsLocalized = {};
  (definition.clientControls || []).forEach((control) => {
    const controlName = getControlName(control);
    if (controlName === "TAILLE RECTANGLE") {
      control.value = shapeType === "circle" ? [520, 520, 0] : [840, 480, 0];
    } else if (controlName === "COIN SARRONDI") {
      control.value = shapeType === "circle" ? 260 : 0;
    } else if (controlName === "OPACITY RECTANGLE") {
      control.value = 100;
    } else if (controlName === "COULEUR RECTANGLE") {
      control.value = [1, 1, 1, 1];
    } else if (controlName.includes("OPACITY CADRE") || controlName.includes("Opacity")) {
      control.value = 0;
    } else if (control.type === 6 && control.value && Array.isArray(control.value.strDB)) {
      // Hide source text layers while preserving the source Graphic structure.
      control.value.strDB.forEach((item) => {
        item.str = "";
      });
    }
  });
}

// Repack one generated MOGRT with deterministic archive metadata where zip supports it.
function buildMogrt(name, shapeType) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-mogrt-"));
  try {
    run("unzip", ["-q", sourcePath, "-d", temporaryDirectory]);
    const definitionPath = path.join(temporaryDirectory, "definition.json");
    const definition = JSON.parse(fs.readFileSync(definitionPath, "utf8"));
    configureDefinition(definition, name, shapeType);
    fs.writeFileSync(definitionPath, JSON.stringify(definition), "utf8");
    fs.mkdirSync(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${name}.mogrt`);
    fs.rmSync(outputPath, { force: true });
    run("zip", ["-X", "-q", "-r", outputPath, "."], { cwd: temporaryDirectory });
    return outputPath;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

// Generate both runtime assets from the same source template.
console.log(buildMogrt("Tool Bar Rectangle", "rectangle"));
console.log(buildMogrt("Tool Bar Circle", "circle"));
