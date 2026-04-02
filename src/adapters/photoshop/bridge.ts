import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";

import type { AppBridgeConfig, Logger } from "../../core/types.js";
import type { JsonObject, JsonValue } from "../../core/json.js";

type PhotoshopCommandName =
  | "get_status"
  | "list_documents"
  | "create_document"
  | "open_document"
  | "inspect_active_document"
  | "export_active_document"
  | "add_text_layer"
  | "run_script"
  | "resize_image"
  | "crop_document"
  | "duplicate_layer"
  | "delete_layer"
  | "set_layer_properties"
  | "flatten_image"
  | "merge_visible"
  | "apply_adjustment"
  | "run_action"
  | "add_shape_layer"
  | "get_layer_info"
  | "canvas_snapshot"
  | "save_document"
  | "close_document"
  | "set_active_document"
  | "undo"
  | "redo"
  | "apply_filter"
  | "select_all"
  | "deselect"
  | "select_color_range"
  | "transform_layer"
  | "fill_color"
  | "copy_layer_to_document";

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
  leasedSessionId: string | null;
}

interface PluginSession {
  readonly sessionId: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly photoshopVersion: string | null;
  readonly capabilities: readonly string[];
  lastSeenAt: number;
  lastPollAt: number;
}

interface PollWaiter {
  readonly resolve: (command: BridgeCommand | null) => void;
  readonly timer: NodeJS.Timeout;
}

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const REGISTER_COOLDOWN_MS = 5_000; // 5 seconds between /register calls
const MIN_PLUGIN_VERSION = "0.3.0";
const SERVER_BRIDGE_VERSION = "0.1.0";
const MAX_WAITER_COUNT = 10;
const MIN_POLL_INTERVAL_MS = 500;

/** Typed HTTP error with status code for proper HTTP response mapping. */
class BridgeHttpError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "BridgeHttpError";
  }
}

class AuthorizationError extends BridgeHttpError {
  public constructor() {
    super("Unauthorized", 401);
    this.name = "AuthorizationError";
  }
}

class SessionNotFoundError extends BridgeHttpError {
  public constructor() {
    super("Unknown session", 404);
    this.name = "SessionNotFoundError";
  }
}

class BadRequestError extends BridgeHttpError {
  public constructor(message: string) {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

/** Strip pre-release and build metadata before comparing semver core. */
function stripSemverSuffix(version: string): string {
  const dashIndex = version.indexOf("-");
  const plusIndex = version.indexOf("+");
  let end = version.length;
  if (dashIndex !== -1) {
    end = Math.min(end, dashIndex);
  }
  if (plusIndex !== -1) {
    end = Math.min(end, plusIndex);
  }
  return version.slice(0, end);
}

function compareSemver(a: string, b: string): number {
  const pa = stripSemverSuffix(a).split(".").map((s) => Number.parseInt(s, 10));
  const pb = stripSemverSuffix(b).split(".").map((s) => Number.parseInt(s, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (Number.isNaN(va) || Number.isNaN(vb)) {
      continue;
    }
    if (va !== vb) {
      return va - vb;
    }
  }
  return 0;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > MAX_BODY_BYTES) {
        request.destroy();
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} byte limit.`));
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);
const DEFAULT_CORS_ORIGIN = "http://127.0.0.1";

/**
 * Validates an origin using exact hostname matching.
 * Rejects spoofed origins like "http://127.0.0.1.evil.com".
 */
function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && ALLOWED_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

function setCorsHeaders(response: ServerResponse, origin: string | undefined): void {
  const allowed = origin !== undefined && isAllowedOrigin(origin)
    ? origin
    : DEFAULT_CORS_ORIGIN;
  response.setHeader("access-control-allow-origin", allowed);
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-max-age", "86400");
}

function json(statusCode: number, response: ServerResponse, payload: JsonObject, origin?: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  setCorsHeaders(response, origin);
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
  readonly lastStartError: string | null;
}

export class PhotoshopPluginBridge {
  private readonly port: number;
  private readonly token: string;
  private server: Server | null = null;
  private startPromise: Promise<void> | null = null;
  private lastStartError: string | null = null;
  private readonly queue: PendingCommand[] = [];
  private readonly sessions = new Map<string, PluginSession>();
  private readonly waiters = new Map<string, PollWaiter>();
  private lastRegisterAt = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  public constructor(
    config: AppBridgeConfig,
    private readonly logger: Logger,
    private readonly allowScriptExecution: boolean = false
  ) {
    this.port = config.pluginPort ?? 47_123;
    this.token = config.pluginToken ?? randomUUID();
  }

  public getPublicConfig(): { readonly port: number; readonly tokenPrefix: string } {
    return {
      port: this.port,
      tokenPrefix: this.token.length > 8 ? `${this.token.slice(0, 8)}…` : "***"
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

    this.startPromise = this.startListeningServer()
      .then((server) => {
        this.server = server;
        this.lastStartError = null;
        this.cleanupInterval = setInterval(() => this.pruneStaleSessionsAndCommands(), 30_000);
      })
      .catch((error: unknown) => {
        this.server = null;
        this.startPromise = null;
        this.lastStartError = error instanceof Error ? error.message : String(error);
        throw error;
      });

    await this.startPromise;
  }

  public async close(): Promise<void> {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.server === null) {
      return;
    }

    const server = this.server;
    this.server = null;
    this.startPromise = null;

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
        if (error != null) {
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
      bridgeUrl: `http://127.0.0.1:${this.port}/photoshop-bridge`,
      lastStartError: this.lastStartError
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
      bridgeUrl: status.bridgeUrl,
      lastStartError: status.lastStartError
    };
  }

  protected async startListeningServer(): Promise<Server> {
    return await new Promise<Server>((resolve, reject) => {
      const server = createServer(async (request, response) => {
        try {
          await this.handleRequest(request, response);
        } catch (error) {
          const statusCode = error instanceof BridgeHttpError ? error.statusCode : 500;
          // Only log non-auth errors at error level; auth failures are expected traffic.
          if (error instanceof AuthorizationError) {
            this.logger.debug("Photoshop bridge auth rejected", {});
          } else {
            this.logger.error("Photoshop bridge request failed", {
              error: error instanceof Error ? error.message : String(error)
            });
          }
          // Sanitize: never leak internal details for auth errors.
          const message = error instanceof AuthorizationError
            ? "Unauthorized"
            : error instanceof Error
              ? error.message
              : String(error);
          json(statusCode, response, {
            ok: false,
            error: message
          }, request.headers.origin);
        }
      });

      server.on("error", (error) => {
        reject(error);
      });

      server.listen(this.port, "127.0.0.1", () => {
        this.logger.info("Photoshop bridge listening", {
          port: this.port,
          tokenPrefix: this.token.slice(0, 8)
        });
        resolve(server);
      });
    });
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

    const MAX_QUEUE_SIZE = 50;
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error(
        `Photoshop bridge command queue is full (${MAX_QUEUE_SIZE}). Is the plugin responding to commands?`
      );
    }

    return await new Promise<JsonObject>((resolve, reject) => {
      const requestId = randomUUID();

      // Audit log: track all bridge commands for security traceability.
      if (command === "run_script") {
        const scriptHash = typeof payload.scriptSource === "string"
          ? createHash("sha256").update(payload.scriptSource).digest("hex").slice(0, 16)
          : "n/a";
        this.logger.warn("Photoshop bridge: run_script command queued", {
          requestId,
          scriptHash
        });
      } else {
        this.logger.info("Photoshop bridge command queued", {
          requestId,
          command
        });
      }

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
        timer,
        leasedSessionId: null
      };

      this.queue.push(pending);
      this.flushWaiters();
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);
    const origin = request.headers.origin;

    if (method === "OPTIONS") {
      setCorsHeaders(response, request.headers.origin);
      response.statusCode = 204;
      response.end();
      return;
    }

    // Unauthenticated health endpoint returns only minimal info.
    if (url.pathname === "/photoshop-bridge/health" && method === "GET") {
      const activeSession = this.getActiveSession();
      json(200, response, {
        ok: true,
        connected: activeSession !== null,
        bridgeVersion: SERVER_BRIDGE_VERSION
      }, origin);
      return;
    }

    if (url.pathname === "/photoshop-bridge/register" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const now = Date.now();
      if (now - this.lastRegisterAt < REGISTER_COOLDOWN_MS) {
        json(429, response, {
          ok: false,
          error: "Registration rate limit exceeded. Try again in a few seconds."
        }, origin);
        return;
      }
      this.lastRegisterAt = now;
      const pluginVersion = asString(body.pluginVersion, "0.0.0");
      if (compareSemver(pluginVersion, MIN_PLUGIN_VERSION) < 0) {
        this.logger.warn("Photoshop plugin version is outdated", {
          pluginVersion,
          minRequired: MIN_PLUGIN_VERSION
        });
        json(400, response, {
          ok: false,
          error: `Plugin version ${pluginVersion} is below the minimum required ${MIN_PLUGIN_VERSION}. Please update the plugin.`
        }, origin);
        return;
      }
      const session = this.registerSession(body);
      json(200, response, {
        ok: true,
        sessionId: session.sessionId,
        pollTimeoutMs: 25_000,
        serverBridgeVersion: SERVER_BRIDGE_VERSION,
        minPluginVersion: MIN_PLUGIN_VERSION,
        allowScriptExecution: this.allowScriptExecution
      }, origin);
      return;
    }

    if (url.pathname === "/photoshop-bridge/poll" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const sessionId = asString(body.sessionId, "");
      const session = this.touchSession(sessionId);
      // Rate limit polling to prevent abuse from local processes.
      const now = Date.now();
      if (now - session.lastPollAt < MIN_POLL_INTERVAL_MS) {
        json(429, response, {
          ok: false,
          error: "Poll rate limit exceeded."
        }, origin);
        return;
      }
      session.lastPollAt = now;
      const command = await this.nextCommand(session.sessionId);
      json(200, response, {
        ok: true,
        sessionId: session.sessionId,
        command: commandToJson(command)
      }, origin);
      return;
    }

    if (url.pathname === "/photoshop-bridge/result" && method === "POST") {
      const body = this.parseBody(await readRequestBody(request));
      this.assertAuthorized(body);
      const sessionId = asString(body.sessionId, "");
      this.touchSession(sessionId);
      this.resolveCommand(
        asString(body.requestId, ""),
        sessionId,
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
      json(200, response, { ok: true }, origin);
      return;
    }

    json(404, response, {
      ok: false,
      error: "Not found"
    }, origin);
  }

  private parseBody(body: string): JsonObject {
    if (body.trim() === "") {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new BadRequestError("Invalid JSON in request body.");
    }
    if (!isJsonObject(parsed)) {
      throw new BadRequestError("Expected JSON object body.");
    }

    return parsed;
  }

  private assertAuthorized(body: JsonObject): void {
    const provided = asString(body.token, "");
    const expected = this.token;
    // Use timing-safe comparison to prevent token extraction via timing side-channel.
    // If lengths differ, compare against a dummy buffer to avoid leaking length info.
    const providedBuf = Buffer.from(provided, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (providedBuf.length !== expectedBuf.length) {
      const dummy = Buffer.alloc(expectedBuf.length);
      timingSafeEqual(dummy, expectedBuf);
      throw new AuthorizationError();
    }
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      throw new AuthorizationError();
    }
  }

  protected registerSession(body: JsonObject): PluginSession {
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.waiters.clear();
    this.sessions.clear();

    for (const pending of this.queue.splice(0, this.queue.length)) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error("Photoshop plugin session re-registered; pending command discarded.")
      );
    }

    const sessionId = randomUUID();
    const session: PluginSession = {
      sessionId,
      pluginName: asString(body.pluginName, "photoshop-uxp"),
      pluginVersion: asString(body.pluginVersion, "0.0.0"),
      photoshopVersion:
        typeof body.photoshopVersion === "string" ? body.photoshopVersion : null,
      capabilities: asStringArray(body.capabilities),
      lastSeenAt: Date.now(),
      lastPollAt: 0
    };

    this.sessions.set(sessionId, session);
    this.logger.info("Photoshop plugin session registered", {
      sessionId,
      photoshopVersion: session.photoshopVersion
    });
    return session;
  }

  protected touchSession(sessionId: string): PluginSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new SessionNotFoundError();
    }

    session.lastSeenAt = Date.now();
    return session;
  }

  protected getActiveSession(): PluginSession | null {
    let active: PluginSession | null = null;
    const cutoff = Date.now() - 60_000;
    const staleIds: string[] = [];
    for (const [id, session] of this.sessions.entries()) {
      if (session.lastSeenAt < cutoff) {
        staleIds.push(id);
        continue;
      }

      if (active === null || session.lastSeenAt > active.lastSeenAt) {
        active = session;
      }
    }

    for (const id of staleIds) {
      this.sessions.delete(id);
    }

    return active;
  }

  private pruneStaleSessionsAndCommands(): void {
    const cutoff = Date.now() - 60_000;
    const staleIds = new Set<string>();
    for (const [id, session] of this.sessions.entries()) {
      if (session.lastSeenAt < cutoff) {
        staleIds.add(id);
      }
    }

    for (const id of staleIds) {
      this.sessions.delete(id);
      this.logger.debug("Pruned stale Photoshop plugin session", { sessionId: id });
    }

    if (staleIds.size > 0) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const pending = this.queue[i]!;
        if (pending.leasedSessionId !== null && staleIds.has(pending.leasedSessionId)) {
          this.queue.splice(i, 1);
          clearTimeout(pending.timer);
          pending.reject(new Error("Photoshop plugin session expired; command discarded."));
        }
      }
    }
  }

  // Node.js is single-threaded: the synchronous lease assignment is atomic within a tick.
  protected async nextCommand(sessionId: string): Promise<BridgeCommand | null> {
    const pending = this.queue[0];
    if (pending !== undefined) {
      if (pending.leasedSessionId === null) {
        pending.leasedSessionId = sessionId;
        return pending.command;
      }

      if (pending.leasedSessionId === sessionId) {
        return pending.command;
      }

      return null;
    }

    // Safety net: cap waiter count to prevent unbounded accumulation.
    if (this.waiters.size >= MAX_WAITER_COUNT) {
      const oldestKey = this.waiters.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.waiters.get(oldestKey);
        if (oldest !== undefined) {
          clearTimeout(oldest.timer);
          oldest.resolve(null);
        }
        this.waiters.delete(oldestKey);
      }
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
      const pending = this.queue[0];
      if (pending === undefined) {
        clearTimeout(waiter.timer);
        this.waiters.delete(sessionId);
        waiter.resolve(null);
        continue;
      }

      if (pending.leasedSessionId === null) {
        pending.leasedSessionId = sessionId;
      }

      if (pending.leasedSessionId !== sessionId) {
        continue;
      }

      clearTimeout(waiter.timer);
      this.waiters.delete(sessionId);
      waiter.resolve(pending.command);
      break;
    }
  }

  protected resolveCommand(
    requestId: string,
    sessionId: string,
    envelope: ResultEnvelope
  ): void {
    const index = this.queue.findIndex((pending) => pending.command.requestId === requestId);
    if (index === -1) {
      throw new Error(`Unknown Photoshop request id: ${requestId}`);
    }

    const [pending] = this.queue.splice(index, 1);
    if (pending === undefined) {
      throw new Error(`Unable to resolve Photoshop request id: ${requestId}`);
    }

    if (pending.leasedSessionId !== sessionId) {
      throw new Error(`Photoshop request ${requestId} is leased to a different session.`);
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

/** @internal Exported for testing only. */
export { isAllowedOrigin as _isAllowedOrigin, compareSemver as _compareSemver };
