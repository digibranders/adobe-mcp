import { afterEach, describe, expect, it } from "vitest";
import { request } from "node:http";

import { StderrLogger } from "../core/logger.js";
import { PhotoshopPluginBridge } from "../adapters/photoshop/bridge.js";

const TOKEN = "test-integration-token";
const bridges: PhotoshopPluginBridge[] = [];
let nextPort = 49_200;

function createBridge(): { bridge: PhotoshopPluginBridge; port: number } {
  const port = nextPort++;
  const bridge = new PhotoshopPluginBridge(
    {
      enabled: true,
      executablePath: null,
      minimumVersion: null,
      pluginPort: port,
      pluginToken: TOKEN
    },
    new StderrLogger("error")
  );
  bridges.push(bridge);
  return { bridge, port };
}

function httpPost(
  port: number,
  path: string,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          try {
            resolve({
              statusCode: res.statusCode ?? 0,
              body: JSON.parse(data) as Record<string, unknown>
            });
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function httpGet(
  port: number,
  path: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET"
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          try {
            resolve({
              statusCode: res.statusCode ?? 0,
              body: JSON.parse(data) as Record<string, unknown>
            });
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

afterEach(async () => {
  while (bridges.length > 0) {
    const bridge = bridges.pop();
    if (bridge !== undefined) {
      await bridge.close();
    }
  }
});

describe("Photoshop HTTP Bridge Integration", () => {
  it("health endpoint returns ok without authentication", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpGet(port, "/photoshop-bridge/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects register request with invalid token", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/register", {
      token: "wrong-token",
      pluginName: "test"
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it("rejects poll request with invalid token", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/poll", {
      token: "wrong-token",
      sessionId: "fake"
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it("rejects result request with invalid token", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/result", {
      token: "wrong-token",
      sessionId: "fake",
      requestId: "fake",
      ok: true,
      result: {}
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it("completes register → poll → result round trip", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const registerRes = await httpPost(port, "/photoshop-bridge/register", {
      token: TOKEN,
      pluginName: "integration-test",
      pluginVersion: "1.0.0",
      photoshopVersion: "25.0.0",
      capabilities: ["list_documents"]
    });

    expect(registerRes.statusCode).toBe(200);
    expect(registerRes.body.ok).toBe(true);
    const sessionId = registerRes.body.sessionId as string;
    expect(typeof sessionId).toBe("string");

    const commandPromise = bridge.runCommand("list_documents", {}, 10_000);

    const pollRes = await httpPost(port, "/photoshop-bridge/poll", {
      token: TOKEN,
      sessionId
    });

    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.body.ok).toBe(true);
    const command = pollRes.body.command as Record<string, unknown>;
    expect(command.command).toBe("list_documents");
    const requestId = command.requestId as string;

    const resultRes = await httpPost(port, "/photoshop-bridge/result", {
      token: TOKEN,
      sessionId,
      requestId,
      ok: true,
      result: { documents: [] }
    });

    expect(resultRes.statusCode).toBe(200);
    expect(resultRes.body.ok).toBe(true);

    const commandResult = await commandPromise;
    expect(commandResult).toEqual({ documents: [] });
  });

  it("rejects poll with unknown session id", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/poll", {
      token: TOKEN,
      sessionId: "nonexistent-session"
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it("returns 404 for unknown paths", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpGet(port, "/photoshop-bridge/unknown");

    expect(res.statusCode).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
