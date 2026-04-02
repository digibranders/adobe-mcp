import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

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

class TestPhotoshopPluginBridge extends PhotoshopPluginBridge {
  private failuresRemaining = 0;

  public setStartFailures(count: number): void {
    this.failuresRemaining = count;
  }

  protected override async startListeningServer(): Promise<Server> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("listen failed");
    }

    const fakeServer = {
      close(callback?: (error?: Error) => void) {
        callback?.();
        return fakeServer;
      }
    } as unknown as Server;

    return fakeServer;
  }

  public registerSessionForTests(sessionName: string): string {
    return this.registerSession({
      pluginName: sessionName,
      pluginVersion: "0.1.0",
      photoshopVersion: "25.0.0",
      capabilities: ["list_documents"]
    }).sessionId;
  }

  public async nextCommandForTests(sessionId: string) {
    return await this.nextCommand(sessionId);
  }

  public resolveCommandForTests(requestId: string, sessionId: string): void {
    this.resolveCommand(requestId, sessionId, {
      ok: true,
      result: {
        ok: true
      }
    });
  }
}

describe("PhotoshopPluginBridge", () => {
  it("reports default bridge configuration before startup", async () => {
    const bridge = new TestPhotoshopPluginBridge(
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
    const bridge = new TestPhotoshopPluginBridge(
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

  it("allows startup to be retried after a transient listen failure", async () => {
    const bridge = new TestPhotoshopPluginBridge(
      {
        enabled: true,
        executablePath: null,
        minimumVersion: null,
        pluginPort: 48125,
        pluginToken: "test-token"
      },
      new StderrLogger("error")
    );
    bridgeInstances.push(bridge);

    bridge.setStartFailures(1);

    await expect(bridge.ensureStarted()).rejects.toThrow("listen failed");
    expect(bridge.getStatusPayload().lastStartError).toBe("listen failed");

    await expect(bridge.ensureStarted()).resolves.toBeUndefined();
    expect(bridge.getStatus().listening).toBe(true);
    expect(bridge.getStatusPayload().lastStartError).toBeNull();
  });

  it("rejects pending commands when a new session registers", async () => {
    const bridge = new TestPhotoshopPluginBridge(
      {
        enabled: true,
        executablePath: null,
        minimumVersion: null,
        pluginPort: 48126,
        pluginToken: "test-token"
      },
      new StderrLogger("error")
    );
    bridgeInstances.push(bridge);

    await bridge.ensureStarted();

    const firstSessionId = bridge.registerSessionForTests("session-one");
    const pendingResult = bridge.runCommand("list_documents", {}, 5_000);

    const leasedToFirstSession = await bridge.nextCommandForTests(firstSessionId);
    expect(leasedToFirstSession?.command).toBe("list_documents");

    bridge.registerSessionForTests("session-two");

    await expect(pendingResult).rejects.toThrow(
      "Photoshop plugin session re-registered; pending command discarded."
    );
  });
});
