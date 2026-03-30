import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "acrobat",
  displayName: "Adobe Acrobat Pro",
  automationSurfaces: ["javascript", "applescript", "com", "iac", "c_sdk"],
  externalControlPath: "Direct interapplication communication plus Acrobat JavaScript.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "iac_js",
  majorLimitations: [
    "Privileged-context rules restrict some save/export and page operations.",
    "Acrobat Reader is not a viable automation target."
  ],
  feasibilityScore: 6.5,
  recommendedVersionTarget: "Current Acrobat Pro DC release",
  v1Operations: [
    "discover_host",
    "open_document",
    "inspect_metadata",
    "extract_pages",
    "save_as"
  ]
};

export class AcrobatAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Acrobat"]);
  }
}
