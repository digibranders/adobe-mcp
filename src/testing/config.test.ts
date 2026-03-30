import { describe, expect, it } from "vitest";

import { loadConfig } from "../core/config.js";

describe("loadConfig", () => {
  it("uses defaults when no environment overrides are present", () => {
    const config = loadConfig({});

    expect(config.serverName).toBe("adobe-desktop-mcp");
    expect(config.apps.illustrator.enabled).toBe(true);
    expect(config.apps.premiere.pluginPort).toBeNull();
  });

  it("parses app-specific overrides", () => {
    const config = loadConfig({
      ADOBE_MCP_LOG_LEVEL: "debug",
      ADOBE_MCP_ILLUSTRATOR_PATH: "/Applications/Adobe Illustrator 2025",
      ADOBE_MCP_PHOTOSHOP_PLUGIN_PORT: "47123",
      ADOBE_MCP_PREMIERE_ENABLED: "false"
    });

    expect(config.logLevel).toBe("debug");
    expect(config.apps.illustrator.executablePath).toBe("/Applications/Adobe Illustrator 2025");
    expect(config.apps.photoshop.pluginPort).toBe(47123);
    expect(config.apps.premiere.enabled).toBe(false);
  });
});
