# Tool Bar

Tool Bar is a compact Adobe Premiere Pro UXP plugin for creating dockable shortcut bars. Each button can apply a configured native effect, a video transition, or an internally captured effect stack to the clips currently selected in the timeline.

## Requirements

- Adobe Premiere Pro 25.6 or later.
- UXP Developer Tool 2.2 or later for development loading and packaging.
- Premiere Developer Mode enabled in `Preferences > Plugins`.

## Install for Testing

1. Open Premiere Pro.
2. Open the UXP Developer Tool.
3. Add this folder as an existing plugin.
4. Click `Load` or `Load & Watch`.
5. In Premiere, open `Window > UXP Plugins > Tool Bar`.

For distribution, package the plugin as a `.ccx` from the UXP Developer Tool. Adobe installs `.ccx` plugins through Creative Cloud Desktop.

## Use

Open one or more bars from `Window > UXP Plugins > Tool Bar`:

- `Tool Bar 1`
- `Tool Bar 2`
- `Tool Bar 3`
- `Tool Bar 4`
- `Tool Bar Settings`

Each bar is a separate dockable Premiere panel. Use the gear button on any bar to open settings. In settings you can:

- Rename and enable or disable each bar.
- Create, duplicate, delete, and reorder buttons.
- Assign an icon, icon color, button color, or short text label.
- Choose native video/audio effects from Premiere after refreshing the catalog.
- Assign video transition match names from Premiere.
- Capture an exposed effect stack from the currently selected clip and reuse it as a Tool Bar preset.
- Export all bars or one bar, then import them later.

## Important API Notes

Adobe's documented UXP API supports adding native video/audio effects and video transitions to selected timeline clips. It also supports multiple dockable panels, so Tool Bar includes four bars.

Directly applying Premiere `.prfpset` effect preset files is not exposed in the documented UXP DOM API at this time. Tool Bar therefore includes an internal captured-stack preset mode for exposed effects, parameters, and keyframes. Some third-party effects or protected parameters may not expose all values to UXP.

## Development

Use the project-prefixed commands:

```bash
npm run ptb:lint
npm run ptb:test
npm run ptb:verify
```

## Changelog

### 0.1.0 - 2026-05-13

- Initial Tool Bar plugin with four dockable bars, configurable buttons, icon gallery, Premiere effect/transition actions, captured-stack presets, and bar import/export.
