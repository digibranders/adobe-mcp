import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";

export function registerPhotoshopTools(server: McpServer, registry: AdapterRegistry): void {
  server.tool(
    "photoshop_get_status",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("photoshop", forceRefresh ?? false))
  );

  server.tool("photoshop_list_supported_operations", {}, async (_args) => {
    const status = await registry.getStatus("photoshop");
    return toToolResult({
      appId: "photoshop",
      supportedOperations: [...status.supportedOperations]
    });
  });
}
