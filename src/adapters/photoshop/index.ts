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
    "Current implementation phase is UXP companion-plugin first.",
    "The plugin must be loaded in Photoshop through UXP Developer Tool before MCP tools can execute."
  ],
  feasibilityScore: 7.5,
  recommendedVersionTarget: "Current Creative Cloud release with UXP support",
  v1Operations: [
    "discover_host",
    "bridge_status",
    "list_documents",
    "create_document",
    "open_document",
    "inspect_active_document",
    "export_active_document",
    "add_text_layer"
  ]
};

export class PhotoshopAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Photoshop"]);
  }
}
