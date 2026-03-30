import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";

export function registerInDesignTools(server: McpServer, registry: AdapterRegistry): void {
  server.tool(
    "indesign_get_status",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("indesign", forceRefresh ?? false))
  );

  server.tool("indesign_list_supported_operations", {}, async (_args) => {
    const status = await registry.getStatus("indesign");
    return toToolResult({
      appId: "indesign",
      supportedOperations: [...status.supportedOperations]
    });
  });
}
