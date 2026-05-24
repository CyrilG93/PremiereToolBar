(function (root) {
  "use strict";

  // Names for intrinsic components that should not be captured as reusable effect presets.
  const INTRINSIC_COMPONENTS = [
    "Motion",
    "Opacity",
    "Time Remapping",
    "Vector Motion",
    "Volume",
    "Channel Volume",
    "Panner"
  ];

  // Return the Premiere UXP API module when the plugin is running inside Premiere.
  function getPremiere() {
    try {
      return require("premierepro");
    } catch (error) {
      return null;
    }
  }

  // Load the active sequence and selected timeline items.
  async function getSelectedItems() {
    const app = getPremiere();
    if (!app) {
      throw new Error(root.PTB_I18N.t("noPremiereApi"));
    }
    const project = await app.Project.getActiveProject();
    const sequence = project ? await project.getActiveSequence() : null;
    if (!sequence) {
      throw new Error("Open a Premiere sequence first.");
    }
    const selection = await sequence.getSelection();
    const items = selection ? await selection.getTrackItems() : [];
    if (!items || !items.length) {
      throw new Error(root.PTB_I18N.t("noSelection"));
    }
    return { app, project, sequence, items };
  }

  // Determine whether a track item is a video clip by checking video-only APIs.
  function isVideoItem(item) {
    return Boolean(item && typeof item.createAddVideoTransitionAction === "function");
  }

  // Determine whether a track item can accept audio effects.
  function isAudioItem(item) {
    return Boolean(item && !isVideoItem(item) && typeof item.getComponentChain === "function");
  }

  // Execute a list of undoable Premiere actions in one transaction.
  function executeActions(project, actions, undoName) {
    if (!actions.length) {
      throw new Error("No compatible selected clips for this button.");
    }
    return project.executeTransaction((compoundAction) => {
      // Add every prepared action to the undoable compound operation.
      actions.forEach((action) => compoundAction.addAction(action));
    }, undoName || "Tool Bar");
  }

  // Nudge the timeline viewer so Premiere paints async UXP changes without waiting for user movement.
  async function refreshSequenceView(sequence) {
    try {
      if (sequence && typeof sequence.getPlayerPosition === "function" && typeof sequence.setPlayerPosition === "function") {
        sequence.setPlayerPosition(sequence.getPlayerPosition());
      }
    } catch (error) {
      // A repaint nudge is best-effort and should never make the button action fail.
    }
  }

  // Load available Premiere effect and transition names for the settings UI.
  async function loadCatalogs() {
    const app = getPremiere();
    if (!app) {
      throw new Error(root.PTB_I18N.t("noPremiereApi"));
    }
    const videoMatchNames = await app.VideoFilterFactory.getMatchNames();
    const videoDisplayNames = await app.VideoFilterFactory.getDisplayNames();
    const audioDisplayNames = await app.AudioFilterFactory.getDisplayNames();
    const videoTransitionMatchNames = await app.TransitionFactory.getVideoTransitionMatchNames();
    return {
      videoEffects: videoMatchNames.map((matchName, index) => ({
        matchName,
        displayName: videoDisplayNames[index] || matchName
      })),
      audioEffects: audioDisplayNames.map((displayName) => ({
        matchName: "",
        displayName
      })),
      videoTransitions: videoTransitionMatchNames.map((matchName) => ({
        matchName,
        displayName: matchName
      }))
    };
  }

  // Apply a toolbar button to the current Premiere timeline selection.
  async function applyButton(button) {
    const normalizedButton = root.PTB_SCHEMA.createButton(button);
    if (normalizedButton.actionType === "settings") {
      return false;
    }
    if (normalizedButton.actionType === "transition") {
      return applyTransitionButton(normalizedButton);
    }
    if (normalizedButton.actionType === "preset") {
      return applyPresetButton(normalizedButton);
    }
    return applyEffectButton(normalizedButton);
  }

  // Apply a native audio or video effect to all compatible selected clips.
  async function applyEffectButton(button) {
    const { app, project, sequence, items } = await getSelectedItems();
    const actions = [];
    for (const item of items) {
      if (button.mediaType === "video" && isVideoItem(item)) {
        const component = await createVideoFilterComponent(app, button.effect);
        const chain = await item.getComponentChain();
        actions.push(createNaturalAppendComponentAction(chain, component));
      }
      if (button.mediaType === "audio" && isAudioItem(item)) {
        const component = await app.AudioFilterFactory.createComponentByDisplayName(button.effect.displayName, item);
        const chain = await item.getComponentChain();
        actions.push(createNaturalAppendComponentAction(chain, component));
      }
    }
    const result = executeActions(project, actions, "Tool Bar: " + button.label);
    await refreshSequenceView(sequence);
    return result;
  }

  // Insert at index 0 because Premiere displays the component chain in reverse UI order.
  function createNaturalAppendComponentAction(chain, component, offset) {
    if (chain && typeof chain.createInsertComponentAction === "function" && typeof chain.getComponentCount === "function") {
      return chain.createInsertComponentAction(component, Number(offset) || 0);
    }
    if (chain && typeof chain.createAppendComponentAction === "function") {
      return chain.createAppendComponentAction(component);
    }
    throw new Error("Selected clip does not expose a Premiere component append action.");
  }

  // Return known fallback match names for beta defaults and common display names.
  function getVideoEffectCandidates(effect) {
    const candidates = [effect.matchName];
    if (effect.displayName === "Mosaic") {
      candidates.push("AE.ADBE Mosaic");
    }
    if (effect.displayName === "Transform") {
      candidates.push("AE.ADBE Transform");
    }
    if (effect.displayName === "Crop") {
      candidates.push("AE.ADBE Crop");
    }
    if (effect.displayName === "Gaussian Blur" || effect.matchName === "PR.ADBE Solarize") {
      candidates.push("AE.ADBE Gaussian Blur 2");
    }
    if (effect.displayName === "Drop Shadow") {
      candidates.push("AE.ADBE Drop Shadow");
    }
    if (effect.displayName === "Horizontal Flip") {
      candidates.push("AE.ADBE Horizontal Flip");
    }
    if (effect.displayName === "Vertical Flip") {
      candidates.push("AE.ADBE Vertical Flip");
    }
    if (effect.displayName === "Ultra Key") {
      candidates.push("AE.ADBE Ultra Key", "PR.ADBE Ultra Key");
    }
    return candidates.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
  }

  // Create a video component with fallbacks and a catalog lookup when the stored match name is stale.
  async function createVideoFilterComponent(app, effect) {
    let lastError = null;
    for (const matchName of getVideoEffectCandidates(effect)) {
      try {
        return await app.VideoFilterFactory.createComponent(matchName);
      } catch (error) {
        lastError = error;
      }
    }
    try {
      const matchNames = await app.VideoFilterFactory.getMatchNames();
      const displayNames = await app.VideoFilterFactory.getDisplayNames();
      const index = displayNames.findIndex((displayName) => displayName === effect.displayName);
      if (index >= 0 && matchNames[index]) {
        return await app.VideoFilterFactory.createComponent(matchNames[index]);
      }
    } catch (error) {
      lastError = error;
    }
    throw new Error("Video effect not found: " + (effect.displayName || effect.matchName) + ". Check the effect match name in the button settings.");
  }

  // Create transition options using whichever constructor shape Premiere exposes.
  function createTransitionOptions(app, button, applyTo) {
    let options = null;
    try {
      options = new app.AddTransitionOptions();
    } catch (error) {
      try {
        options = app.AddTransitionOptions();
      } catch (nestedError) {
        options = null;
      }
    }
    if (!options) {
      return null;
    }
    if (typeof options.setApplyToStart === "function") {
      options.setApplyToStart(applyTo === "start");
    }
    if (typeof options.setForceSingleSided === "function") {
      options.setForceSingleSided(Boolean(button.transition.forceSingleSided));
    }
    if (typeof options.setTransitionAlignment === "function") {
      options.setTransitionAlignment(Number(button.transition.alignment) || 0);
    }
    if (typeof options.setDuration === "function" && app.TickTime && app.TickTime.createWithSeconds) {
      options.setDuration(app.TickTime.createWithSeconds(Number(button.transition.durationSeconds) || 1));
    }
    return options;
  }

  // Apply a native video transition to all selected video clips.
  async function applyTransitionButton(button) {
    const { app, project, sequence, items } = await getSelectedItems();
    const actions = [];
    if (!button.transition.matchName) {
      throw new Error("Choose a Premiere video transition first.");
    }
    const applyTargets = button.transition.applyTo === "both" ? ["start", "end"] : [button.transition.applyTo || "end"];
    for (const item of items) {
      if (isVideoItem(item)) {
        for (const applyTo of applyTargets) {
          const transition = await app.TransitionFactory.createVideoTransition(button.transition.matchName);
          const options = createTransitionOptions(app, button, applyTo);
          actions.push(item.createAddVideoTransitionAction(transition, options));
        }
      }
    }
    const result = executeActions(project, actions, "Tool Bar: " + button.label);
    await refreshSequenceView(sequence);
    return result;
  }

  // Apply a captured Tool Bar preset made from exposed effects and parameter values.
  async function applyPresetButton(button) {
    const { app, project, sequence, items } = await getSelectedItems();
    const stack = root.PTB_SCHEMA.normalizeStack(button.stack);
    const actions = [];
    for (const item of items) {
      let appendOffset = 0;
      for (const componentSnapshot of stack.components) {
        if (componentSnapshot.mediaType === "video" && isVideoItem(item)) {
          const component = await app.VideoFilterFactory.createComponent(componentSnapshot.matchName);
          const chain = await item.getComponentChain();
          actions.push(createNaturalAppendComponentAction(chain, component, appendOffset));
          appendOffset += 1;
          actions.push.apply(actions, await createParamActions(app, component, componentSnapshot.params));
        }
        if (componentSnapshot.mediaType === "audio" && isAudioItem(item)) {
          const component = await app.AudioFilterFactory.createComponentByDisplayName(componentSnapshot.displayName, item);
          const chain = await item.getComponentChain();
          actions.push(createNaturalAppendComponentAction(chain, component, appendOffset));
          appendOffset += 1;
          actions.push.apply(actions, await createParamActions(app, component, componentSnapshot.params));
        }
      }
    }
    const result = executeActions(project, actions, "Tool Bar: " + button.label);
    await refreshSequenceView(sequence);
    return result;
  }

  // Convert a serialized value back into a Premiere-compatible parameter value.
  function reviveValue(app, snapshot) {
    const value = root.PTB_SCHEMA.normalizeStack({ components: [] }) && snapshot;
    if (!value || value.kind === "primitive") {
      return value ? value.value : undefined;
    }
    if (value.kind === "point") {
      try {
        return new app.PointF(value.x, value.y);
      } catch (error) {
        return { x: value.x, y: value.y };
      }
    }
    if (value.kind === "color") {
      try {
        return new app.Color(value.red, value.green, value.blue, value.alpha);
      } catch (error) {
        return { red: value.red, green: value.green, blue: value.blue, alpha: value.alpha };
      }
    }
    return value.value;
  }

  // Create a TickTime object from a stored keyframe position.
  function reviveTime(app, keyframeSnapshot) {
    if (app.TickTime && app.TickTime.createWithTicks && keyframeSnapshot.ticks) {
      return app.TickTime.createWithTicks(String(keyframeSnapshot.ticks));
    }
    if (app.TickTime && app.TickTime.createWithSeconds) {
      return app.TickTime.createWithSeconds(Number(keyframeSnapshot.seconds) || 0);
    }
    return null;
  }

  // Create parameter set/keyframe actions for a newly-created component.
  async function createParamActions(app, component, paramSnapshots) {
    const actions = [];
    const paramCount = typeof component.getParamCount === "function" ? component.getParamCount() : 0;
    for (const snapshot of paramSnapshots) {
      if (snapshot.index >= paramCount) {
        continue;
      }
      const param = component.getParam(snapshot.index);
      if (!param) {
        continue;
      }
      if (snapshot.timeVarying && snapshot.keyframes.length) {
        actions.push(param.createSetTimeVaryingAction(true));
        for (const keyframeSnapshot of snapshot.keyframes) {
          const keyframe = param.createKeyframe(reviveValue(app, keyframeSnapshot.value));
          const position = reviveTime(app, keyframeSnapshot);
          if (position) {
            keyframe.position = position;
          }
          if (keyframeSnapshot.temporalInterpolation !== null && typeof keyframe.setTemporalInterpolationMode === "function") {
            await keyframe.setTemporalInterpolationMode(keyframeSnapshot.temporalInterpolation);
          }
          actions.push(param.createAddKeyframeAction(keyframe));
        }
      } else {
        const keyframe = param.createKeyframe(reviveValue(app, snapshot.startValue));
        if (snapshot.startTemporalInterpolation !== null && typeof keyframe.setTemporalInterpolationMode === "function") {
          await keyframe.setTemporalInterpolationMode(snapshot.startTemporalInterpolation);
        }
        actions.push(param.createSetValueAction(keyframe, true));
      }
    }
    return actions;
  }

  // Unwrap UXP keyframe/value containers while supporting multiple host shapes.
  function unwrapParamValue(value) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      return unwrapParamValue(value.value);
    }
    return value;
  }

  // Serialize a Premiere parameter value into JSON-safe data.
  function serializeValue(value) {
    const rawValue = unwrapParamValue(value);
    if (rawValue && typeof rawValue === "object" && typeof rawValue.x === "number" && typeof rawValue.y === "number") {
      return { kind: "point", x: rawValue.x, y: rawValue.y };
    }
    if (rawValue && typeof rawValue === "object" && typeof rawValue.red === "number" && typeof rawValue.green === "number" && typeof rawValue.blue === "number") {
      return {
        kind: "color",
        red: rawValue.red,
        green: rawValue.green,
        blue: rawValue.blue,
        alpha: typeof rawValue.alpha === "number" ? rawValue.alpha : 1
      };
    }
    return { kind: "primitive", value: rawValue };
  }

  // Serialize a keyframe into JSON-safe data.
  async function serializeKeyframe(param, time) {
    const keyframe = await param.getKeyframePtr(time);
    let value = keyframe && keyframe.value;
    if (typeof param.getValueAtTime === "function") {
      try {
        value = await param.getValueAtTime(time);
      } catch (error) {
        // Keep the keyframe payload value when direct time sampling is unavailable.
      }
    }
    const temporalInterpolation = keyframe && typeof keyframe.getTemporalInterpolationMode === "function"
      ? await keyframe.getTemporalInterpolationMode()
      : null;
    const position = (keyframe && keyframe.position) || time;
    return {
      ticks: position && position.ticks ? String(position.ticks) : "0",
      seconds: position && typeof position.seconds === "number" ? position.seconds : 0,
      temporalInterpolation,
      value: serializeValue(value)
    };
  }

  // Capture one component parameter for the internal stack preset.
  async function captureParam(param, index) {
    const startKeyframe = await param.getStartValue();
    const timeVarying = typeof param.isTimeVarying === "function" ? param.isTimeVarying() : false;
    const keyframeTimes = timeVarying && typeof param.getKeyframeListAsTickTimes === "function"
      ? await param.getKeyframeListAsTickTimes()
      : [];
    const keyframes = [];
    for (const time of keyframeTimes) {
      keyframes.push(await serializeKeyframe(param, time));
    }
    return {
      index,
      displayName: param.displayName || "Param " + (index + 1),
      timeVarying,
      startValue: serializeValue(startKeyframe && startKeyframe.value),
      startTemporalInterpolation: startKeyframe && typeof startKeyframe.getTemporalInterpolationMode === "function"
        ? await startKeyframe.getTemporalInterpolationMode()
        : null,
      keyframes
    };
  }

  // Capture a selected clip's non-intrinsic effect stack for reuse by a toolbar button.
  async function captureSelectedStack() {
    const { items } = await getSelectedItems();
    const item = items[0];
    const mediaType = isVideoItem(item) ? "video" : "audio";
    const itemName = typeof item.getName === "function" ? await item.getName() : "";
    const chain = await item.getComponentChain();
    const componentCount = typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const components = [];
    for (let index = 0; index < componentCount; index += 1) {
      const component = chain.getComponentAtIndex(index);
      const displayName = typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
      const matchName = typeof component.getMatchName === "function" ? await component.getMatchName() : "";
      if (INTRINSIC_COMPONENTS.includes(displayName)) {
        continue;
      }
      const paramCount = typeof component.getParamCount === "function" ? component.getParamCount() : 0;
      const params = [];
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        try {
          params.push(await captureParam(component.getParam(paramIndex), paramIndex));
        } catch (error) {
          console.warn("Tool Bar skipped unsupported parameter:", error);
        }
      }
      components.push({ mediaType, matchName, displayName, params });
    }
    if (!components.length) {
      throw new Error(root.PTB_I18N.t("noStackCaptured"));
    }
    return root.PTB_SCHEMA.normalizeStack({
      sourceName: itemName,
      capturedAt: new Date().toISOString(),
      components
    });
  }

  // Expose Premiere bridge methods for the UI.
  root.PTB_PREMIERE = {
    loadCatalogs,
    applyButton,
    captureSelectedStack
  };
}(typeof window !== "undefined" ? window : globalThis));
