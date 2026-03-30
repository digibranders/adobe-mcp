import { afterEach, describe, expect, it } from "vitest";

import { StderrLogger } from "../core/logger.js";
import { PhotoshopPluginBridge } from "../adapters/photoshop/bridge.js";

const bridgeInstances: PhotoshopPluginBridge[] = [];

afterEach(async () => {
  while (bridgeInstances.length > 0) {
    const bridge = bridgeInstances.pop();
    if (bridge !== undefined) {
      await bridge.close();
    }
  }
});

describe("PhotoshopPluginBridge", () => {
  it("reports default bridge configuration before startup", async () => {
    const bridge = new PhotoshopPluginBridge(
      {
        enabled: true,
        executablePath: null,
        minimumVersion: null,
        pluginPort: 48123,
        pluginToken: "test-token"
      },
      new StderrLogger("error")
    );
    bridgeInstances.push(bridge);

    const status = bridge.getStatus();

    expect(status.listening).toBe(false);
    expect(status.port).toBe(48123);
    expect(status.connected).toBe(false);
  });

  it("exposes connection config for the Photoshop panel", async () => {
    const bridge = new PhotoshopPluginBridge(
      {
        enabled: true,
        executablePath: null,
        minimumVersion: null,
        pluginPort: 48124,
        pluginToken: "test-token"
      },
      new StderrLogger("error")
    );
    bridgeInstances.push(bridge);

    const config = bridge.getPublicConfig();

    expect(config.port).toBe(48124);
    expect(config.token).toBe("test-token");
  });
});
