import { tmpdir } from "node:os";
import { join } from "node:path";

import { serverConfigSchema } from "./schema.js";
import type { AdobeAppId, AppBridgeConfig, LogLevel, ServerConfig } from "./types.js";

const APP_ENV_PREFIXES: Record<AdobeAppId, string> = {
  illustrator: "ILLUSTRATOR",
  photoshop: "PHOTOSHOP",
  indesign: "INDESIGN",
  acrobat: "ACROBAT",
  aftereffects: "AFTEREFFECTS",
  premiere: "PREMIERE"
};

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNullableString(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  return value;
}

function readNullablePositiveInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number {
  const parsed = readNullablePositiveInteger(value);
  return parsed ?? defaultValue;
}

function readLogLevel(value: string | undefined): LogLevel {
  switch (value) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value;
    default:
      return "info";
  }
}

function readAppConfig(env: NodeJS.ProcessEnv, appId: AdobeAppId): AppBridgeConfig {
  const prefix = APP_ENV_PREFIXES[appId];

  return {
    enabled: readBoolean(env[`ADOBE_MCP_${prefix}_ENABLED`], true),
    executablePath: readNullableString(env[`ADOBE_MCP_${prefix}_PATH`]),
    minimumVersion: readNullableString(env[`ADOBE_MCP_${prefix}_MIN_VERSION`]),
    pluginPort: readNullablePositiveInteger(env[`ADOBE_MCP_${prefix}_PLUGIN_PORT`]),
    pluginToken: readNullableString(env[`ADOBE_MCP_${prefix}_PLUGIN_TOKEN`])
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apps: ServerConfig["apps"] = {
    illustrator: readAppConfig(env, "illustrator"),
    photoshop: readAppConfig(env, "photoshop"),
    indesign: readAppConfig(env, "indesign"),
    acrobat: readAppConfig(env, "acrobat"),
    aftereffects: readAppConfig(env, "aftereffects"),
    premiere: readAppConfig(env, "premiere")
  };

  const config: ServerConfig = {
    serverName: "adobe-desktop-mcp",
    serverVersion: "0.1.0",
    logLevel: readLogLevel(env.ADOBE_MCP_LOG_LEVEL),
    tempRoot: env.ADOBE_MCP_TEMP_ROOT ?? join(tmpdir(), ".adobe-desktop-mcp"),
    probeCacheTtlMs: readPositiveInteger(env.ADOBE_MCP_PROBE_CACHE_TTL_MS, 15_000),
    apps
  };

  serverConfigSchema.parse(config);
  return config;
}
