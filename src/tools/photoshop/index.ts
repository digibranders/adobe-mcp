import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Logger, ServerConfig } from "../../core/types.js";
import type { AdapterRegistry } from "../../server/registry.js";
import { toToolResult } from "../../server/toolResult.js";
import { PhotoshopPluginBridge } from "../../adapters/photoshop/bridge.js";
import { jsonObjectSchema } from "../../core/json.js";

const timeoutSchema = z.number().int().positive().max(300_000).optional();

function createBridge(config: ServerConfig, logger: Logger): PhotoshopPluginBridge {
  return new PhotoshopPluginBridge(config.apps.photoshop, logger);
}

async function getBridgeStatusPayload(bridge: PhotoshopPluginBridge) {
  try {
    await bridge.ensureStarted();
    return {
      bridge: bridge.getStatusPayload()
    };
  } catch (error) {
    return {
      bridge: bridge.getStatusPayload(),
      bridgeStartupError: error instanceof Error ? error.message : String(error)
    };
  }
}

export function registerPhotoshopTools(
  server: McpServer,
  registry: AdapterRegistry,
  config: ServerConfig,
  logger: Logger
): void {
  const bridge = createBridge(config, logger);

  server.tool(
    "photoshop_get_status",
    "Check Photoshop availability, bridge connection status, and detected version.",
    {
      forceRefresh: z.boolean().optional()
    },
    async ({ forceRefresh }) => {
      const bridgeStatus = await getBridgeStatusPayload(bridge);
      return toToolResult({
        runtime: await registry.getStatus("photoshop", forceRefresh ?? false),
        ...bridgeStatus
      });
    }
  );

  server.tool("photoshop_list_supported_operations", "List all Photoshop operations supported by the bridge.", {}, async (_args) => {
    const status = await registry.getStatus("photoshop");
    return toToolResult({
      appId: "photoshop",
      supportedOperations: [...status.supportedOperations]
    });
  });

  server.tool("photoshop_bridge_status", "Get the HTTP bridge connection status and UXP plugin session info.", {}, async (_args) => {
    const bridgeStatus = await getBridgeStatusPayload(bridge);
    return toToolResult({
      appId: "photoshop",
      ...bridgeStatus,
      connectionConfig: bridge.getPublicConfig()
    });
  });

  server.tool(
    "photoshop_list_documents",
    "List all open documents in Photoshop with metadata (title, dimensions, resolution).",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("list_documents", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_create_document",
    "Create a new Photoshop document with specified dimensions, resolution, and name.",
    {
      width: z.number().positive(),
      height: z.number().positive(),
      name: z.string().min(1).optional(),
      resolution: z.number().positive().optional(),
      timeoutMs: timeoutSchema
    },
    async ({ width, height, name, resolution, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "create_document",
          {
            width,
            height,
            ...(name === undefined ? {} : { name }),
            ...(resolution === undefined ? {} : { resolution })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_open_document",
    "Open a document in Photoshop from a file path on disk.",
    {
      documentPath: z.string().min(1),
      timeoutMs: timeoutSchema
    },
    async ({ documentPath, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "open_document",
          {
            documentPath
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_inspect_active_document",
    "Get metadata and layer structure of the active Photoshop document.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("inspect_active_document", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_export_active_document",
    "Export the active Photoshop document to PNG, JPG, or PSD format.",
    {
      outputPath: z.string().min(1),
      format: z.enum(["png", "jpg", "psd"]),
      quality: z.number().int().min(1).max(12).optional(),
      timeoutMs: timeoutSchema
    },
    async ({ outputPath, format, quality, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "export_active_document",
          {
            outputPath,
            format,
            ...(quality === undefined ? {} : { quality })
          },
          timeoutMs ?? 120_000
        )
      })
  );

  server.tool(
    "photoshop_add_text_layer",
    "Add a text layer to the active Photoshop document with specified content, font size, and position.",
    {
      contents: z.string().min(1),
      name: z.string().min(1).optional(),
      fontSize: z.number().positive().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      timeoutMs: timeoutSchema
    },
    async ({ contents, name, fontSize, x, y, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "add_text_layer",
          {
            contents,
            ...(name === undefined ? {} : { name }),
            ...(fontSize === undefined ? {} : { fontSize }),
            ...(x === undefined ? {} : { x }),
            ...(y === undefined ? {} : { y })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_run_script",
    "Execute arbitrary UXP JavaScript / batchPlay code in Photoshop. The script has access to the Photoshop UXP API (app, action, core, storage modules). Return a JSON-serializable value from the script to receive it as the result. Use this for any Photoshop operation not covered by a dedicated tool.",
    {
      scriptSource: z.string().min(1).describe("UXP JavaScript code to execute inside Photoshop. Has access to: app, action, core, storage, and an optional 'input' object."),
      input: jsonObjectSchema.optional().describe("Optional JSON object passed to the script as the 'input' variable."),
      timeoutMs: timeoutSchema
    },
    async ({ scriptSource, input, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "run_script",
          {
            scriptSource,
            ...(input === undefined ? {} : { input })
          },
          timeoutMs ?? 120_000
        )
      })
  );

  server.tool(
    "photoshop_resize_image",
    "Resize the active Photoshop document to new dimensions.",
    {
      width: z.number().positive().optional().describe("New width in pixels."),
      height: z.number().positive().optional().describe("New height in pixels."),
      resampleMethod: z.enum(["nearestNeighbor", "bilinear", "bicubic", "bicubicSmoother", "bicubicSharper", "automaticInterpolation"]).optional(),
      timeoutMs: timeoutSchema
    },
    async ({ width, height, resampleMethod, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "resize_image",
          {
            ...(width === undefined ? {} : { width }),
            ...(height === undefined ? {} : { height }),
            ...(resampleMethod === undefined ? {} : { resampleMethod })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_crop_document",
    "Crop the active Photoshop document to specified bounds.",
    {
      top: z.number(),
      left: z.number(),
      bottom: z.number(),
      right: z.number(),
      timeoutMs: timeoutSchema
    },
    async ({ top, left, bottom, right, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "crop_document",
          { top, left, bottom, right },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_duplicate_layer",
    "Duplicate a layer in the active Photoshop document.",
    {
      layerId: z.number().int().describe("ID of the layer to duplicate."),
      newName: z.string().min(1).optional().describe("Name for the duplicated layer."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, newName, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "duplicate_layer",
          {
            layerId,
            ...(newName === undefined ? {} : { newName })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_delete_layer",
    "Delete a layer from the active Photoshop document.",
    {
      layerId: z.number().int().describe("ID of the layer to delete."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "delete_layer",
          { layerId },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_set_layer_properties",
    "Set properties (opacity, blend mode, visibility, name) of a layer in the active Photoshop document.",
    {
      layerId: z.number().int().describe("ID of the layer to modify."),
      opacity: z.number().min(0).max(100).optional().describe("Layer opacity (0-100)."),
      blendMode: z.string().optional().describe("Blend mode name (e.g. 'normal', 'multiply', 'screen', 'overlay', 'softLight', 'hardLight', 'colorDodge', 'colorBurn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity')."),
      visible: z.boolean().optional().describe("Layer visibility."),
      name: z.string().min(1).optional().describe("New layer name."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, opacity, blendMode, visible, name, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "set_layer_properties",
          {
            layerId,
            ...(opacity === undefined ? {} : { opacity }),
            ...(blendMode === undefined ? {} : { blendMode }),
            ...(visible === undefined ? {} : { visible }),
            ...(name === undefined ? {} : { name })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_flatten_image",
    "Flatten all layers in the active Photoshop document into one.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("flatten_image", {}, timeoutMs ?? 60_000)
      })
  );

  server.tool(
    "photoshop_merge_visible",
    "Merge all visible layers in the active Photoshop document.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("merge_visible", {}, timeoutMs ?? 60_000)
      })
  );

  server.tool(
    "photoshop_apply_adjustment",
    "Apply an image adjustment to the active Photoshop document (brightness/contrast, hue/saturation, curves, levels).",
    {
      adjustment: z.enum(["brightnessContrast", "hueSaturation", "curves", "levels"]).describe("Type of adjustment to apply."),
      brightness: z.number().min(-150).max(150).optional().describe("Brightness value (for brightnessContrast)."),
      contrast: z.number().min(-150).max(150).optional().describe("Contrast value (for brightnessContrast)."),
      hue: z.number().min(-180).max(180).optional().describe("Hue shift (for hueSaturation)."),
      saturation: z.number().min(-100).max(100).optional().describe("Saturation (for hueSaturation)."),
      lightness: z.number().min(-100).max(100).optional().describe("Lightness (for hueSaturation)."),
      timeoutMs: timeoutSchema
    },
    async ({ adjustment, brightness, contrast, hue, saturation, lightness, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "apply_adjustment",
          {
            adjustment,
            ...(brightness === undefined ? {} : { brightness }),
            ...(contrast === undefined ? {} : { contrast }),
            ...(hue === undefined ? {} : { hue }),
            ...(saturation === undefined ? {} : { saturation }),
            ...(lightness === undefined ? {} : { lightness })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_run_action",
    "Run an existing Photoshop Action by name and action set.",
    {
      actionName: z.string().min(1).describe("Name of the action to run."),
      actionSet: z.string().min(1).describe("Name of the action set containing the action."),
      timeoutMs: timeoutSchema
    },
    async ({ actionName, actionSet, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "run_action",
          { actionName, actionSet },
          timeoutMs ?? 120_000
        )
      })
  );

  server.tool(
    "photoshop_add_shape_layer",
    "Add a shape layer (rectangle or ellipse) to the active Photoshop document.",
    {
      shape: z.enum(["rectangle", "ellipse"]).describe("Shape type."),
      top: z.number().describe("Top position in pixels."),
      left: z.number().describe("Left position in pixels."),
      width: z.number().positive().describe("Width in pixels."),
      height: z.number().positive().describe("Height in pixels."),
      fillColor: z.object({
        red: z.number().min(0).max(255),
        green: z.number().min(0).max(255),
        blue: z.number().min(0).max(255)
      }).optional().describe("Fill color as RGB. Defaults to black."),
      strokeColor: z.object({
        red: z.number().min(0).max(255),
        green: z.number().min(0).max(255),
        blue: z.number().min(0).max(255)
      }).optional().describe("Stroke color as RGB."),
      strokeWidth: z.number().positive().optional().describe("Stroke width in pixels."),
      name: z.string().min(1).optional().describe("Layer name."),
      timeoutMs: timeoutSchema
    },
    async ({ shape, top, left, width, height, fillColor, strokeColor, strokeWidth, name, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "add_shape_layer",
          {
            shape,
            top,
            left,
            width,
            height,
            ...(fillColor === undefined ? {} : { fillColor }),
            ...(strokeColor === undefined ? {} : { strokeColor }),
            ...(strokeWidth === undefined ? {} : { strokeWidth }),
            ...(name === undefined ? {} : { name })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_get_layer_info",
    "Get detailed information about a specific layer by ID, including bounds, effects, styles, and smart object status.",
    {
      layerId: z.number().int().describe("ID of the layer to inspect."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "get_layer_info",
          { layerId },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_canvas_snapshot",
    "Capture a snapshot of the active Photoshop canvas as a PNG file on disk. Use this to visually inspect the current state of the document. Returns the file path to the snapshot image.",
    {
      outputPath: z.string().min(1).optional().describe("Where to save the snapshot PNG. Defaults to a temp file."),
      maxDimension: z.number().positive().optional().describe("Max width/height in pixels for the snapshot (scales down large documents). Default: 1024."),
      timeoutMs: timeoutSchema
    },
    async ({ outputPath, maxDimension, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "canvas_snapshot",
          {
            ...(outputPath === undefined ? {} : { outputPath }),
            ...(maxDimension === undefined ? {} : { maxDimension })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_save_document",
    "Save the active Photoshop document. Optionally save to a new path in PSD, PNG, or JPG format.",
    {
      savePath: z.string().min(1).optional().describe("File path to save to. If omitted, saves in place."),
      format: z.enum(["psd", "png", "jpg"]).optional().describe("Format when saving to a new path."),
      quality: z.number().int().min(1).max(12).optional().describe("JPEG quality (1-12). Only used with jpg format."),
      timeoutMs: timeoutSchema
    },
    async ({ savePath, format, quality, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "save_document",
          {
            ...(savePath === undefined ? {} : { savePath }),
            ...(format === undefined ? {} : { format }),
            ...(quality === undefined ? {} : { quality })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_close_document",
    "Close a Photoshop document. Defaults to active document.",
    {
      documentId: z.number().int().optional().describe("Document ID to close. Defaults to active document."),
      save: z.boolean().optional().describe("Save before closing. Default: true."),
      timeoutMs: timeoutSchema
    },
    async ({ documentId, save, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "close_document",
          {
            ...(documentId === undefined ? {} : { documentId }),
            ...(save === undefined ? {} : { save })
          },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_set_active_document",
    "Switch the active document in Photoshop by document ID. Use photoshop_list_documents to find IDs.",
    {
      documentId: z.number().int().describe("ID of the document to make active."),
      timeoutMs: timeoutSchema
    },
    async ({ documentId, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "set_active_document",
          { documentId },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_undo",
    "Undo the last operation(s) in Photoshop.",
    {
      steps: z.number().int().positive().max(50).optional().describe("Number of undo steps. Default: 1."),
      timeoutMs: timeoutSchema
    },
    async ({ steps, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "undo",
          { ...(steps === undefined ? {} : { steps }) },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_redo",
    "Redo previously undone operation(s) in Photoshop.",
    {
      steps: z.number().int().positive().max(50).optional().describe("Number of redo steps. Default: 1."),
      timeoutMs: timeoutSchema
    },
    async ({ steps, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "redo",
          { ...(steps === undefined ? {} : { steps }) },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_apply_filter",
    "Apply a filter to the active Photoshop document or selection.",
    {
      filter: z.enum(["gaussianBlur", "motionBlur", "sharpen", "unsharpMask", "addNoise", "medianNoise"]).describe("Filter type to apply."),
      radius: z.number().positive().optional().describe("Radius in pixels (for gaussianBlur, unsharpMask, medianNoise)."),
      angle: z.number().optional().describe("Angle in degrees (for motionBlur)."),
      distance: z.number().positive().optional().describe("Distance in pixels (for motionBlur)."),
      amount: z.number().positive().optional().describe("Amount (for unsharpMask: 1-500, for addNoise: 0-400)."),
      threshold: z.number().min(0).optional().describe("Threshold (for unsharpMask, 0-255)."),
      distribution: z.enum(["uniform", "gaussian"]).optional().describe("Noise distribution (for addNoise)."),
      monochromatic: z.boolean().optional().describe("Monochromatic noise (for addNoise)."),
      timeoutMs: timeoutSchema
    },
    async ({ filter, radius, angle, distance, amount, threshold, distribution, monochromatic, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "apply_filter",
          {
            filter,
            ...(radius === undefined ? {} : { radius }),
            ...(angle === undefined ? {} : { angle }),
            ...(distance === undefined ? {} : { distance }),
            ...(amount === undefined ? {} : { amount }),
            ...(threshold === undefined ? {} : { threshold }),
            ...(distribution === undefined ? {} : { distribution }),
            ...(monochromatic === undefined ? {} : { monochromatic })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_select_all",
    "Select all pixels in the active Photoshop document.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("select_all", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_deselect",
    "Remove the current selection in the active Photoshop document.",
    {
      timeoutMs: timeoutSchema
    },
    async ({ timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand("deselect", {}, timeoutMs ?? 30_000)
      })
  );

  server.tool(
    "photoshop_select_color_range",
    "Select pixels by color range in the active Photoshop document.",
    {
      color: z.object({
        red: z.number().min(0).max(255),
        green: z.number().min(0).max(255),
        blue: z.number().min(0).max(255)
      }).describe("Target color to select."),
      fuzziness: z.number().min(0).max(200).optional().describe("Color tolerance (0-200). Default: 40."),
      timeoutMs: timeoutSchema
    },
    async ({ color, fuzziness, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "select_color_range",
          {
            color,
            ...(fuzziness === undefined ? {} : { fuzziness })
          },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_transform_layer",
    "Transform a layer: move, scale, and/or rotate.",
    {
      layerId: z.number().int().optional().describe("Layer ID to transform. Defaults to active layer."),
      offsetX: z.number().optional().describe("Horizontal move in pixels."),
      offsetY: z.number().optional().describe("Vertical move in pixels."),
      scaleX: z.number().positive().optional().describe("Horizontal scale in percent (100 = no change)."),
      scaleY: z.number().positive().optional().describe("Vertical scale in percent (100 = no change)."),
      angle: z.number().optional().describe("Rotation angle in degrees."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, offsetX, offsetY, scaleX, scaleY, angle, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "transform_layer",
          {
            ...(layerId === undefined ? {} : { layerId }),
            ...(offsetX === undefined ? {} : { offsetX }),
            ...(offsetY === undefined ? {} : { offsetY }),
            ...(scaleX === undefined ? {} : { scaleX }),
            ...(scaleY === undefined ? {} : { scaleY }),
            ...(angle === undefined ? {} : { angle })
          },
          timeoutMs ?? 60_000
        )
      })
  );

  server.tool(
    "photoshop_fill_color",
    "Fill the current selection or layer with a solid color.",
    {
      color: z.object({
        red: z.number().min(0).max(255),
        green: z.number().min(0).max(255),
        blue: z.number().min(0).max(255)
      }).describe("Fill color as RGB."),
      opacity: z.number().min(0).max(100).optional().describe("Fill opacity (0-100). Default: 100."),
      blendMode: z.string().optional().describe("Blend mode (e.g. 'normal', 'multiply', 'screen'). Default: 'normal'."),
      timeoutMs: timeoutSchema
    },
    async ({ color, opacity, blendMode, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "fill_color",
          {
            color,
            ...(opacity === undefined ? {} : { opacity }),
            ...(blendMode === undefined ? {} : { blendMode })
          },
          timeoutMs ?? 30_000
        )
      })
  );

  server.tool(
    "photoshop_copy_layer_to_document",
    "Copy a layer from the active document to another open document.",
    {
      layerId: z.number().int().describe("ID of the layer to copy."),
      targetDocumentId: z.number().int().describe("ID of the target document."),
      timeoutMs: timeoutSchema
    },
    async ({ layerId, targetDocumentId, timeoutMs }) =>
      toToolResult({
        appId: "photoshop",
        result: await bridge.runCommand(
          "copy_layer_to_document",
          { layerId, targetDocumentId },
          timeoutMs ?? 60_000
        )
      })
  );
}
