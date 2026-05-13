(function () {
  "use strict";

  // Register all Premiere UXP panel entrypoints declared in manifest.json.
  const { entrypoints, pluginManager } = require("uxp");

  // Store the plugin id so the gear button can open the settings panel.
  let pluginId = "";

  // Render a specific panel body when Premiere opens or shows an entrypoint.
  function mountPanel(rootNode, panelId) {
    // Delegate UI rendering to a single module so all panels share state.
    window.PTB_UI.mountPanel(rootNode, panelId, {
      pluginManager,
      getPluginId: () => pluginId
    });
  }

  // Define lifecycle hooks for each compact bar and the settings panel.
  entrypoints.setup({
    plugin: {
      create() {
        // UXP provides the concrete plugin id through the lifecycle context.
        pluginId = this.id;
      }
    },
    panels: {
      "ptb-bar-1": {
        show(rootNode) {
          // Render the first dockable toolbar.
          mountPanel(rootNode, "ptb-bar-1");
        }
      },
      "ptb-bar-2": {
        show(rootNode) {
          // Render the second dockable toolbar.
          mountPanel(rootNode, "ptb-bar-2");
        }
      },
      "ptb-bar-3": {
        show(rootNode) {
          // Render the third dockable toolbar.
          mountPanel(rootNode, "ptb-bar-3");
        }
      },
      "ptb-bar-4": {
        show(rootNode) {
          // Render the fourth dockable toolbar.
          mountPanel(rootNode, "ptb-bar-4");
        }
      },
      "ptb-settings": {
        show(rootNode) {
          // Render the full configuration panel.
          mountPanel(rootNode, "ptb-settings");
        }
      }
    }
  });
}());
