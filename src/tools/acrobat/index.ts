import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";

export function registerAcrobatTools(server: McpServer, registry: AdapterRegistry): void {
  server.tool(
    "acrobat_get_status",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => toToolResult(await registry.getStatus("acrobat", forceRefresh ?? false))
  );

  server.tool("acrobat_list_supported_operations", {}, async (_args) => {
    const status = await registry.getStatus("acrobat");
    return toToolResult({
      appId: "acrobat",
      supportedOperations: [...status.supportedOperations]
    });
  });
}
