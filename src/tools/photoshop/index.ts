import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Logger, ServerConfig } from "../../core/types.js";
import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";
import { PhotoshopPluginBridge } from "../../adapters/photoshop/bridge.js";

const timeoutSchema = z.number().int().positive().max(300_000).optional();

function createBridge(config: ServerConfig, logger: Logger): PhotoshopPluginBridge {
  return new PhotoshopPluginBridge(config.apps.photoshop, logger);
}

async function getBridgeStatusPayload(bridge: PhotoshopPluginBridge) {
  try {
    await bridge.ensureStarted();
    return {
      bridge: bridge.getStatusPayload()
    };
  } catch (error) {
    return {
      bridge: bridge.getStatusPayload(),
      bridgeStartupError: error instanceof Error ? error.message : String(error)
    };
  }
}

export function registerPhotoshopTools(
  server: McpServer,
  registry: AdapterRegistry,
  config: ServerConfig,
  logger: Logger
): void {
  const bridge = createBridge(config, logger);

  server.tool(
    "photoshop_get_status",
    "Check Photoshop availability, bridge connection status, and detected version.",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => {
      const bridgeStatus = await getBridgeStatusPayload(bridge);
      return toToolResult({
        runtime: await registry.getStatus("photoshop", forceRefresh ?? false),
        ...bridgeStatus
      });
    }
  );

  server.tool("photoshop_list_supported_operations", "List all Photoshop operations supported by the bridge.", {}, async (_args) => {
    const status = await registry.getStatus("photoshop");
    return toToolResult({
      appId: "photoshop",
      supportedOperations: [...status.supportedOperations]
    });
  });

  server.tool("photoshop_bridge_status", "Get the HTTP bridge connection status and UXP plugin session info.", {}, async (_args) => {
    const bridgeStatus = await getBridgeStatusPayload(bridge);
    return toToolResult({
      appId: "photoshop",
      ...bridgeStatus,
      connectionConfig: bridge.getPublicConfig()
    });
  });

  server.tool(
    "photoshop_list_documents",
    "List all open documents in Photoshop with metadata (title, dimensions, resolution).",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("list_documents", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_create_document",
    "Create a new Photoshop document with specified dimensions, resolution, and name.",
    {
      width: z.number().positive(),
      height: z.number().positive(),
      name: z.string().min(1).optional(),
      resolution: z.number().positive().optional(),
      timeoutMs: timeoutSchema
    },
    async ({ width, height, name, resolution, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "create_document",
          {
            width,
            height,
            ...(name === undefined ? {} : { name }),
            ...(resolution === undefined ? {} : { resolution })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_open_document",
    "Open a document in Photoshop from a file path on disk.",
    {
      documentPath: z.string().min(1),
      timeoutMs: timeoutSchema
    },
    async ({ documentPath, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "open_document",
          {
            documentPath
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_inspect_active_document",
    "Get metadata and layer structure of the active Photoshop document.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("inspect_active_document", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_export_active_document",
    "Export the active Photoshop document to PNG, JPG, or PSD format.",
    {
      outputPath: z.string().min(1),
      format: z.enum(["png", "jpg", "psd"]),
      quality: z.number().int().min(1).max(12).optional(),
      timeoutMs: timeoutSchema
    },
    async ({ outputPath, format, quality, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "export_active_document",
          {
            outputPath,
            format,
            ...(quality === undefined ? {} : { quality })
          },
          timeoutMs ?? 120_000
        )
      })
  );

  server.tool(
    "photoshop_add_text_layer",
    "Add a text layer to the active Photoshop document with specified content, font size, and position.",
    {
      contents: z.string().min(1),
      name: z.string().min(1).optional(),
      fontSize: z.number().positive().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      timeoutMs: timeoutSchema
    },
    async ({ contents, name, fontSize, x, y, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "add_text_layer",
          {
            contents,
            ...(name === undefined ? {} : { name }),
            ...(fontSize === undefined ? {} : { fontSize }),
            ...(x === undefined ? {} : { x }),
            ...(y === undefined ? {} : { y })
          },
          timeoutMs ?? 60_000
        )
      })
  );
}
