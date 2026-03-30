import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { adobeAppIdSchema } from "../core/schema.js";
import type { Logger, ServerConfig } from "../core/types.js";
import type { AdapterRegistry } from "./registry.js";
import { registerIllustratorTools } from "../tools/illustrator/index.js";
import { registerPhotoshopTools } from "../tools/photoshop/index.js";
import { registerInDesignTools } from "../tools/indesign/index.js";
import { registerAcrobatTools } from "../tools/acrobat/index.js";
import { registerAfterEffectsTools } from "../tools/aftereffects/index.js";
import { registerPremiereTools } from "../tools/premiere/index.js";
import { toToolResult } from "./toolResult.js";

export function createMcpServer(
  config: ServerConfig,
  registry: AdapterRegistry,
  logger: Logger
): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion
  });

  server.tool("adobe_desktop_health", "Get MCP server health info including name, version, and configuration.", {}, async (_args) => {
    return toToolResult({
      name: config.serverName,
      version: config.serverVersion,
      logLevel: config.logLevel,
      probeCacheTtlMs: config.probeCacheTtlMs
    });
  });

  server.tool(
    "adobe_desktop_get_app_status",
    "Get runtime status for a specific Adobe app (availability, version, bridge strategy).",
    {
      appId: adobeAppIdSchema,
      forceRefresh: z.boolean().optional()
    },
    async ({ appId, forceRefresh }) => toToolResult(await registry.getStatus(appId, forceRefresh ?? false))
  );

  server.tool(
    "adobe_desktop_list_apps",
    "List all Adobe apps with their runtime status and availability.",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) =>
      toToolResult({
        apps: [...(await registry.listStatuses(forceRefresh ?? false))]
      })
  );

  server.tool("adobe_desktop_get_capability_matrix", "Get the full capability matrix for all Adobe apps (automation surfaces, bridge strategies, feasibility).", {}, async (_args) => {
    return toToolResult({
      capabilityMatrix: registry.getCapabilityMatrix()
    });
  });

  registerIllustratorTools(server, registry, config, logger);
  registerPhotoshopTools(server, registry, config, logger);
  registerInDesignTools(server, registry);
  registerAcrobatTools(server, registry);
  registerAfterEffectsTools(server, registry);
  registerPremiereTools(server, registry);

  return server;
}
