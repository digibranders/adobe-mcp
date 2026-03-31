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
    "The UXP companion plugin must be installed once via the install script or UXP Developer Tool.",
    "Generative Fill/Expand are cloud-gated and not accessible via automation.",
    "3D layers and video timeline are not yet exposed.",
    "Canvas snapshots are static exports, not real-time previews."
  ],
  feasibilityScore: 9.0,
  recommendedVersionTarget: "Current Creative Cloud release with UXP support",
  v1Operations: [
    "discover_host",
    "bridge_status",
    "list_documents",
    "create_document",
    "open_document",
    "inspect_active_document",
    "export_active_document",
    "add_text_layer",
    "run_script",
    "resize_image",
    "crop_document",
    "duplicate_layer",
    "delete_layer",
    "set_layer_properties",
    "flatten_image",
    "merge_visible",
    "apply_adjustment",
    "run_action",
    "add_shape_layer",
    "get_layer_info",
    "canvas_snapshot",
    "save_document",
    "close_document",
    "set_active_document",
    "undo",
    "redo",
    "apply_filter",
    "select_all",
    "deselect",
    "select_color_range",
    "transform_layer",
    "fill_color",
    "copy_layer_to_document"
  ]
};

export class PhotoshopAdapter extends StaticAdobeAdapter {
  public constructor() {
    super(descriptor, ["Adobe Photoshop"]);
  }
}
