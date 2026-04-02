import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";

export function registerPremiereTools(server: McpServer, registry: AdapterRegistry): void {
  server.tool(
    "premiere_get_status",
    "Check Premiere Pro availability and detected version.",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("premiere", forceRefresh ?? false))
  );

  server.tool(
    "premiere_list_supported_operations",
    "List all Premiere Pro operations supported by the bridge.",
    {},
    async (_args) => {
      const status = await registry.getStatus("premiere");
      return toToolResult({
        appId: "premiere",
        supportedOperations: [...status.supportedOperations]
      });
    }
  );
}
