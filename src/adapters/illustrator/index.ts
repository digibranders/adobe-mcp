import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "illustrator",
  displayName: "Adobe Illustrator",
  automationSurfaces: ["extendscript", "javascript", "applescript", "com", "c_sdk"],
  externalControlPath: "Direct external scripting via AppleScript on macOS and COM/VBScript on Windows.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "external_script",
  majorLimitations: [
    "Current implementation phase ships the real bridge on macOS only.",
    "Structured result passing is weaker than modern plugin runtimes.",
    "No single modern cross-platform plugin surface was validated in official docs."
  ],
  feasibilityScore: 9,
  recommendedVersionTarget: "Current Creative Cloud release",
  v1Operations: [
    "discover_host",
    "create_document",
    "open_document",
    "inspect_document",
    "export_document",
    "run_script"
  ]
};

export class IllustratorAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Illustrator"]);
  }
}
