# Tool Bar

Tool Bar is a compact Adobe Premiere Pro UXP plugin for creating dockable shortcut bars. Each button can apply a configured native effect, a video transition, or an internally captured effect stack to the clips currently selected in the timeline.

## Requirements

- Adobe Premiere Pro 25.6 or later.
- Adobe Creative Cloud Desktop for `.ccx` installation.
- UXP Developer Tool 2.2 or later for development loading and packaging.
- Premiere Developer Mode enabled in `Preferences > Plugins`.

## Install

The easiest user install method is a `.ccx` file. The included installers build that `.ccx` package, then try to install it with Adobe's Unified Plugin Installer Agent.

### macOS

1. Quit Premiere Pro.
2. Open Terminal in the Tool Bar folder.
3. Run:

```bash
bash installers/ptb_install_macos.sh
```

### Windows

1. Quit Premiere Pro.
2. Open the Tool Bar folder.
3. Double-click `installers\ptb_install_windows.bat`.

The Windows installer window stays open after it finishes so you can read any Creative Cloud or UPIA message. For packaging workflows that should not wait for a key press, run `installers\ptb_install_windows.bat --package-only`.

If Adobe UPIA is not found, the scripts still create a `.ccx` file in `.ptb-installer-build`. Double-clicking that `.ccx` file still requires Adobe Creative Cloud Desktop.

If Adobe UPIA reports a failed install status, open Creative Cloud Desktop first, then run the installer again. For development loading, add this project folder or `manifest.json` in UXP Developer Tool instead of using the `.ccx` installer.

### Development Loading

1. Open Premiere Pro.
2. Open the UXP Developer Tool.
3. Add this folder as an existing plugin.
4. Click `Load` or `Load & Watch`.
5. In Premiere, open `Window > UXP Plugins > Tool Bar`.

## Use

Open one or more bars from `Window > UXP Plugins > Tool Bar`:

- `Tool Bar 1`
- `Tool Bar 2`
- `Tool Bar 3`
- `Tool Bar 4`
- `Tool Bar Settings`

Each bar is a separate dockable Premiere panel. Open `Tool Bar Settings` from the UXP Plugins menu, or add the built-in Settings button to any collection. In settings you can:

- Create buttons from the top action bar, then edit the selected button below the gallery.
- Drag buttons from the gallery into any collection, or use the add-button menu inside a collection.
- Rename collections and assign them to bars 1-4 with the compact `B1` to `B4` toggles.
- Choose whether a button shows an icon, a three-letter text shortcut, or both.
- Assign an icon, icon color, and button color with popover pickers.
- Type either the Premiere effect name or the effect match name in one field.
- Assign video transition match names from Premiere.
- Capture an exposed effect stack from the currently selected clip and reuse it as a Tool Bar preset.
- Export all collections or one collection, then import them later.

## Important API Notes

Adobe's documented UXP API supports adding native video/audio effects and video transitions to selected timeline clips. It also supports multiple dockable panels, so Tool Bar includes four bars.

Directly applying Premiere `.prfpset` effect preset files is not exposed in the documented UXP DOM API at this time. Tool Bar therefore includes an internal captured-stack preset mode for exposed effects, parameters, and keyframes. Some third-party effects or protected parameters may not expose all values to UXP.

## Development

Use the project-prefixed commands:

```bash
npm run ptb:install:mac
npm run ptb:install:windows
npm run ptb:lint
npm run ptb:test
npm run ptb:verify
```

## Icon Notes

The built-in icon gallery is bundled locally so Tool Bar does not need internet access inside Premiere. The current test pack uses transparent PNG files from `assets/Icons`, which is the safest format found so far for this UXP panel.

## Changelog

### 0.1.21 - 2026-05-23

- Clarified the Windows installer messages when CCX installation depends on Creative Cloud Desktop.

### 0.1.20 - 2026-05-23

- Made the Windows installer report Adobe UPIA failed-install statuses clearly instead of showing a success message.

### 0.1.19 - 2026-05-23

- Fixed Windows packaging on PowerShell versions that only allow `.zip` archive output.

### 0.1.18 - 2026-05-23

- Kept the Windows installer window open after user launches so installation messages are visible.

### 0.1.17 - 2026-05-22

- Switched the icon gallery and toolbar buttons to the bundled PNG icon pack.
- Replaced picker previews with custom controls to avoid gray native button squares in Premiere.

### 0.1.16 - 2026-05-22

- Rebuilt icon rendering with real HTML shape elements instead of pseudo-elements.
- Added a mouseup fallback for collection drag and drop so the hovered target applies even when UXP skips native drop events.
- Clarified that transparent PNG icon packs are safer than SVG packs for this panel.

### 0.1.15 - 2026-05-22

- Moved the icon gallery into an on-demand picker next to the color controls.
- Replaced text glyph icons with CSS-shape icons to avoid missing-font squares in Premiere.
- Normalized compact toolbar spacing across all four bars.

### 0.1.14 - 2026-05-22

- Added an `Icon + Text` button display mode.
- Replaced the native color input with a built-in color picker that works inside Premiere UXP.
- Restored visible icons with UXP-safe graphic glyphs and kept icon colors editable.
- Removed the collection name from compact toolbar panels and kept the bars distinct as Tool Bar 1-4 panels.
- Improved collection drag and drop feedback with an insertion marker.

### 0.1.13 - 2026-05-22

- Added separate icon-only and text-only display modes for buttons.
- Reworked icon rendering so toolbar buttons and collection cards show graphic icons without fallback initials.
- Replaced color swatch rows with native color pickers for icon and button colors.
- Merged effect display name and match name into one effect lookup field.
- Improved collection drag and drop behavior and showed the assigned collection name in each toolbar panel.

### 0.1.12 - 2026-05-21

- Simplified button gallery and collection labels to show only the editable button name.
- Added a graphical SVG icon gallery and visual color swatches for icon and button colors.
- Added drag and drop reordering inside collections plus right-click removal from a collection.
- Kept video effect display-name lookup, while match names remain the most reliable Premiere identifier.
- Icon shapes use an internal SVG set compatible with Lucide-style open icons; Lucide is available under the ISC license.

### 0.1.11 - 2026-05-21

- Changed the Settings modules so their contents are filled only after each section is mounted in Premiere.
- Kept module bodies open with a stable minimum height to prevent UXP from showing title-only sections.
- Replaced nested grid layouts in Settings with flex layouts for better Premiere UXP rendering.

### 0.1.10 - 2026-05-21

- Made the Settings modules render as a stable visible column in Premiere UXP.
- Added per-module render fallbacks so Button Gallery, Button Editor, Collections, and Import / Export do not disappear silently.
- Removed the remaining visible dependency on the Premiere list refresh workflow.

### 0.1.9 - 2026-05-13

- Made all settings modules visible immediately instead of relying on collapsible sections.
- Removed the visible `Refresh Premiere Lists` buttons while the effect list workflow is still being refined.
- Unified toolbar spacing to the tighter compact style across all dockable bars.

### 0.1.8 - 2026-05-13

- Removed the panel-root style injection that UXP rendered as visible CSS text.
- Added inline critical styling to the toolbar and settings UI so redraws keep the intended layout.

### 0.1.7 - 2026-05-13

- Fixed settings redraws so the panel keeps its styled sections after pressing buttons.
- Ensured the button gallery and collections render immediately when the settings panel opens.
- Made toolbar strips choose vertical layout only when the docked panel is genuinely tall and narrow.

### 0.1.6 - 2026-05-13

- Added cache-busting for UXP assets so Premiere does not keep an old stylesheet while loading newer JavaScript.
- Added built-in critical styles to keep the settings panel readable even if UXP caches external CSS.
- Updated the panel background to follow Premiere/UXP theme colors when available.

### 0.1.5 - 2026-05-13

- Simplified settings into collapsible sections for button gallery, button editor, collections, and import/export.
- Added drag and drop from the button gallery into collections.
- Added compact `B1` to `B4` toggles on collections for assigning dockable bars.

### 0.1.4 - 2026-05-13

- Replaced bar names with a collection system: global buttons can be assigned to collections, and collections can be assigned to bars 1-4.
- Added a default Base Effects collection with Settings, Transform, Crop, Gaussian Blur, Drop Shadow, Horizontal Flip, Vertical Flip, and Ultra Key buttons.
- Updated import/export to target collections instead of bars and unified the compact bar appearance.

### 0.1.3 - 2026-05-13

- Rebuilt the settings panel as a wider workspace with clear bar and button selection.
- Fixed bar renaming, button creation, duplication, deletion, and reordering.
- Replaced the invalid Solarize starter button with Gaussian Blur and added safer effect lookup.

### 0.1.2 - 2026-05-13

- Improved the settings panel so Add Button and edit controls are visible immediately in Premiere UXP.
- Replaced SVG toolbar icons with compact text icons for better UXP compatibility.

### 0.1.1 - 2026-05-13

- Added macOS and Windows installer scripts that build a `.ccx` package and install it through Adobe UPIA when available.

### 0.1.0 - 2026-05-13

- Initial Tool Bar plugin with four dockable bars, configurable buttons, icon gallery, Premiere effect/transition actions, captured-stack presets, and bar import/export.
