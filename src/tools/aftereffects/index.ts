import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";

export function registerAfterEffectsTools(server: McpServer, registry: AdapterRegistry): void {
  server.tool(
    "aftereffects_get_status",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("aftereffects", forceRefresh ?? false))
  );

  server.tool("aftereffects_list_supported_operations", {}, async (_args) => {
    const status = await registry.getStatus("aftereffects");
    return toToolResult({
      appId: "aftereffects",
      supportedOperations: [...status.supportedOperations]
    });
  });
}
