#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./core/config.js";
import { StderrLogger } from "./core/logger.js";
import { ensureDirectory } from "./core/tempfiles.js";
import { AdapterRegistry } from "./server/registry.js";
import { createMcpServer } from "./server/mcp.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await ensureDirectory(config.tempRoot);

  const logger = new StderrLogger(config.logLevel);
  const registry = new AdapterRegistry(config, logger);
  const server = createMcpServer(config, registry, logger);
  const transport = new StdioServerTransport();

  logger.info("Starting adobe-desktop-mcp", {
    version: config.serverVersion
  });

  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
