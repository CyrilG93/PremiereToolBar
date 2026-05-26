#!/usr/bin/env bash
set -euo pipefail

# // Resolve the project root whether the script is launched from the repo root or the installers folder.
PTB_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PTB_ROOT="$(cd "${PTB_SCRIPT_DIR}/.." && pwd)"
PTB_MANIFEST="${PTB_ROOT}/manifest.json"

# // Read the plugin version from manifest.json without requiring Node or Python.
PTB_VERSION="$(/usr/bin/awk -F '"' '/"version"[[:space:]]*:/ { print $4; exit }' "${PTB_MANIFEST}")"
if [ -z "${PTB_VERSION}" ]; then
  echo "Unable to read Tool Bar version from manifest.json."
  exit 1
fi

# // Preserve existing user buttons before packaging or installing because some UXP installers clear plugin storage.
/bin/bash "${PTB_ROOT}/scripts/ptb-backup-macos.sh" backup "${PTB_VERSION}"

# // Stage only the files required by the UXP plugin runtime.
PTB_BUILD_DIR="${PTB_ROOT}/.ptb-installer-build"
PTB_STAGE_DIR="${PTB_BUILD_DIR}/package-${PTB_VERSION}"
PTB_CCX="${PTB_BUILD_DIR}/ToolBar-${PTB_VERSION}.ccx"
mkdir -p "${PTB_BUILD_DIR}"
# // Reuse one staging folder and clean old package folders inside the build directory only.
case "${PTB_STAGE_DIR}" in
  "${PTB_BUILD_DIR}"/package-*) find "${PTB_BUILD_DIR}" -maxdepth 1 -type d -name "package-*" -exec rm -rf {} + ;;
  *) echo "Unsafe Tool Bar staging path."; exit 1 ;;
esac
mkdir -p "${PTB_STAGE_DIR}"
cp "${PTB_ROOT}/manifest.json" "${PTB_STAGE_DIR}/manifest.json"
cp "${PTB_ROOT}/index.html" "${PTB_STAGE_DIR}/index.html"
cp "${PTB_ROOT}/index.js" "${PTB_STAGE_DIR}/index.js"
cp "${PTB_ROOT}/styles.css" "${PTB_STAGE_DIR}/styles.css"
cp -R "${PTB_ROOT}/src" "${PTB_STAGE_DIR}/src"
if [ -d "${PTB_ROOT}/assets" ]; then
  cp -R "${PTB_ROOT}/assets" "${PTB_STAGE_DIR}/assets"
fi
# // Remove macOS Finder metadata from the staged package so local .DS_Store files never enter the CCX.
/usr/bin/find "${PTB_STAGE_DIR}" -name ".DS_Store" -type f -delete

# // Build a .ccx package; Adobe documents CCX as a ZIP container for UXP plugins.
mkdir -p "${PTB_BUILD_DIR}"
if [ -x "/usr/bin/ditto" ]; then
  (cd "${PTB_STAGE_DIR}" && /usr/bin/ditto -c -k --norsrc . "${PTB_CCX}")
elif command -v zip >/dev/null 2>&1; then
  (cd "${PTB_STAGE_DIR}" && zip -qr "${PTB_CCX}" .)
else
  echo "Unable to package Tool Bar: neither ditto nor zip is available."
  exit 1
fi

echo "Created ${PTB_CCX}"

# // Allow release/package workflows to create the CCX without installing it immediately.
if [ "${1:-}" = "--package-only" ]; then
  exit 0
fi

# // Find Adobe's Unified Plugin Installer Agent in the standard Creative Cloud location.
PTB_UPIA=""
for PTB_CANDIDATE in \
  "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" \
  "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/macOS/UnifiedPluginInstallerAgent"; do
  if [ -x "${PTB_CANDIDATE}" ]; then
    PTB_UPIA="${PTB_CANDIDATE}"
    break
  fi
done

# // If UPIA is unavailable, keep the generated CCX and tell the user the supported manual method.
if [ -z "${PTB_UPIA}" ]; then
  echo "Adobe UPIA was not found."
  echo "Install manually by double-clicking: ${PTB_CCX}"
  echo "You can also package/load the folder with the UXP Developer Tool."
  exit 2
fi

# // Install the packaged UXP plugin through Adobe UPIA and restore the backup mirror afterward.
set +e
"${PTB_UPIA}" --install "${PTB_CCX}"
PTB_UPIA_EXIT=$?
set -e
/bin/bash "${PTB_ROOT}/scripts/ptb-backup-macos.sh" restore "${PTB_VERSION}"
if [ "${PTB_UPIA_EXIT}" -ne 0 ]; then
  echo "Adobe UPIA returned an installation error."
  exit "${PTB_UPIA_EXIT}"
fi
echo "Tool Bar ${PTB_VERSION} installation command completed."
