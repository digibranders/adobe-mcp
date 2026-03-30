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

export function registerPhotoshopTools(
  server: McpServer,
  registry: AdapterRegistry,
  config: ServerConfig,
  logger: Logger
): void {
  const bridge = createBridge(config, logger);

  server.tool(
    "photoshop_get_status",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => {
      await bridge.ensureStarted();
      return toToolResult({
        runtime: await registry.getStatus("photoshop", forceRefresh ?? false),
        bridge: bridge.getStatus()
      });
    }
  );

  server.tool("photoshop_list_supported_operations", {}, async (_args) => {
    const status = await registry.getStatus("photoshop");
    return toToolResult({
      appId: "photoshop",
      supportedOperations: [...status.supportedOperations]
    });
  });

  server.tool("photoshop_bridge_status", {}, async (_args) => {
    await bridge.ensureStarted();
    return toToolResult({
      appId: "photoshop",
      bridge: bridge.getStatusPayload(),
      connectionConfig: bridge.getPublicConfig()
    });
  });

  server.tool(
    "photoshop_list_documents",
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
