(function (root) {
  "use strict";

  // Match native and AE-style Premiere effect ids commonly found inside .prfpset XML.
  const MATCH_NAME_PATTERN = /\b(?:AE|PR)\.[A-Za-z0-9_ .-]+/g;
  const PREMIERE_TICKS_PER_SECOND = 254016000000;

  // Test text for a match name without sharing RegExp global state.
  function containsMatchName(value) {
    return /\b(?:AE|PR)\.[A-Za-z0-9_ .-]+/.test(String(value || ""));
  }

  // Convert array-like browser collections into plain arrays for older UXP hosts.
  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  // Return a readable node label that works with XML tag names and attributes.
  function nodeLabel(node) {
    return String((node && (node.localName || node.nodeName)) || "").toLowerCase();
  }

  // Read an attribute by trying the common names used by Premiere XML-like exports.
  function readAttr(node, names) {
    if (!node || !node.attributes) {
      return "";
    }
    for (const name of names) {
      const value = node.getAttribute && node.getAttribute(name);
      if (value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }
    }
    const attrs = toArray(node.attributes);
    for (const attr of attrs) {
      if (names.some((name) => String(attr.name || "").toLowerCase() === name.toLowerCase()) && String(attr.value || "").trim()) {
        return String(attr.value).trim();
      }
    }
    return "";
  }

  // Extract short text from a node without including huge nested XML payloads.
  function shortText(node) {
    const text = String((node && node.textContent) || "").replace(/\s+/g, " ").trim();
    return text.length <= 180 ? text : "";
  }

  // Decode the tiny set of XML entities that appear in Premiere preset text.
  function decodeXmlText(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  // Return the first text content for a simple XML tag inside one block.
  function readTagText(block, tagName) {
    const match = String(block || "").match(new RegExp("<" + tagName + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tagName + ">", "i"));
    return match ? decodeXmlText(match[1].trim()) : "";
  }

  // Read one XML attribute from a tag snippet.
  function readTagAttr(tagText, attrName) {
    const match = String(tagText || "").match(new RegExp("\\b" + attrName + "=\"([^\"]*)\"", "i"));
    return match ? decodeXmlText(match[1]) : "";
  }

  // Try to parse primitive, point, and color values into Tool Bar's stack schema.
  function parseValue(value) {
    const text = String(value === undefined || value === null ? "" : value).trim();
    if (!text) {
      return { kind: "primitive", value: "" };
    }
    if (/^(true|false)$/i.test(text)) {
      return { kind: "primitive", value: /^true$/i.test(text) };
    }
    if (/^-?\d+(?:\.\d*)?\s*,\s*-?\d+(?:\.\d*)?$/.test(text)) {
      const pointParts = text.split(",");
      return {
        kind: "point",
        x: Number(pointParts[0]) || 0,
        y: Number(pointParts[1]) || 0
      };
    }
    const numbers = text.match(/-?\d+(?:[.,]\d+)?/g);
    if (numbers && numbers.length >= 3 && /color|rgba|rgb/i.test(text)) {
      return {
        kind: "color",
        red: Number(numbers[0].replace(",", ".")) || 0,
        green: Number(numbers[1].replace(",", ".")) || 0,
        blue: Number(numbers[2].replace(",", ".")) || 0,
        alpha: numbers[3] !== undefined ? Number(numbers[3].replace(",", ".")) || 1 : 1
      };
    }
    if (numbers && numbers.length === 2 && /[,;\s]/.test(text)) {
      return {
        kind: "point",
        x: Number(numbers[0].replace(",", ".")) || 0,
        y: Number(numbers[1].replace(",", ".")) || 0
      };
    }
    if (/^-?\d+(?:[.,]\d*)?$/.test(text)) {
      return { kind: "primitive", value: Number(numbers[0].replace(",", ".")) };
    }
    return { kind: "primitive", value: text };
  }

  // Convert Premiere tick strings to seconds while preserving relative preset timing.
  function ticksToSeconds(ticks, anchorTicks) {
    const parsed = Number(ticks);
    const anchor = Number(anchorTicks);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    const relativeTicks = Number.isFinite(anchor) ? parsed - anchor : parsed;
    return relativeTicks / PREMIERE_TICKS_PER_SECOND;
  }

  // Parse Premiere's compact keyframe list: time,value,flags...;time,value,flags...;
  function parseCompactKeyframes(text, anchorTicks) {
    return String(text || "").split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const parts = entry.split(",");
      const seconds = ticksToSeconds(parts[0], anchorTicks);
      return {
        ticks: String(parts[0] || "0"),
        seconds,
        relativeSeconds: seconds,
        temporalInterpolation: null,
        value: parseValue(parts[1])
      };
    });
  }

  // Find any match names embedded in one node's attributes or text.
  function extractMatchNames(node) {
    const haystacks = [shortText(node)];
    toArray(node && node.attributes).forEach((attr) => haystacks.push(String(attr.value || "")));
    return haystacks.join(" ").match(MATCH_NAME_PATTERN) || [];
  }

  // Walk upward to find the effect-like node that owns a detected match name.
  function findComponentNode(node) {
    let current = node;
    let depth = 0;
    while (current && depth < 6) {
      const label = nodeLabel(current);
      if (/component|effect|filter|presetitem|item/.test(label)) {
        return current;
      }
      current = current.parentNode;
      depth += 1;
    }
    return node && node.parentNode ? node.parentNode : node;
  }

  // Guess an effect display name from nearby attributes or child text.
  function readComponentDisplayName(node, matchName) {
    const attrName = readAttr(node, ["displayName", "name", "Name", "effectName", "EffectName"]);
    if (attrName && !containsMatchName(attrName)) {
      return attrName;
    }
    const children = toArray(node && node.children);
    for (const child of children) {
      if (/display|name/.test(nodeLabel(child))) {
        const value = shortText(child);
        if (value && !containsMatchName(value)) {
          return value;
        }
      }
    }
    return String(matchName || "Component").replace(/^(AE|PR)\./, "").replace(/^ADBE\s+/i, "");
  }

  // Detect whether an XML node looks like an effect parameter or property.
  function isParamNode(node) {
    const label = nodeLabel(node);
    if (/param|property|prop/.test(label)) {
      return true;
    }
    return Boolean(readAttr(node, ["parameterID", "parameterId", "paramID", "id"]) && readAttr(node, ["displayName", "name", "Name"]));
  }

  // Pull a raw value from the most common parameter value locations.
  function readRawValue(node) {
    const attrValue = readAttr(node, ["value", "Value", "currentValue", "defaultValue"]);
    if (attrValue) {
      return attrValue;
    }
    const children = toArray(node && node.children);
    for (const child of children) {
      if (/value|val/.test(nodeLabel(child))) {
        const text = shortText(child);
        if (text) {
          return text;
        }
      }
    }
    return shortText(node);
  }

  // Convert keyframe-ish XML nodes into Tool Bar keyframe snapshots.
  function parseKeyframes(paramNode) {
    const nodes = toArray(paramNode && paramNode.getElementsByTagName ? paramNode.getElementsByTagName("*") : [])
      .filter((node) => /keyframe|key/.test(nodeLabel(node)));
    return nodes.map((node) => {
      const rawSeconds = readAttr(node, ["seconds", "second", "time", "Time"]);
      const rawTicks = readAttr(node, ["ticks", "Ticks"]);
      const seconds = rawSeconds ? Number(String(rawSeconds).replace(",", ".")) || 0 : 0;
      return {
        ticks: rawTicks || "0",
        seconds,
        relativeSeconds: seconds,
        temporalInterpolation: null,
        value: parseValue(readRawValue(node))
      };
    }).filter((keyframe, index, list) => index === list.findIndex((item) => item.seconds === keyframe.seconds && JSON.stringify(item.value) === JSON.stringify(keyframe.value)));
  }

  // Convert effect-like XML descendants into normalized parameter snapshots.
  function parseParams(componentNode) {
    const paramNodes = toArray(componentNode && componentNode.getElementsByTagName ? componentNode.getElementsByTagName("*") : [])
      .filter(isParamNode)
      .slice(0, 500);
    return paramNodes.map((node, index) => {
      const keyframes = parseKeyframes(node);
      const value = parseValue(readRawValue(node));
      return {
        index,
        displayName: readAttr(node, ["displayName", "name", "Name"]) || "Param " + (index + 1),
        parameterId: readAttr(node, ["parameterID", "parameterId", "paramID", "id"]),
        timeVarying: keyframes.length > 0,
        startValue: value,
        startTemporalInterpolation: null,
        keyframes
      };
    }).filter((param) => param.displayName || param.keyframes.length || param.startValue.value !== "");
  }

  // Extract a preset name from XML metadata, falling back to the file name.
  function readPresetName(doc, fileName) {
    const rootNode = doc && doc.documentElement;
    const attrName = readAttr(rootNode, ["name", "Name", "displayName"]);
    if (attrName) {
      return attrName;
    }
    const nameNode = toArray(doc.getElementsByTagName("*")).find((node) => /^name$/i.test(nodeLabel(node)));
    const textName = shortText(nameNode);
    return textName || String(fileName || "Imported Preset").replace(/\.prfpset$/i, "");
  }

  // Parse a .prfpset XML string into Tool Bar's captured-stack structure.
  function parsePrfpsetText(xmlText, fileName) {
    if (!xmlText) {
      throw new Error("Empty .prfpset file.");
    }
    if (typeof DOMParser !== "function") {
      return parsePremierePresetText(xmlText, fileName);
    }
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const parseError = doc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error("Invalid .prfpset XML: " + shortText(parseError));
    }
    const nodes = toArray(doc.getElementsByTagName("*"));
    const componentMap = {};
    nodes.forEach((node) => {
      extractMatchNames(node).forEach((matchName) => {
        const componentNode = findComponentNode(node);
        const key = matchName + "::" + nodes.indexOf(componentNode);
        if (!componentMap[key]) {
          componentMap[key] = {
            mediaType: "video",
            matchName,
            displayName: readComponentDisplayName(componentNode, matchName),
            params: parseParams(componentNode)
          };
        }
      });
    });
    const components = Object.keys(componentMap).map((key) => componentMap[key]);
    const stack = root.PTB_SCHEMA.normalizeStack({
      sourceName: readPresetName(doc, fileName),
      capturedAt: new Date().toISOString(),
      importSource: fileName || ".prfpset",
      sourceStartSeconds: 0,
      sourceEndSeconds: inferSourceEndSeconds(components),
      sourceDurationSeconds: inferSourceEndSeconds(components),
      components
    });
    return {
      stack,
      summary: {
        name: stack.sourceName,
        components: stack.components.length,
        params: stack.components.reduce((count, component) => count + component.params.length, 0),
        keyframes: stack.components.reduce((count, component) => count + component.params.reduce((total, param) => total + param.keyframes.length, 0), 0)
      }
    };
  }

  // Parse Premiere's .prfpset text directly when UXP does not expose DOMParser.
  function parsePremierePresetText(xmlText, fileName) {
    const text = String(xmlText || "");
    const presetName = readTagText(text.match(/<TreeItem\b[\s\S]*?<\/TreeItem>/i), "Name")
      || String(fileName || "Imported Preset").replace(/\.prfpset$/i, "");
    const filterBlocks = text.match(/<FilterPreset\b[\s\S]*?<\/FilterPreset>/gi) || [];
    const components = [];
    let maxSourceSeconds = 0;
    filterBlocks.forEach((filterBlock) => {
      const matchName = readTagText(filterBlock, "FilterMatchName");
      const componentRefTag = (filterBlock.match(/<Component\b[^>]*>/i) || [""])[0];
      const componentRef = readTagAttr(componentRefTag, "ObjectRef");
      const anchorTicks = readTagText(filterBlock, "AnchorInPoint");
      const sourceEndTicks = readTagText(filterBlock, "AnchorOutPoint");
      const componentBlock = findObjectBlock(text, componentRef);
      if (!matchName || !componentBlock) {
        return;
      }
      const displayName = readTagText(componentBlock, "DisplayName") || matchName;
      const params = parsePremiereParams(text, componentBlock, anchorTicks);
      components.push({
        mediaType: "video",
        matchName,
        displayName,
        params
      });
      maxSourceSeconds = Math.max(maxSourceSeconds, ticksToSeconds(sourceEndTicks, anchorTicks));
    });
    const inferredEnd = Math.max(maxSourceSeconds, inferSourceEndSeconds(components) || 0) || null;
    const stack = root.PTB_SCHEMA.normalizeStack({
      sourceName: presetName,
      capturedAt: new Date().toISOString(),
      importSource: fileName || ".prfpset",
      sourceStartSeconds: 0,
      sourceEndSeconds: inferredEnd,
      sourceDurationSeconds: inferredEnd,
      components
    });
    return {
      stack,
      summary: {
        name: stack.sourceName,
        components: stack.components.length,
        params: stack.components.reduce((count, component) => count + component.params.length, 0),
        keyframes: stack.components.reduce((count, component) => count + component.params.reduce((total, param) => total + param.keyframes.length, 0), 0)
      }
    };
  }

  // Find an XML object block by ObjectID and its closing tag.
  function findObjectBlock(xmlText, objectId) {
    if (!objectId) {
      return "";
    }
    const startMatch = new RegExp("<([A-Za-z0-9_]+)\\b[^>]*\\bObjectID=\"" + objectId + "\"[^>]*>", "i").exec(xmlText);
    if (!startMatch) {
      return "";
    }
    const tagName = startMatch[1];
    const endPattern = new RegExp("<\\/" + tagName + ">", "i");
    const afterStart = xmlText.slice(startMatch.index);
    const endMatch = endPattern.exec(afterStart);
    return endMatch ? afterStart.slice(0, endMatch.index + endMatch[0].length) : "";
  }

  // Parse component params in the same order Premiere stores them in the component chain.
  function parsePremiereParams(xmlText, componentBlock, anchorTicks) {
    const paramRefs = [];
    const paramPattern = /<Param\b[^>]*>/gi;
    let match = null;
    while ((match = paramPattern.exec(componentBlock))) {
      paramRefs.push({
        index: Number(readTagAttr(match[0], "Index")) || 0,
        objectRef: readTagAttr(match[0], "ObjectRef")
      });
    }
    return paramRefs.sort((left, right) => left.index - right.index).map((paramRef) => {
      const paramBlock = findObjectBlock(xmlText, paramRef.objectRef);
      const keyframes = parseCompactKeyframes(readTagText(paramBlock, "Keyframes"), anchorTicks);
      const currentValue = readTagText(paramBlock, "CurrentValue");
      return {
        index: paramRef.index,
        displayName: readTagText(paramBlock, "Name") || "Param " + (paramRef.index + 1),
        parameterId: readTagText(paramBlock, "ParameterID"),
        timeVarying: /^true$/i.test(readTagText(paramBlock, "IsTimeVarying")) || keyframes.length > 0,
        startValue: keyframes[0] ? keyframes[0].value : parseValue(currentValue),
        startTemporalInterpolation: null,
        keyframes
      };
    });
  }

  // Use the last parsed keyframe as a source duration hint for scale/anchor-out modes.
  function inferSourceEndSeconds(components) {
    let maxSeconds = 0;
    components.forEach((component) => {
      component.params.forEach((param) => {
        param.keyframes.forEach((keyframe) => {
          maxSeconds = Math.max(maxSeconds, Number(keyframe.relativeSeconds) || Number(keyframe.seconds) || 0);
        });
      });
    });
    return maxSeconds || null;
  }

  // Expose the importer separately so the UI can keep Premiere bridge code focused on Premiere APIs.
  root.PTB_PRESET_IMPORT = {
    parsePrfpsetText
  };
}(typeof window !== "undefined" ? window : globalThis));
