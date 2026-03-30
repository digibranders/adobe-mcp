import { readFile, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { basename, extname, join } from "node:path";

import { runProcess } from "../../core/process.js";
import { createSessionTempDirectory, removePath, writeJsonFile } from "../../core/tempfiles.js";
import type { AppBridgeConfig, Logger } from "../../core/types.js";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface IllustratorExecutionRequest {
  readonly scriptSource: string;
  readonly input: JsonObject;
  readonly timeoutMs: number;
  readonly preserveTempFiles?: boolean;
}

export interface IllustratorExecutionResult {
  readonly bridge: "applescript";
  readonly sessionDirectory: string | null;
  readonly result: JsonObject;
}

interface ExecutionPayload {
  readonly scriptSource: string;
  readonly input: JsonObject;
}

interface ScriptSuccessEnvelope {
  readonly ok: true;
  readonly result: JsonObject;
}

interface ScriptFailureEnvelope {
  readonly ok: false;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly line: number | null;
    readonly fileName: string | null;
  };
}

type ScriptEnvelope = ScriptSuccessEnvelope | ScriptFailureEnvelope;

function toJsStringLiteral(value: string): string {
  return `'${value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;
}

function createIllustratorWrapperScript(inputPath: string, resultPath: string): string {
  return `#target illustrator
(function () {
  var __mcpInputPath = ${toJsStringLiteral(inputPath)};
  var __mcpResultPath = ${toJsStringLiteral(resultPath)};

  function __mcpReadText(path) {
    var file = new File(path);
    if (!file.exists) {
      throw new Error("Input file does not exist: " + path);
    }
    file.encoding = "UTF-8";
    file.open("r");
    var text = file.read();
    file.close();
    return text;
  }

  function __mcpWriteText(path, text) {
    var file = new File(path);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(text);
    file.close();
  }

  function __mcpSerialize(value, stack) {
    if (value === null || value === undefined) {
      return null;
    }

    var type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
      return value;
    }

    if (value instanceof File || value instanceof Folder) {
      return {
        type: value instanceof File ? "File" : "Folder",
        fsName: value.fsName
      };
    }

    if (type !== "object") {
      return String(value);
    }

    if (!stack) {
      stack = [];
    }

    for (var i = 0; i < stack.length; i += 1) {
      if (stack[i] === value) {
        return "[Circular]";
      }
    }

    if (value.typename && value.name !== undefined) {
      return {
        typename: value.typename,
        name: value.name
      };
    }

    stack.push(value);
    try {
      if (value instanceof Array) {
        var list = [];
        for (var j = 0; j < value.length; j += 1) {
          list.push(__mcpSerialize(value[j], stack));
        }
        return list;
      }

      var result = {};
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          try {
            result[key] = __mcpSerialize(value[key], stack);
          } catch (_inner) {
            result[key] = "[Unserializable]";
          }
        }
      }
      return result;
    } finally {
      stack.pop();
    }
  }

  function __mcpWriteEnvelope(envelope) {
    __mcpWriteText(__mcpResultPath, JSON.stringify(__mcpSerialize(envelope, []), null, 2));
  }

  function __mcpGetDocumentPath(doc) {
    try {
      if (doc.fullName) {
        return doc.fullName.fsName;
      }
    } catch (_error) {}

    try {
      if (doc.path) {
        return doc.path.fsName;
      }
    } catch (_error2) {}

    return null;
  }

  function __mcpSummarizeDocument(doc) {
    return {
      name: doc.name,
      path: __mcpGetDocumentPath(doc),
      width: doc.width,
      height: doc.height,
      saved: doc.saved,
      artboards: doc.artboards.length,
      layers: doc.layers.length,
      pageItems: doc.pageItems.length,
      selectionCount: doc.selection ? doc.selection.length : 0
    };
  }

  function __mcpResolveDocument(input) {
    if (input.documentPath) {
      var file = new File(input.documentPath);
      if (!file.exists) {
        throw new Error("Document not found: " + input.documentPath);
      }
      return app.open(file);
    }

    if (app.documents.length === 0) {
      throw new Error("No active Illustrator document is open.");
    }

    return app.activeDocument;
  }

  function __mcpStripKnownExtension(path) {
    var known = [".png", ".jpg", ".jpeg", ".svg"];
    var lower = path.toLowerCase();
    for (var i = 0; i < known.length; i += 1) {
      var ext = known[i];
      if (lower.slice(lower.length - ext.length) === ext) {
        return path.slice(0, path.length - ext.length);
      }
    }
    return path;
  }

  function __mcpExportDocument(doc, options) {
    var format = options.format;
    var outputPath = options.outputPath;
    if (!outputPath) {
      throw new Error("outputPath is required for export.");
    }

    if (format === "png24") {
      var pngOptions = new ExportOptionsPNG24();
      pngOptions.antiAliasing = options.antiAliasing !== false;
      pngOptions.transparency = options.transparency !== false;
      pngOptions.artBoardClipping = options.artBoardClipping === true;
      if (options.horizontalScale) {
        pngOptions.horizontalScale = options.horizontalScale;
      }
      if (options.verticalScale) {
        pngOptions.verticalScale = options.verticalScale;
      }
      doc.exportFile(new File(__mcpStripKnownExtension(outputPath)), ExportType.PNG24, pngOptions);
      return { outputPath: outputPath, format: format };
    }

    if (format === "jpeg") {
      var jpegOptions = new ExportOptionsJPEG();
      jpegOptions.antiAliasing = options.antiAliasing !== false;
      jpegOptions.artBoardClipping = options.artBoardClipping === true;
      if (options.qualitySetting) {
        jpegOptions.qualitySetting = options.qualitySetting;
      }
      doc.exportFile(new File(__mcpStripKnownExtension(outputPath)), ExportType.JPEG, jpegOptions);
      return { outputPath: outputPath, format: format };
    }

    if (format === "svg") {
      var svgOptions = new ExportOptionsSVG();
      doc.exportFile(new File(__mcpStripKnownExtension(outputPath)), ExportType.SVG, svgOptions);
      return { outputPath: outputPath, format: format };
    }

    if (format === "pdf") {
      var pdfOptions = new PDFSaveOptions();
      doc.saveAs(new File(outputPath), pdfOptions);
      return { outputPath: outputPath, format: format };
    }

    if (format === "ai") {
      var aiOptions = new IllustratorSaveOptions();
      doc.saveAs(new File(outputPath), aiOptions);
      return { outputPath: outputPath, format: format };
    }

    if (format === "eps") {
      var epsOptions = new EPSSaveOptions();
      doc.saveAs(new File(outputPath), epsOptions);
      return { outputPath: outputPath, format: format };
    }

    throw new Error("Unsupported export format: " + format);
  }

  function __mcpCreateDocument(input) {
    var colorSpace = DocumentColorSpace.RGB;
    if (input.colorSpace === "CMYK") {
      colorSpace = DocumentColorSpace.CMYK;
    }
    var doc = app.documents.add(
      colorSpace,
      input.width || 800,
      input.height || 600,
      input.numArtboards || 1
    );
    if (input.title) {
      try {
        doc.name = input.title;
      } catch (_error) {}
    }
    return doc;
  }

  var __mcpPayload = JSON.parse(__mcpReadText(__mcpInputPath));
  var __mcpResult;

  function setResult(value) {
    __mcpResult = value;
    return value;
  }

  var helpers = {
    summarizeDocument: __mcpSummarizeDocument,
    resolveDocument: __mcpResolveDocument,
    exportDocument: __mcpExportDocument,
    createDocument: __mcpCreateDocument
  };

  try {
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var fn = eval("(function(input, setResult, helpers) {\\n" + __mcpPayload.scriptSource + "\\n})");
    var returned = fn(__mcpPayload.input, setResult, helpers);
    var finalResult = typeof __mcpResult !== "undefined" ? __mcpResult : returned;
    __mcpWriteEnvelope({
      ok: true,
      result: __mcpSerialize(finalResult, [])
    });
  } catch (error) {
    __mcpWriteEnvelope({
      ok: false,
      error: {
        name: error && error.name ? String(error.name) : "Error",
        message: error && error.message ? String(error.message) : String(error),
        line: error && error.line ? Number(error.line) : null,
        fileName: error && error.fileName ? String(error.fileName) : null
      }
    });
    throw error;
  }
})();
`;
}

function createAppleScriptRunner(scriptPath: string, appPath: string | null): string {
  const appTarget =
    appPath === null
      ? '"Adobe Illustrator"'
      : `(POSIX file ${toJsStringLiteral(appPath)})`;

  return `on run argv
  set jsFile to POSIX file ${toJsStringLiteral(scriptPath)}
  tell application ${appTarget}
    activate
    do javascript jsFile
  end tell
end run
`;
}

async function waitForResultFile(path: string, timeoutMs: number): Promise<ScriptEnvelope> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const text = await readFile(path, "utf8");
      return parseResultEnvelope(text);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error(`Timed out waiting for Illustrator result file: ${path}`);
}

function parseResultEnvelope(text: string): ScriptEnvelope {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || !("ok" in parsed) || typeof (parsed as Record<string, unknown>).ok !== "boolean") {
    throw new Error("Invalid Illustrator result envelope: missing or non-boolean 'ok' field.");
  }

  return parsed as ScriptEnvelope;
}

export class IllustratorBridge {
  public constructor(
    private readonly config: AppBridgeConfig,
    private readonly tempRoot: string,
    private readonly logger: Logger
  ) {}

  public async execute(request: IllustratorExecutionRequest): Promise<IllustratorExecutionResult> {
    const sessionDirectory = await createSessionTempDirectory(this.tempRoot);
    const payloadPath = join(sessionDirectory, "input.json");
    const resultPath = join(sessionDirectory, "result.json");
    const wrapperPath = join(sessionDirectory, "runner.jsx");

    const payload: ExecutionPayload = {
      scriptSource: request.scriptSource,
      input: request.input
    };

    try {
      await writeJsonFile(payloadPath, payload);
      await writeFile(wrapperPath, createIllustratorWrapperScript(payloadPath, resultPath), "utf8");

      const currentPlatform = platform();
      if (currentPlatform !== "darwin") {
        throw new Error("This phase of adobe-desktop-mcp supports Illustrator automation on macOS only.");
      }

      const runnerPath = join(sessionDirectory, "run.applescript");
      await writeFile(
        runnerPath,
        createAppleScriptRunner(wrapperPath, this.config.executablePath),
        "utf8"
      );
      const executionStart = Date.now();
      const processResult = await runProcess("osascript", [runnerPath], request.timeoutMs);
      if (processResult.exitCode !== 0) {
        this.logger.warn("Illustrator AppleScript runner exited non-zero", {
          exitCode: processResult.exitCode,
          stderr: processResult.stderr
        });
      }

      const elapsed = Date.now() - executionStart;
      const remainingMs = Math.max(request.timeoutMs - elapsed, 5_000);
      const envelope = await waitForResultFile(resultPath, remainingMs);
      if (!envelope.ok) {
        throw new Error(`${envelope.error.name}: ${envelope.error.message}`);
      }

      return {
        bridge: "applescript",
        sessionDirectory: request.preserveTempFiles === true ? sessionDirectory : null,
        result: envelope.result
      };
    } catch (error) {
      this.logger.error("Illustrator bridge execution failed", {
        error: error instanceof Error ? error.message : String(error),
        sessionDirectory,
        configuredPath: this.config.executablePath
      });
      throw error;
    } finally {
      if (request.preserveTempFiles !== true) {
        await removePath(sessionDirectory);
      }
    }
  }
}

export function createOpenDocumentScript(): string {
  return `
var doc = helpers.resolveDocument(input);
return {
  operation: "open_document",
  document: helpers.summarizeDocument(doc)
};
`;
}

export function createInspectDocumentScript(): string {
  return `
var doc = helpers.resolveDocument(input);
return {
  operation: "inspect_document",
  document: helpers.summarizeDocument(doc)
};
`;
}

export function createExportDocumentScript(): string {
  return `
var doc = helpers.resolveDocument(input);
var exported = helpers.exportDocument(doc, input);
return {
  operation: "export_document",
  document: helpers.summarizeDocument(doc),
  export: exported
};
`;
}

export function createCreateDocumentScript(): string {
  return `
var doc = helpers.createDocument(input);
return {
  operation: "create_document",
  document: helpers.summarizeDocument(doc)
};
`;
}

export function createGenericUserScript(source: string): string {
  return source;
}

export function normalizeExportPath(outputPath: string, format: string): string {
  if (["png24", "jpeg", "svg"].includes(format)) {
    const extension = extname(outputPath);
    if (extension.length > 0) {
      return outputPath.slice(0, -extension.length);
    }
  }

  return outputPath;
}

export function suggestResultFileName(documentPath: string | null, format: string): string {
  const base = documentPath === null ? "untitled" : basename(documentPath, extname(documentPath));
  const extension = format === "png24" ? "png" : format === "jpeg" ? "jpg" : format;
  return `${base}.${extension}`;
}
