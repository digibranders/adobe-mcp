const { entrypoints, storage } = require("uxp");
const { app, core } = require("photoshop");

const CONFIG_KEY = "adobe-desktop-mcp-photoshop-config";

let panelRoot = null;
let bridgeLoopState = {
  running: false,
  sessionId: null,
  timeoutHandle: null
};

function defaultConfig() {
  return {
    bridgeUrl: "http://127.0.0.1:47123/photoshop-bridge",
    bridgeToken: "adobe-mcp-dev-token"
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
          width: Number(payload.width),
          height: Number(payload.height),
          resolution: payload.resolution ? Number(payload.resolution) : 72,
          ...(typeof payload.name === "string" ? { name: payload.name } : {})
        });
        return {
          document: summarizeDocument(document)
        };
      }, { commandName: "Create Photoshop Document" });

    case "open_document":
      return await core.executeAsModal(async () => {
        const document = await app.open(String(payload.documentPath));
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
        layers: app.activeDocument.layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          kind: String(layer.kind)
        }))
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
        if (format === "png") {
          await doc.saveAs.png(entry, {}, true);
        } else if (format === "jpg") {
          await doc.saveAs.jpg(entry, payload.quality ? { quality: Number(payload.quality) } : { quality: 12 }, true);
        } else if (format === "psd") {
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
        const layer = await document.createTextLayer({
          contents: String(payload.contents),
          ...(typeof payload.name === "string" ? { name: payload.name } : {}),
          ...(payload.fontSize ? { fontSize: Number(payload.fontSize) } : {}),
          ...(payload.x !== undefined && payload.y !== undefined
            ? { position: { x: Number(payload.x), y: Number(payload.y) } }
            : {})
        });
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

    default:
      throw new Error(`Unsupported bridge command: ${commandEnvelope.command}`);
  }
}

async function registerWithBridge(config) {
  const response = await postJson(`${config.bridgeUrl}/register`, {
    token: config.bridgeToken,
    pluginName: "photoshop-uxp",
    pluginVersion: "0.1.0",
    photoshopVersion: app.version,
    capabilities: [
      "list_documents",
      "create_document",
      "open_document",
      "inspect_active_document",
      "export_active_document",
      "add_text_layer"
    ]
  });

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
  const config = readConfig();
  if (!bridgeLoopState.sessionId) {
    bridgeLoopState.sessionId = await registerWithBridge(config);
  }

  while (bridgeLoopState.running) {
    try {
      await pollOnce(config);
    } catch (error) {
      setStatus("Bridge error", {
        error: error instanceof Error ? error.message : String(error)
      });
      await new Promise((resolve) => {
        bridgeLoopState.timeoutHandle = setTimeout(resolve, 2000);
      });
    }
  }
}

async function startBridge() {
  if (bridgeLoopState.running) {
    return;
  }

  bridgeLoopState.running = true;
  bridgeLoopState.sessionId = null;
  setStatus("Connecting to adobe-desktop-mcp...");

  try {
    await runBridgeLoop();
  } catch (error) {
    bridgeLoopState.running = false;
    setStatus("Bridge stopped with error", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function stopBridge() {
  bridgeLoopState.running = false;
  bridgeLoopState.sessionId = null;
  if (bridgeLoopState.timeoutHandle) {
    clearTimeout(bridgeLoopState.timeoutHandle);
    bridgeLoopState.timeoutHandle = null;
  }
  setStatus("Bridge stopped.");
}

function wireUi() {
  if (!panelRoot) {
    return;
  }

  syncUiWithConfig();

  panelRoot.querySelector("#saveConfig").addEventListener("click", () => {
    const config = getUiConfig();
    writeConfig(config);
    setStatus("Configuration saved.", config);
  });

  panelRoot.querySelector("#startBridge").addEventListener("click", async () => {
    const config = getUiConfig();
    writeConfig(config);
    await startBridge();
  });

  panelRoot.querySelector("#stopBridge").addEventListener("click", () => {
    stopBridge();
  });
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
        setStatus("Panel ready. Click Start Bridge after the MCP server is running.");
      },
      hide() {
        return undefined;
      }
    }
  }
});
