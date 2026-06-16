(function (root) {
  "use strict";

  // Names for intrinsic components that Premiere exposes as built-in clip parameters.
  const INTRINSIC_COMPONENTS = [
    "Motion",
    "Opacity",
    "Time Remapping",
    "Vector Motion",
    "Volume",
    "Channel Volume",
    "Panner"
  ];
  const CAPTURABLE_PRESET_INTRINSICS = [
    "Motion",
    "Opacity",
    "Vector Motion"
  ];
  const FALLBACK_AUDIO_TRANSITIONS = [
    "Constant Gain",
    "Constant Power",
    "Exponential Fade"
  ];
  const AUDIO_TRANSITIONS_ENABLED = false;
  const CENTERED_TRANSITION_ALIGNMENT = 0.5;
  const EFFECT_CLIPBOARD_KEY = "com.cyrilplugin.toolbar.effectClipboard.v1";

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

  // Run one Premiere timeline stage with enough context to diagnose generic host errors.
  async function runTimelineStage(stage, details, operation) {
    logBridge("info", stage + "...", details);
    try {
      return await operation();
    } catch (error) {
      const message = stage + " failed: " + describeBridgeError(error);
      logBridge("error", message, Object.assign({}, details || {}, {
        error: describeBridgeError(error)
      }));
      throw new Error(message);
    }
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

  // Read a plain property from UXP objects when methods are unavailable or return empty values.
  function readOptionalProperty(target, propertyName, fallback) {
    try {
      if (target && target[propertyName] !== undefined) {
        return target[propertyName];
      }
    } catch (error) {
      logBridge("warn", "Could not read property " + propertyName + ".", describeBridgeError(error));
    }
    return fallback;
  }

  // Prefer method values, then fallback to object properties with the same semantic meaning.
  async function readMethodOrProperty(target, methodName, propertyName, fallback) {
    const methodValue = await readOptionalMethod(target, methodName, undefined);
    if (methodValue !== undefined && methodValue !== null && methodValue !== "") {
      return methodValue;
    }
    return readOptionalProperty(target, propertyName, fallback);
  }

  // Return a compact list of callable names exposed by an opaque UXP object.
  function listObjectMethods(target) {
    const methods = [];
    try {
      let current = target;
      let depth = 0;
      while (current && depth < 4) {
        Object.getOwnPropertyNames(current).forEach((name) => {
          try {
            if (typeof target[name] === "function" && !methods.includes(name)) {
              methods.push(name);
            }
          } catch (error) {
            // Some UXP proxies throw when a property is touched; skip those names.
          }
        });
        current = Object.getPrototypeOf(current);
        depth += 1;
      }
    } catch (error) {
      return ["<method listing failed: " + describeBridgeError(error) + ">"];
    }
    return methods.sort().slice(0, 80);
  }

  // Return visible property keys and primitive values from an opaque UXP object.
  function inspectObjectShape(target) {
    const shape = {
      constructorName: "",
      ownKeys: [],
      enumerableKeys: [],
      methods: [],
      primitiveProperties: {}
    };
    if (!target) {
      return shape;
    }
    try {
      shape.constructorName = target.constructor && target.constructor.name ? target.constructor.name : "";
    } catch (error) {
      shape.constructorName = "<unavailable>";
    }
    try {
      shape.ownKeys = Object.getOwnPropertyNames(target).slice(0, 80);
    } catch (error) {
      shape.ownKeys = ["<own keys failed: " + describeBridgeError(error) + ">"];
    }
    try {
      shape.enumerableKeys = Object.keys(target).slice(0, 80);
    } catch (error) {
      shape.enumerableKeys = ["<enumerable keys failed: " + describeBridgeError(error) + ">"];
    }
    shape.methods = listObjectMethods(target);
    const propertyNames = shape.ownKeys.concat(shape.enumerableKeys).filter((name, index, list) => name && list.indexOf(name) === index);
    propertyNames.forEach((name) => {
      try {
        const value = target[name];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
          shape.primitiveProperties[name] = value;
        }
      } catch (error) {
        shape.primitiveProperties[name] = "<read failed>";
      }
    });
    return shape;
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

  // Return public timing fields for a clip so captured keyframes can be replayed on another clip.
  async function getItemTimingSnapshot(item) {
    const startTime = await readOptionalMethod(item, "getStartTime", null);
    const endTime = await readOptionalMethod(item, "getEndTime", null);
    // Premiere stores effect keyframes on the clip's source/in-point clock, not only on sequence time.
    const inPoint = await readOptionalMethod(item, "getInPoint", null);
    const outPoint = await readOptionalMethod(item, "getOutPoint", null);
    const startSeconds = timeToNumber(startTime);
    const endSeconds = timeToNumber(endTime);
    const inPointSeconds = timeToNumber(inPoint);
    const outPointSeconds = timeToNumber(outPoint);
    return {
      start: describeTickTime(startTime),
      end: describeTickTime(endTime),
      inPoint: describeTickTime(inPoint),
      outPoint: describeTickTime(outPoint),
      startSeconds,
      endSeconds,
      inPointSeconds,
      outPointSeconds,
      durationSeconds: typeof startSeconds === "number" && typeof endSeconds === "number"
        ? Math.max(0, endSeconds - startSeconds)
        : null
    };
  }

  // Read the fields common to clips and transition track items.
  async function inspectTrackItemIdentity(item, index, mediaType, role) {
    const startTime = await readMethodOrProperty(item, "getStartTime", "startTime", null);
    const endTime = await readMethodOrProperty(item, "getEndTime", "endTime", null);
    return {
      index,
      role,
      mediaType,
      name: await readMethodOrProperty(item, "getName", "name", ""),
      matchName: await readMethodOrProperty(item, "getMatchName", "matchName", ""),
      type: await readMethodOrProperty(item, "getType", "type", null),
      trackIndex: await readMethodOrProperty(item, "getTrackIndex", "trackIndex", null),
      start: describeTickTime(startTime),
      end: describeTickTime(endTime),
      objectShape: role === "trackTransition" ? inspectObjectShape(item) : undefined,
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

  // Return the constant Premiere uses for regular clip track items.
  function getClipTrackItemType(app) {
    const constants = (app && (app.Constants || app.constants)) || {};
    return constants.TrackItemType && constants.TrackItemType.CLIP !== undefined
      ? constants.TrackItemType.CLIP
      : 1;
  }

  // Compare timeline points using seconds when available.
  function nearlyEqualTime(left, right) {
    if (left === null || right === null) {
      return false;
    }
    return Math.abs(Number(left) - Number(right)) < 0.0001;
  }

  // Read a track item's start/end/track details for edit-point matching.
  async function getTrackItemTiming(item) {
    const startTime = await readOptionalMethod(item, "getStartTime", null);
    const endTime = await readOptionalMethod(item, "getEndTime", null);
    return {
      item,
      type: await readOptionalMethod(item, "getType", null),
      trackIndex: await readOptionalMethod(item, "getTrackIndex", null),
      startNumber: timeToNumber(startTime),
      endNumber: timeToNumber(endTime)
    };
  }

  // Return all track indices to scan when a selected transition does not expose its track index.
  async function getTrackIndices(sequence, mediaType, preferredIndex) {
    if (typeof preferredIndex === "number") {
      return [preferredIndex];
    }
    const countGetter = mediaType === "audio" ? "getAudioTrackCount" : "getVideoTrackCount";
    const count = sequence && typeof sequence[countGetter] === "function" ? await sequence[countGetter]() : 0;
    const indices = [];
    for (let index = 0; index < count; index += 1) {
      indices.push(index);
    }
    return indices;
  }

  // Read clips from one Premiere track.
  async function getTrackClips(app, sequence, mediaType, trackIndex) {
    const trackGetter = mediaType === "audio" ? "getAudioTrack" : "getVideoTrack";
    if (!sequence || typeof sequence[trackGetter] !== "function") {
      return [];
    }
    const track = await sequence[trackGetter](trackIndex);
    if (!track || typeof track.getTrackItems !== "function") {
      return [];
    }
    return track.getTrackItems(getClipTrackItemType(app), false);
  }

  // Find the clip edge that corresponds to a selected edit point or transition item.
  async function findClipEdgeForTransitionSelection(app, sequence, transitionInfo) {
    const trackIndices = await getTrackIndices(sequence, "video", transitionInfo.trackIndex);
    const editPoints = [transitionInfo.startNumber, transitionInfo.endNumber].filter((value, index, list) => value !== null && list.indexOf(value) === index);
    for (const trackIndex of trackIndices) {
      const clips = await getTrackClips(app, sequence, "video", trackIndex);
      for (const point of editPoints) {
        for (const clip of clips) {
          const clipInfo = await getTrackItemTiming(clip);
          if (nearlyEqualTime(clipInfo.startNumber, point)) {
            return { item: clip, applyTo: "start", trackIndex, point };
          }
        }
        for (const clip of clips) {
          const clipInfo = await getTrackItemTiming(clip);
          if (nearlyEqualTime(clipInfo.endNumber, point)) {
            return { item: clip, applyTo: "end", trackIndex, point };
          }
        }
      }
    }
    return null;
  }

  // Detect selected edit points/transitions and map them to the adjacent clip edge where Premiere can add a transition.
  async function resolveSelectedVideoEditPointTargets(app, sequence, items) {
    const targets = [];
    const seen = {};
    const transitionType = getTransitionTrackItemType(app);
    for (const item of items) {
      const info = await getTrackItemTiming(item);
      if (info.type !== transitionType) {
        continue;
      }
      const target = await findClipEdgeForTransitionSelection(app, sequence, info);
      if (!target) {
        logBridge("warn", "Selected edit point could not be mapped to an adjacent video clip.");
        continue;
      }
      const key = target.trackIndex + "|" + target.point + "|" + target.applyTo;
      if (!seen[key]) {
        seen[key] = true;
        targets.push(target);
      }
    }
    return targets;
  }

  // Detect adjacent selected video clips and convert each shared cut into one centered transition target.
  async function resolveSelectedAdjacentVideoClipTargets(items) {
    const clips = [];
    const targets = [];
    const seen = {};
    for (const item of items) {
      if (!isVideoItem(item)) {
        continue;
      }
      const info = await getTrackItemTiming(item);
      info.item = item;
      clips.push(info);
    }
    for (let leftIndex = 0; leftIndex < clips.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < clips.length; rightIndex += 1) {
        const first = clips[leftIndex];
        const second = clips[rightIndex];
        const firstTrack = first.trackIndex;
        const secondTrack = second.trackIndex;
        if (typeof firstTrack === "number" && typeof secondTrack === "number" && firstTrack !== secondTrack) {
          continue;
        }
        let target = null;
        if (nearlyEqualTime(first.endNumber, second.startNumber)) {
          target = { item: second.item, applyTo: "start", trackIndex: secondTrack, point: second.startNumber };
        } else if (nearlyEqualTime(second.endNumber, first.startNumber)) {
          target = { item: first.item, applyTo: "start", trackIndex: firstTrack, point: first.startNumber };
        }
        if (!target) {
          continue;
        }
        const key = (typeof target.trackIndex === "number" ? target.trackIndex : "unknown") + "|" + target.point;
        if (!seen[key]) {
          seen[key] = true;
          targets.push(target);
        }
      }
    }
    return targets;
  }

  // Read every transition track item from all exposed tracks of one media kind.
  async function inspectAllTransitionsForMedia(app, sequence, mediaType) {
    const scan = await getTransitionTrackItemsForMedia(app, sequence, mediaType);
    return {
      mediaType,
      trackCount: scan.trackCount,
      scannedTracks: scan.scannedTracks,
      transitionType: scan.transitionType,
      transitions: scan.items.map((entry) => entry.info),
      errors: scan.errors
    };
  }

  // Read transition track items and keep the raw UXP item when later parameter replay needs it.
  async function getTransitionTrackItemsForMedia(app, sequence, mediaType) {
    const trackGetter = mediaType === "audio" ? "getAudioTrack" : "getVideoTrack";
    const countGetter = mediaType === "audio" ? "getAudioTrackCount" : "getVideoTrackCount";
    const output = { mediaType, trackCount: null, scannedTracks: 0, transitionType: null, items: [], errors: [] };
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
          output.items.push({ item: trackTransitions[transitionIndex], info: transitionInfo });
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
  async function applyButton(button, config, depth) {
    const normalizedButton = root.PTB_SCHEMA.createButton(button);
    const recursionDepth = Number(depth) || 0;
    if (recursionDepth > 8) {
      throw new Error("Multi Action nesting is too deep.");
    }
    if (normalizedButton.actionType === "tool") {
      return applyToolButton(normalizedButton);
    }
    if (normalizedButton.actionType === "multi") {
      return applyMultiButton(normalizedButton, config, recursionDepth);
    }
    if (normalizedButton.actionType === "script") {
      return applyScriptButton(normalizedButton);
    }
    if (normalizedButton.actionType === "transition" || normalizedButton.actionType === "transitionPreset") {
      return applyTransitionButton(normalizedButton);
    }
    if (normalizedButton.actionType === "audioTransition") {
      if (!AUDIO_TRANSITIONS_ENABLED) {
        const message = "Audio transitions are disabled until Premiere exposes reliable UXP support.";
        logBridge("warn", message);
        throw new Error(message);
      }
      return applyAudioTransitionButton(normalizedButton);
    }
    if (normalizedButton.actionType === "preset") {
      return applyPresetButton(normalizedButton);
    }
    return applyEffectButton(normalizedButton);
  }

  // Run an imported JSX script only when Premiere exposes a compatible host API.
  async function applyScriptButton(button) {
    const app = getPremiere();
    if (!app) {
      throw new Error(root.PTB_I18N.t("noPremiereApi"));
    }
    const source = button.script && button.script.source ? button.script.source : "";
    const sourcePath = button.script && button.script.sourcePath ? button.script.sourcePath : "";
    if (!source && !sourcePath) {
      throw new Error(root.PTB_I18N.t("scriptNoSource"));
    }
    const fileRunners = [
      "executeScriptFile",
      "runScriptFile",
      "evaluateScriptFile"
    ];
    for (const methodName of fileRunners) {
      if (sourcePath && typeof app[methodName] === "function") {
        logBridge("info", "Executing JSX script through Premiere host API.", { method: methodName, name: button.script.name || button.label });
        return app[methodName](sourcePath);
      }
    }
    const sourceRunners = [
      "executeScript",
      "executeExtendScript",
      "evalScript",
      "evaluateScript",
      "runScript"
    ];
    for (const methodName of sourceRunners) {
      if (source && typeof app[methodName] === "function") {
        logBridge("info", "Executing JSX source through Premiere host API.", { method: methodName, name: button.script.name || button.label });
        return app[methodName](source);
      }
    }
    logBridge("warn", root.PTB_I18N.t("scriptUnsupported"), {
      script: button.script && (button.script.sourceFileName || button.script.name),
      storedCharacters: source.length
    });
    throw new Error(root.PTB_I18N.t("scriptUnsupported"));
  }

  // Run a built-in utility action that can be assigned to toolbar buttons.
  async function applyToolButton(button) {
    if (button.tool.id === "copyClipEffects") {
      return copySelectedClipEffects();
    }
    if (button.tool.id === "pasteClipEffects") {
      return pasteCopiedClipEffects(button);
    }
    if (button.tool.id === "removeClipEffects") {
      return removeSelectedClipEffects(button);
    }
    if (button.tool.id === "addAdjustmentLayer") {
      return addAdjustmentLayer(button);
    }
    return false;
  }

  // Load the active timeline while allowing tools that start at the playhead to work without a selection.
  async function getTimelineContext() {
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
    return { app, project, sequence, items: items || [] };
  }

  // Resolve the start, end, and reference track requested by a generated timeline item button.
  async function getTimelinePlacement(app, sequence, items, options) {
    const useSelectedRange = !options || options.useSelectedRange !== false;
    const selectedVideoItem = items.find((item) => isVideoItem(item) && typeof item.getStartTime === "function");
    if (useSelectedRange && !selectedVideoItem) {
      throw new Error("Select a video clip to use its time range.");
    }
    if (selectedVideoItem && useSelectedRange) {
      const timing = await getTrackItemTiming(selectedVideoItem);
      if (timing.startNumber === null || timing.endNumber === null || timing.endNumber <= timing.startNumber) {
        throw new Error("The selected clip does not expose a usable time range.");
      }
      return {
        startSeconds: timing.startNumber,
        endSeconds: timing.endNumber,
        durationSeconds: timing.endNumber - timing.startNumber,
        referenceTrackIndex: typeof timing.trackIndex === "number" ? timing.trackIndex : null
      };
    }
    const playerPosition = await readOptionalMethod(sequence, "getPlayerPosition", null);
    const startSeconds = timeToNumber(playerPosition);
    const durationSeconds = Math.max(0.1, Number(options && options.defaultDurationSeconds) || 5);
    return {
      startSeconds: startSeconds === null ? 0 : startSeconds,
      endSeconds: (startSeconds === null ? 0 : startSeconds) + durationSeconds,
      durationSeconds,
      referenceTrackIndex: selectedVideoItem ? await readOptionalMethod(selectedVideoItem, "getTrackIndex", null) : null
    };
  }

  // Return true when an existing clip would collide with the requested timeline interval.
  async function trackHasOverlap(app, sequence, trackIndex, startSeconds, endSeconds) {
    const clips = await getTrackClips(app, sequence, "video", trackIndex);
    for (const clip of clips) {
      const timing = await getTrackItemTiming(clip);
      if (timing.startNumber !== null && timing.endNumber !== null
        && timing.startNumber < endSeconds - 0.0001
        && timing.endNumber > startSeconds + 0.0001) {
        return true;
      }
    }
    return false;
  }

  // Return true when an insert edit could shift an existing clip later on the destination track.
  async function trackHasClipAtOrAfter(app, sequence, trackIndex, startSeconds) {
    const clips = await getTrackClips(app, sequence, "video", trackIndex);
    for (const clip of clips) {
      const timing = await getTrackItemTiming(clip);
      if (timing.endNumber !== null && timing.endNumber > startSeconds + 0.0001) {
        return true;
      }
    }
    return false;
  }

  // Prefer a free video track above the reference clip, then return the next top-track index.
  async function findSafeVideoTrackIndex(app, sequence, placement, safetyOptions) {
    const trackCount = typeof sequence.getVideoTrackCount === "function" ? await sequence.getVideoTrackCount() : 0;
    const firstCandidate = typeof placement.referenceTrackIndex === "number"
      ? placement.referenceTrackIndex + 1
      : Math.max(0, trackCount - 1);
    const safeEndSeconds = safetyOptions && Number.isFinite(Number(safetyOptions.endSeconds))
      ? Number(safetyOptions.endSeconds)
      : placement.endSeconds;
    const avoidLaterItems = Boolean(safetyOptions && safetyOptions.avoidLaterItems);
    for (let trackIndex = firstCandidate; trackIndex < trackCount; trackIndex += 1) {
      const hasOverlap = await trackHasOverlap(app, sequence, trackIndex, placement.startSeconds, safeEndSeconds);
      const couldRippleLaterItem = avoidLaterItems
        ? await trackHasClipAtOrAfter(app, sequence, trackIndex, placement.startSeconds)
        : false;
      if (!hasOverlap && !couldRippleLaterItem) {
        return { trackIndex, createsTrack: false };
      }
    }
    return { trackIndex: trackCount, createsTrack: true };
  }

  // Cast a generic ProjectItem to the clip subtype that exposes source In/Out actions.
  function castClipProjectItem(app, projectItem) {
    if (!projectItem) {
      return null;
    }
    if (typeof projectItem.getInPoint === "function" && typeof projectItem.getOutPoint === "function") {
      return projectItem;
    }
    try {
      return app.ClipProjectItem && typeof app.ClipProjectItem.cast === "function"
        ? app.ClipProjectItem.cast(projectItem)
        : null;
    } catch (error) {
      logBridge("warn", "Could not cast ProjectItem to ClipProjectItem.", {
        name: projectItem.name || "",
        error: describeBridgeError(error)
      });
      return null;
    }
  }

  // Read a ProjectItem name from the documented property with a runtime method fallback.
  async function getProjectItemName(projectItem) {
    const propertyName = readOptionalProperty(projectItem, "name", "");
    return propertyName || await readOptionalMethod(projectItem, "getName", "");
  }

  // Recursively collect exact-name matches from the Project panel hierarchy.
  async function findProjectItemsByName(app, project, requestedName) {
    const expected = String(requestedName || "").trim().toLowerCase();
    if (!expected || !project || typeof project.getRootItem !== "function") {
      return [];
    }
    const rootItem = await project.getRootItem();
    const matches = [];
    const scannedNames = [];
    async function visitFolder(folder) {
      const children = folder && typeof folder.getItems === "function" ? await folder.getItems() : [];
      for (const child of children || []) {
        const name = await getProjectItemName(child);
        if (name && scannedNames.length < 80) {
          scannedNames.push(name);
        }
        if (String(name || "").trim().toLowerCase() === expected) {
          matches.push(child);
        }
        const type = readOptionalProperty(child, "type", null);
        const isFolder = app.ProjectItem && (type === app.ProjectItem.TYPE_BIN || type === app.ProjectItem.TYPE_ROOT);
        if ((isFolder || type === null) && app.FolderItem && typeof app.FolderItem.cast === "function") {
          try {
            // Recurse into documented bins, and also try unknown ProjectItem types because some hosts omit type.
            await visitFolder(app.FolderItem.cast(child));
          } catch (error) {
            // Non-folder ProjectItems are expected to reject FolderItem.cast.
          }
        }
      }
    }
    await visitFolder(rootItem);
    if (!matches.length) {
      logBridge("warn", "No Project item matched the requested Adjustment Layer name.", {
        requestedName,
        scannedNames
      });
    }
    return matches;
  }

  // Resolve an explicitly named ProjectItem while rejecting ambiguous or non-clip matches.
  async function findNamedAdjustmentLayerSource(app, project, requestedName) {
    const matches = await findProjectItemsByName(app, project, requestedName);
    if (!matches.length) {
      throw new Error("No Project item named \"" + requestedName + "\" was found.");
    }
    if (matches.length > 1) {
      throw new Error("Several Project items are named \"" + requestedName + "\". Rename it uniquely.");
    }
    const clipProjectItem = castClipProjectItem(app, matches[0]);
    if (!clipProjectItem) {
      throw new Error("The named Project item is not a clip that Premiere can insert.");
    }
    return {
      item: null,
      sequence: null,
      trackIndex: null,
      startSeconds: null,
      projectItem: matches[0],
      clipProjectItem,
      namedSource: true
    };
  }

  // Find a validated Adjustment Layer source from the active sequence or another sequence in the project.
  async function findAdjustmentLayerSource(app, project, activeSequence, requestedName) {
    if (String(requestedName || "").trim()) {
      return findNamedAdjustmentLayerSource(app, project, String(requestedName).trim());
    }
    const projectSequences = project && typeof project.getSequences === "function" ? await project.getSequences() : [];
    const sequences = [activeSequence].concat((projectSequences || []).filter((sequence) => sequence !== activeSequence));
    for (const sequence of sequences) {
      if (!sequence) {
        continue;
      }
      const trackCount = typeof sequence.getVideoTrackCount === "function" ? await sequence.getVideoTrackCount() : 0;
      for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
        const clips = await getTrackClips(app, sequence, "video", trackIndex);
        for (const clip of clips) {
          if (await readOptionalMethod(clip, "isAdjustmentLayer", false)) {
            const timing = await getTrackItemTiming(clip);
            const projectItem = await readOptionalMethod(clip, "getProjectItem", null);
            return {
              item: clip,
              sequence,
              trackIndex,
              startSeconds: timing.startNumber,
              projectItem,
              clipProjectItem: castClipProjectItem(app, projectItem),
              namedSource: false,
              durationSeconds: timing.startNumber !== null && timing.endNumber !== null
                ? Math.max(0, timing.endNumber - timing.startNumber)
                : null
            };
          }
        }
      }
    }
    return null;
  }

  // Locate the inserted Adjustment Layer after Premiere completes the timeline action.
  async function findInsertedProjectItem(app, sequence, trackIndex, projectItem, startSeconds) {
    const expectedId = projectItem && typeof projectItem.getId === "function" ? projectItem.getId() : "";
    const clips = await getTrackClips(app, sequence, "video", trackIndex);
    for (const clip of clips) {
      const timing = await getTrackItemTiming(clip);
      if (!nearlyEqualTime(timing.startNumber, startSeconds)) {
        continue;
      }
      const source = await readOptionalMethod(clip, "getProjectItem", null);
      const sourceId = source && typeof source.getId === "function" ? source.getId() : "";
      if (!expectedId || sourceId === expectedId) {
        return clip;
      }
    }
    return null;
  }

  // Find an inserted ProjectItem on any newly created video track.
  async function findInsertedProjectItemOnNewTrack(app, sequence, firstTrackIndex, projectItem, startSeconds) {
    const trackCount = typeof sequence.getVideoTrackCount === "function" ? await sequence.getVideoTrackCount() : firstTrackIndex;
    for (let trackIndex = firstTrackIndex; trackIndex < trackCount; trackIndex += 1) {
      const item = await findInsertedProjectItem(app, sequence, trackIndex, projectItem, startSeconds);
      if (item) {
        return { item, trackIndex };
      }
    }
    return null;
  }

  // Read the ProjectItem range that must be restored after inserting the requested duration.
  async function getProjectItemRange(app, clipProjectItem) {
    const mediaType = app.Constants && app.Constants.MediaType ? app.Constants.MediaType.VIDEO : 2;
    const inPoint = clipProjectItem && typeof clipProjectItem.getInPoint === "function" ? await clipProjectItem.getInPoint(mediaType) : null;
    const outPoint = clipProjectItem && typeof clipProjectItem.getOutPoint === "function" ? await clipProjectItem.getOutPoint(mediaType) : null;
    return {
      inPoint,
      outPoint,
      inPointSeconds: timeToNumber(inPoint),
      outPointSeconds: timeToNumber(outPoint)
    };
  }

  // Set a temporary ProjectItem range so Premiere creates the Adjustment Layer at the requested duration.
  async function setProjectItemRange(app, project, clipProjectItem, inPointSeconds, outPointSeconds, undoName) {
    await runTimelineStage("Preparing Adjustment Layer source range", {
      inPointSeconds,
      outPointSeconds,
      durationSeconds: outPointSeconds - inPointSeconds
    }, () => {
      const inPoint = app.TickTime.createWithSeconds(inPointSeconds);
      const outPoint = app.TickTime.createWithSeconds(outPointSeconds);
      if (!clipProjectItem || (typeof clipProjectItem.createSetInOutPointsAction !== "function"
        && typeof clipProjectItem.createSetOutPointAction !== "function")) {
        throw new Error("Premiere does not expose source range actions for this Project item.");
      }
      const action = typeof clipProjectItem.createSetInOutPointsAction === "function"
        ? clipProjectItem.createSetInOutPointsAction(inPoint, outPoint)
        : clipProjectItem.createSetOutPointAction(outPoint);
      return Promise.resolve(executeActions(project, [action], undoName));
    });
  }

  // Restore the source ProjectItem range without invalidating an Adjustment Layer already inserted on the timeline.
  async function restoreProjectItemRange(app, project, clipProjectItem, range) {
    if (range.inPointSeconds === null || range.outPointSeconds === null) {
      return;
    }
    try {
      await setProjectItemRange(
        app,
        project,
        clipProjectItem,
        range.inPointSeconds,
        range.outPointSeconds,
        "Tool Bar: Restore Adjustment Layer Source Range"
      );
    } catch (error) {
      // The inserted timeline item is already independent; keep the operation successful and report restoration failure.
      logBridge("warn", "Could not restore the Adjustment Layer source range.", describeBridgeError(error));
    }
  }

  // Try ProjectItem insertion with host-specific track/audio index fallbacks.
  async function insertProjectItemWithFallback(app, project, editor, source, time, trackIndices, placement, createsTrack) {
    const audioTrackIndices = [0, -1];
    let lastError = null;
    for (const trackIndex of trackIndices) {
      for (const audioTrackIndex of audioTrackIndices) {
        try {
          await runTimelineStage(createsTrack ? "Creating a track and inserting the Adjustment Layer" : "Inserting the Adjustment Layer", {
            requestedTrackIndex: trackIndex,
            audioTrackIndex,
            createdTrack: createsTrack,
            startSeconds: placement.startSeconds,
            endSeconds: placement.endSeconds
          }, () => {
            const action = editor.createInsertProjectItemAction(source, time, trackIndex, audioTrackIndex, true);
            return Promise.resolve(executeActions(project, [action], "Tool Bar: Add Adjustment Layer"));
          });
          return { trackIndex, audioTrackIndex };
        } catch (error) {
          lastError = error;
          logBridge("warn", "Adjustment Layer insert attempt failed.", {
            requestedTrackIndex: trackIndex,
            audioTrackIndex,
            error: describeBridgeError(error)
          });
        }
      }
    }
    throw lastError || new Error("Premiere could not insert the Adjustment Layer.");
  }

  // Insert a validated Adjustment Layer ProjectItem on a verified free or newly created track.
  async function addAdjustmentLayer(button) {
    const { app, project, sequence, items } = await getTimelineContext();
    if (!app.SequenceEditor || typeof app.SequenceEditor.getEditor !== "function") {
      throw new Error("Premiere does not expose the SequenceEditor API in this build.");
    }
    const options = button.tool && button.tool.timelineItem ? button.tool.timelineItem : {};
    const sourceInfo = await findAdjustmentLayerSource(app, project, sequence, options.adjustmentLayerName);
    if (!sourceInfo || !sourceInfo.projectItem) {
      throw new Error("Place one Adjustment Layer in any project sequence first. Premiere UXP cannot identify it from the Project panel alone.");
    }
    const source = sourceInfo.projectItem;
    const clipSource = sourceInfo.clipProjectItem;
    if (!clipSource) {
      throw new Error("Premiere could not access the Adjustment Layer as a ClipProjectItem.");
    }
    const placement = await getTimelinePlacement(app, sequence, items, options);
    const target = await findSafeVideoTrackIndex(app, sequence, placement, {
      endSeconds: placement.endSeconds,
      avoidLaterItems: true
    });
    const editor = app.SequenceEditor.getEditor(sequence);
    const originalRange = await getProjectItemRange(app, clipSource);
    const sourceInPointSeconds = originalRange.inPointSeconds === null ? 0 : originalRange.inPointSeconds;
    await setProjectItemRange(
      app,
      project,
      clipSource,
      sourceInPointSeconds,
      sourceInPointSeconds + placement.durationSeconds,
      "Tool Bar: Prepare Adjustment Layer Duration"
    );
    const beforeTrackCount = typeof sequence.getVideoTrackCount === "function" ? await sequence.getVideoTrackCount() : 0;
    const requestedTrackIndices = target.createsTrack
      ? [beforeTrackCount, beforeTrackCount + 1]
      : [target.trackIndex];
    try {
      await insertProjectItemWithFallback(
        app,
        project,
        editor,
        source,
        app.TickTime.createWithSeconds(placement.startSeconds),
        requestedTrackIndices,
        placement,
        target.createsTrack
      );
    } finally {
      await restoreProjectItemRange(app, project, clipSource, originalRange);
    }
    const inserted = target.createsTrack
      ? await findInsertedProjectItemOnNewTrack(app, sequence, beforeTrackCount, source, placement.startSeconds)
      : {
        item: await findInsertedProjectItem(app, sequence, target.trackIndex, source, placement.startSeconds),
        trackIndex: target.trackIndex
      };
    const item = inserted && inserted.item;
    if (!item) {
      throw new Error("Premiere completed the insert but Tool Bar could not locate the new Adjustment Layer.");
    }
    if (!await readOptionalMethod(item, "isAdjustmentLayer", false)) {
      throw new Error("Premiere inserted an item that is not recognized as an Adjustment Layer.");
    }
    logBridge("info", "Inserted Adjustment Layer.", {
      trackIndex: inserted.trackIndex,
      createdTrack: target.createsTrack,
      startSeconds: placement.startSeconds,
      endSeconds: placement.endSeconds
    });
    await refreshSequenceView(sequence);
    return item;
  }

  // Remove selected clip components according to the user's Remove Effects choices.
  async function removeSelectedClipEffects(button) {
    const { app, project, sequence, items } = await getSelectedItems();
    const options = button.tool && button.tool.removeEffects ? button.tool.removeEffects : {};
    const includeIntrinsic = options.includeIntrinsic !== false;
    const includeVideoEffects = options.includeVideoEffects !== false;
    if (!includeIntrinsic && !includeVideoEffects) {
      throw new Error("Choose at least one Remove Effects option.");
    }
    const actions = [];
    const summary = { clips: 0, baseParameters: 0, videoEffects: 0, graphicsLayersPreserved: 0, skipped: 0 };
    const videoEffectCatalog = includeVideoEffects ? await loadVideoEffectIdentityCatalog(app) : null;
    const frameSize = await getSequenceFrameSize(sequence);
    for (const item of items) {
      if (!isVideoItem(item) || typeof item.getComponentChain !== "function") {
        summary.skipped += 1;
        continue;
      }
      summary.clips += 1;
      const chain = await item.getComponentChain();
      const count = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
      if (!chain) {
        summary.skipped += 1;
        logBridge("warn", "Selected clip does not expose a component chain.");
        continue;
      }
      for (let index = 0; index < count; index += 1) {
        const component = chain.getComponentAtIndex(index);
        const displayName = await readComponentDisplayName(component);
        const isIntrinsic = INTRINSIC_COMPONENTS.includes(displayName);
        if (isIntrinsic && !includeIntrinsic) {
          continue;
        }
        if (!isIntrinsic && (!includeVideoEffects || isEssentialGraphicsLayerComponent(displayName))) {
          if (includeVideoEffects && isEssentialGraphicsLayerComponent(displayName)) {
            summary.graphicsLayersPreserved += 1;
          }
          continue;
        }
        try {
          if (isIntrinsic) {
            const resetActions = await createResetIntrinsicComponentActions(app, component, displayName, frameSize);
            actions.push.apply(actions, resetActions);
            summary.baseParameters += resetActions.length ? 1 : 0;
            if (!resetActions.length) {
              summary.skipped += 1;
            }
          } else {
            const matchName = await readComponentMatchName(component);
            if (!isCatalogVideoEffect(videoEffectCatalog, matchName, displayName)) {
              summary.skipped += 1;
              logBridge("info", "Preserved non-effect clip component.", {
                component: displayName || "Unknown",
                matchName: matchName || ""
              });
              continue;
            }
            if (typeof chain.createRemoveComponentAction !== "function") {
              summary.skipped += 1;
              logBridge("warn", "Selected clip does not expose remove component actions.");
              continue;
            }
            actions.push(chain.createRemoveComponentAction(component));
            summary.videoEffects += 1;
          }
        } catch (error) {
          summary.skipped += 1;
          logBridge("warn", "Could not queue component removal.", {
            component: displayName || "Unknown",
            error: describeBridgeError(error)
          });
        }
      }
    }
    const result = executeActions(project, actions, "Tool Bar: Remove Effects");
    await refreshSequenceView(sequence);
    logBridge("info", "Remove Effects completed.", summary);
    return result;
  }

  // Read a component display name while keeping remove workflows resilient.
  async function readComponentDisplayName(component) {
    try {
      return component && typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
    } catch (error) {
      logBridge("warn", "Could not read component display name.", describeBridgeError(error));
      return "";
    }
  }

  // Read a component match name so removal can be limited to registered video filters.
  async function readComponentMatchName(component) {
    try {
      return component && typeof component.getMatchName === "function" ? await component.getMatchName() : "";
    } catch (error) {
      logBridge("warn", "Could not read component match name.", describeBridgeError(error));
      return "";
    }
  }

  // Load the registered Premiere video-filter identities used to distinguish effects from Graphics layers.
  async function loadVideoEffectIdentityCatalog(app) {
    const catalog = { matchNames: {}, displayNames: {} };
    try {
      const factory = app && app.VideoFilterFactory;
      const matchNames = factory && typeof factory.getMatchNames === "function" ? await factory.getMatchNames() : [];
      const displayNames = factory && typeof factory.getDisplayNames === "function" ? await factory.getDisplayNames() : [];
      // Store normalized identities because display names can vary in punctuation and spacing.
      (matchNames || []).forEach((matchName) => {
        catalog.matchNames[normalizeCatalogName(matchName)] = true;
      });
      (displayNames || []).forEach((displayName) => {
        catalog.displayNames[normalizeCatalogName(displayName)] = true;
      });
    } catch (error) {
      logBridge("warn", "Could not load the video effect catalog; unknown components will be preserved.", describeBridgeError(error));
    }
    return catalog;
  }

  // Identify editable Essential Graphics layer components that must never be removed as clip effects.
  function isEssentialGraphicsLayerComponent(displayName) {
    return /^(text|shape|clip|group)(?:\s|\(|$)/i.test(String(displayName || "").trim());
  }

  // Return true only for components that Premiere's VideoFilterFactory recognizes as video effects.
  function isCatalogVideoEffect(catalog, matchName, displayName) {
    if (!catalog) {
      return false;
    }
    const normalizedMatchName = normalizeCatalogName(matchName);
    if (normalizedMatchName && catalog.matchNames[normalizedMatchName]) {
      return true;
    }
    const normalizedDisplayName = normalizeCatalogName(displayName);
    return !normalizedMatchName && Boolean(normalizedDisplayName && catalog.displayNames[normalizedDisplayName]);
  }

  // Reset Motion/Opacity-style intrinsic components without removing the visible base section.
  async function createResetIntrinsicComponentActions(app, component, componentName, frameSize) {
    const actions = [];
    const paramCount = getComponentParamCount(component);
    for (let index = 0; index < paramCount; index += 1) {
      try {
        const param = component.getParam(index);
        const defaultSnapshot = await getIntrinsicParamDefaultSnapshot(app, param, componentName, frameSize);
        if (!defaultSnapshot || !param || typeof param.createKeyframe !== "function" || typeof param.createSetValueAction !== "function") {
          continue;
        }
        actions.push.apply(actions, await createClearParamKeyframeActions(param));
        if (typeof param.createSetTimeVaryingAction === "function") {
          actions.push(param.createSetTimeVaryingAction(false));
        }
        const keyframe = createPresetKeyframe(app, param, defaultSnapshot);
        actions.push(param.createSetValueAction(keyframe, true));
      } catch (error) {
        logBridge("warn", "Skipped intrinsic parameter reset.", {
          component: componentName,
          index,
          error: describeBridgeError(error)
        });
      }
    }
    return actions;
  }

  // Remove existing keyframes before writing a static default value.
  async function createClearParamKeyframeActions(param) {
    const actions = [];
    try {
      const keyframes = typeof param.getKeyframeListAsTickTimes === "function" ? await param.getKeyframeListAsTickTimes() : [];
      if (!Array.isArray(keyframes) || typeof param.createRemoveKeyframeAction !== "function") {
        return actions;
      }
      keyframes.forEach((time) => {
        actions.push(param.createRemoveKeyframeAction(time, true));
      });
    } catch (error) {
      logBridge("warn", "Could not queue intrinsic keyframe cleanup.", describeBridgeError(error));
    }
    return actions;
  }

  // Return known Premiere defaults for intrinsic clip parameters exposed through UXP.
  async function getIntrinsicParamDefaultSnapshot(app, param, componentName, frameSize) {
    const paramName = normalizeEffectLabel(param && param.displayName);
    const componentKey = normalizeEffectLabel(componentName);
    const currentSnapshot = await readCurrentParamSnapshot(param);
    if (paramName.includes("position") || paramName.includes("anchorpoint")) {
      return makeDefaultPointSnapshot(currentSnapshot, frameSize);
    }
    if (paramName === "scale" || paramName.includes("scalewidth") || paramName.includes("scaleheight")
      || paramName.includes("opacity") || paramName.includes("speed")) {
      return { kind: "primitive", value: 100 };
    }
    if (paramName.includes("rotation") || paramName.includes("antiflicker")) {
      return { kind: "primitive", value: 0 };
    }
    if (paramName.includes("crop")) {
      return { kind: "primitive", value: 0 };
    }
    if (componentKey.includes("opacity") && paramName.includes("blend")) {
      return currentSnapshot && typeof currentSnapshot.value === "string" ? { kind: "primitive", value: "Normal" } : null;
    }
    return null;
  }

  // Read the current value only to preserve the host's point coordinate shape.
  async function readCurrentParamSnapshot(param) {
    try {
      const startValue = param && typeof param.getStartValue === "function" ? await param.getStartValue() : null;
      return serializeValue(startValue);
    } catch (error) {
      return null;
    }
  }

  // Build a default center point in normalized or pixel space depending on the current value shape.
  function makeDefaultPointSnapshot(currentSnapshot, frameSize) {
    const width = frameSize && frameSize.width ? frameSize.width : 1920;
    const height = frameSize && frameSize.height ? frameSize.height : 1080;
    if (currentSnapshot && currentSnapshot.kind === "point") {
      const looksNormalized = Math.abs(Number(currentSnapshot.x)) <= 1.5 && Math.abs(Number(currentSnapshot.y)) <= 1.5;
      return looksNormalized
        ? { kind: "point", x: 0.5, y: 0.5 }
        : { kind: "point", x: width / 2, y: height / 2 };
    }
    return { kind: "point", x: 0.5, y: 0.5 };
  }

  // Read sequence dimensions for pixel-space Motion defaults when Premiere exposes them.
  async function getSequenceFrameSize(sequence) {
    const fallbacks = [];
    try {
      if (sequence && typeof sequence.getFrameSize === "function") {
        fallbacks.push(await sequence.getFrameSize());
      }
    } catch (error) {
      logBridge("warn", "Could not read sequence frame size.", describeBridgeError(error));
    }
    try {
      const settings = sequence && typeof sequence.getSettings === "function" ? await sequence.getSettings() : null;
      if (settings && typeof settings.getVideoFrameRect === "function") {
        fallbacks.push(await settings.getVideoFrameRect());
      }
    } catch (error) {
      logBridge("warn", "Could not read sequence video frame rect.", describeBridgeError(error));
    }
    for (const value of fallbacks) {
      const size = readRectSize(value);
      if (size) {
        return size;
      }
    }
    return { width: 1920, height: 1080 };
  }

  // Normalize RectF-like values returned by different Premiere UXP builds.
  function readRectSize(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const width = Number(value.width || value.w || value.right);
    const height = Number(value.height || value.h || value.bottom);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
  }

  // Compare labels while ignoring spaces and punctuation.
  function normalizeEffectLabel(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Run multiple existing buttons in order, sharing the same current Premiere selection.
  async function applyMultiButton(button, config, depth) {
    const buttons = config && Array.isArray(config.buttons) ? config.buttons : [];
    const ids = button.multi.buttonIds.filter((buttonId) => buttonId !== button.id);
    if (!ids.length) {
      throw new Error("This Multi Action button has no actions assigned.");
    }
    const results = [];
    for (const buttonId of ids) {
      const child = buttons.find((item) => item.id === buttonId);
      if (!child) {
        logBridge("warn", "Skipped missing Multi Action child.", { buttonId });
        continue;
      }
      results.push(await applyButton(child, config, depth + 1));
    }
    logBridge("info", "Multi Action completed.", { actions: results.length });
    return results;
  }

  // Capture the selected clip's replayable effect stack into Tool Bar's local clipboard.
  async function copySelectedClipEffects() {
    const stack = await captureSelectedStack();
    if (root.localStorage) {
      root.localStorage.setItem(EFFECT_CLIPBOARD_KEY, JSON.stringify(stack));
    }
    logBridge("info", "Copied selected clip effects.", {
      sourceName: stack.sourceName,
      components: stack.components.length
    });
    return stack;
  }

  // Paste the last copied effect stack to the current selected target clip(s).
  async function pasteCopiedClipEffects(button) {
    const raw = root.localStorage && root.localStorage.getItem(EFFECT_CLIPBOARD_KEY);
    if (!raw) {
      throw new Error("No copied clip effects are available yet.");
    }
    const stack = root.PTB_SCHEMA.normalizeStack(JSON.parse(raw));
    if (!stack.components.length) {
      throw new Error("The copied clip effects are empty.");
    }
    return applyPresetButton(root.PTB_SCHEMA.createButton({
      label: button.label || "Paste Clip Effects",
      actionType: "preset",
      preset: { name: stack.sourceName || "Copied Clip Effects", keyframeTiming: "anchorIn" },
      stack
    }));
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
  function createTransitionOptions(app, button, applyTo, overrides) {
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
      const forceSingleSided = overrides && Object.prototype.hasOwnProperty.call(overrides, "forceSingleSided")
        ? overrides.forceSingleSided
        : button.transition.forceSingleSided;
      options.setForceSingleSided(Boolean(forceSingleSided));
    }
    if (typeof options.setTransitionAlignment === "function") {
      const alignment = overrides && Object.prototype.hasOwnProperty.call(overrides, "alignment")
        ? overrides.alignment
        : button.transition.alignment;
      options.setTransitionAlignment(Number(alignment) || 0);
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

  // Queue one video transition per detected edit point, keeping the cut-centered options consistent.
  async function queueVideoEditPointTransitionActions(app, button, targets, actions, logLabel) {
    for (const target of targets) {
      if (!target.item || typeof target.item.createAddVideoTransitionAction !== "function") {
        logBridge("warn", "Skipped edit-point target without createAddVideoTransitionAction.");
        continue;
      }
      const transition = await createTransitionWithFallback(app, button.transition.matchName, target.applyTo, "video");
      const options = createTransitionOptions(app, button, target.applyTo, {
        forceSingleSided: false,
        alignment: CENTERED_TRANSITION_ALIGNMENT
      });
      actions.push(target.item.createAddVideoTransitionAction(transition, options));
      logBridge("info", "Queued " + logLabel + " video transition action.", {
        applyTo: target.applyTo,
        trackIndex: target.trackIndex,
        point: target.point,
        hasOptions: Boolean(options),
        actions: actions.length
      });
    }
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
    if (mediaType === "video") {
      const editPointTargets = await resolveSelectedVideoEditPointTargets(app, sequence, items);
      if (editPointTargets.length) {
        logBridge("info", "Applying transition to selected edit point.", { targets: editPointTargets.length });
        await queueVideoEditPointTransitionActions(app, button, editPointTargets, actions, "edit-point");
        const result = executeActions(project, actions, "Tool Bar: " + button.label);
        await refreshSequenceView(sequence);
        await applyTransitionPresetValues(app, project, sequence, button, items);
        logBridge("info", "Edit-point video transition command completed.", { actions: actions.length });
        return result;
      }
      const adjacentClipTargets = await resolveSelectedAdjacentVideoClipTargets(items);
      if (adjacentClipTargets.length) {
        logBridge("info", "Applying transition to selected adjacent clip cut.", { targets: adjacentClipTargets.length });
        await queueVideoEditPointTransitionActions(app, button, adjacentClipTargets, actions, "adjacent-clip");
        const result = executeActions(project, actions, "Tool Bar: " + button.label);
        await refreshSequenceView(sequence);
        await applyTransitionPresetValues(app, project, sequence, button, items);
        logBridge("info", "Adjacent-clip video transition command completed.", { actions: actions.length });
        return result;
      }
    }
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
    await applyTransitionPresetValues(app, project, sequence, button, items);
    logBridge("info", capitalize(mediaType) + " transition command completed.", { actions: actions.length });
    return result;
  }

  // Replay imported transition preset parameters on the transition items Premiere exposes after creation.
  async function applyTransitionPresetValues(app, project, sequence, button, selectedItems) {
    if (button.actionType !== "transitionPreset") {
      return 0;
    }
    const stack = root.PTB_SCHEMA.normalizeStack(button.stack);
    const componentSnapshot = stack.components[0];
    if (!componentSnapshot || !componentSnapshot.params.length) {
      logBridge("warn", "Transition preset has no stored parameters to replay.");
      return 0;
    }
    await waitForHostPaint();
    const targets = await findTransitionPresetParamTargets(app, sequence, selectedItems, button, componentSnapshot);
    if (!targets.length) {
      logBridge("warn", "No matching transition item found for preset parameter replay.", {
        matchName: button.transition.matchName,
        storedParams: componentSnapshot.params.length
      });
      return 0;
    }
    const setupActions = [];
    const valueTargets = [];
    for (const target of targets) {
      const component = await resolveTransitionPresetComponent(target.item, componentSnapshot);
      if (!component) {
        logBridge("warn", "Matching transition item does not expose a component chain for preset parameters.", target.info);
        continue;
      }
      const targetTiming = await getItemTimingSnapshot(target.item);
      setupActions.push.apply(setupActions, await createParamSetupActions(app, component, componentSnapshot.params));
      valueTargets.push({ component, params: componentSnapshot.params, stack, targetTiming, timingMode: "scale" });
    }
    if (setupActions.length) {
      executeActions(project, setupActions, "Tool Bar: " + button.label + " transition preset setup");
      await refreshSequenceView(sequence);
      await waitForHostPaint();
    }
    const paramActions = [];
    for (const target of valueTargets) {
      paramActions.push.apply(paramActions, await createParamValueActions(app, target.component, target.params, target));
    }
    if (paramActions.length) {
      executeActions(project, paramActions, "Tool Bar: " + button.label + " transition preset values");
      await refreshSequenceView(sequence);
    } else {
      logBridge("warn", "Transition preset applied without parameter actions.", {
        targets: valueTargets.length,
        storedParams: componentSnapshot.params.length
      });
    }
    logBridge("info", "Transition preset parameter replay completed.", {
      targets: valueTargets.length,
      setupActions: setupActions.length,
      parameterActions: setupActions.length + paramActions.length
    });
    return setupActions.length + paramActions.length;
  }

  // Find newly-created or nearby transition track items that match the imported preset.
  async function findTransitionPresetParamTargets(app, sequence, selectedItems, button, componentSnapshot) {
    const selectedInfos = [];
    for (let index = 0; index < selectedItems.length; index += 1) {
      selectedInfos.push(await inspectTrackItemIdentity(selectedItems[index], index, "video", "selectedItem"));
    }
    const scan = await getTransitionTrackItemsForMedia(app, sequence, "video");
    const seen = {};
    const targets = [];
    scan.items.forEach((entry) => {
      const info = entry.info;
      const matchName = info.matchName || "";
      const name = info.name || "";
      const matchesTransition = !button.transition.matchName
        || matchName === button.transition.matchName
        || name === componentSnapshot.displayName;
      if (!matchesTransition) {
        return;
      }
      const nearSelection = selectedInfos.some((selectedInfo) => itemsOverlapOrTouch(selectedInfo, info));
      if (!nearSelection) {
        return;
      }
      const key = [
        info.scannedTrackIndex,
        info.start.ticks || info.start.seconds,
        info.end.ticks || info.end.seconds,
        matchName || name
      ].join("|");
      if (!seen[key]) {
        seen[key] = true;
        targets.push(entry);
      }
    });
    if (scan.errors.length) {
      logBridge("warn", "Transition preset scan had errors.", { errors: scan.errors });
    }
    return targets;
  }

  // Resolve the component inside a transition track item that should receive imported parameters.
  async function resolveTransitionPresetComponent(transitionItem, componentSnapshot) {
    try {
      if (!transitionItem || typeof transitionItem.getComponentChain !== "function") {
        return null;
      }
      const chain = await transitionItem.getComponentChain();
      const count = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
      let fallback = null;
      for (let index = 0; index < count; index += 1) {
        const component = chain.getComponentAtIndex(index);
        if (!fallback) {
          fallback = component;
        }
        const matchName = typeof component.getMatchName === "function" ? await component.getMatchName() : "";
        const displayName = typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
        if ((componentSnapshot.matchName && matchName === componentSnapshot.matchName)
          || (componentSnapshot.displayName && displayName === componentSnapshot.displayName)) {
          return component;
        }
      }
      return fallback;
    } catch (error) {
      logBridge("warn", "Could not resolve transition preset component.", describeBridgeError(error));
      return null;
    }
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
    const appendActions = [];
    const pendingParamTargets = [];
    if (!stack.components.length) {
      throw new Error(root.PTB_I18N.t("noPresetCaptured"));
    }
    for (const item of items) {
      let appendOffset = 0;
      const targetTiming = await getItemTimingSnapshot(item);
      const targetChain = typeof item.getComponentChain === "function" ? await item.getComponentChain() : null;
      for (const componentSnapshot of stack.components) {
        if (componentSnapshot.intrinsic) {
          if (componentSnapshot.mediaType === "video" && isVideoItem(item) && targetChain) {
            // Intrinsic snapshots write to the existing Motion/Opacity component on the target clip.
            const component = await resolveIntrinsicPresetComponent(targetChain, componentSnapshot);
            if (component) {
              pendingParamTargets.push({ component, chain: targetChain, insertIndex: 0, intrinsic: true, params: componentSnapshot.params, stack, targetTiming, timingMode: button.preset.keyframeTiming });
            }
          }
          continue;
        }
        if (componentSnapshot.mediaType === "video" && isVideoItem(item)) {
          const component = await app.VideoFilterFactory.createComponent(componentSnapshot.matchName);
          const chain = targetChain || await item.getComponentChain();
          appendActions.push(createNaturalAppendComponentAction(chain, component, appendOffset));
          pendingParamTargets.push({ component, chain, insertIndex: appendOffset, params: componentSnapshot.params, stack, targetTiming, timingMode: button.preset.keyframeTiming });
          appendOffset += 1;
        }
        if (componentSnapshot.mediaType === "audio" && isAudioItem(item)) {
          const component = await app.AudioFilterFactory.createComponentByDisplayName(componentSnapshot.displayName, item);
          const chain = targetChain || await item.getComponentChain();
          appendActions.push(createNaturalAppendComponentAction(chain, component, appendOffset));
          pendingParamTargets.push({ component, chain, insertIndex: appendOffset, params: componentSnapshot.params, stack, targetTiming, timingMode: button.preset.keyframeTiming });
          appendOffset += 1;
        }
      }
    }
    const result = appendActions.length ? executeActions(project, appendActions, "Tool Bar: " + button.label + " components") : null;
    if (!pendingParamTargets.length) {
      throw new Error("No compatible selected clips for this preset.");
    }
    if (appendActions.length) {
      await refreshSequenceView(sequence);
      await waitForHostPaint();
    }
    const resolvedTargets = pendingParamTargets.map((target) => Object.assign({}, target, {
      resolvedComponent: target.intrinsic ? target.component : (resolveInsertedComponent(target.chain, target.insertIndex) || target.component)
    }));
    const setupActions = [];
    for (const target of resolvedTargets) {
      let actions = await createParamSetupActions(app, target.resolvedComponent, target.params, { clearExistingKeyframes: target.intrinsic });
      target.valueComponent = target.resolvedComponent;
      if (!actions.length && target.resolvedComponent !== target.component) {
        // Use the original component proxy when the inserted component is not exposing params yet.
        const fallbackSetupActions = await createParamSetupActions(app, target.component, target.params, { clearExistingKeyframes: target.intrinsic });
        if (fallbackSetupActions.length) {
          actions = fallbackSetupActions;
          target.valueComponent = target.component;
        }
      }
      setupActions.push.apply(setupActions, actions);
    }
    if (setupActions.length) {
      // Enable animated parameters in their own transaction; macOS can ignore keyframes added in the same transaction.
      executeActions(project, setupActions, "Tool Bar: " + button.label + " preset keyframe setup");
      await refreshSequenceView(sequence);
      await waitForHostPaint();
    }
    const paramActions = [];
    const finalPointActions = [];
    for (const target of resolvedTargets) {
      const lateGroups = await createParamValueActionGroups(app, target.valueComponent, target.params, target);
      const alternateComponent = target.valueComponent === target.resolvedComponent ? target.component : target.resolvedComponent;
      const fallbackGroups = lateGroups.actions.length || lateGroups.pointActions.length || target.valueComponent === alternateComponent
        ? { actions: [], pointActions: [] }
        : await createParamValueActionGroups(app, alternateComponent, target.params, target);
      const usableGroups = lateGroups.actions.length || lateGroups.pointActions.length ? lateGroups : fallbackGroups;
      if (!usableGroups.actions.length && !usableGroups.pointActions.length) {
        logBridge("warn", "Preset component has no parameter actions.", {
          storedParams: target.params.length,
          insertIndex: target.insertIndex,
          resolvedParamCount: getComponentParamCount(target.resolvedComponent),
          setupActions: setupActions.length
        });
      }
      paramActions.push.apply(paramActions, usableGroups.actions);
      finalPointActions.push.apply(finalPointActions, usableGroups.pointActions);
    }
    if (paramActions.length) {
      executeActions(project, paramActions, "Tool Bar: " + button.label + " preset values");
    } else if (!finalPointActions.length) {
      logBridge("warn", "Preset applied without parameter actions.", { components: pendingParamTargets.length });
    }
    if (finalPointActions.length) {
      // Reapply point parameters after scalar Transform settings that can reset Position/Anchor Point to center.
      await refreshSequenceView(sequence);
      await waitForHostPaint();
      executeActions(project, finalPointActions, "Tool Bar: " + button.label + " preset point values");
    }
    await refreshSequenceView(sequence);
    logBridge("info", "Preset command completed.", { components: pendingParamTargets.length, keyframeSetupActions: setupActions.length, parameterActions: setupActions.length + paramActions.length + finalPointActions.length });
    return result;
  }

  // Return a component from the destination chain after Premiere has inserted it.
  function resolveInsertedComponent(chain, index) {
    try {
      if (chain && typeof chain.getComponentAtIndex === "function") {
        return chain.getComponentAtIndex(Number(index) || 0);
      }
    } catch (error) {
      logBridge("warn", "Could not resolve inserted component.", describeBridgeError(error));
    }
    return null;
  }

  // Read a component parameter count without letting opaque UXP proxies break the workflow.
  function getComponentParamCount(component) {
    try {
      return component && typeof component.getParamCount === "function" ? component.getParamCount() : 0;
    } catch (error) {
      return 0;
    }
  }

  // Give Premiere a short chance to attach newly-created components before setting their params.
  function waitForHostPaint() {
    return new Promise((resolve) => {
      if (typeof setTimeout === "function") {
        setTimeout(resolve, 35);
      } else {
        resolve();
      }
    });
  }

  // Convert a serialized value back into a Premiere-compatible parameter value.
  function reviveValue(app, snapshot) {
    const value = root.PTB_SCHEMA.normalizeStack({ components: [] }) && snapshot;
    if (!value || value.kind === "primitive") {
      return value ? value.value : undefined;
    }
    if (value.kind === "point") {
      return createPremierePoint(app, value);
    }
    if (value.kind === "color") {
      return createPremiereColor(app, value);
    }
    if (value.kind === "raw") {
      return undefined;
    }
    return value.value;
  }

  // Build a real Premiere PointF and assign fields explicitly because constructors can ignore arguments.
  function createPremierePoint(app, value) {
    const x = Number(value.x);
    const y = Number(value.y);
    try {
      if (app && typeof app.PointF === "function") {
        const point = new app.PointF();
        point.x = x;
        point.y = y;
        return point;
      }
    } catch (error) {
      try {
        const point = new app.PointF(x, y);
        point.x = x;
        point.y = y;
        return point;
      } catch (fallbackError) {
        // Fall back to a plain point object for older host shims and tests.
      }
    }
    return { x, y };
  }

  // Build a real Premiere Color and assign fields explicitly to preserve captured channel values.
  function createPremiereColor(app, value) {
    const red = Number(value.red);
    const green = Number(value.green);
    const blue = Number(value.blue);
    const alpha = typeof value.alpha === "number" ? value.alpha : 1;
    try {
      if (app && typeof app.Color === "function") {
        const color = new app.Color();
        color.red = red;
        color.green = green;
        color.blue = blue;
        color.alpha = alpha;
        return color;
      }
    } catch (error) {
      try {
        const color = new app.Color(red, green, blue, alpha);
        color.red = red;
        color.green = green;
        color.blue = blue;
        color.alpha = alpha;
        return color;
      } catch (fallbackError) {
        // Fall back to a plain color object for older host shims and tests.
      }
    }
    return { red, green, blue, alpha };
  }

  // Create a TickTime object from a stored keyframe position.
  function reviveTime(app, keyframeSnapshot, timingContext) {
    const adjustedSeconds = getAdjustedKeyframeSeconds(keyframeSnapshot, timingContext);
    if (adjustedSeconds !== null && app.TickTime && app.TickTime.createWithSeconds) {
      return app.TickTime.createWithSeconds(adjustedSeconds);
    }
    if (!timingContext && app.TickTime && app.TickTime.createWithTicks && keyframeSnapshot.ticks) {
      return app.TickTime.createWithTicks(String(keyframeSnapshot.ticks));
    }
    if (app.TickTime && app.TickTime.createWithSeconds) {
      return app.TickTime.createWithSeconds(Number(keyframeSnapshot.seconds) || 0);
    }
    return null;
  }

  // Calculate where an imported/captured keyframe should land on the selected target clip.
  function getAdjustedKeyframeSeconds(keyframeSnapshot, timingContext) {
    if (!timingContext) {
      return null;
    }
    const stack = timingContext.stack || {};
    const target = timingContext.targetTiming || {};
    const sourceStart = typeof stack.sourceStartSeconds === "number" ? stack.sourceStartSeconds : null;
    const sourceEnd = typeof stack.sourceEndSeconds === "number" ? stack.sourceEndSeconds : null;
    // Prefer in/out point timing for actual keyframe positions so image/text/adjustment clips stay visible.
    const sourceKeyStart = typeof stack.sourceInPointSeconds === "number" ? stack.sourceInPointSeconds : sourceStart;
    const sourceKeyEnd = typeof stack.sourceOutPointSeconds === "number" ? stack.sourceOutPointSeconds : sourceEnd;
    const sourceDuration = typeof timingContext.paramDurationSeconds === "number" && timingContext.paramDurationSeconds > 0
      ? timingContext.paramDurationSeconds
      : (typeof stack.sourceDurationSeconds === "number" && stack.sourceDurationSeconds > 0
        ? stack.sourceDurationSeconds
        : (typeof sourceKeyStart === "number" && typeof sourceKeyEnd === "number" ? Math.max(0, sourceKeyEnd - sourceKeyStart) : null));
    const targetStart = typeof target.startSeconds === "number" ? target.startSeconds : null;
    const targetEnd = typeof target.endSeconds === "number" ? target.endSeconds : null;
    // UXP keyframes are positioned against the selected clip's in/out point clock.
    const targetKeyStart = typeof target.inPointSeconds === "number" ? target.inPointSeconds : targetStart;
    const targetKeyEnd = typeof target.outPointSeconds === "number" ? target.outPointSeconds : targetEnd;
    const targetKeyDuration = typeof targetKeyStart === "number" && typeof targetKeyEnd === "number" && targetKeyEnd > targetKeyStart
      ? targetKeyEnd - targetKeyStart
      : null;
    const targetDuration = targetKeyDuration || (typeof target.durationSeconds === "number" && target.durationSeconds > 0 ? target.durationSeconds : null);
    const rawSeconds = typeof keyframeSnapshot.seconds === "number" ? keyframeSnapshot.seconds : null;
    let relativeSeconds = typeof keyframeSnapshot.relativeSeconds === "number" ? keyframeSnapshot.relativeSeconds : null;
    if (relativeSeconds === null && rawSeconds !== null) {
      const looksAbsolute = sourceKeyStart !== null && sourceKeyEnd !== null && rawSeconds >= sourceKeyStart - 0.5 && rawSeconds <= sourceKeyEnd + 0.5;
      relativeSeconds = looksAbsolute ? rawSeconds - sourceKeyStart : rawSeconds;
    }
    if (relativeSeconds === null) {
      return null;
    }
    let outputSeconds = null;
    if (timingContext.timingMode === "absolute") {
      outputSeconds = targetKeyStart !== null ? targetKeyStart + relativeSeconds : (rawSeconds !== null ? rawSeconds : relativeSeconds);
    } else if (timingContext.timingMode === "scale" && targetKeyStart !== null && sourceDuration && targetDuration) {
      outputSeconds = targetKeyStart + (relativeSeconds / sourceDuration) * targetDuration;
    } else if (timingContext.timingMode === "anchorOut" && targetKeyEnd !== null && sourceDuration !== null) {
      outputSeconds = targetKeyEnd - Math.max(0, sourceDuration - relativeSeconds);
    } else if (targetKeyStart !== null) {
      outputSeconds = targetKeyStart + relativeSeconds;
    } else {
      outputSeconds = relativeSeconds;
    }
    return clampPresetKeyframeSeconds(outputSeconds, targetKeyStart, targetKeyEnd);
  }

  // Keep generated keyframes inside the selected clip so Premiere does not silently drop them.
  function clampPresetKeyframeSeconds(seconds, targetStart, targetEnd) {
    if (seconds === null || !Number.isFinite(Number(seconds))) {
      return null;
    }
    let output = Number(seconds);
    if (typeof targetStart === "number") {
      output = Math.max(targetStart, output);
    }
    if (typeof targetEnd === "number") {
      output = Math.min(targetEnd, output);
    }
    return output;
  }

  // Create only the actions that turn parameter keyframing on before keyframes are added.
  async function createParamSetupActions(app, component, paramSnapshots, options) {
    const actions = [];
    const paramCount = getComponentParamCount(component);
    const clearExistingKeyframes = Boolean(options && options.clearExistingKeyframes);
    for (const snapshot of paramSnapshots) {
      if (snapshot.index >= paramCount) {
        continue;
      }
      try {
        const param = component.getParam(snapshot.index);
        if (!param) {
          continue;
        }
        if (clearExistingKeyframes) {
          // Intrinsic clip parameters already exist on the target, so clear their old animation first.
          actions.push.apply(actions, await createClearParamKeyframeActions(param));
          if (typeof param.createSetTimeVaryingAction === "function") {
            actions.push(param.createSetTimeVaryingAction(Boolean(snapshot.timeVarying && Array.isArray(snapshot.keyframes) && snapshot.keyframes.length)));
          }
          continue;
        }
        if (snapshot.timeVarying && Array.isArray(snapshot.keyframes) && snapshot.keyframes.length) {
          actions.push(param.createSetTimeVaryingAction(true));
        }
      } catch (error) {
        logBridge("warn", "Skipped preset keyframe setup action.", {
          index: snapshot.index,
          name: snapshot.displayName,
          error: describeBridgeError(error)
        });
      }
    }
    return actions;
  }

  // Create parameter value/keyframe actions after animated parameters have been enabled.
  async function createParamValueActions(app, component, paramSnapshots, timingContext) {
    const groups = await createParamValueActionGroups(app, component, paramSnapshots, timingContext);
    return groups.actions.concat(groups.pointActions);
  }

  // Create regular actions separately from point actions so Transform points can be applied last.
  async function createParamValueActionGroups(app, component, paramSnapshots, timingContext) {
    const actions = [];
    const pointActions = [];
    const paramCount = getComponentParamCount(component);
    for (const snapshot of paramSnapshots) {
      if (snapshot.index >= paramCount) {
        continue;
      }
      try {
        const param = component.getParam(snapshot.index);
        if (!param) {
          continue;
        }
        if (snapshot.timeVarying && Array.isArray(snapshot.keyframes) && snapshot.keyframes.length) {
          const paramTimingContext = Object.assign({}, timingContext || {}, {
            paramDurationSeconds: getParamKeyframeDuration(snapshot)
          });
          for (const keyframeSnapshot of snapshot.keyframes) {
            if (!isSupportedPresetValue(keyframeSnapshot.value)) {
              continue;
            }
            try {
              const keyframe = createPresetKeyframe(app, param, keyframeSnapshot.value);
              const position = reviveTime(app, keyframeSnapshot, paramTimingContext);
              if (position) {
                keyframe.position = position;
              }
              if (keyframeSnapshot.temporalInterpolation !== null && typeof keyframe.setTemporalInterpolationMode === "function") {
                try {
                  await keyframe.setTemporalInterpolationMode(keyframeSnapshot.temporalInterpolation);
                } catch (error) {
                  logBridge("warn", "Skipped captured keyframe interpolation.", {
                    index: snapshot.index,
                    name: snapshot.displayName,
                    error: describeBridgeError(error)
                  });
                }
              }
              const action = param.createAddKeyframeAction(keyframe);
              if (isPointPresetValue(keyframeSnapshot.value)) {
                logBridge("info", "Queued point preset keyframe.", {
                  index: snapshot.index,
                  name: snapshot.displayName,
                  x: keyframeSnapshot.value.x,
                  y: keyframeSnapshot.value.y
                });
                pointActions.push(action);
              } else {
                actions.push(action);
              }
            } catch (error) {
              logBridge("warn", "Skipped one preset keyframe.", {
                index: snapshot.index,
                name: snapshot.displayName,
                error: describeBridgeError(error)
              });
            }
          }
        } else {
          if (!isSupportedPresetValue(snapshot.startValue)) {
            if (snapshot.startValue && snapshot.startValue.kind === "raw") {
              logBridge("info", "Preserved raw preset parameter; Premiere UXP cannot replay this value type yet.", {
                index: snapshot.index,
                name: snapshot.displayName,
                encoding: snapshot.startValue.encoding || "",
                parameterControlType: snapshot.startValue.parameterControlType || ""
              });
            }
            continue;
          }
          const keyframe = createPresetKeyframe(app, param, snapshot.startValue);
          if (snapshot.startTemporalInterpolation !== null && typeof keyframe.setTemporalInterpolationMode === "function") {
            await keyframe.setTemporalInterpolationMode(snapshot.startTemporalInterpolation);
          }
          const action = param.createSetValueAction(keyframe, true);
          if (isPointPresetValue(snapshot.startValue)) {
            logBridge("info", "Queued point preset value.", {
              index: snapshot.index,
              name: snapshot.displayName,
              x: snapshot.startValue.x,
              y: snapshot.startValue.y
            });
            pointActions.push(action);
          } else {
            actions.push(action);
          }
        }
      } catch (error) {
        logBridge("warn", "Skipped preset parameter action.", {
          index: snapshot.index,
          name: snapshot.displayName,
          error: describeBridgeError(error)
        });
      }
    }
    return { actions, pointActions };
  }

  // Create a Premiere keyframe and explicitly write object values for PointF/Color-backed params.
  function createPresetKeyframe(app, param, snapshot) {
    const revivedValue = reviveValue(app, snapshot);
    const keyframe = param.createKeyframe(revivedValue);
    if (snapshot && (snapshot.kind === "point" || snapshot.kind === "color")) {
      try {
        keyframe.value = revivedValue;
      } catch (error) {
        // Some host keyframe proxies only accept the value through createKeyframe.
      }
    }
    return keyframe;
  }

  // Identify point payloads that need to be replayed after other Transform settings.
  function isPointPresetValue(snapshot) {
    return snapshot && snapshot.kind === "point" && isSupportedPresetValue(snapshot);
  }

  // Return the source offset of the last keyframe for anchor-out and scale placement.
  function getParamKeyframeDuration(snapshot) {
    const values = (snapshot && Array.isArray(snapshot.keyframes) ? snapshot.keyframes : []).map((keyframe) => {
      if (typeof keyframe.relativeSeconds === "number") {
        return keyframe.relativeSeconds;
      }
      return typeof keyframe.seconds === "number" ? keyframe.seconds : null;
    }).filter((value) => typeof value === "number" && Number.isFinite(value));
    if (!values.length) {
      return null;
    }
    return Math.max.apply(null, values);
  }

  // Keep unsupported/empty parameter payloads from aborting a whole preset.
  function isSupportedPresetValue(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }
    if (snapshot.kind === "point") {
      return Number.isFinite(Number(snapshot.x)) && Number.isFinite(Number(snapshot.y));
    }
    if (snapshot.kind === "color") {
      return ["red", "green", "blue"].every((key) => Number.isFinite(Number(snapshot[key])));
    }
    if (snapshot.kind === "raw") {
      return false;
    }
    if (snapshot.kind === "primitive") {
      return typeof snapshot.value === "number" || typeof snapshot.value === "boolean" || typeof snapshot.value === "string";
    }
    return false;
  }

  // Return JSON-safe data for opaque objects exposed by UXP parameter values.
  function tryJsonClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  // Keep non-replayable captured values visible in exported Tool Bar JSON.
  function serializeUnsupportedPresetValue(rawValue, param, reason) {
    const valueText = rawValue === undefined || rawValue === null ? "" : String(rawValue);
    return {
      kind: "raw",
      // Capture can expose placeholders for Lumetri curves without a UXP-writable value.
      encoding: reason || "uxp-unsupported",
      value: valueText,
      valueType: rawValue === null ? "null" : typeof rawValue,
      objectShape: inspectObjectShape(param)
    };
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
    const pointValue = readPointLikeValue(rawValue);
    if (pointValue) {
      return pointValue;
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
    if (rawValue && typeof rawValue === "object") {
      return {
        kind: "raw",
        // Store opaque Lumetri/host values for export and future replay support.
        encoding: "uxp-object",
        value: "",
        valueType: Object.prototype.toString.call(rawValue),
        jsonValue: tryJsonClone(rawValue),
        objectShape: inspectObjectShape(rawValue)
      };
    }
    return { kind: "primitive", value: rawValue };
  }

  // Read point-ish Premiere values that may arrive as PointF, arrays, numeric-key objects, or text pairs.
  function readPointLikeValue(rawValue) {
    if (!rawValue) {
      return null;
    }
    if (Array.isArray(rawValue) && rawValue.length >= 2) {
      return createPointSnapshot(rawValue[0], rawValue[1]);
    }
    if (typeof rawValue === "object") {
      const direct = createPointSnapshot(rawValue.x, rawValue.y)
        || createPointSnapshot(rawValue.X, rawValue.Y)
        || createPointSnapshot(rawValue[0], rawValue[1]);
      if (direct) {
        return direct;
      }
      const jsonValue = tryJsonClone(rawValue);
      if (jsonValue && jsonValue !== rawValue) {
        return readPointLikeValue(jsonValue);
      }
    }
    if (typeof rawValue === "string") {
      const match = rawValue.match(/-?\d+(?:[.,]\d+)?/g);
      if (match && match.length >= 2) {
        return createPointSnapshot(match[0].replace(",", "."), match[1].replace(",", "."));
      }
    }
    return null;
  }

  // Return a normalized point only when both coordinates are finite numbers.
  function createPointSnapshot(x, y) {
    const numericX = Number(x);
    const numericY = Number(y);
    return Number.isFinite(numericX) && Number.isFinite(numericY)
      ? { kind: "point", x: numericX, y: numericY }
      : null;
  }

  // Serialize a keyframe into JSON-safe data.
  async function serializeKeyframe(param, time, sourceTiming) {
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
    const seconds = position && typeof position.seconds === "number" ? position.seconds : 0;
    const sourceStart = sourceTiming && typeof sourceTiming.startSeconds === "number" ? sourceTiming.startSeconds : null;
    const sourceEnd = sourceTiming && typeof sourceTiming.endSeconds === "number" ? sourceTiming.endSeconds : null;
    // Store keyframe offsets from the clip in-point when Premiere exposes it.
    const sourceKeyStart = sourceTiming && typeof sourceTiming.inPointSeconds === "number" ? sourceTiming.inPointSeconds : sourceStart;
    const sourceKeyEnd = sourceTiming && typeof sourceTiming.outPointSeconds === "number" ? sourceTiming.outPointSeconds : sourceEnd;
    const looksAbsolute = sourceKeyStart !== null && sourceKeyEnd !== null && seconds >= sourceKeyStart - 0.5 && seconds <= sourceKeyEnd + 0.5;
    return {
      ticks: position && position.ticks ? String(position.ticks) : "0",
      seconds,
      relativeSeconds: looksAbsolute ? seconds - sourceKeyStart : seconds,
      temporalInterpolation,
      value: serializeValue(value)
    };
  }

  // Sample the visible static value at the selected clip's source in-point when Premiere exposes it.
  async function sampleStaticParamValue(app, param, sourceTiming) {
    if (!param || typeof param.getValueAtTime !== "function") {
      return undefined;
    }
    const seconds = sourceTiming && typeof sourceTiming.inPointSeconds === "number"
      ? sourceTiming.inPointSeconds
      : (sourceTiming && typeof sourceTiming.startSeconds === "number" ? sourceTiming.startSeconds : 0);
    const sampleTime = app && app.TickTime && typeof app.TickTime.createWithSeconds === "function"
      ? app.TickTime.createWithSeconds(seconds)
      : { seconds };
    try {
      return await param.getValueAtTime(sampleTime);
    } catch (error) {
      // Some Premiere parameter types only expose getStartValue; keep that fallback.
      return undefined;
    }
  }

  // Prefer sampled static values only when getStartValue looks like a zero placeholder.
  function chooseCapturedStaticValue(startValue, sampledValue) {
    if (sampledValue === undefined) {
      return startValue;
    }
    const startSnapshot = serializeValue(startValue);
    const sampledSnapshot = serializeValue(sampledValue);
    if (!isSupportedPresetValue(startSnapshot) && isSupportedPresetValue(sampledSnapshot)) {
      return sampledValue;
    }
    if (startSnapshot.kind === "primitive"
      && sampledSnapshot.kind === "primitive"
      && typeof startSnapshot.value === "number"
      && typeof sampledSnapshot.value === "number"
      && startSnapshot.value === 0
      && sampledSnapshot.value !== 0) {
      return sampledValue;
    }
    return startValue;
  }

  // Capture one component parameter for the internal stack preset.
  async function captureParam(app, param, index, sourceTiming) {
    const startKeyframe = await param.getStartValue();
    const timeVarying = typeof param.isTimeVarying === "function" ? param.isTimeVarying() : false;
    const keyframeTimes = timeVarying && typeof param.getKeyframeListAsTickTimes === "function"
      ? await param.getKeyframeListAsTickTimes()
      : [];
    const keyframes = [];
    for (const time of keyframeTimes) {
      keyframes.push(await serializeKeyframe(param, time, sourceTiming));
    }
    const sampledStaticValue = keyframes.length ? undefined : await sampleStaticParamValue(app, param, sourceTiming);
    const staticValue = chooseCapturedStaticValue(startKeyframe && startKeyframe.value, sampledStaticValue);
    const serializedStartValue = serializeValue(staticValue);
    if (isPointPresetValue(serializedStartValue)) {
      logBridge("info", "Captured point preset value.", {
        index,
        name: param.displayName || "Param " + (index + 1),
        x: serializedStartValue.x,
        y: serializedStartValue.y
      });
    }
    return {
      index,
      displayName: param.displayName || "Param " + (index + 1),
      timeVarying,
      startValue: isSupportedPresetValue(serializedStartValue) || serializedStartValue.kind === "raw"
        ? serializedStartValue
        : serializeUnsupportedPresetValue(staticValue, param, "uxp-unsupported-start-value"),
      startTemporalInterpolation: startKeyframe && typeof startKeyframe.getTemporalInterpolationMode === "function"
        ? await startKeyframe.getTemporalInterpolationMode()
        : null,
      keyframes
    };
  }

  // Return the normalized preset capture options used by UI buttons and the clipboard tool.
  function normalizePresetCaptureOptions(options) {
    return root.PTB_SCHEMA && typeof root.PTB_SCHEMA.normalizePresetCaptureOptions === "function"
      ? root.PTB_SCHEMA.normalizePresetCaptureOptions(options)
      : { includeIntrinsic: false, includeVideoEffects: true };
  }

  // Return whether a built-in clip component should be captured as base media parameters.
  function isCapturablePresetIntrinsic(displayName, mediaType) {
    return mediaType === "video" && CAPTURABLE_PRESET_INTRINSICS.includes(displayName);
  }

  // Resolve a stored intrinsic component snapshot against the target clip's existing component chain.
  async function resolveIntrinsicPresetComponent(chain, snapshot) {
    const componentCount = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const expectedDisplayName = normalizeEffectLabel(snapshot.displayName);
    for (let index = 0; index < componentCount; index += 1) {
      const component = chain.getComponentAtIndex(index);
      const displayName = await readComponentDisplayName(component);
      if (normalizeEffectLabel(displayName) === expectedDisplayName && isCapturablePresetIntrinsic(displayName, snapshot.mediaType)) {
        return component;
      }
    }
    return null;
  }

  // Capture a selected clip's requested base parameters and/or effect stack for reuse by a toolbar button.
  async function captureSelectedStack(options) {
    const { app, items } = await getSelectedItems();
    const captureOptions = normalizePresetCaptureOptions(options);
    const item = items[0];
    const mediaType = isVideoItem(item) ? "video" : "audio";
    const itemName = typeof item.getName === "function" ? await item.getName() : "";
    const sourceTiming = await getItemTimingSnapshot(item);
    const chain = await item.getComponentChain();
    const componentCount = typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const components = [];
    for (let index = 0; index < componentCount; index += 1) {
      const component = chain.getComponentAtIndex(index);
      const displayName = typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
      const matchName = typeof component.getMatchName === "function" ? await component.getMatchName() : "";
      const isIntrinsic = INTRINSIC_COMPONENTS.includes(displayName);
      if (isIntrinsic && (!captureOptions.includeIntrinsic || !isCapturablePresetIntrinsic(displayName, mediaType))) {
        continue;
      }
      if (!isIntrinsic && !captureOptions.includeVideoEffects) {
        continue;
      }
      const paramCount = typeof component.getParamCount === "function" ? component.getParamCount() : 0;
      const params = [];
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        try {
          params.push(await captureParam(app, component.getParam(paramIndex), paramIndex, sourceTiming));
        } catch (error) {
          console.warn("Tool Bar skipped unsupported parameter:", error);
        }
      }
      components.push({ mediaType, matchName, displayName, intrinsic: isIntrinsic, params });
    }
    if (!components.length) {
      throw new Error(root.PTB_I18N.t("noStackCaptured"));
    }
    logBridge("info", "Captured Tool Bar preset.", {
      components: components.length,
      baseParameters: components.filter((component) => component.intrinsic).length,
      clipEffects: components.filter((component) => !component.intrinsic).length,
      params: components.reduce((count, component) => count + component.params.length, 0),
      keyframes: components.reduce((count, component) => count + component.params.reduce((total, param) => total + param.keyframes.length, 0), 0)
    });
    return root.PTB_SCHEMA.normalizeStack({
      sourceName: itemName,
      capturedAt: new Date().toISOString(),
      sourceStartSeconds: sourceTiming.startSeconds,
      sourceEndSeconds: sourceTiming.endSeconds,
      sourceInPointSeconds: sourceTiming.inPointSeconds,
      sourceOutPointSeconds: sourceTiming.outPointSeconds,
      sourceDurationSeconds: sourceTiming.durationSeconds,
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
