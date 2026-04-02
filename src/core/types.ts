export const ADOBE_APP_IDS = [
  "illustrator",
  "photoshop",
  "indesign",
  "acrobat",
  "aftereffects",
  "premiere"
] as const;

export type AdobeAppId = (typeof ADOBE_APP_IDS)[number];

export const BRIDGE_STRATEGIES = [
  "external_script",
  "uxp_plugin",
  "hybrid",
  "iac_js",
  "deferred"
] as const;

export type BridgeStrategy = (typeof BRIDGE_STRATEGIES)[number];

export const AUTOMATION_SURFACES = [
  "extendscript",
  "javascript",
  "applescript",
  "com",
  "uxp_script",
  "uxp_plugin",
  "cep",
  "iac",
  "c_sdk"
] as const;

export type AutomationSurface = (typeof AUTOMATION_SURFACES)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppBridgeConfig {
  readonly enabled: boolean;
  readonly executablePath: string | null;
  readonly minimumVersion: string | null;
  readonly pluginPort: number | null;
  readonly pluginToken: string | null;
}

export interface ServerConfig {
  readonly serverName: string;
  readonly serverVersion: string;
  readonly logLevel: LogLevel;
  readonly tempRoot: string;
  readonly probeCacheTtlMs: number;
  readonly allowScriptExecution: boolean;
  readonly apps: Record<AdobeAppId, AppBridgeConfig>;
}

export interface AppCapabilityDescriptor {
  readonly appId: AdobeAppId;
  readonly displayName: string;
  readonly automationSurfaces: readonly AutomationSurface[];
  readonly externalControlPath: string;
  readonly readSupport: boolean;
  readonly editSupport: boolean;
  readonly exportSupport: boolean;
  readonly bestBridgeStrategy: BridgeStrategy;
  readonly majorLimitations: readonly string[];
  readonly feasibilityScore: number;
  readonly recommendedVersionTarget: string;
  readonly v1Operations: readonly string[];
}

export interface HostProbeResult {
  readonly appId: AdobeAppId;
  readonly available: boolean;
  readonly detectedPath: string | null;
  readonly detectedVersion: string | null;
  readonly bridgeStrategy: BridgeStrategy;
  readonly notes: readonly string[];
}

export interface AppRuntimeStatus {
  readonly descriptor: AppCapabilityDescriptor;
  readonly probe: HostProbeResult;
  readonly configured: AppBridgeConfig;
  readonly supportedOperations: readonly string[];
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}
