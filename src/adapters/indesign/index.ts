import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "indesign",
  displayName: "Adobe InDesign",
  automationSurfaces: ["extendscript", "javascript", "applescript", "com", "uxp_script", "uxp_plugin"],
  externalControlPath: "UXP-first companion plugin, with legacy scripting available for selective fallback.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "uxp_plugin",
  majorLimitations: [
    "The companion plugin transport must be implemented by this project.",
    "Version floor is materially higher for UXP plugin workflows."
  ],
  feasibilityScore: 8,
  recommendedVersionTarget: "InDesign 2023 / v18.5+",
  v1Operations: [
    "discover_host",
    "open_document",
    "inspect_pages",
    "update_text",
    "export_pdf",
    "export_idml"
  ]
};

export class InDesignAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe InDesign"]);
  }
}
