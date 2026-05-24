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
  const FALLBACK_AUDIO_TRANSITIONS = [
    "Constant Gain",
    "Constant Power",
    "Exponential Fade"
  ];

  // Return the Premiere UXP API module when the plugin is running inside Premiere.
  function getPremiere() {
    try {
      return require("premierepro");
    } catch (error) {
      return null;
    }
  }

  // Send bridge diagnostics to the settings log panel when the UI logger is available.
  function logBridge(level, message, details) {
    const logger = root.PTB_LOGGER;
    if (logger && typeof logger[level] === "function") {
      logger[level](message, details);
    }
  }

  // Return an error message that is safe to display in the in-panel logs.
  function describeBridgeError(error) {
    return error && error.message ? error.message : String(error);
  }

  // Normalize labels before comparing match names and display names.
  function normalizeCatalogName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Return the video transition catalog when Premiere exposes it.
  async function getVideoTransitionMatchNames(app) {
    if (app.TransitionFactory && typeof app.TransitionFactory.getVideoTransitionMatchNames === "function") {
      return app.TransitionFactory.getVideoTransitionMatchNames();
    }
    return [];
  }

  // Return the audio transition catalog when Premiere exposes it, with built-in crossfade names as a visible fallback.
  async function getAudioTransitionMatchNames(app) {
    if (app.TransitionFactory && typeof app.TransitionFactory.getAudioTransitionMatchNames === "function") {
      const matchNames = await app.TransitionFactory.getAudioTransitionMatchNames();
      if (matchNames && matchNames.length) {
        return matchNames;
      }
    }
    return FALLBACK_AUDIO_TRANSITIONS.slice();
  }

  // Find catalog transition match names that resemble a user-entered display name.
  async function findTransitionMatchNameSuggestions(app, value, mediaType) {
    try {
      const expected = normalizeCatalogName(value);
      const matchNames = mediaType === "audio" ? await getAudioTransitionMatchNames(app) : await getVideoTransitionMatchNames(app);
      const suggestions = matchNames.filter((matchName) => {
        const normalized = normalizeCatalogName(matchName);
        return normalized.includes(expected) || expected.includes(normalized);
      });
      suggestions.sort((left, right) => {
        const normalizedLeft = normalizeCatalogName(left);
        const normalizedRight = normalizeCatalogName(right);
        const leftExact = normalizedLeft.endsWith(expected) ? 0 : 1;
        const rightExact = normalizedRight.endsWith(expected) ? 0 : 1;
        return leftExact - rightExact || normalizedLeft.length - normalizedRight.length;
      });
      return suggestions.slice(0, 12);
    } catch (error) {
      logBridge("warn", "Could not read transition match name catalog.", describeBridgeError(error));
      return [];
    }
  }

  // Create a transition from the stored value, then retry close catalog match names when the value was a display name.
  async function createTransitionWithFallback(app, matchName, applyTo, mediaType) {
    const isAudio = mediaType === "audio";
    const createMethod = isAudio ? "createAudioTransition" : "createVideoTransition";
    if (!app.TransitionFactory || typeof app.TransitionFactory[createMethod] !== "function") {
      const message = isAudio
        ? "Premiere UXP does not expose audio transition creation in this build."
        : "Premiere UXP does not expose video transition creation in this build.";
      logBridge("error", message, { method: "TransitionFactory." + createMethod });
      throw new Error(message);
    }
    try {
      const transition = await app.TransitionFactory[createMethod](matchName);
      logBridge("info", "Created " + mediaType + " transition.", { matchName, applyTo });
      return transition;
    } catch (error) {
      const suggestions = await findTransitionMatchNameSuggestions(app, matchName, mediaType);
      logBridge("warn", capitalize(mediaType) + " transition creation failed; trying catalog suggestions.", {
        matchName,
        error: describeBridgeError(error),
        suggestions: suggestions.length ? suggestions : "No close match names found in Premiere's transition catalog."
      });
      for (const suggestion of suggestions) {
        if (suggestion === matchName) {
          continue;
        }
        try {
          const transition = await app.TransitionFactory[createMethod](suggestion);
          logBridge("info", "Created " + mediaType + " transition from suggested match name.", { original: matchName, matchName: suggestion, applyTo });
          return transition;
        } catch (nestedError) {
          logBridge("warn", "Suggested transition match name failed.", { matchName: suggestion, error: describeBridgeError(nestedError) });
        }
      }
      logBridge("error", capitalize(mediaType) + " transition creation failed.", {
        matchName,
        error: describeBridgeError(error),
        suggestions: suggestions.length ? suggestions : "No close match names found in Premiere's transition catalog."
      });
      throw error;
    }
  }

  // Capitalize short log labels without depending on newer JavaScript helpers.
  function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
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
    logBridge("info", "Premiere selection loaded.", { count: items.length });
    return { app, project, sequence, items };
  }

  // Safely call optional Premiere object methods while keeping diagnostics alive.
  async function readOptionalMethod(target, methodName, fallback) {
    try {
      if (target && typeof target[methodName] === "function") {
        return await target[methodName]();
      }
    } catch (error) {
      logBridge("warn", "Could not read " + methodName + ".", describeBridgeError(error));
    }
    return fallback;
  }

  // Convert Premiere TickTime-like objects into compact diagnostic data.
  function describeTickTime(time) {
    if (!time) {
      return { ticks: "", seconds: null };
    }
    return {
      ticks: time.ticks !== undefined ? String(time.ticks) : "",
      seconds: typeof time.seconds === "number" ? time.seconds : null
    };
  }

  // Use seconds when available, otherwise compare best-effort numeric ticks.
  function timeToNumber(time) {
    const described = describeTickTime(time);
    if (typeof described.seconds === "number") {
      return described.seconds;
    }
    const ticks = Number(described.ticks);
    return Number.isFinite(ticks) ? ticks : null;
  }

  // Read the fields common to clips and transition track items.
  async function inspectTrackItemIdentity(item, index, mediaType, role) {
    const startTime = await readOptionalMethod(item, "getStartTime", null);
    const endTime = await readOptionalMethod(item, "getEndTime", null);
    return {
      index,
      role,
      mediaType,
      name: await readOptionalMethod(item, "getName", ""),
      matchName: await readOptionalMethod(item, "getMatchName", ""),
      type: await readOptionalMethod(item, "getType", null),
      trackIndex: await readOptionalMethod(item, "getTrackIndex", null),
      start: describeTickTime(startTime),
      end: describeTickTime(endTime),
      _startNumber: timeToNumber(startTime),
      _endNumber: timeToNumber(endTime)
    };
  }

  // Guess the selected item media kind from APIs exposed by the UXP object.
  function getItemMediaKind(item) {
    if (isVideoItem(item)) {
      return "video";
    }
    if (isAudioTransitionItem(item) || isAudioItem(item)) {
      return "audio";
    }
    return "unknown";
  }

  // Return whether two track items overlap or touch on the timeline.
  function itemsOverlapOrTouch(left, right) {
    if (left._startNumber === null || left._endNumber === null || right._startNumber === null || right._endNumber === null) {
      return false;
    }
    const tolerance = 0.0001;
    return left._startNumber <= right._endNumber + tolerance && left._endNumber + tolerance >= right._startNumber;
  }

  // Remove private helper fields before logging JSON to the user.
  function publicTrackItemInfo(info) {
    const output = Object.assign({}, info);
    delete output._startNumber;
    delete output._endNumber;
    return output;
  }

  // Read all component display names and match names from a selected clip.
  async function inspectComponentChain(item, itemInfo) {
    const components = [];
    const chain = await readOptionalMethod(item, "getComponentChain", null);
    const count = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    for (let componentIndex = 0; componentIndex < count; componentIndex += 1) {
      const component = chain.getComponentAtIndex(componentIndex);
      components.push({
        itemIndex: itemInfo.index,
        itemName: itemInfo.name,
        mediaType: itemInfo.mediaType,
        componentIndex,
        displayName: await readOptionalMethod(component, "getDisplayName", ""),
        matchName: await readOptionalMethod(component, "getMatchName", ""),
        paramCount: typeof (component && component.getParamCount) === "function" ? component.getParamCount() : null
      });
    }
    return components;
  }

  // Return the constant Premiere uses for transition track items, falling back to the documented numeric value.
  function getTransitionTrackItemType(app) {
    const constants = (app && (app.Constants || app.constants)) || {};
    return constants.TrackItemType && constants.TrackItemType.TRANSITION !== undefined
      ? constants.TrackItemType.TRANSITION
      : 2;
  }

  // Read every transition track item from all exposed tracks of one media kind.
  async function inspectAllTransitionsForMedia(app, sequence, mediaType) {
    const trackGetter = mediaType === "audio" ? "getAudioTrack" : "getVideoTrack";
    const countGetter = mediaType === "audio" ? "getAudioTrackCount" : "getVideoTrackCount";
    const output = { mediaType, trackCount: null, scannedTracks: 0, transitions: [], errors: [] };
    if (!sequence || typeof sequence[trackGetter] !== "function" || typeof sequence[countGetter] !== "function") {
      output.errors.push("Sequence does not expose " + trackGetter + " / " + countGetter + ".");
      return output;
    }
    const transitionType = getTransitionTrackItemType(app);
    output.transitionType = transitionType;
    output.trackCount = await readOptionalMethod(sequence, countGetter, 0);
    for (let trackIndex = 0; trackIndex < output.trackCount; trackIndex += 1) {
      try {
        const track = await sequence[trackGetter](trackIndex);
        output.scannedTracks += 1;
        const trackTransitions = track && typeof track.getTrackItems === "function"
          ? await track.getTrackItems(transitionType, false)
          : [];
        for (let transitionIndex = 0; transitionIndex < trackTransitions.length; transitionIndex += 1) {
          const transitionInfo = await inspectTrackItemIdentity(trackTransitions[transitionIndex], transitionIndex, mediaType, "trackTransition");
          transitionInfo.scannedTrackIndex = trackIndex;
          output.transitions.push(transitionInfo);
        }
      } catch (error) {
        output.errors.push({ trackIndex, error: describeBridgeError(error) });
      }
    }
    return output;
  }

  // Inspect all sequence transitions, then keep the ones near selected clips.
  async function inspectNearbyTransitions(app, sequence, selectedInfos) {
    const seen = {};
    const scan = {
      video: await inspectAllTransitionsForMedia(app, sequence, "video"),
      audio: await inspectAllTransitionsForMedia(app, sequence, "audio")
    };
    const nearby = [];
    selectedInfos.forEach((selectedInfo) => {
      const source = scan[selectedInfo.mediaType] && scan[selectedInfo.mediaType].transitions ? scan[selectedInfo.mediaType].transitions : [];
      source.forEach((transitionInfo) => {
        transitionInfo.nearSelectedItem = selectedInfo.index;
        if (!itemsOverlapOrTouch(selectedInfo, transitionInfo)) {
          return;
        }
        const key = [
          transitionInfo.mediaType,
          transitionInfo.scannedTrackIndex,
          transitionInfo.start.ticks || transitionInfo.start.seconds,
          transitionInfo.end.ticks || transitionInfo.end.seconds,
          transitionInfo.matchName || transitionInfo.name
        ].join("|");
        if (!seen[key]) {
          seen[key] = true;
          nearby.push(publicTrackItemInfo(transitionInfo));
        }
      });
    });
    return {
      nearby,
      scan: {
        video: {
          trackCount: scan.video.trackCount,
          scannedTracks: scan.video.scannedTracks,
          transitionType: scan.video.transitionType,
          transitionCount: scan.video.transitions.length,
          transitions: scan.video.transitions.slice(0, 80).map(publicTrackItemInfo),
          errors: scan.video.errors
        },
        audio: {
          trackCount: scan.audio.trackCount,
          scannedTracks: scan.audio.scannedTracks,
          transitionType: scan.audio.transitionType,
          transitionCount: scan.audio.transitions.length,
          transitions: scan.audio.transitions.slice(0, 80).map(publicTrackItemInfo),
          errors: scan.audio.errors
        }
      }
    };
  }

  // Determine whether a track item is a video clip by checking video-only APIs.
  function isVideoItem(item) {
    return Boolean(item && typeof item.createAddVideoTransitionAction === "function");
  }

  // Determine whether a track item can accept audio effects.
  function isAudioItem(item) {
    return Boolean(item && !isVideoItem(item) && typeof item.getComponentChain === "function");
  }

  // Determine whether a track item exposes an audio-transition action.
  function isAudioTransitionItem(item) {
    return Boolean(item && typeof item.createAddAudioTransitionAction === "function");
  }

  // Execute a list of undoable Premiere actions in one transaction.
  function executeActions(project, actions, undoName) {
    if (!actions.length) {
      throw new Error("No compatible selected clips for this button.");
    }
    logBridge("info", "Executing Premiere transaction.", { undoName: undoName || "Tool Bar", actions: actions.length });
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
        logBridge("info", "Sequence view refreshed.");
      }
    } catch (error) {
      // A repaint nudge is best-effort and should never make the button action fail.
      logBridge("warn", "Sequence view refresh skipped.", describeBridgeError(error));
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
    const videoTransitionMatchNames = await getVideoTransitionMatchNames(app);
    const audioTransitionMatchNames = await getAudioTransitionMatchNames(app);
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
      })),
      audioTransitions: audioTransitionMatchNames.map((matchName) => ({
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
    if (normalizedButton.actionType === "audioTransition") {
      return applyAudioTransitionButton(normalizedButton);
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
      logBridge("info", "Created transition options with constructor.", { applyTo });
    } catch (error) {
      try {
        options = app.AddTransitionOptions();
        logBridge("info", "Created transition options with factory call.", { applyTo });
      } catch (nestedError) {
        options = null;
        logBridge("warn", "Premiere did not expose AddTransitionOptions.", {
          constructorError: describeBridgeError(error),
          factoryError: describeBridgeError(nestedError)
        });
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
    logBridge("info", "Prepared transition options.", {
      applyTo,
      durationSeconds: Number(button.transition.durationSeconds) || 1,
      hasSetApplyToStart: typeof options.setApplyToStart === "function",
      hasSetDuration: typeof options.setDuration === "function"
    });
    return options;
  }

  // Apply a native transition to all selected compatible clips.
  async function applyNativeTransitionButton(button, mediaType) {
    const { app, project, sequence, items } = await getSelectedItems();
    const actions = [];
    if (!button.transition.matchName) {
      throw new Error("Choose a Premiere " + mediaType + " transition first.");
    }
    const applyTargets = button.transition.applyTo === "both" ? ["start", "end"] : [button.transition.applyTo || "end"];
    logBridge("info", "Applying " + mediaType + " transition.", {
      button: button.label,
      matchName: button.transition.matchName,
      applyTargets,
      selectedItems: items.length
    });
    if (mediaType === "audio" && (!app.TransitionFactory || typeof app.TransitionFactory.createAudioTransition !== "function")) {
      const message = "Premiere UXP does not expose audio transition creation in this build.";
      logBridge("error", message, { method: "TransitionFactory.createAudioTransition" });
      throw new Error(message);
    }
    for (const item of items) {
      const compatible = mediaType === "audio" ? isAudioTransitionItem(item) : isVideoItem(item);
      const actionMethod = mediaType === "audio" ? "createAddAudioTransitionAction" : "createAddVideoTransitionAction";
      if (compatible) {
        for (const applyTo of applyTargets) {
          const transition = await createTransitionWithFallback(app, button.transition.matchName, applyTo, mediaType);
          const options = createTransitionOptions(app, button, applyTo);
          actions.push(item[actionMethod](transition, options));
          logBridge("info", "Queued " + mediaType + " transition action.", { applyTo, hasOptions: Boolean(options), actions: actions.length });
        }
      } else {
        logBridge("warn", "Skipped timeline item without " + actionMethod + ".");
      }
    }
    const result = executeActions(project, actions, "Tool Bar: " + button.label);
    await refreshSequenceView(sequence);
    logBridge("info", capitalize(mediaType) + " transition command completed.", { actions: actions.length });
    return result;
  }

  // Apply a native video transition to all selected video clips.
  async function applyTransitionButton(button) {
    return applyNativeTransitionButton(button, "video");
  }

  // Apply a native audio transition when the host exposes the required UXP methods.
  async function applyAudioTransitionButton(button) {
    return applyNativeTransitionButton(button, "audio");
  }

  // Apply a captured Tool Bar preset made from exposed effects and parameter values.
  async function applyPresetButton(button) {
    const { app, project, sequence, items } = await getSelectedItems();
    const stack = root.PTB_SCHEMA.normalizeStack(button.stack);
    const actions = [];
    if (!stack.components.length) {
      throw new Error(root.PTB_I18N.t("noPresetCaptured"));
    }
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

  // Log match names for selected clips, their component chains, and nearby transition track items.
  async function inspectSelectionMatchNames() {
    const { app, sequence, items } = await getSelectedItems();
    const selectedItems = [];
    const components = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const mediaType = getItemMediaKind(item);
      const itemInfo = await inspectTrackItemIdentity(item, index, mediaType, "selectedItem");
      selectedItems.push(itemInfo);
      if (typeof item.getComponentChain === "function") {
        components.push.apply(components, await inspectComponentChain(item, itemInfo));
      }
    }
    const transitionInspection = await inspectNearbyTransitions(app, sequence, selectedItems);
    const payload = {
      selectedItems: selectedItems.map(publicTrackItemInfo),
      effects: components,
      transitions: transitionInspection.nearby,
      transitionScan: transitionInspection.scan
    };
    logBridge("info", "Selection match-name inspection.", payload);
    if (!components.length) {
      logBridge("warn", "No effect components found on the selected item(s).");
    }
    logBridge("info", "Sequence transition scan.", transitionInspection.scan);
    if (!transitionInspection.nearby.length) {
      logBridge("warn", "No nearby transition track items found for the selected item(s).");
    }
    return payload;
  }

  // Expose Premiere bridge methods for the UI.
  root.PTB_PREMIERE = {
    loadCatalogs,
    applyButton,
    captureSelectedStack,
    inspectSelectionMatchNames
  };
}(typeof window !== "undefined" ? window : globalThis));
