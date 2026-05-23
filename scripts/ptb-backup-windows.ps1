param(
  [string]$Mode = "backup",
  [string]$Version = "unknown"
)

$ErrorActionPreference = "Stop"

# // Keep the backup script scoped to Tool Bar so it cannot touch unrelated UXP plugins.
$ptbPluginId = "com.cyrilplugin.toolbar"
$ptbBackupFileName = "ToolBar-config-backup.json"
$ptbSafeBackupRoot = Join-Path $env:APPDATA "Tool Bar\Backups"
$ptbExternalConfigFile = Join-Path (Split-Path -Parent $ptbSafeBackupRoot) "ToolBar-config.json"
$ptbLatestBackupFile = Join-Path $ptbSafeBackupRoot "ToolBar-config-latest.json"
$ptbLocationsFile = Join-Path $ptbSafeBackupRoot "ToolBar-backup-locations.json"

# // Find Tool Bar's mirrored config files inside Adobe UXP storage for Premiere.
function Get-PtbBackupSources {
  if (Test-Path -LiteralPath $ptbExternalConfigFile) {
    Get-Item -LiteralPath $ptbExternalConfigFile
  }
  $ptbRoots = @(
    (Join-Path $env:APPDATA "Adobe\UXP\PluginsStorage"),
    (Join-Path $env:LOCALAPPDATA "Adobe\UXP\PluginsStorage")
  )
  foreach ($ptbRoot in $ptbRoots) {
    if (-not (Test-Path -LiteralPath $ptbRoot)) {
      continue
    }
    Get-ChildItem -LiteralPath $ptbRoot -Recurse -Filter $ptbBackupFileName -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like "*\PPRO\*" -and $_.FullName -like "*\$ptbPluginId\PluginData\$ptbBackupFileName" }
  }
}

# // Validate that a candidate backup is readable JSON before preserving or restoring it.
function Test-PtbJsonBackup {
  param([string]$Path)
  try {
    $ptbRaw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($ptbRaw)) {
      return $false
    }
    $null = $ptbRaw | ConvertFrom-Json
    return $true
  } catch {
    return $false
  }
}

# // Copy the current UXP mirror into a user-level folder that plugin reinstalls should not remove.
function Backup-PtbConfig {
  New-Item -ItemType Directory -Force -Path $ptbSafeBackupRoot | Out-Null
  $ptbTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $ptbIndex = 0
  $ptbRecords = @()
  foreach ($ptbSource in Get-PtbBackupSources) {
    if (-not (Test-PtbJsonBackup -Path $ptbSource.FullName)) {
      continue
    }
    $ptbIndex += 1
    $ptbTarget = Join-Path $ptbSafeBackupRoot ("ToolBar-config-before-{0}-{1}-{2}.json" -f $Version, $ptbTimestamp, $ptbIndex)
    Copy-Item -LiteralPath $ptbSource.FullName -Destination $ptbTarget -Force
    Copy-Item -LiteralPath $ptbSource.FullName -Destination $ptbLatestBackupFile -Force
    $ptbRecords += [pscustomobject]@{
      source = $ptbSource.FullName
      backup = $ptbTarget
      version = $Version
      createdAt = (Get-Date).ToString("s")
    }
  }
  if ($ptbRecords.Count -gt 0) {
    $ptbRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ptbLocationsFile -Encoding UTF8
    Write-Host ("Saved Tool Bar button backup to {0}" -f $ptbLatestBackupFile)
    return
  }
  Write-Host "No existing Tool Bar button backup was found yet."
}

# // Restore the latest safe copy back to the same UXP data locations after an installer update.
function Restore-PtbConfig {
  if (-not (Test-Path -LiteralPath $ptbLatestBackupFile)) {
    Write-Host "No Tool Bar button backup is available to restore."
    return
  }
  if (-not (Test-PtbJsonBackup -Path $ptbLatestBackupFile)) {
    Write-Host "Tool Bar button backup was skipped because the latest backup is not valid JSON."
    return
  }
  if (-not (Test-Path -LiteralPath $ptbLocationsFile)) {
    Write-Host "No Tool Bar backup location list is available to restore."
    return
  }
  $ptbLocations = Get-Content -LiteralPath $ptbLocationsFile -Raw | ConvertFrom-Json
  $ptbRestored = 0
  foreach ($ptbLocation in @($ptbLocations)) {
    if ([string]::IsNullOrWhiteSpace($ptbLocation.source)) {
      continue
    }
    $ptbDestinationFolder = Split-Path -Parent $ptbLocation.source
    New-Item -ItemType Directory -Force -Path $ptbDestinationFolder | Out-Null
    Copy-Item -LiteralPath $ptbLatestBackupFile -Destination $ptbLocation.source -Force
    $ptbRestored += 1
  }
  if ($ptbRestored -gt 0) {
    Write-Host ("Restored Tool Bar button backup to {0} UXP location(s)." -f $ptbRestored)
    return
  }
  Write-Host "No Tool Bar UXP backup location was restored."
}

if ($Mode -ieq "restore") {
  Restore-PtbConfig
} else {
  Backup-PtbConfig
}
