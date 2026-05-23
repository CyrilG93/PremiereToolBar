#!/usr/bin/env bash
set -euo pipefail

PTB_MODE="${1:-backup}"
PTB_VERSION="${2:-unknown}"

# // Keep user data outside Adobe UXP plugin storage so updates do not remove it.
PTB_PLUGIN_ID="com.cyrilplugin.toolbar"
PTB_BACKUP_FILE_NAME="ToolBar-config-backup.json"
PTB_SUPPORT_DIR="${HOME}/Library/Application Support/Tool Bar"
PTB_BACKUP_DIR="${PTB_SUPPORT_DIR}/Backups"
PTB_EXTERNAL_CONFIG="${PTB_SUPPORT_DIR}/ToolBar-config.json"
PTB_LATEST_BACKUP="${PTB_BACKUP_DIR}/ToolBar-config-latest.json"
PTB_LOCATIONS_FILE="${PTB_BACKUP_DIR}/ToolBar-backup-locations.tsv"

# // Validate JSON with macOS built-in plutil before preserving or restoring it.
ptb_is_json_backup() {
  local PTB_FILE="$1"
  [ -s "${PTB_FILE}" ] && /usr/bin/plutil -lint "${PTB_FILE}" >/dev/null 2>&1
}

# // List the external config plus Premiere UXP mirrors for this plugin only.
ptb_backup_sources() {
  if [ -f "${PTB_EXTERNAL_CONFIG}" ]; then
    printf '%s\n' "${PTB_EXTERNAL_CONFIG}"
  fi
  local PTB_UXP_ROOT="${HOME}/Library/Application Support/Adobe/UXP/PluginsStorage"
  if [ -d "${PTB_UXP_ROOT}" ]; then
    /usr/bin/find "${PTB_UXP_ROOT}" -type f -name "${PTB_BACKUP_FILE_NAME}" -path "*PPRO*${PTB_PLUGIN_ID}/PluginData/${PTB_BACKUP_FILE_NAME}" 2>/dev/null
  fi
}

# // Copy current configs to a stable user-level backup folder.
ptb_backup_config() {
  /bin/mkdir -p "${PTB_BACKUP_DIR}"
  local PTB_TIMESTAMP
  PTB_TIMESTAMP="$(/bin/date +%Y%m%d-%H%M%S)"
  local PTB_INDEX=0
  : > "${PTB_LOCATIONS_FILE}"
  while IFS= read -r PTB_SOURCE; do
    if ! ptb_is_json_backup "${PTB_SOURCE}"; then
      continue
    fi
    PTB_INDEX=$((PTB_INDEX + 1))
    local PTB_TARGET="${PTB_BACKUP_DIR}/ToolBar-config-before-${PTB_VERSION}-${PTB_TIMESTAMP}-${PTB_INDEX}.json"
    /bin/cp "${PTB_SOURCE}" "${PTB_TARGET}"
    /bin/cp "${PTB_SOURCE}" "${PTB_LATEST_BACKUP}"
    printf '%s\t%s\t%s\n' "${PTB_SOURCE}" "${PTB_TARGET}" "${PTB_VERSION}" >> "${PTB_LOCATIONS_FILE}"
  done < <(ptb_backup_sources)
  if [ "${PTB_INDEX}" -gt 0 ]; then
    echo "Saved Tool Bar button backup to ${PTB_LATEST_BACKUP}"
  else
    echo "No existing Tool Bar button backup was found yet."
  fi
}

# // Restore the latest stable copy to the known UXP and external config locations.
ptb_restore_config() {
  if [ ! -f "${PTB_LATEST_BACKUP}" ] || ! ptb_is_json_backup "${PTB_LATEST_BACKUP}"; then
    echo "No valid Tool Bar button backup is available to restore."
    return
  fi
  if [ ! -f "${PTB_LOCATIONS_FILE}" ]; then
    echo "No Tool Bar backup location list is available to restore."
    return
  fi
  local PTB_RESTORED=0
  while IFS=$'\t' read -r PTB_SOURCE _PTB_TARGET _PTB_VERSION; do
    if [ -z "${PTB_SOURCE}" ]; then
      continue
    fi
    /bin/mkdir -p "$(/usr/bin/dirname "${PTB_SOURCE}")"
    /bin/cp "${PTB_LATEST_BACKUP}" "${PTB_SOURCE}"
    PTB_RESTORED=$((PTB_RESTORED + 1))
  done < "${PTB_LOCATIONS_FILE}"
  echo "Restored Tool Bar button backup to ${PTB_RESTORED} location(s)."
}

if [ "${PTB_MODE}" = "restore" ]; then
  ptb_restore_config
else
  ptb_backup_config
fi
