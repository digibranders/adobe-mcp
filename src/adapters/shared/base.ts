import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";

import { pathExists } from "../../core/process.js";
import type {
  AdobeAppId,
  AppBridgeConfig,
  AppCapabilityDescriptor,
  HostProbeResult,
  Logger
} from "../../core/types.js";

export interface AdobeAdapter {
  readonly appId: AdobeAppId;
  getDescriptor(): AppCapabilityDescriptor;
  probe(config: AppBridgeConfig, logger: Logger): Promise<HostProbeResult>;
  listSupportedOperations(): readonly string[];
}

function extractVersionFromPath(path: string): string | null {
  const yearMatch = path.match(/20\d{2}/);
  if (yearMatch !== null) {
    return yearMatch[0];
  }

  const majorMinorMatch = path.match(/\b\d+\.\d+\b/);
  return majorMinorMatch?.[0] ?? null;
}

async function findFirstMatchingInstallPath(prefixes: readonly string[]): Promise<string | null> {
  if (platform() === "darwin") {
    const applicationsPath = "/Applications";
    if (!(await pathExists(applicationsPath))) {
      return null;
    }

    const entries = await readdir(applicationsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const matches = prefixes.some((prefix) => entry.name.startsWith(prefix));
      if (matches) {
        return join(applicationsPath, entry.name);
      }
    }
  }

  if (platform() === "win32") {
    const programFiles = process.env.ProgramFiles;
    if (programFiles === undefined || !(await pathExists(programFiles))) {
      return null;
    }

    const entries = await readdir(programFiles, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const matches = prefixes.some((prefix) => entry.name.startsWith(prefix));
      if (matches) {
        return join(programFiles, entry.name);
      }
    }
  }

  return null;
}

export abstract class StaticAdobeAdapter implements AdobeAdapter {
  public readonly appId: AdobeAppId;

  public constructor(
    private readonly descriptor: AppCapabilityDescriptor,
    private readonly installPrefixes: readonly string[]
  ) {
    this.appId = descriptor.appId;
  }

  public getDescriptor(): AppCapabilityDescriptor {
    return this.descriptor;
  }

  public listSupportedOperations(): readonly string[] {
    return this.descriptor.v1Operations;
  }

  public async probe(config: AppBridgeConfig, logger: Logger): Promise<HostProbeResult> {
    const notes: string[] = [];

    if (!config.enabled) {
      notes.push("App adapter is disabled by configuration.");
      return {
        appId: this.appId,
        available: false,
        detectedPath: null,
        detectedVersion: null,
        bridgeStrategy: this.descriptor.bestBridgeStrategy,
        notes
      };
    }

    let detectedPath = config.executablePath;
    if (detectedPath !== null) {
      if (!(await pathExists(detectedPath))) {
        notes.push("Configured path does not exist.");
        detectedPath = null;
      }
    }

    if (detectedPath === null) {
      detectedPath = await findFirstMatchingInstallPath(this.installPrefixes);
      if (detectedPath === null) {
        notes.push("Host application not discovered automatically. Set ADOBE_MCP_*_PATH.");
      }
    }

    if (
      this.descriptor.bestBridgeStrategy !== "external_script" &&
      this.descriptor.bestBridgeStrategy !== "iac_js" &&
      config.pluginPort === null
    ) {
      notes.push("No plugin port configured. Companion plugin handshake is not yet possible.");
    }

    if (config.minimumVersion !== null) {
      notes.push(`Minimum requested version: ${config.minimumVersion}`);
    }

    logger.debug("Probed Adobe host", {
      appId: this.appId,
      detectedPath
    });

    return {
      appId: this.appId,
      available: detectedPath !== null,
      detectedPath,
      detectedVersion: detectedPath === null ? null : extractVersionFromPath(detectedPath),
      bridgeStrategy: this.descriptor.bestBridgeStrategy,
      notes
    };
  }
}
