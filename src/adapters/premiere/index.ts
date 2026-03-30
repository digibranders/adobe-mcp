import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "premiere",
  displayName: "Adobe Premiere Pro",
  automationSurfaces: ["extendscript", "cep", "uxp_plugin", "c_sdk"],
  externalControlPath: "Companion UXP plugin preferred; CEP/ExtendScript retained only as legacy fallback.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "uxp_plugin",
  majorLimitations: [
    "Modern UXP extensibility is newly official and needs spike validation.",
    "A legacy CEP foundation is not a good long-lived V1 base."
  ],
  feasibilityScore: 5.5,
  recommendedVersionTarget: "Premiere Pro v25.6+",
  v1Operations: [
    "discover_host",
    "open_project",
    "inspect_sequences",
    "update_timeline",
    "export_media"
  ]
};

export class PremiereAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Premiere Pro"]);
  }
}
