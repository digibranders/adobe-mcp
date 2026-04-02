const { entrypoints, storage } = require("uxp");
const { app, core, action } = require("photoshop");

const CONFIG_KEY = "adobe-desktop-mcp-photoshop-config";
const SESSION_ERROR_PATTERN = /unknown.*session/i;
const MAX_BACKOFF_MS = 30000;

let panelRoot = null;
let bridgeLoopState = {
  running: false,
  sessionId: null,
  timeoutHandle: null,
  backoffMs: 2000,
  allowScriptExecution: false
};

function defaultConfig() {
  return {
    bridgeUrl: "http://127.0.0.1:47123/photoshop-bridge",
    bridgeToken: ""
  };
}

function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      return defaultConfig();
    }
    const parsed = JSON.parse(raw);
    return {
      bridgeUrl: typeof parsed.bridgeUrl === "string" ? parsed.bridgeUrl : defaultConfig().bridgeUrl,
      bridgeToken: typeof parsed.bridgeToken === "string" ? parsed.bridgeToken : defaultConfig().bridgeToken
    };
  } catch (_error) {
    return defaultConfig();
  }
}

function writeConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function setStatus(message, extra) {
  if (!panelRoot) {
    return;
  }
  const target = panelRoot.querySelector("#statusText");
  if (!target) {
    return;
  }
  const text = extra ? `${message}\n${JSON.stringify(extra, null, 2)}` : message;
  target.textContent = text;
}

function setConnectionState(state) {
  if (!panelRoot) {
    return;
  }
  const indicator = panelRoot.querySelector("#connectionIndicator");
  const label = panelRoot.querySelector("#connectionLabel");
  if (!indicator || !label) {
    return;
  }

  indicator.className = `indicator ${state}`;
  switch (state) {
    case "connected":
      label.textContent = "Connected";
      break;
    case "connecting":
      label.textContent = "Connecting...";
      break;
    case "error":
      label.textContent = "Disconnected";
      break;
    default:
      label.textContent = "Idle";
  }
}

function getUiConfig() {
  if (!panelRoot) {
    return readConfig();
  }

  const bridgeUrl = panelRoot.querySelector("#bridgeUrl");
  const bridgeToken = panelRoot.querySelector("#bridgeToken");
  return {
    bridgeUrl: bridgeUrl && typeof bridgeUrl.value === "string" ? bridgeUrl.value.trim() : defaultConfig().bridgeUrl,
    bridgeToken: bridgeToken && typeof bridgeToken.value === "string" ? bridgeToken.value.trim() : defaultConfig().bridgeToken
  };
}

function syncUiWithConfig() {
  if (!panelRoot) {
    return;
  }
  const config = readConfig();
  const bridgeUrl = panelRoot.querySelector("#bridgeUrl");
  const bridgeToken = panelRoot.querySelector("#bridgeToken");
  if (bridgeUrl) {
    bridgeUrl.value = config.bridgeUrl;
  }
  if (bridgeToken) {
    bridgeToken.value = config.bridgeToken;
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Bridge request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function requireNumber(value, name) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric value for '${name}': ${String(value)}`);
  }
  return num;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`'${name}' is required and must be a non-empty string.`);
  }
  return value;
}

function fileUrlFromPath(path) {
  if (path.startsWith("file:")) {
    return path;
  }

  if (/^[A-Za-z]:\\/.test(path)) {
    return `file:/${path.replace(/\\/g, "/")}`;
  }

  return `file:${path}`;
}

function summarizeDocument(document) {
  return {
    id: document.id,
    title: document.title,
    width: Number(document.width),
    height: Number(document.height),
    resolution: Number(document.resolution),
    layerCount: document.layers.length,
    saved: document.saved
  };
}

function summarizeLayerDeep(layer) {
  const info = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    kind: String(layer.kind),
    opacity: typeof layer.opacity === "number" ? layer.opacity : null,
    blendMode: typeof layer.blendMode === "string" ? layer.blendMode : null,
    locked: Boolean(layer.locked)
  };

  try {
    if (layer.bounds) {
      info.bounds = {
        top: Number(layer.bounds.top),
        left: Number(layer.bounds.left),
        bottom: Number(layer.bounds.bottom),
        right: Number(layer.bounds.right),
        width: Number(layer.bounds.width),
        height: Number(layer.bounds.height)
      };
    }
  } catch (_e) {
    // bounds not available for this layer type
  }

  if (layer.layers && layer.layers.length > 0) {
    info.children = layer.layers.map(summarizeLayerDeep);
  }

  return info;
}

function findLayerById(layers, targetId) {
  for (const layer of layers) {
    if (layer.id === targetId) {
      return layer;
    }
    if (layer.layers && layer.layers.length > 0) {
      const found = findLayerById(layer.layers, targetId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

async function executeCommand(commandEnvelope) {
  const payload = commandEnvelope.payload || {};

  switch (commandEnvelope.command) {
    case "get_status":
      return {
        photoshopVersion: app.version,
        documents: app.documents.map(summarizeDocument)
      };

    case "list_documents":
      return {
        photoshopVersion: app.version,
        activeDocumentId: app.activeDocument ? app.activeDocument.id : null,
        documents: app.documents.map(summarizeDocument)
      };

    case "create_document":
      return await core.executeAsModal(async () => {
        const document = await app.createDocument({
          width: requireNumber(payload.width, "width"),
          height: requireNumber(payload.height, "height"),
          resolution: payload.resolution ? requireNumber(payload.resolution, "resolution") : 72,
          ...(typeof payload.name === "string" ? { name: payload.name } : {})
        });
        return {
          document: summarizeDocument(document)
        };
      }, { commandName: "Create Photoshop Document" });

    case "open_document":
      return await core.executeAsModal(async () => {
        const fs = storage.localFileSystem;
        const entry = await fs.getEntryWithUrl(fileUrlFromPath(String(payload.documentPath)));
        const document = await app.open(entry);
        return {
          document: summarizeDocument(document)
        };
      }, { commandName: "Open Photoshop Document" });

    case "inspect_active_document":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return {
        document: summarizeDocument(app.activeDocument),
        layers: app.activeDocument.layers.map(summarizeLayerDeep)
      };

    case "export_active_document":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const fs = storage.localFileSystem;
        const entry = await fs.createEntryWithUrl(fileUrlFromPath(String(payload.outputPath)), {
          overwrite: true
        });
        const doc = app.activeDocument;
        const format = String(payload.format);
        if (!doc.saveAs || typeof doc.saveAs !== "object") {
          throw new Error("Photoshop saveAs API is not available. Requires Photoshop 25.0 or later.");
        }
        if (format === "png") {
          if (typeof doc.saveAs.png !== "function") {
            throw new Error("doc.saveAs.png is not available in this Photoshop version.");
          }
          await doc.saveAs.png(entry, {}, true);
        } else if (format === "jpg") {
          if (typeof doc.saveAs.jpg !== "function") {
            throw new Error("doc.saveAs.jpg is not available in this Photoshop version.");
          }
          await doc.saveAs.jpg(entry, payload.quality ? { quality: Number(payload.quality) } : { quality: 12 }, true);
        } else if (format === "psd") {
          if (typeof doc.saveAs.psd !== "function") {
            throw new Error("doc.saveAs.psd is not available in this Photoshop version.");
          }
          await doc.saveAs.psd(entry, {}, false);
        } else {
          throw new Error(`Unsupported export format: ${format}`);
        }
        return {
          document: summarizeDocument(doc),
          outputPath: String(payload.outputPath),
          format
        };
      }, { commandName: "Export Photoshop Document" });

    case "add_text_layer":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const document = app.activeDocument;
        const textContents = String(payload.contents);
        const fontSize = payload.fontSize ? Number(payload.fontSize) : 24;
        const posX = payload.x !== undefined ? Number(payload.x) : 50;
        const posY = payload.y !== undefined ? Number(payload.y) : 50;

        await action.batchPlay([
          {
            _obj: "make",
            _target: [{ _ref: "textLayer" }],
            using: {
              _obj: "textLayer",
              textKey: textContents,
              textShape: [{
                _obj: "textShape",
                char: { _enum: "char", _value: "box" },
                bounds: {
                  _obj: "bounds",
                  top: { _unit: "pixelsUnit", _value: posY },
                  left: { _unit: "pixelsUnit", _value: posX },
                  bottom: { _unit: "pixelsUnit", _value: posY + 200 },
                  right: { _unit: "pixelsUnit", _value: posX + 400 }
                }
              }],
              textStyleRange: [{
                _obj: "textStyleRange",
                from: 0,
                to: textContents.length,
                textStyle: {
                  _obj: "textStyle",
                  size: { _unit: "pointsUnit", _value: fontSize }
                }
              }]
            }
          }
        ], {});

        const layer = document.activeLayers[0];
        if (typeof payload.name === "string" && layer) {
          layer.name = payload.name;
        }

        return {
          document: summarizeDocument(document),
          layer: layer
            ? {
                id: layer.id,
                name: layer.name
              }
            : null
        };
      }, { commandName: "Add Photoshop Text Layer" });

    case "run_script": {
      // Defense-in-depth: enforce server-side script execution policy at the plugin level.
      // This prevents direct HTTP-to-bridge bypass of the MCP server's allowScriptExecution gate.
      if (!bridgeLoopState.allowScriptExecution) {
        throw new Error("Script execution is disabled by the MCP server (ADOBE_MCP_ALLOW_SCRIPT_EXECUTION=false). Enable it on the server to use run_script.");
      }
      const source = String(payload.scriptSource || "");
      const MAX_SCRIPT_LENGTH = 1_000_000;
      if (source.length === 0) {
        throw new Error("scriptSource is required and must not be empty.");
      }
      if (source.length > MAX_SCRIPT_LENGTH) {
        throw new Error(`Script source exceeds maximum length (${MAX_SCRIPT_LENGTH} characters).`);
      }
      return await core.executeAsModal(async () => {
        const scriptInput = payload.input || {};
        const scriptFn = new Function("app", "action", "core", "storage", "input", source);
        const result = await scriptFn(app, action, core, storage, scriptInput);
        if (result === undefined || result === null) {
          return { result: null };
        }
        try {
          JSON.stringify(result);
          return { result };
        } catch (_e) {
          return { result: String(result) };
        }
      }, { commandName: "Run MCP Script" });
    }

    case "resize_image":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const doc = app.activeDocument;
        const resizeDesc = {
          _obj: "imageSize",
          constrainProportions: false
        };
        if (payload.width !== undefined) {
          resizeDesc.width = { _unit: "pixelsUnit", _value: requireNumber(payload.width, "width") };
        }
        if (payload.height !== undefined) {
          resizeDesc.height = { _unit: "pixelsUnit", _value: requireNumber(payload.height, "height") };
        }
        if (payload.resampleMethod) {
          resizeDesc.interfaceIconFrameDimmed = { _enum: "interpolationType", _value: String(payload.resampleMethod) };
        }
        await action.batchPlay([resizeDesc], {});
        return { document: summarizeDocument(doc) };
      }, { commandName: "Resize Photoshop Image" });

    case "crop_document":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const doc = app.activeDocument;
        await action.batchPlay([{
          _obj: "crop",
          to: {
            _obj: "rectangle",
            top: { _unit: "pixelsUnit", _value: requireNumber(payload.top, "top") },
            left: { _unit: "pixelsUnit", _value: requireNumber(payload.left, "left") },
            bottom: { _unit: "pixelsUnit", _value: requireNumber(payload.bottom, "bottom") },
            right: { _unit: "pixelsUnit", _value: requireNumber(payload.right, "right") }
          }
        }], {});
        return { document: summarizeDocument(doc) };
      }, { commandName: "Crop Photoshop Document" });

    case "duplicate_layer": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const targetLayer = findLayerById(app.activeDocument.layers, Number(payload.layerId));
      if (!targetLayer) {
        throw new Error(`Layer with id ${payload.layerId} not found.`);
      }
      return await core.executeAsModal(async () => {
        const dup = await targetLayer.duplicate();
        if (typeof payload.newName === "string") {
          dup.name = payload.newName;
        }
        return {
          document: summarizeDocument(app.activeDocument),
          layer: { id: dup.id, name: dup.name }
        };
      }, { commandName: "Duplicate Layer" });
    }

    case "delete_layer": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const delLayer = findLayerById(app.activeDocument.layers, Number(payload.layerId));
      if (!delLayer) {
        throw new Error(`Layer with id ${payload.layerId} not found.`);
      }
      return await core.executeAsModal(async () => {
        const layerName = delLayer.name;
        await delLayer.delete();
        return {
          document: summarizeDocument(app.activeDocument),
          deleted: { id: Number(payload.layerId), name: layerName }
        };
      }, { commandName: "Delete Layer" });
    }

    case "set_layer_properties": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const propLayer = findLayerById(app.activeDocument.layers, Number(payload.layerId));
      if (!propLayer) {
        throw new Error(`Layer with id ${payload.layerId} not found.`);
      }
      return await core.executeAsModal(async () => {
        if (payload.opacity !== undefined) {
          propLayer.opacity = Number(payload.opacity);
        }
        if (typeof payload.blendMode === "string") {
          propLayer.blendMode = payload.blendMode;
        }
        if (payload.visible !== undefined) {
          propLayer.visible = Boolean(payload.visible);
        }
        if (typeof payload.name === "string") {
          propLayer.name = payload.name;
        }
        return {
          document: summarizeDocument(app.activeDocument),
          layer: summarizeLayerDeep(propLayer)
        };
      }, { commandName: "Set Layer Properties" });
    }

    case "flatten_image":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        await app.activeDocument.flatten();
        return { document: summarizeDocument(app.activeDocument) };
      }, { commandName: "Flatten Image" });

    case "merge_visible":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        await app.activeDocument.mergeVisibleLayers();
        return { document: summarizeDocument(app.activeDocument) };
      }, { commandName: "Merge Visible Layers" });

    case "apply_adjustment":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const adj = String(payload.adjustment);
        let descriptor;

        if (adj === "brightnessContrast") {
          descriptor = {
            _obj: "brightnessEvent",
            brightness: payload.brightness !== undefined ? Number(payload.brightness) : 0,
            contrast: payload.contrast !== undefined ? Number(payload.contrast) : 0
          };
        } else if (adj === "hueSaturation") {
          descriptor = {
            _obj: "hueSaturation",
            adjustment: [{
              _obj: "hueSatAdjustmentV2",
              hue: payload.hue !== undefined ? Number(payload.hue) : 0,
              saturation: payload.saturation !== undefined ? Number(payload.saturation) : 0,
              lightness: payload.lightness !== undefined ? Number(payload.lightness) : 0
            }]
          };
        } else if (adj === "curves") {
          descriptor = {
            _obj: "curves",
            presetKind: { _enum: "presetKindType", _value: "presetKindDefault" }
          };
        } else if (adj === "levels") {
          descriptor = {
            _obj: "levels",
            presetKind: { _enum: "presetKindType", _value: "presetKindDefault" }
          };
        } else {
          throw new Error(`Unsupported adjustment type: ${adj}`);
        }

        await action.batchPlay([descriptor], {});
        return {
          document: summarizeDocument(app.activeDocument),
          adjustment: adj
        };
      }, { commandName: "Apply Adjustment" });

    case "run_action":
      return await core.executeAsModal(async () => {
        await action.batchPlay([{
          _obj: "play",
          _target: [{
            _ref: "action",
            _name: String(payload.actionName)
          }, {
            _ref: "actionSet",
            _name: String(payload.actionSet)
          }]
        }], {});
        return {
          actionName: String(payload.actionName),
          actionSet: String(payload.actionSet),
          executed: true
        };
      }, { commandName: "Run Photoshop Action" });

    case "add_shape_layer":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const shapeType = String(payload.shape);
        const top = Number(payload.top);
        const left = Number(payload.left);
        const width = Number(payload.width);
        const height = Number(payload.height);
        const fill = payload.fillColor || { red: 0, green: 0, blue: 0 };

        const shapeDesc = shapeType === "ellipse"
          ? {
              _obj: "ellipse",
              top: { _unit: "pixelsUnit", _value: top },
              left: { _unit: "pixelsUnit", _value: left },
              bottom: { _unit: "pixelsUnit", _value: top + height },
              right: { _unit: "pixelsUnit", _value: left + width }
            }
          : {
              _obj: "rectangle",
              top: { _unit: "pixelsUnit", _value: top },
              left: { _unit: "pixelsUnit", _value: left },
              bottom: { _unit: "pixelsUnit", _value: top + height },
              right: { _unit: "pixelsUnit", _value: left + width }
            };

        const makeDesc = {
          _obj: "make",
          _target: [{ _ref: "contentLayer" }],
          using: {
            _obj: "contentLayer",
            type: {
              _obj: "solidColorLayer",
              color: {
                _obj: "RGBColor",
                red: Number(fill.red),
                green: Number(fill.green),
                blue: Number(fill.blue)
              }
            },
            shape: shapeDesc
          }
        };

        if (payload.strokeColor) {
          makeDesc.using.strokeStyle = {
            _obj: "strokeStyle",
            strokeStyleContent: {
              _obj: "solidColorLayer",
              color: {
                _obj: "RGBColor",
                red: Number(payload.strokeColor.red),
                green: Number(payload.strokeColor.green),
                blue: Number(payload.strokeColor.blue)
              }
            },
            strokeStyleLineWidth: {
              _unit: "pixelsUnit",
              _value: payload.strokeWidth ? Number(payload.strokeWidth) : 1
            },
            strokeEnabled: true
          };
        }

        await action.batchPlay([makeDesc], {});

        const document = app.activeDocument;
        const layer = document.activeLayers[0];
        if (typeof payload.name === "string" && layer) {
          layer.name = payload.name;
        }

        return {
          document: summarizeDocument(document),
          layer: layer ? { id: layer.id, name: layer.name } : null
        };
      }, { commandName: "Add Shape Layer" });

    case "get_layer_info": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const infoLayer = findLayerById(app.activeDocument.layers, Number(payload.layerId));
      if (!infoLayer) {
        throw new Error(`Layer with id ${payload.layerId} not found.`);
      }
      const details = summarizeLayerDeep(infoLayer);
      try {
        details.isBackgroundLayer = Boolean(infoLayer.isBackgroundLayer);
      } catch (_e) { /* not available */ }
      try {
        details.isClippingMask = Boolean(infoLayer.isClippingMask);
      } catch (_e) { /* not available */ }
      try {
        if (infoLayer.smartObject) {
          details.smartObject = true;
        }
      } catch (_e) { /* not available */ }
      return {
        document: summarizeDocument(app.activeDocument),
        layer: details
      };
    }

    case "canvas_snapshot":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const fs = storage.localFileSystem;
        const doc = app.activeDocument;
        const outputPath = payload.outputPath
          ? String(payload.outputPath)
          : `${require("os").tmpdir()}/adobe-mcp-snapshot-${Date.now()}.png`;
        const maxDimension = payload.maxDimension ? Number(payload.maxDimension) : 1024;

        // Create a temp copy to resize for snapshot without modifying original
        const tempDoc = await doc.duplicate();
        try {
          const w = Number(tempDoc.width);
          const h = Number(tempDoc.height);
          const scale = Math.min(maxDimension / w, maxDimension / h, 1);
          if (scale < 1) {
            await action.batchPlay([{
              _obj: "imageSize",
              width: { _unit: "pixelsUnit", _value: Math.round(w * scale) },
              height: { _unit: "pixelsUnit", _value: Math.round(h * scale) },
              constrainProportions: true
            }], {});
          }

          const entry = await fs.createEntryWithUrl(fileUrlFromPath(outputPath), {
            overwrite: true
          });
          if (typeof tempDoc.saveAs.png === "function") {
            await tempDoc.saveAs.png(entry, {}, true);
          } else if (typeof tempDoc.saveAs.jpg === "function") {
            await tempDoc.saveAs.jpg(entry, { quality: 8 }, true);
          } else {
            throw new Error("Neither PNG nor JPG export is available.");
          }
        } finally {
          await tempDoc.closeWithoutSaving();
        }

        return {
          snapshotPath: outputPath,
          originalSize: { width: Number(doc.width), height: Number(doc.height) },
          document: summarizeDocument(doc)
        };
      }, { commandName: "Canvas Snapshot" });

    case "save_document":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const doc = app.activeDocument;
        if (payload.savePath) {
          const fs = storage.localFileSystem;
          const entry = await fs.createEntryWithUrl(fileUrlFromPath(String(payload.savePath)), {
            overwrite: true
          });
          const format = String(payload.format || "psd");
          if (format === "psd" && typeof doc.saveAs.psd === "function") {
            await doc.saveAs.psd(entry, {}, false);
          } else if (format === "png" && typeof doc.saveAs.png === "function") {
            await doc.saveAs.png(entry, {}, true);
          } else if (format === "jpg" && typeof doc.saveAs.jpg === "function") {
            await doc.saveAs.jpg(entry, { quality: payload.quality ? Number(payload.quality) : 12 }, true);
          } else {
            throw new Error(`Unsupported save format: ${format}`);
          }
        } else {
          await doc.save();
        }
        return { document: summarizeDocument(doc), saved: true };
      }, { commandName: "Save Document" });

    case "close_document": {
      const docId = payload.documentId !== undefined ? Number(payload.documentId) : null;
      const targetDoc = docId !== null
        ? app.documents.find((d) => d.id === docId)
        : app.activeDocument;
      if (!targetDoc) {
        throw new Error(docId !== null ? `Document with id ${docId} not found.` : "No active document.");
      }
      return await core.executeAsModal(async () => {
        const title = targetDoc.title;
        const saveBeforeClose = payload.save !== false;
        if (saveBeforeClose && !targetDoc.saved) {
          try {
            await targetDoc.save();
          } catch (_e) {
            // If save fails (e.g. never been saved), just close without saving
          }
        }
        await targetDoc.closeWithoutSaving();
        return { closed: true, title };
      }, { commandName: "Close Document" });
    }

    case "set_active_document": {
      const targetId = Number(payload.documentId);
      const targetDoc = app.documents.find((d) => d.id === targetId);
      if (!targetDoc) {
        throw new Error(`Document with id ${targetId} not found. Open documents: ${app.documents.map((d) => `${d.id}:${d.title}`).join(", ")}`);
      }
      return await core.executeAsModal(async () => {
        app.activeDocument = targetDoc;
        return { document: summarizeDocument(targetDoc) };
      }, { commandName: "Set Active Document" });
    }

    case "undo":
      return await core.executeAsModal(async () => {
        const steps = payload.steps ? Number(payload.steps) : 1;
        for (let i = 0; i < steps; i++) {
          await action.batchPlay([{ _obj: "undo" }], {});
        }
        return {
          undone: steps,
          document: app.activeDocument ? summarizeDocument(app.activeDocument) : null
        };
      }, { commandName: "Undo" });

    case "redo":
      return await core.executeAsModal(async () => {
        const steps = payload.steps ? Number(payload.steps) : 1;
        for (let i = 0; i < steps; i++) {
          await action.batchPlay([{ _obj: "redo" }], {});
        }
        return {
          redone: steps,
          document: app.activeDocument ? summarizeDocument(app.activeDocument) : null
        };
      }, { commandName: "Redo" });

    case "apply_filter":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const filterType = String(payload.filter);
        let descriptor;

        if (filterType === "gaussianBlur") {
          descriptor = {
            _obj: "gaussianBlur",
            radius: { _unit: "pixelsUnit", _value: payload.radius !== undefined ? Number(payload.radius) : 5.0 }
          };
        } else if (filterType === "motionBlur") {
          descriptor = {
            _obj: "motionBlur",
            angle: payload.angle !== undefined ? Number(payload.angle) : 0,
            distance: { _unit: "pixelsUnit", _value: payload.distance !== undefined ? Number(payload.distance) : 10 }
          };
        } else if (filterType === "sharpen") {
          descriptor = { _obj: "sharpen" };
        } else if (filterType === "unsharpMask") {
          descriptor = {
            _obj: "unsharpMask",
            amount: payload.amount !== undefined ? Number(payload.amount) : 100,
            radius: { _unit: "pixelsUnit", _value: payload.radius !== undefined ? Number(payload.radius) : 2.0 },
            threshold: payload.threshold !== undefined ? Number(payload.threshold) : 0
          };
        } else if (filterType === "addNoise") {
          descriptor = {
            _obj: "addNoise",
            noise: payload.amount !== undefined ? Number(payload.amount) : 25,
            distribution: { _enum: "distribution", _value: payload.distribution || "uniform" },
            monochromatic: Boolean(payload.monochromatic)
          };
        } else if (filterType === "medianNoise") {
          descriptor = {
            _obj: "median",
            radius: { _unit: "pixelsUnit", _value: payload.radius !== undefined ? Number(payload.radius) : 3 }
          };
        } else {
          throw new Error(`Unsupported filter: ${filterType}. Supported: gaussianBlur, motionBlur, sharpen, unsharpMask, addNoise, medianNoise`);
        }

        await action.batchPlay([descriptor], {});
        return {
          document: summarizeDocument(app.activeDocument),
          filter: filterType
        };
      }, { commandName: "Apply Filter" });

    case "select_all":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "channel", _property: "selection" }],
          to: { _enum: "ordinal", _value: "allEnum" }
        }], {});
        return { document: summarizeDocument(app.activeDocument), selected: "all" };
      }, { commandName: "Select All" });

    case "deselect":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "channel", _property: "selection" }],
          to: { _enum: "ordinal", _value: "none" }
        }], {});
        return { document: summarizeDocument(app.activeDocument), selected: "none" };
      }, { commandName: "Deselect" });

    case "select_color_range":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const fuzziness = payload.fuzziness !== undefined ? Number(payload.fuzziness) : 40;
        const color = payload.color || { red: 255, green: 0, blue: 0 };
        await action.batchPlay([{
          _obj: "colorRange",
          fuzziness,
          minimum: {
            _obj: "RGBColor",
            red: Number(color.red),
            green: Number(color.green),
            blue: Number(color.blue)
          },
          maximum: {
            _obj: "RGBColor",
            red: Number(color.red),
            green: Number(color.green),
            blue: Number(color.blue)
          }
        }], {});
        return {
          document: summarizeDocument(app.activeDocument),
          selected: "colorRange",
          fuzziness
        };
      }, { commandName: "Select Color Range" });

    case "transform_layer": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const txLayer = payload.layerId
        ? findLayerById(app.activeDocument.layers, Number(payload.layerId))
        : app.activeDocument.activeLayers[0];
      if (!txLayer) {
        throw new Error("No layer found to transform.");
      }
      return await core.executeAsModal(async () => {
        // Select the target layer
        app.activeDocument.activeLayers = [txLayer];

        const transformDesc = {
          _obj: "transform",
          _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
          freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" }
        };

        if (payload.offsetX !== undefined || payload.offsetY !== undefined) {
          transformDesc.offset = {
            _obj: "offset",
            horizontal: { _unit: "pixelsUnit", _value: payload.offsetX !== undefined ? Number(payload.offsetX) : 0 },
            vertical: { _unit: "pixelsUnit", _value: payload.offsetY !== undefined ? Number(payload.offsetY) : 0 }
          };
        }

        if (payload.scaleX !== undefined || payload.scaleY !== undefined) {
          transformDesc.width = { _unit: "percentUnit", _value: payload.scaleX !== undefined ? Number(payload.scaleX) : 100 };
          transformDesc.height = { _unit: "percentUnit", _value: payload.scaleY !== undefined ? Number(payload.scaleY) : 100 };
        }

        if (payload.angle !== undefined) {
          transformDesc.angle = { _unit: "angleUnit", _value: Number(payload.angle) };
        }

        await action.batchPlay([transformDesc], {});
        return {
          document: summarizeDocument(app.activeDocument),
          layer: summarizeLayerDeep(txLayer)
        };
      }, { commandName: "Transform Layer" });
    }

    case "fill_color":
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      return await core.executeAsModal(async () => {
        const color = payload.color || { red: 0, green: 0, blue: 0 };
        const opacity = payload.opacity !== undefined ? Number(payload.opacity) : 100;
        const mode = payload.blendMode || "normal";

        await action.batchPlay([{
          _obj: "fill",
          using: {
            _obj: "solidColorLayer",
            color: {
              _obj: "RGBColor",
              red: Number(color.red),
              green: Number(color.green),
              blue: Number(color.blue)
            }
          },
          opacity: { _unit: "percentUnit", _value: opacity },
          mode: { _enum: "blendMode", _value: mode }
        }], {});
        return { document: summarizeDocument(app.activeDocument), filled: true };
      }, { commandName: "Fill Color" });

    case "copy_layer_to_document": {
      if (!app.activeDocument) {
        throw new Error("No active Photoshop document.");
      }
      const srcLayer = findLayerById(app.activeDocument.layers, Number(payload.layerId));
      if (!srcLayer) {
        throw new Error(`Source layer with id ${payload.layerId} not found.`);
      }
      const destDocId = Number(payload.targetDocumentId);
      const destDoc = app.documents.find((d) => d.id === destDocId);
      if (!destDoc) {
        throw new Error(`Target document with id ${destDocId} not found.`);
      }
      return await core.executeAsModal(async () => {
        const dup = await srcLayer.duplicate(destDoc);
        return {
          sourceDocument: summarizeDocument(app.activeDocument),
          targetDocument: summarizeDocument(destDoc),
          copiedLayer: { id: dup.id, name: dup.name }
        };
      }, { commandName: "Copy Layer to Document" });
    }

    default:
      throw new Error(`Unsupported bridge command: ${commandEnvelope.command}`);
  }
}

async function registerWithBridge(config) {
  const response = await postJson(`${config.bridgeUrl}/register`, {
    token: config.bridgeToken,
    pluginName: "photoshop-uxp",
    pluginVersion: "0.3.0",
    photoshopVersion: app.version,
    capabilities: [
      "list_documents",
      "create_document",
      "open_document",
      "inspect_active_document",
      "export_active_document",
      "add_text_layer",
      "run_script",
      "resize_image",
      "crop_document",
      "duplicate_layer",
      "delete_layer",
      "set_layer_properties",
      "flatten_image",
      "merge_visible",
      "apply_adjustment",
      "run_action",
      "add_shape_layer",
      "get_layer_info",
      "canvas_snapshot",
      "save_document",
      "close_document",
      "set_active_document",
      "undo",
      "redo",
      "apply_filter",
      "select_all",
      "deselect",
      "select_color_range",
      "transform_layer",
      "fill_color",
      "copy_layer_to_document"
    ]
  });

  // Store server-side script execution policy for defense-in-depth enforcement.
  bridgeLoopState.allowScriptExecution = response.allowScriptExecution === true;

  return response.sessionId;
}

async function pollOnce(config) {
  const response = await postJson(`${config.bridgeUrl}/poll`, {
    token: config.bridgeToken,
    sessionId: bridgeLoopState.sessionId
  });

  const command = response.command;
  if (!command) {
    setStatus("Bridge connected. Waiting for MCP commands...");
    return;
  }

  try {
    setStatus(`Running command: ${command.command}`);
    const result = await executeCommand(command);
    await postJson(`${config.bridgeUrl}/result`, {
      token: config.bridgeToken,
      sessionId: bridgeLoopState.sessionId,
      requestId: command.requestId,
      ok: true,
      result
    });
    setStatus(`Completed command: ${command.command}`, result);
  } catch (error) {
    await postJson(`${config.bridgeUrl}/result`, {
      token: config.bridgeToken,
      sessionId: bridgeLoopState.sessionId,
      requestId: command.requestId,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    setStatus(`Command failed: ${command.command}`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runBridgeLoop() {
  let config = readConfig();

  while (bridgeLoopState.running) {
    try {
      // Register or re-register if needed
      if (!bridgeLoopState.sessionId) {
        setConnectionState("connecting");
        setStatus("Registering with MCP server...");
        config = readConfig();
        bridgeLoopState.sessionId = await registerWithBridge(config);
        bridgeLoopState.backoffMs = 2000; // Reset backoff on success
        setConnectionState("connected");
      }

      config = readConfig();
      await pollOnce(config);
      bridgeLoopState.backoffMs = 2000; // Reset backoff on successful poll
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Session expired or invalidated — re-register automatically
      if (SESSION_ERROR_PATTERN.test(errorMsg)) {
        setStatus("Session expired. Re-registering...");
        bridgeLoopState.sessionId = null;
        continue; // Skip backoff, re-register immediately
      }

      // Connection error — backoff and retry
      setConnectionState("error");
      setStatus(`Bridge error (retrying in ${Math.round(bridgeLoopState.backoffMs / 1000)}s)`, {
        error: errorMsg
      });

      await new Promise((resolve) => {
        bridgeLoopState.timeoutHandle = setTimeout(resolve, bridgeLoopState.backoffMs);
      });

      // Exponential backoff with cap
      bridgeLoopState.backoffMs = Math.min(bridgeLoopState.backoffMs * 2, MAX_BACKOFF_MS);
      bridgeLoopState.sessionId = null; // Force re-registration after error
    }
  }
}

async function startBridge() {
  if (bridgeLoopState.running) {
    return;
  }

  bridgeLoopState.running = true;
  bridgeLoopState.sessionId = null;
  bridgeLoopState.backoffMs = 2000;
  setConnectionState("connecting");
  setStatus("Connecting to adobe-desktop-mcp...");

  try {
    await runBridgeLoop();
  } catch (error) {
    bridgeLoopState.running = false;
    setConnectionState("error");
    setStatus("Bridge stopped with error", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function stopBridge() {
  bridgeLoopState.running = false;
  bridgeLoopState.sessionId = null;
  bridgeLoopState.backoffMs = 2000;
  if (bridgeLoopState.timeoutHandle) {
    clearTimeout(bridgeLoopState.timeoutHandle);
    bridgeLoopState.timeoutHandle = null;
  }
  setConnectionState("error");
  setStatus("Bridge stopped.");
}

function wireUi() {
  if (!panelRoot) {
    return;
  }

  syncUiWithConfig();

  const advToggle = panelRoot.querySelector("#advancedToggle");
  const advSection = panelRoot.querySelector("#advancedSection");
  if (advToggle && advSection) {
    advToggle.addEventListener("click", () => {
      const isHidden = advSection.style.display === "none";
      advSection.style.display = isHidden ? "flex" : "none";
      advToggle.textContent = isHidden ? "Hide Advanced" : "Show Advanced";
    });
  }

  const saveBtn = panelRoot.querySelector("#saveConfig");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const config = getUiConfig();
      writeConfig(config);
      setStatus("Configuration saved.", config);
    });
  }

  const stopBtn = panelRoot.querySelector("#stopBridge");
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopBridge();
    });
  }

  const startBtn = panelRoot.querySelector("#startBridge");
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      const config = getUiConfig();
      writeConfig(config);
      await startBridge();
    });
  }
}

entrypoints.setup({
  plugin: {
    create() {
      return undefined;
    },
    destroy() {
      stopBridge();
    }
  },
  panels: {
    "adobe-desktop-mcp-panel": {
      show(event) {
        panelRoot = event.node;
        wireUi();
        setStatus("Auto-connecting to MCP server...");
        // Auto-start the bridge after a short delay to let the UI render
        setTimeout(() => {
          startBridge();
        }, 500);
      },
      hide() {
        return undefined;
      }
    }
  }
});
