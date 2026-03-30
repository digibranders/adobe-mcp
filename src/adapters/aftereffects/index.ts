import { StaticAdobeAdapter } from "../shared/base.js";
import type { AppCapabilityDescriptor } from "../../core/types.js";

const descriptor: AppCapabilityDescriptor = {
  appId: "aftereffects",
  displayName: "Adobe After Effects",
  automationSurfaces: ["extendscript", "javascript", "c_sdk"],
  externalControlPath: "Direct scripting and render-queue orchestration from Node.",
  readSupport: true,
  editSupport: true,
  exportSupport: true,
  bestBridgeStrategy: "external_script",
  majorLimitations: [
    "Project and render workflows are long-running and operationally expensive.",
    "Result extraction is weaker than plugin-based runtimes."
  ],
  feasibilityScore: 7,
  recommendedVersionTarget: "Current Creative Cloud release",
  v1Operations: [
    "discover_host",
    "open_project",
    "inspect_project",
    "queue_render",
    "export_render"
  ]
};

export class AfterEffectsAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe After Effects"]);
  }
}
