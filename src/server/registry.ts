import { appRuntimeStatusSchema } from "../core/schema.js";
import type {
  AdobeAppId,
  AppRuntimeStatus,
  Logger,
  ServerConfig
} from "../core/types.js";
import type { AdobeAdapter } from "../adapters/shared/base.js";
import { IllustratorAdapter } from "../adapters/illustrator/index.js";
import { PhotoshopAdapter } from "../adapters/photoshop/index.js";
import { InDesignAdapter } from "../adapters/indesign/index.js";
import { AcrobatAdapter } from "../adapters/acrobat/index.js";
import { AfterEffectsAdapter } from "../adapters/aftereffects/index.js";
import { PremiereAdapter } from "../adapters/premiere/index.js";
import { UnsupportedAppError } from "./errors.js";

interface CachedStatus {
  readonly status: AppRuntimeStatus;
  readonly expiresAt: number;
}

export class AdapterRegistry {
  private readonly adapters = new Map<AdobeAppId, AdobeAdapter>();
  private readonly cache = new Map<AdobeAppId, CachedStatus>();

  public constructor(
    private readonly config: ServerConfig,
    private readonly logger: Logger
  ) {
    const adapterList: readonly AdobeAdapter[] = [
      new IllustratorAdapter(),
      new PhotoshopAdapter(),
      new InDesignAdapter(),
      new AcrobatAdapter(),
      new AfterEffectsAdapter(),
      new PremiereAdapter()
    ];

    for (const adapter of adapterList) {
      this.adapters.set(adapter.appId, adapter);
    }
  }

  public getCapabilityMatrix() {
    return Array.from(this.adapters.values()).map((adapter) => adapter.getDescriptor());
  }

  public getAdapter(appId: AdobeAppId): AdobeAdapter {
    const adapter = this.adapters.get(appId);
    if (adapter === undefined) {
      throw new UnsupportedAppError(appId);
    }

    return adapter;
  }

  public async listStatuses(forceRefresh = false): Promise<readonly AppRuntimeStatus[]> {
    const statuses = await Promise.all(
      Array.from(this.adapters.keys()).map(async (appId) => await this.getStatus(appId, forceRefresh))
    );

    return statuses;
  }

  public async getStatus(appId: AdobeAppId, forceRefresh = false): Promise<AppRuntimeStatus> {
    const adapter = this.adapters.get(appId);
    if (adapter === undefined) {
      throw new UnsupportedAppError(appId);
    }

    if (!forceRefresh) {
      const cached = this.cache.get(appId);
      if (cached !== undefined && cached.expiresAt > Date.now()) {
        return cached.status;
      }
    }

    const probe = await adapter.probe(this.config.apps[appId], this.logger);
    const status: AppRuntimeStatus = {
      descriptor: adapter.getDescriptor(),
      probe,
      configured: this.config.apps[appId],
      supportedOperations: adapter.listSupportedOperations()
    };

    const parsed = appRuntimeStatusSchema.parse(status);
    this.cache.set(appId, {
      status: parsed,
      expiresAt: Date.now() + this.config.probeCacheTtlMs
    });

    return parsed;
  }
}
