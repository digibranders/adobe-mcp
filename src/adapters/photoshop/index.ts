import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "photoshop",
  displayName: "Adobe Photoshop",
  automationSurfaces: [
    "extendscript",
    "javascript",
    "applescript",
    "com",
    "uxp_script",
    "uxp_plugin"
  ],
  externalControlPath: "Hybrid legacy scripting plus optional UXP companion plugin.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "hybrid",
  majorLimitations: [
    "Legacy scripting and modern UXP features are split across different runtimes.",
    "A robust bidirectional control plane is cleaner through a plugin."
  ],
  feasibilityScore: 7.5,
  recommendedVersionTarget: "Current Creative Cloud release with UXP support",
  v1Operations: [
    "discover_host",
    "open_document",
    "inspect_layers",
    "run_legacy_script",
    "export_document"
  ]
};

export class PhotoshopAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Photoshop"]);
  }
}
