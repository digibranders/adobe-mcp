import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Logger, ServerConfig } from "../../core/types.js";
import { jsonObjectSchema } from "../../core/json.js";
import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";
import {
  createCreateDocumentScript,
  createExportDocumentScript,
  createGenericUserScript,
  createInspectDocumentScript,
  createOpenDocumentScript,
  IllustratorBridge
} from "../../adapters/illustrator/bridge.js";

const illustratorTimeoutSchema = z.number().int().positive().max(300_000).optional();

function createBridge(config: ServerConfig, logger: Logger): IllustratorBridge {
  return new IllustratorBridge(config.apps.illustrator, config.tempRoot, logger);
}

export function registerIllustratorTools(
  server: McpServer,
  registry: AdapterRegistry,
  config: ServerConfig,
  logger: Logger
): void {
  const bridge = createBridge(config, logger);

  server.tool(
    "illustrator_get_status",
    "Check Illustrator availability, detected version, and bridge configuration.",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("illustrator", forceRefresh ?? false))
  );

  server.tool("illustrator_list_supported_operations", "List all Illustrator operations supported by the bridge.", {}, async (_args) => {
    const status = await registry.getStatus("illustrator");
    return toToolResult({
      appId: "illustrator",
      supportedOperations: [...status.supportedOperations]
    });
  });

  server.tool(
    "illustrator_create_document",
    "Create a new Illustrator document with optional dimensions, artboards, color space, and title.",
    {
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      numArtboards: z.number().int().positive().max(100).optional(),
      colorSpace: z.enum(["RGB", "CMYK"]).optional(),
      title: z.string().min(1).optional(),
      timeoutMs: illustratorTimeoutSchema,
      preserveTempFiles: z.boolean().optional()
    },
    async (args) => {
      const execution = await bridge.execute({
        scriptSource: createCreateDocumentScript(),
        input: {
          ...(args.width === undefined ? {} : { width: args.width }),
          ...(args.height === undefined ? {} : { height: args.height }),
          ...(args.numArtboards === undefined ? {} : { numArtboards: args.numArtboards }),
          ...(args.colorSpace === undefined ? {} : { colorSpace: args.colorSpace }),
          ...(args.title === undefined ? {} : { title: args.title })
        },
        timeoutMs: args.timeoutMs ?? 60_000,
        ...(args.preserveTempFiles === undefined
          ? {}
          : { preserveTempFiles: args.preserveTempFiles })
      });

      return toToolResult({
        appId: "illustrator",
        bridge: execution.bridge,
        ...execution.result
      });
    }
  );

  server.tool(
    "illustrator_open_document",
    "Open an Illustrator document from a file path on disk.",
    {
      documentPath: z.string().min(1),
      timeoutMs: illustratorTimeoutSchema,
      preserveTempFiles: z.boolean().optional()
    },
    async ({ documentPath, timeoutMs, preserveTempFiles }) => {
      const execution = await bridge.execute({
        scriptSource: createOpenDocumentScript(),
        input: {
          documentPath
        },
        timeoutMs: timeoutMs ?? 60_000,
        ...(preserveTempFiles === undefined ? {} : { preserveTempFiles })
      });

      return toToolResult({
        appId: "illustrator",
        bridge: execution.bridge,
        ...execution.result
      });
    }
  );

  server.tool(
    "illustrator_inspect_document",
    "Get metadata for an Illustrator document (name, dimensions, artboards, layers, page items).",
    {
      documentPath: z.string().min(1).optional(),
      timeoutMs: illustratorTimeoutSchema,
      preserveTempFiles: z.boolean().optional()
    },
    async ({ documentPath, timeoutMs, preserveTempFiles }) => {
      const execution = await bridge.execute({
        scriptSource: createInspectDocumentScript(),
        input: documentPath === undefined ? {} : { documentPath },
        timeoutMs: timeoutMs ?? 60_000,
        ...(preserveTempFiles === undefined ? {} : { preserveTempFiles })
      });

      return toToolResult({
        appId: "illustrator",
        bridge: execution.bridge,
        ...execution.result
      });
    }
  );

  server.tool(
    "illustrator_export_document",
    "Export an Illustrator document to PNG, JPEG, SVG, PDF, AI, or EPS format.",
    {
      documentPath: z.string().min(1).optional(),
      outputPath: z.string().min(1),
      format: z.enum(["png24", "jpeg", "svg", "pdf", "ai", "eps"]),
      artBoardClipping: z.boolean().optional(),
      antiAliasing: z.boolean().optional(),
      transparency: z.boolean().optional(),
      qualitySetting: z.number().int().min(0).max(100).optional(),
      horizontalScale: z.number().positive().optional(),
      verticalScale: z.number().positive().optional(),
      timeoutMs: illustratorTimeoutSchema,
      preserveTempFiles: z.boolean().optional()
    },
    async (args) => {
      const execution = await bridge.execute({
        scriptSource: createExportDocumentScript(),
        input: {
          outputPath: args.outputPath,
          format: args.format,
          ...(args.documentPath === undefined ? {} : { documentPath: args.documentPath }),
          ...(args.artBoardClipping === undefined ? {} : { artBoardClipping: args.artBoardClipping }),
          ...(args.antiAliasing === undefined ? {} : { antiAliasing: args.antiAliasing }),
          ...(args.transparency === undefined ? {} : { transparency: args.transparency }),
          ...(args.qualitySetting === undefined ? {} : { qualitySetting: args.qualitySetting }),
          ...(args.horizontalScale === undefined ? {} : { horizontalScale: args.horizontalScale }),
          ...(args.verticalScale === undefined ? {} : { verticalScale: args.verticalScale })
        },
        timeoutMs: args.timeoutMs ?? 120_000,
        ...(args.preserveTempFiles === undefined
          ? {}
          : { preserveTempFiles: args.preserveTempFiles })
      });

      return toToolResult({
        appId: "illustrator",
        bridge: execution.bridge,
        ...execution.result
      });
    }
  );

  server.tool(
    "illustrator_run_script",
    "Execute custom ExtendScript/JavaScript code inside Illustrator with access to the full DOM.",
    {
      scriptSource: z.string().min(1),
      input: jsonObjectSchema.optional(),
      timeoutMs: illustratorTimeoutSchema,
      preserveTempFiles: z.boolean().optional()
    },
    async ({ scriptSource, input, timeoutMs, preserveTempFiles }) => {
      const execution = await bridge.execute({
        scriptSource: createGenericUserScript(scriptSource),
        input: input ?? {},
        timeoutMs: timeoutMs ?? 120_000,
        ...(preserveTempFiles === undefined ? {} : { preserveTempFiles })
      });

      return toToolResult({
        appId: "illustrator",
        bridge: execution.bridge,
        result: execution.result
      });
    }
  );
}
