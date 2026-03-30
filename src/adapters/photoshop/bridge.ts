import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import type { AppBridgeConfig, Logger } from "../../core/types.js";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type PhotoshopCommandName =
  | "get_status"
  | "list_documents"
  | "create_document"
  | "open_document"
  | "inspect_active_document"
  | "export_active_document"
  | "add_text_layer";

interface BridgeCommand {
  readonly requestId: string;
  readonly command: PhotoshopCommandName;
  readonly payload: JsonObject;
}

interface ResultEnvelope {
  readonly ok: boolean;
  readonly result?: JsonObject;
  readonly error?: {
    readonly message: string;
    readonly stack?: string;
  };
}

interface PendingCommand {
  readonly command: BridgeCommand;
  readonly resolve: (result: JsonObject) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface PluginSession {
  readonly sessionId: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly photoshopVersion: string | null;
  readonly capabilities: readonly string[];
  lastSeenAt: number;
}

interface PollWaiter {
  readonly resolve: (command: BridgeCommand | null) => void;
  readonly timer: NodeJS.Timeout;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function json(statusCode: number, response: ServerResponse, payload: JsonObject): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function sessionToJson(session: PluginSession | null): JsonValue {
  if (session === null) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    pluginName: session.pluginName,
    pluginVersion: session.pluginVersion,
    photoshopVersion: session.photoshopVersion,
    capabilities: [...session.capabilities],
    lastSeenAt: session.lastSeenAt
  };
}

function commandToJson(command: BridgeCommand | null): JsonValue {
  if (command === null) {
    return null;
  }

  return {
    requestId: command.requestId,
    command: command.command,
    payload: command.payload
  };
}

export interface PhotoshopBridgeStatus {
  readonly listening: boolean;
  readonly port: number;
  readonly tokenConfigured: boolean;
  readonly connected: boolean;
  readonly activeSession: PluginSession | null;
  readonly pendingCommands: number;
  readonly bridgeUrl: string;
}

export class PhotoshopPluginBridge {
  private readonly port: number;
  private readonly token: string;
  private server: Server | null = null;
  private startPromise: Promise<void> | null = null;
  private readonly queue: PendingCommand[] = [];
  private readonly sessions = new Map<string, PluginSession>();
  private readonly waiters = new Map<string, PollWaiter>();

  public constructor(
    config: AppBridgeConfig,
    private readonly logger: Logger
  ) {
    this.port = config.pluginPort ?? 47_123;
    this.token = config.pluginToken ?? "adobe-mcp-dev-token";
  }

  public getPublicConfig(): { readonly port: number; readonly token: string } {
    return {
      port: this.port,
      token: this.token
    };
  }

  public async ensureStarted(): Promise<void> {
    if (this.server !== null) {
      return;
    }

    if (this.startPromise !== null) {
      await this.startPromise;
      return;
    }

    this.startPromise = new Promise<void>((resolve, reject) => {
      const server = createServer(async (request, response) => {
        try {
          await this.handleRequest(request, response);
        } catch (error) {
          this.logger.error("Photoshop bridge request failed", {
            error: error instanceof Error ? error.message : String(error)
          });
          json(500, response, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      server.on("error", (error) => {
        reject(error);
      });

      server.listen(this.port, "127.0.0.1", () => {
        this.server = server;
        this.logger.info("Photoshop bridge listening", {
          port: this.port
        });
        resolve();
      });
    });

    await this.startPromise;
  }

  public async close(): Promise<void> {
    if (this.server === null) {
      return;
    }

    const server = this.server;
    this.server = null;

    for (const pending of this.queue.splice(0, this.queue.length)) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Photoshop bridge closed before the command completed."));
    }

    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.waiters.clear();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  public getStatus(): PhotoshopBridgeStatus {
    const activeSession = this.getActiveSession();
    return {
      listening: this.server !== null,
      port: this.port,
      tokenConfigured: this.token.length > 0,
      connected: activeSession !== null,
      activeSession,
      pendingCommands: this.queue.length,
      bridgeUrl: `http://127.0.0.1:${this.port}/photoshop-bridge`
    };
  }

  public getStatusPayload(): JsonObject {
    const status = this.getStatus();
    return {
      listening: status.listening,
      port: status.port,
      tokenConfigured: status.tokenConfigured,
      connected: status.connected,
      activeSession: sessionToJson(status.activeSession),
      pendingCommands: status.pendingCommands,
      bridgeUrl: status.bridgeUrl
    };
  }

  public async runCommand(
    command: PhotoshopCommandName,
    payload: JsonObject,
    timeoutMs = 60_000
  ): Promise<JsonObject> {
    await this.ensureStarted();

    if (this.getActiveSession() === null) {
      throw new Error(
        "Photoshop plugin is not connected. Load plugins/photoshop-uxp in UXP Developer Tool and start the bridge from the panel."
      );
    }

    return await new Promise<JsonObject>((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.removePendingCommand(requestId);
        reject(new Error(`Photoshop command timed out: ${command}`));
      }, timeoutMs);

      const pending: PendingCommand = {
        command: {
          requestId,
          command,
          payload
        },
        resolve,
        reject,
        timer
      };

      this.queue.push(pending);
      this.flushWaiters();
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);

    if (url.pathname === "/photoshop-bridge/health" && method === "GET") {
      json(200, response, {
        ok: true,
        status: this.getStatusPayload()
      });
      return;
    }

    if (url.pathname === "/photoshop-bridge/register" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const session = this.registerSession(body);
      json(200, response, {
        ok: true,
        sessionId: session.sessionId,
        pollTimeoutMs: 25_000
      });
      return;
    }

    if (url.pathname === "/photoshop-bridge/poll" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const sessionId = asString(body.sessionId, "");
      const session = this.touchSession(sessionId);
      const command = await this.nextCommand(session.sessionId);
      json(200, response, {
        ok: true,
        sessionId: session.sessionId,
        command: commandToJson(command)
      });
      return;
    }

    if (url.pathname === "/photoshop-bridge/result" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const sessionId = asString(body.sessionId, "");
      this.touchSession(sessionId);
      this.resolveCommand(
        asString(body.requestId, ""),
        body.ok === true
          ? {
              ok: true,
              result: isJsonObject(body.result) ? body.result : {}
            }
          : {
              ok: false,
              error: {
                message: isJsonObject(body.error)
                  ? asString(body.error.message as JsonValue | undefined, "Unknown Photoshop plugin error")
                  : "Unknown Photoshop plugin error",
                ...(isJsonObject(body.error) &&
                typeof body.error.stack === "string"
                  ? { stack: body.error.stack }
                  : {})
              }
            }
      );
      json(200, response, { ok: true });
      return;
    }

    json(404, response, {
      ok: false,
      error: "Not found"
    });
  }

  private parseBody(body: string): JsonObject {
    if (body.trim() === "") {
      return {};
    }

    const parsed = JSON.parse(body) as unknown;
    if (!isJsonObject(parsed)) {
      throw new Error("Expected JSON object body.");
    }

    return parsed;
  }

  private assertAuthorized(body: JsonObject): void {
    if (asString(body.token, "") !== this.token) {
      throw new Error("Unauthorized Photoshop bridge request.");
    }
  }

  private registerSession(body: JsonObject): PluginSession {
    const sessionId = randomUUID();
    const session: PluginSession = {
      sessionId,
      pluginName: asString(body.pluginName, "photoshop-uxp"),
      pluginVersion: asString(body.pluginVersion, "0.0.0"),
      photoshopVersion:
        typeof body.photoshopVersion === "string" ? body.photoshopVersion : null,
      capabilities: asStringArray(body.capabilities),
      lastSeenAt: Date.now()
    };

    this.sessions.set(sessionId, session);
    this.logger.info("Photoshop plugin session registered", {
      sessionId,
      photoshopVersion: session.photoshopVersion
    });
    return session;
  }

  private touchSession(sessionId: string): PluginSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new Error("Unknown Photoshop plugin session.");
    }

    session.lastSeenAt = Date.now();
    return session;
  }

  private getActiveSession(): PluginSession | null {
    let active: PluginSession | null = null;
    const cutoff = Date.now() - 60_000;
    for (const session of this.sessions.values()) {
      if (session.lastSeenAt < cutoff) {
        continue;
      }

      if (active === null || session.lastSeenAt > active.lastSeenAt) {
        active = session;
      }
    }

    return active;
  }

  private async nextCommand(sessionId: string): Promise<BridgeCommand | null> {
    const pending = this.queue[0];
    if (pending !== undefined) {
      return pending.command;
    }

    return await new Promise<BridgeCommand | null>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(sessionId);
        resolve(null);
      }, 25_000);

      this.waiters.set(sessionId, {
        resolve,
        timer
      });
    });
  }

  private flushWaiters(): void {
    if (this.queue.length === 0) {
      return;
    }

    for (const [sessionId, waiter] of this.waiters.entries()) {
      clearTimeout(waiter.timer);
      this.waiters.delete(sessionId);
      const pending = this.queue[0];
      if (pending !== undefined) {
        waiter.resolve(pending.command);
      } else {
        waiter.resolve(null);
      }
      break;
    }
  }

  private resolveCommand(requestId: string, envelope: ResultEnvelope): void {
    const index = this.queue.findIndex((pending) => pending.command.requestId === requestId);
    if (index === -1) {
      throw new Error(`Unknown Photoshop request id: ${requestId}`);
    }

    const [pending] = this.queue.splice(index, 1);
    if (pending === undefined) {
      throw new Error(`Unable to resolve Photoshop request id: ${requestId}`);
    }
    clearTimeout(pending.timer);

    if (envelope.ok) {
      pending.resolve(envelope.result ?? {});
    } else {
      pending.reject(new Error(envelope.error?.message ?? "Unknown Photoshop bridge error."));
    }
  }

  private removePendingCommand(requestId: string): void {
    const index = this.queue.findIndex((pending) => pending.command.requestId === requestId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }
}
