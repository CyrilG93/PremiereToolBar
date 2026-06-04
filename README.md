# Tool Bar

Tool Bar is an Adobe Premiere Pro UXP extension that adds compact dockable shortcut bars for common editing actions.

Create buttons for native effects, video transitions, captured presets, and utility actions, then place them in one or more toolbar collections.

## Requirements

- Adobe Premiere Pro 25.6 or later.
- Adobe Creative Cloud Desktop, used to install the `.ccx` package.
- Premiere plugin permissions enabled when Premiere asks for them.

## Install

1. Quit Premiere Pro.
2. Download or open the Tool Bar folder.
3. Run the installer for your system:

```bash
bash installers/ptb_install_macos.sh
```

On Windows, double-click:

```text
installers\ptb_install_windows.bat
```

The installer builds the `.ccx` package and tries to install it with Adobe's installer tool. If that does not open automatically, the `.ccx` file is created in `.ptb-installer-build`; double-click it while Creative Cloud Desktop is running.

## Open Tool Bar

In Premiere Pro, open:

```text
Window > UXP Plugins
```

Available panels:

- `Tool Bar 1`
- `Tool Bar 2`
- `Tool Bar 3`
- `Tool Bar 4`
- `Tool Bar Settings`

Each Tool Bar panel can be docked wherever you want in Premiere.

## Use

Open `Tool Bar Settings` to manage everything:

- Create and edit buttons.
- Drag buttons into collections.
- Assign collections to `Tool Bar 1` through `Tool Bar 4`.
- Choose icon, text, color, and background style for each button.
- Set each toolbar to horizontal, vertical, or automatic layout.
- Adjust toolbar button size per panel.
- Export or import complete button packs.

New installations start with the bundled `Base Effects` collection. Updates and reinstallations keep existing buttons when Tool Bar can restore the saved configuration from local storage or its external backup file.

## Button Types

- `Native Effect`: add a Premiere effect to selected clips.
- `Video Transition`: add a video transition to selected clips or an edit point.
- `Effect Preset`: capture exposed clip parameters, effects, and keyframes from a selected clip, then apply them later.
- `Multi Action`: run several existing Tool Bar buttons in order.
- `Tools`: open settings, copy effects, paste effects, or remove selected clip effects.

## Backup

Use `Backup Buttons` in settings before major updates if you want a manual JSON copy.

Tool Bar also keeps an automatic config copy outside the UXP plugin folder:

- macOS: `~/Library/Application Support/Tool Bar/ToolBar-config.json`
- Windows: `%APPDATA%\Tool Bar\ToolBar-config.json`

## Notes

Premiere's UXP API can add native effects, edit exposed parameters, and add video transitions. Some Premiere preset data, Lumetri curve data, audio transitions, and direct `.jsx` script execution are not fully exposed by Adobe's documented UXP API yet, so Tool Bar keeps those areas limited or experimental.

Premiere controls the physical size and position of docked panels through its workspace system. Tool Bar saves its internal settings layout, but Premiere manages the panel window placement.

## Development

Useful project commands:

```bash
npm run ptb:lint
npm run ptb:test
npm run ptb:verify
```

## Changelog

### 0.7.0 - 2026-06-04

- Updated the first-run `Base Effects` collection from the bundled starter JSON.
- Added more spacing between gallery button previews and their names.
- Simplified the README and compacted the changelog.

### 0.6.0 - 2026-06-01

- Added a cleaner Settings workflow with remembered open sections, selection, and scroll position.
- Added preset capture options for base parameters, clip effects, or both.
- Kept `.prfpset` import experimental while focusing on the internal preset capture workflow.

### 0.5.0 - 2026-05-31

- Improved captured preset replay for Transform values, keyframes, and point parameters.
- Added per-bar button scaling and compact Settings controls.
- Added Remove Effects options for base parameters and video effects.

### 0.4.0 - 2026-05-26

- Renamed the main actions to clearer user-facing labels.
- Added the visible update download button.
- Published the first `0.4.x` beta package.

### 0.3.0 - 2026-05-25

- Added reliable captured video presets with keyframe timing modes.
- Added Multi Action buttons and complete pack import/export.
- Improved preset and transition preset parsing for compatible Premiere data.

### 0.2.0 - 2026-05-25

- Added the GitHub update check.
- Added the bundled Base Effects starter setup.
- Improved video effect lookup with stable Premiere match names.

### 0.1.0 - 2026-05-13

- Initial Tool Bar extension with four dockable bars, configurable buttons, icon editing, collections, installers, backups, and import/export.
