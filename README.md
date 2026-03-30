# adobe-desktop-mcp

`adobe-desktop-mcp` is a local TypeScript/Node.js MCP server for Adobe desktop applications.

Current phase:

- Illustrator: real bridge on macOS
- Photoshop, InDesign, Acrobat, After Effects, Premiere Pro: discovery and capability reporting only

This is not yet a fully operational multi-app Adobe automation stack. It is a production-oriented MCP core plus a real first host integration.

## What Works Today

- stdio MCP server based on `@modelcontextprotocol/sdk`
- typed config, logging, process orchestration, temp-file handling, and adapter registry
- real macOS Illustrator automation through AppleScript invoking ExtendScript wrappers
- capability matrix and status tools for all target Adobe hosts
- packageable local artifact for Claude Desktop and Codex-compatible clients

## Prerequisites

- macOS
- Node.js 20.11+ or newer
- Adobe Illustrator installed
- Claude Desktop or another MCP client
- macOS permission to allow terminal/host app automation of Illustrator when prompted

## Install From Source

```bash
cd /Users/siddiqueahmed/Desktop/AI/claude-adobe-mcp
npm install
npm run typecheck
npm test
npm run build
```

This produces the MCP server entrypoint at:

- `dist/index.js`

## Package Artifact

An installable tarball has also been generated:

- `adobe-desktop-mcp-0.1.0.tgz`

You can regenerate it with:

```bash
npm pack
```

## Environment Configuration

Copy or adapt [.env.example](/Users/siddiqueahmed/Desktop/AI/claude-adobe-mcp/.env.example).

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

## Claude Desktop Setup

Use [docs/claude_desktop_config.example.json](/Users/siddiqueahmed/Desktop/AI/claude-adobe-mcp/docs/claude_desktop_config.example.json) as the starting point.

Example:

```json
{
  "mcpServers": {
    "adobe-desktop-mcp": {
      "command": "node",
      "args": [
        "/Users/siddiqueahmed/Desktop/AI/claude-adobe-mcp/dist/index.js"
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
- args: `/Users/siddiqueahmed/Desktop/AI/claude-adobe-mcp/dist/index.js`
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
- Illustrator does not open:
  macOS may be blocking Apple Events or Automation permissions.
- The tool hangs waiting for results:
  Illustrator may have shown a permission dialog or may not have executed the script.
- Export fails:
  Check write permissions for the output directory.
- The MCP server starts but tools do not show up:
  Restart the MCP client after updating its config.

## Important Limitations

- Real automation is implemented only for Illustrator on macOS in this phase.
- I have validated build, startup, packaging, and tool wiring, but not end-to-end execution against a live Illustrator install on this machine.
- The other Adobe hosts are not falsely advertised as operational yet.

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
