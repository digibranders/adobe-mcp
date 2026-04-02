import { afterEach, describe, expect, it } from "vitest";
import { request } from "node:http";

import { StderrLogger } from "../core/logger.js";
import { PhotoshopPluginBridge, _isAllowedOrigin, _compareSemver } from "../adapters/photoshop/bridge.js";

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
  it("health endpoint returns minimal info without authentication", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpGet(port, "/photoshop-bridge/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.connected).toBe(false);
    expect(res.body.bridgeVersion).toBe("0.1.0");
    // Should NOT expose sensitive fields
    expect(res.body.status).toBeUndefined();
  });

  it("rejects register request with invalid token with 401", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/register", {
      token: "wrong-token",
      pluginName: "test"
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("rejects poll request with invalid token with 401", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/poll", {
      token: "wrong-token",
      sessionId: "fake"
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("rejects result request with invalid token with 401", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/result", {
      token: "wrong-token",
      sessionId: "fake",
      requestId: "fake",
      ok: true,
      result: {}
    });

    expect(res.statusCode).toBe(401);
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

  it("rejects poll with unknown session id with 404", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/poll", {
      token: TOKEN,
      sessionId: "nonexistent-session"
    });

    expect(res.statusCode).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("returns 404 for unknown paths", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpGet(port, "/photoshop-bridge/unknown");

    expect(res.statusCode).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("rejects outdated plugin version with 400", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/register", {
      token: TOKEN,
      pluginName: "test",
      pluginVersion: "0.1.0",
      photoshopVersion: "25.0.0",
      capabilities: []
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(typeof res.body.error).toBe("string");
  });

  it("returns 400 for malformed JSON body", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    // Send malformed JSON
    const res = await new Promise<{ statusCode: number; body: Record<string, unknown> }>((resolve, reject) => {
      const payload = "not-valid-json{{{";
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/photoshop-bridge/register",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload)
          }
        },
        (innerRes) => {
          let data = "";
          innerRes.on("data", (chunk: Buffer) => {
            data += chunk.toString("utf8");
          });
          innerRes.on("end", () => {
            try {
              resolve({
                statusCode: innerRes.statusCode ?? 0,
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

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("registration response includes allowScriptExecution flag", async () => {
    const { bridge, port } = createBridge();
    await bridge.ensureStarted();

    const res = await httpPost(port, "/photoshop-bridge/register", {
      token: TOKEN,
      pluginName: "test",
      pluginVersion: "1.0.0",
      photoshopVersion: "25.0.0",
      capabilities: []
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.allowScriptExecution).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("accepts valid localhost origins", () => {
    expect(_isAllowedOrigin("http://127.0.0.1")).toBe(true);
    expect(_isAllowedOrigin("http://127.0.0.1:47123")).toBe(true);
    expect(_isAllowedOrigin("http://localhost")).toBe(true);
    expect(_isAllowedOrigin("http://localhost:3000")).toBe(true);
  });

  it("rejects spoofed origins with prefix matching", () => {
    expect(_isAllowedOrigin("http://127.0.0.1.evil.com")).toBe(false);
    expect(_isAllowedOrigin("http://localhost.evil.com")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(_isAllowedOrigin("https://127.0.0.1")).toBe(false);
    expect(_isAllowedOrigin("ftp://127.0.0.1")).toBe(false);
  });

  it("rejects malformed and empty strings", () => {
    expect(_isAllowedOrigin("")).toBe(false);
    expect(_isAllowedOrigin("not-a-url")).toBe(false);
    expect(_isAllowedOrigin("://127.0.0.1")).toBe(false);
  });

  it("rejects remote addresses", () => {
    expect(_isAllowedOrigin("http://192.168.1.1")).toBe(false);
    expect(_isAllowedOrigin("http://example.com")).toBe(false);
  });
});

describe("compareSemver", () => {
  it("compares standard semver correctly", () => {
    expect(_compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(_compareSemver("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(_compareSemver("0.3.0", "0.2.9")).toBeGreaterThan(0);
    expect(_compareSemver("0.2.0", "0.3.0")).toBeLessThan(0);
  });

  it("handles pre-release tags by stripping them", () => {
    expect(_compareSemver("1.0.0-beta", "1.0.0")).toBe(0);
    expect(_compareSemver("1.0.0-alpha.1", "1.0.0")).toBe(0);
    expect(_compareSemver("2.0.0-rc.1", "1.9.9")).toBeGreaterThan(0);
  });

  it("handles build metadata", () => {
    expect(_compareSemver("1.0.0+build123", "1.0.0")).toBe(0);
    expect(_compareSemver("1.0.0-beta+build", "1.0.0")).toBe(0);
  });

  it("handles missing segments", () => {
    expect(_compareSemver("1.0", "1.0.0")).toBe(0);
    expect(_compareSemver("1", "1.0.0")).toBe(0);
  });
});
