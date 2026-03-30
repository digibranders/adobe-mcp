import { z } from "zod";

import {
  ADOBE_APP_IDS,
  AUTOMATION_SURFACES,
  BRIDGE_STRATEGIES,
  LOG_LEVELS
} from "./types.js";

export const adobeAppIdSchema = z.enum(ADOBE_APP_IDS);
export const bridgeStrategySchema = z.enum(BRIDGE_STRATEGIES);
export const automationSurfaceSchema = z.enum(AUTOMATION_SURFACES);
export const logLevelSchema = z.enum(LOG_LEVELS);

export const appBridgeConfigSchema = z.object({
  enabled: z.boolean(),
  executablePath: z.string().nullable(),
  minimumVersion: z.string().nullable(),
  pluginPort: z.number().int().positive().nullable(),
  pluginToken: z.string().nullable()
});

export const hostProbeResultSchema = z.object({
  appId: adobeAppIdSchema,
  available: z.boolean(),
  detectedPath: z.string().nullable(),
  detectedVersion: z.string().nullable(),
  bridgeStrategy: bridgeStrategySchema,
  notes: z.array(z.string())
});

export const appCapabilityDescriptorSchema = z.object({
  appId: adobeAppIdSchema,
  displayName: z.string(),
  automationSurfaces: z.array(automationSurfaceSchema),
  externalControlPath: z.string(),
  readSupport: z.boolean(),
  editSupport: z.boolean(),
  exportSupport: z.boolean(),
  bestBridgeStrategy: bridgeStrategySchema,
  majorLimitations: z.array(z.string()),
  feasibilityScore: z.number().min(0).max(10),
  recommendedVersionTarget: z.string(),
  v1Operations: z.array(z.string())
});

export const appRuntimeStatusSchema = z.object({
  descriptor: appCapabilityDescriptorSchema,
  probe: hostProbeResultSchema,
  configured: appBridgeConfigSchema,
  supportedOperations: z.array(z.string())
});

export const serverConfigSchema = z.object({
  serverName: z.string(),
  serverVersion: z.string(),
  logLevel: logLevelSchema,
  tempRoot: z.string(),
  probeCacheTtlMs: z.number().int().positive(),
  apps: z.record(adobeAppIdSchema, appBridgeConfigSchema)
});
