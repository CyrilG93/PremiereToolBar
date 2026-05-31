# Tool Bar

Tool Bar is a compact Adobe Premiere Pro UXP plugin for creating dockable shortcut bars. Each button can apply a configured native effect, a video transition, or a captured Tool Bar preset to the clips currently selected in the timeline.

## Requirements

- Adobe Premiere Pro 25.6 or later.
- Adobe Creative Cloud Desktop for `.ccx` installation.
- UXP Developer Tool 2.2 or later for development loading and packaging.
- Premiere Developer Mode enabled in `Preferences > Plugins`.
- Local file access permission, used to keep buttons and collections in a Windows user data folder that survives plugin updates.

## Install

The easiest user install method is to use the installers provided. The installers also build a `.ccx` package, that you can install with Adobe's Unified Plugin Installer Agent.
You can also use extenal ZXP/UXP installer like [this one.](https://aescripts.com/learn/post/zxp-installer?srsltid=AfmBOooDDsd7L4wQn5h1OmGuJOTGiIilBJE7gAMMv228W99OHFv0YtaG)

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

Some third-party CCX installers may warn that no compatible application was found even when the plugin installs correctly. Tool Bar's manifest targets Premiere Pro 25.6 or later.

On Windows, Tool Bar also keeps buttons and collections in `%APPDATA%\Tool Bar\ToolBar-config.json`, outside Adobe's UXP plugin storage. On macOS, it uses `~/Library/Application Support/Tool Bar/ToolBar-config.json`. The included installers back up existing data before packaging or installing, then restore the UXP backup mirror after installation.

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
- Set each bar to horizontal or vertical from the compact bar controls.
- Choose whether a button shows an icon, a three-letter text shortcut, or both.
- Assign an icon, icon color, and button color with popover pickers, including a transparent button background when you only want the icon or text.
- Type either the Premiere effect name or the effect match name in one field. Video effect catalog choices fill the stable match name when Premiere exposes one.
- Assign video transition match names from Premiere.
- Create a `Tools` action for built-in utilities such as opening settings, copying the selected clip's effect stack, or pasting the copied stack to the current selection.
- Create a `Multi Action` button that runs several existing Tool Bar buttons in order, with drag and drop ordering like collections.
- Create an `Effect Preset` action by naming the preset, applying it to one clip, selecting that clip, then using `Capture Selected Preset`; choose whether keyframes anchor to the clip in/out, scale to clip duration, or keep original times.
- Try `Import .prfpset (Experimental)` on a `Preset` button when you want Tool Bar to parse a Premiere effect preset file directly. It works best with native video effects whose match names and parameter values are visible in the XML.
- Read the `Logs` section at the bottom of settings when a Premiere action fails or needs debugging.
- Use the update button at the top of settings when Tool Bar detects a newer GitHub release.
- Use `Backup Buttons` before updating if you want a JSON copy outside Premiere's plugin storage, then use `Restore Buttons` after reinstalling if needed.
- Export a complete pack with buttons, collections, and bar assignments, or export one collection from that collection's own card. Complete imports merge into the current setup instead of replacing everything.

## Important API Notes

Adobe's documented UXP API supports adding native video/audio effects and video transitions to selected timeline clips. Video effects expose stable match names, while audio effects currently expose display names for creation in the documented UXP API. Audio transition creation is not currently documented by Adobe and did not apply reliably in current tests, so Tool Bar keeps that code disabled for now. The documented API also supports multiple dockable panels, so Tool Bar includes four bars.

Directly applying Premiere `.prfpset` effect or transition preset files is not exposed in the documented UXP DOM API at this time. Tool Bar therefore includes a `Preset` action that captures exposed effects, parameters, and keyframes from a selected clip and replays them later. The experimental `.prfpset` importer reads XML and rebuilds a Tool Bar preset when possible, but Premiere UXP still does not expose stable parameter IDs, so some third-party effects, duplicated parameter names, or protected parameters may not replay perfectly. JSX scripts are also not directly runnable through a documented Premiere UXP API today; Tool Bar can store imported `.jsx` files on Script buttons and will try compatible host runner methods if Adobe exposes them later. Lumetri curve blobs and other opaque preset payloads are preserved in exported Tool Bar JSON for future compatibility, but Premiere UXP cannot replay those raw values yet.

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

The built-in icon gallery is bundled locally so Tool Bar does not need internet access inside Premiere. The current test pack uses inline SVG files from `assets/SVG`, and Tool Bar paints the SVG shapes directly so `Icon Color` can recolor icons in bars and settings.

## Changelog

### 0.4.5 - 2026-05-31

- Improved capture and logging for Transform Anchor Point and Position presets.

### 0.4.4 - 2026-05-31

- Fixed captured Transform Anchor Point and Position values so they paste back with their edited coordinates.

### 0.4.3 - 2026-05-28

- Fixed static point parameters such as Transform Position so they keep their captured values.

### 0.4.2 - 2026-05-28

- Increased the default Settings panel size so the button editor and collections are usable immediately.

### 0.4.1 - 2026-05-28

- Fixed captured presets so edited non-keyframed parameters keep their real value instead of falling back to `0`.
- Improved `.prfpset` parsing for static edited values stored in `CurrentValue`.

### 0.4.0 - 2026-05-26

- Renamed the action labels to `Effect Preset` and `Tools`.
- Hid Script buttons from the visible action list until Premiere exposes a usable JSX runner.
- Published the first `0.4.x` beta release package.
- Added the visible update download button and the Premiere UXP permission required to open the GitHub release `.zip`.

### 0.3.11 - 2026-05-26

- Reordered button action types to Native Effect, Preset, Transition, Multi Action, Script, then Tool.
- Hid the experimental Transition Preset action from new button setup while keeping its code path for later.
- Added Script buttons with `.jsx` import and clear logging for the current Premiere UXP JSX limitation.

### 0.3.10 - 2026-05-26

- Replayed compatible parameters from imported transition `.prfpset` files after adding the transition.
- Logged clear warnings when Premiere does not expose the created transition item for parameter replay.

### 0.3.9 - 2026-05-26

- Added `Transition Preset` buttons with `.prfpset` import for transition match name and duration.
- Stored imported transition preset data in Tool Bar so the original preset file is not required after import.

### 0.3.8 - 2026-05-26

- Fixed Multi Action drag and drop from the gallery and between Multi Action buttons.
- Removed the extra empty space in the Multi Action button editor.

### 0.3.7 - 2026-05-26

- Made Multi Action editing compact and drag/drop based, with right-click removal like collections.
- Moved collection export onto each collection card.
- Simplified the global import/export panel to complete export and merge import only.

### 0.3.6 - 2026-05-26

- Added Tool buttons for settings, copy clip effects, and paste clip effects.
- Added Multi Action buttons that run several existing buttons in order.
- Added complete pack export/import with merge behavior for buttons, collections, and bar assignments.

### 0.3.5 - 2026-05-26

- Rebased preset keyframes on the selected clip in/out point so they appear on macOS instead of applying only one static value.

### 0.3.4 - 2026-05-26

- Split preset keyframe replay into a dedicated setup step before adding keyframes, improving macOS reliability.
- Removed the extra empty space in the Preset button editor layout.

### 0.3.3 - 2026-05-26

- Fixed macOS installer backups so valid Tool Bar JSON is no longer rejected by `plutil`.
- Preserved unsupported captured preset values as raw entries so Lumetri-like parameters remain visible in exported JSON.

### 0.3.2 - 2026-05-26

- Preserved raw Lumetri curve and selector payloads when importing `.prfpset` files.
- Preserved opaque captured parameter objects in Tool Bar preset JSON for future replay support.
- Skipped raw preset values cleanly when Premiere UXP cannot apply their parameter type.

### 0.3.1 - 2026-05-26

- Improved macOS packaging so local Finder metadata files are excluded from the generated `.ccx`.
- Extended local verification to cover the preset import module loaded by the plugin.

### 0.3.0 - 2026-05-25

- Added reliable captured video presets with keyframe timing modes.
- Added experimental `.prfpset` import for native video effect presets.
- Improved preset replay so static values and keyframes are preserved more consistently.
- Kept update checks quieter when Premiere blocks network access.

### 0.2.0 - 2026-05-25

- Added a GitHub release update check with a settings banner when a newer version is available.
- Updated the first-run default buttons and collections with the bundled Base Effects setup.
- Made video effect catalog selections fill the stable Premiere match name in the editor.

### 0.1.44 - 2026-05-25

- Made video effect catalog selections fill the stable Premiere match name in the editor.
- Clarified that audio effects use display names because Premiere UXP does not expose audio effect match names in the documented factory API.

### 0.1.43 - 2026-05-25

- Improved collection drag and drop so buttons can be reordered at the beginning, middle, or end.
- Made the insertion preview clearer while dragging inside a collection.

### 0.1.42 - 2026-05-25

- Centered detected edit-point video transitions on the shared cut between adjacent clips.
- Hid and disabled audio transition buttons until Premiere exposes reliable support.

### 0.1.41 - 2026-05-24

- Applied video transitions only once at the shared cut when two adjacent clips are selected.
- Kept settings scroll position stable when toolbar buttons update status or logs.

### 0.1.40 - 2026-05-24

- Removed the built-in match-name analyzer button from settings.
- Improved transition picker labels and simplified audio transition selection.
- Added edit-point video transition handling when a selected timeline edit point can be mapped to an adjacent clip.

### 0.1.37 - 2026-05-24

- Added `Inspect Selection Match Names` to log selected clip effect match names and nearby transition match names.
- Expanded transition diagnostics to scan all exposed video and audio tracks when no nearby transition is found.
- Added raw object-shape diagnostics for transition objects that do not expose normal match-name methods.
- Kept the settings scroll position stable when logs refresh after an inspection.

### 0.1.36 - 2026-05-24

- Added a separate `Audio Transition` action for audio crossfades when Premiere exposes compatible UXP methods.
- Added audio-transition catalog entries for common crossfades and clearer logs when the host cannot apply them.

### 0.1.35 - 2026-05-24

- Removed the oversized empty space in the preset editor.
- Added a small gap between toolbar buttons.
- Allowed comma decimals such as `0,5` for transition duration.

### 0.1.34 - 2026-05-24

- Kept only the copyable log view in settings.
- Added staged redraws when opening settings to avoid the occasional broken first layout.
- Retried video transitions with close Premiere match-name suggestions, such as `AE.ADBE Dip To White`.
- Improved empty captured-preset errors so they no longer look like clip-selection failures.

### 0.1.33 - 2026-05-24

- Made logs read from oldest to newest and added a selectable text copy area.
- Added `Copy Logs` for easier debugging reports.
- Added transition match-name copy support and closer error suggestions when a transition cannot be created.

### 0.1.32 - 2026-05-24

- Added a `Logs` section at the bottom of settings for internal messages and Premiere errors.
- Made SVG icon coloring apply in the settings view as well as the docked bars.
- Reduced the initial icon gallery render by loading the large SVG list progressively.
- Added detailed transition diagnostics to show why a transition action fails or is ignored.

### 0.1.31 - 2026-05-24

- Loaded the expanded SVG icon pack and kept the icon picker scrollable.
- Removed icon-color borders from toolbar and collection buttons.
- Added clip start plus end transition placement and a timeline repaint nudge after applying actions.

### 0.1.30 - 2026-05-24

- Switched the icon test pack to inline SVG icons for more reliable coloring.
- Kept one automatic backup file per version instead of creating a new timestamped copy every run.
- Cleaned old package staging folders before creating a new installer package.

### 0.1.29 - 2026-05-24

- Improved icon recoloring by tinting the loaded PNG element through canvas.
- Changed effect insertion to target Premiere's reverse component-chain order.
- Increased the preferred Tool Bar Settings panel size for floating and docked openings.

### 0.1.28 - 2026-05-23

- Added the same automatic update backup flow to the macOS installer.
- Changed effect application to use Premiere's native append action.
- Improved icon and button text recoloring inside Premiere panels.

### 0.1.27 - 2026-05-23

- Added automatic Windows installer backup for buttons and collections before updates.
- Stored buttons and collections in a user-level Tool Bar config file outside Adobe's UXP plugin storage.
- Restored the internal UXP backup mirror after Windows installer runs.

### 0.1.26 - 2026-05-23

- Restored visible PNG icons in Premiere panels.
- Improved vertical bar layout consistency.
- Added quick button backup and restore actions for update-safe JSON copies.

### 0.1.25 - 2026-05-23

- Improved icon color rendering, icon gallery placement, vertical bar wrapping, and text weight consistency.

### 0.1.24 - 2026-05-23

- Added compact horizontal/vertical controls for bars 1-4.
- Improved icon editing, icon/text coloring, collection drag previews, and active bar assignment highlights.
- Added a backup mirror for saved buttons to better survive installer updates.
- Added new effects at the bottom of the existing effect stack.

### 0.1.23 - 2026-05-23

- Improved preset capture so exposed keyframes are preserved more reliably.
- Added a preset name field for `Preset` buttons.

### 0.1.22 - 2026-05-23

- Added a user-facing `Preset` button action that captures and reapplies exposed effect stacks from selected clips.
- Documented the third-party CCX installer compatibility warning.

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
