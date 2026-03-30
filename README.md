# adobe-desktop-mcp

`adobe-desktop-mcp` is a local TypeScript/Node.js MCP server for Adobe desktop applications.

Current phase:

- Illustrator: real bridge on macOS
- Photoshop: real companion UXP plugin plus localhost MCP bridge
- InDesign, Acrobat, After Effects, Premiere Pro: discovery and capability reporting only

This is not yet a fully operational multi-app Adobe automation stack. It is a production-oriented MCP core plus a real first host integration.

## What Works Today

- stdio MCP server based on `@modelcontextprotocol/sdk`
- typed config, logging, process orchestration, temp-file handling, and adapter registry
- real macOS Illustrator automation through AppleScript invoking ExtendScript wrappers
- real Photoshop localhost bridge through a UXP companion plugin
- capability matrix and status tools for all target Adobe hosts
- packageable local artifact for Claude Desktop and Codex-compatible clients

## Prerequisites

- macOS
- Node.js 20.11+ or newer
- Adobe Illustrator installed (for Illustrator tools)
- Adobe Photoshop 25.0+ installed (for Photoshop tools)
- Adobe UXP Developer Tool (for loading the Photoshop companion plugin)
- Claude Desktop or another MCP client
- macOS permission to allow terminal/host app automation of Illustrator when prompted

## Install From Source

```bash
git clone https://github.com/digibranders/adobe-mcp.git
cd adobe-mcp
npm install
npm run typecheck
npm test
npm run build
```

This produces the MCP server entrypoint at:

- `dist/index.js`

## Package Artifact

You can generate an installable tarball with:

```bash
npm pack
```

## Environment Configuration

Copy or adapt `.env.example`.

Supported environment variables:

- `ADOBE_MCP_LOG_LEVEL`
- `ADOBE_MCP_TEMP_ROOT`
- `ADOBE_MCP_PROBE_CACHE_TTL_MS`
- `ADOBE_MCP_<APP>_ENABLED`
- `ADOBE_MCP_<APP>_PATH`
- `ADOBE_MCP_<APP>_MIN_VERSION`
- `ADOBE_MCP_<APP>_PLUGIN_PORT`
- `ADOBE_MCP_<APP>_PLUGIN_TOKEN`

Where `<APP>` is:

- `ILLUSTRATOR`
- `PHOTOSHOP`
- `INDESIGN`
- `ACROBAT`
- `AFTEREFFECTS`
- `PREMIERE`

For the current Illustrator bridge, the most important setting is:

```bash
export ADOBE_MCP_ILLUSTRATOR_PATH="/Applications/Adobe Illustrator 2025/Adobe Illustrator.app"
```

If you omit it, the server will try to discover Illustrator under `/Applications`.

For the Photoshop plugin bridge, the defaults are:

```bash
export ADOBE_MCP_PHOTOSHOP_PLUGIN_PORT=47123
export ADOBE_MCP_PHOTOSHOP_PLUGIN_TOKEN=adobe-mcp-dev-token
```

## Claude Desktop Setup

Use `docs/claude_desktop_config.example.json` as the starting point.

Example (replace `/path/to/adobe-mcp` with the actual cloned directory):

```json
{
  "mcpServers": {
    "adobe-desktop-mcp": {
      "command": "node",
      "args": [
        "/path/to/adobe-mcp/dist/index.js"
      ],
      "env": {
        "ADOBE_MCP_LOG_LEVEL": "info",
        "ADOBE_MCP_ILLUSTRATOR_PATH": "/Applications/Adobe Illustrator 2025/Adobe Illustrator.app"
      }
    }
  }
}
```

Then:

1. Save the config.
2. Restart Claude Desktop.
3. Confirm the server appears.
4. Run `adobe_desktop_health`.
5. Run `illustrator_get_status`.

## Codex-Compatible MCP Client Setup

If your Codex client supports local MCP stdio servers, register:

- command: `node`
- args: `/path/to/adobe-mcp/dist/index.js`
- env: `ADOBE_MCP_ILLUSTRATOR_PATH` and optionally `ADOBE_MCP_LOG_LEVEL`

The same tool flow used in Claude Desktop should work in Codex-compatible clients.

## Manual Test Flow

Run these in order.

1. Health check

Tool:
- `adobe_desktop_health`

Expected:
- server name/version returned

2. Host discovery

Tool:
- `illustrator_get_status`

Expected:
- `available: true`

3. Create a document

Tool:
- `illustrator_create_document`

Arguments:

```json
{
  "width": 800,
  "height": 600,
  "colorSpace": "RGB"
}
```

Expected:
- Illustrator opens or activates
- a new document is created

4. Inspect the active document

Tool:
- `illustrator_inspect_document`

Arguments:

```json
{}
```

Expected:
- document metadata returned

5. Run a custom script

Tool:
- `illustrator_run_script`

Arguments:

```json
{
  "scriptSource": "var doc = helpers.resolveDocument(input); var text = doc.textFrames.add(); text.contents = 'Hello from MCP'; text.position = [100, 700]; return { name: doc.name, textFrames: doc.textFrames.length };"
}
```

Expected:
- a text frame is added to the current document

6. Export a PNG

Tool:
- `illustrator_export_document`

Arguments:

```json
{
  "outputPath": "/tmp/illustrator-mcp-test.png",
  "format": "png24",
  "artBoardClipping": true
}
```

Expected:
- `/tmp/illustrator-mcp-test.png` exists

## Photoshop UXP Plugin Setup

The Photoshop path is different from Illustrator.

Photoshop does not run directly from AppleScript in this implementation. Instead:

1. Start the MCP server.
2. Load the UXP plugin from `plugins/photoshop-uxp`.
3. Open the `Adobe MCP` panel inside Photoshop.
4. Confirm the bridge URL and token match the MCP server env vars.
5. Click `Start Bridge`.
6. Run Photoshop MCP tools from Claude Desktop or Codex.

### Install the Photoshop Plugin

Requires **Photoshop 25.0 or later** (2024 release).

1. Open Adobe UXP Developer Tool.
2. Choose `Add Plugin`.
3. Select the `plugins/photoshop-uxp` folder from this repo.
4. Launch the plugin in Photoshop.
5. Open the `Adobe MCP` panel.
6. Click `Start Bridge`.

See `plugins/photoshop-uxp/README.md` for the focused plugin instructions.

### Photoshop Manual Test Flow

1. Check plugin bridge status

Tool:
- `photoshop_bridge_status`

Expected:
- bridge listening on `127.0.0.1`
- after starting the panel bridge, `connected: true`

2. Check full Photoshop status

Tool:
- `photoshop_get_status`

Expected:
- bridge section present
- runtime section present

3. Create a document

Tool:
- `photoshop_create_document`

Arguments:

```json
{
  "width": 1200,
  "height": 800,
  "name": "MCP Photoshop Test"
}
```

4. Inspect the active document

Tool:
- `photoshop_inspect_active_document`

Arguments:

```json
{}
```

5. Add a text layer

Tool:
- `photoshop_add_text_layer`

Arguments:

```json
{
  "contents": "Hello from MCP",
  "fontSize": 42,
  "x": 140,
  "y": 180
}
```

6. Export the active document

Tool:
- `photoshop_export_active_document`

Arguments:

```json
{
  "outputPath": "/tmp/photoshop-mcp-test.png",
  "format": "png"
}
```

Expected:
- `/tmp/photoshop-mcp-test.png` exists

## Current Tool Surface

- `adobe_desktop_health`
- `adobe_desktop_list_apps`
- `adobe_desktop_get_app_status`
- `adobe_desktop_get_capability_matrix`
- `illustrator_get_status`
- `illustrator_list_supported_operations`
- `illustrator_create_document`
- `illustrator_open_document`
- `illustrator_inspect_document`
- `illustrator_export_document`
- `illustrator_run_script`
- `photoshop_get_status`
- `photoshop_list_supported_operations`
- `photoshop_bridge_status`
- `photoshop_list_documents`
- `photoshop_create_document`
- `photoshop_open_document`
- `photoshop_inspect_active_document`
- `photoshop_export_active_document`
- `photoshop_add_text_layer`
- `indesign_get_status`
- `indesign_list_supported_operations`
- `acrobat_get_status`
- `acrobat_list_supported_operations`
- `aftereffects_get_status`
- `aftereffects_list_supported_operations`
- `premiere_get_status`
- `premiere_list_supported_operations`

## Troubleshooting

- `illustrator_get_status` says unavailable:
  Check `ADOBE_MCP_ILLUSTRATOR_PATH` and make sure Illustrator is installed.
- `photoshop_bridge_status` shows not connected:
  Open the Photoshop panel and click `Start Bridge`.
- Photoshop bridge auth fails:
  Make sure the panel token matches `ADOBE_MCP_PHOTOSHOP_PLUGIN_TOKEN`.
- Photoshop commands fail immediately:
  The UXP plugin may not have file/network permissions or Photoshop may not have an active document when required.
- Illustrator does not open:
  macOS may be blocking Apple Events or Automation permissions.
- The tool hangs waiting for results:
  Illustrator may have shown a permission dialog or may not have executed the script.
- Export fails:
  Check write permissions for the output directory.
- The MCP server starts but tools do not show up:
  Restart the MCP client after updating its config.

## Important Limitations

- Real automation is implemented for Illustrator (macOS) and Photoshop (UXP companion plugin).
- Photoshop automation requires Photoshop 25.0+ and the UXP plugin loaded via UXP Developer Tool.
- InDesign, Acrobat, After Effects, and Premiere Pro are discovery and capability reporting only — no real automation yet.
- Illustrator automation is macOS-only (AppleScript + ExtendScript).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Run locally:

```bash
npm run dev
```

## Roadmap

- Milestone 0: validate external-script and companion-plugin proof-of-concepts
- Milestone 1: shared MCP core and discovery layer
- Milestone 2: Illustrator direct bridge
- Milestone 3: Photoshop hybrid bridge
- Milestone 4: InDesign UXP-first bridge
- Milestone 5: Acrobat limited bridge
- Milestone 6: After Effects and/or Premiere only after spikes succeed
- Milestone 7: packaging, docs, QA, and SKILL.md refinement
