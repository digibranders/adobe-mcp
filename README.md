# adobe-desktop-mcp

Local MCP server enabling AI agents to automate Adobe Creative Cloud desktop apps. Works with Claude Desktop, Claude Code, and any MCP-compatible agent.

| App | Status | Tools |
|-----|--------|-------|
| **Photoshop** | Full automation (UXP plugin) | 34 tools + arbitrary script execution |
| **Illustrator** | Full automation (macOS only) | 7 tools (AppleScript + ExtendScript) |
| InDesign | Discovery only | 2 tools (status + capability reporting) |
| Acrobat | Discovery only | 2 tools (status + capability reporting) |
| After Effects | Discovery only | 2 tools (status + capability reporting) |
| Premiere Pro | Discovery only | 2 tools (status + capability reporting) |

Plus **4 core tools** for health checks, app status, and capability discovery across all apps.

## Prerequisites

- **Node.js** v20.11.0 or later
- **Photoshop** 25.0+ (for Photoshop automation)
- **macOS** (for Illustrator automation — Windows not yet supported)

## Quick Start

```bash
git clone https://github.com/digibranders/adobe-mcp.git
cd adobe-mcp
npm install && npm run build
```

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "adobe-desktop-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/adobe-mcp/dist/index.js"],
      "env": {
        "ADOBE_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Claude Code

Add to your Claude Code settings (`.claude/settings.json` or global config):

```json
{
  "mcpServers": {
    "adobe-desktop-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/adobe-mcp/dist/index.js"],
      "env": {
        "ADOBE_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

> Replace `/absolute/path/to/adobe-mcp` with the actual path where you cloned the repo.

## Photoshop Setup (One-Time)

Requires **Photoshop 25.0+**.

### 1. Install the UXP Plugin

```bash
# macOS
chmod +x scripts/install-photoshop-plugin.sh
./scripts/install-photoshop-plugin.sh

# Windows — double-click or run from Command Prompt
scripts\install-photoshop-plugin.bat
```

### 2. Open the Plugin Panel

1. Restart Photoshop (if it was already running)
2. Go to **Plugins > Adobe MCP** to open the panel
3. The panel auto-connects to the MCP server and auto-reconnects on disconnection

### Fallback: Manual Plugin Load

If the plugin doesn't appear in the Plugins menu after installation:

1. Download and open [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/)
2. Click **Add Plugin** and select the `plugins/photoshop-uxp` directory
3. Click **Load** to activate it in Photoshop
4. After the first load, it persists across restarts

## How It Works

```
AI Agent (Claude)  ←→  MCP Server (Node.js, stdio)  ←→  HTTP Bridge (localhost:47123)  ←→  UXP Plugin (inside Photoshop)
```

1. The **MCP server** runs as a Node.js process and communicates with the AI agent over stdio
2. For Photoshop, a local **HTTP bridge** listens on `localhost:47123`
3. The **UXP plugin** (running inside Photoshop) polls the bridge for pending commands
4. Commands execute via Photoshop's batchPlay API, and results flow back to the agent
5. For Illustrator, the bridge uses macOS **AppleScript** to run ExtendScript inside Illustrator

The Photoshop plugin must have its panel open for the bridge to work. It auto-reconnects with exponential backoff if the connection drops.

## Tool Reference

### Core Tools (4)

| Tool | Description |
|------|-------------|
| `adobe_desktop_health` | Get MCP server health info (version, config) |
| `adobe_desktop_get_app_status` | Get runtime status for a specific Adobe app |
| `adobe_desktop_list_apps` | List all Adobe apps with their current status |
| `adobe_desktop_get_capability_matrix` | Full capability matrix for all apps (bridge strategies, feasibility scores) |

### Photoshop Tools (34)

| Category | Tools |
|----------|-------|
| **Status** | `get_status`, `list_supported_operations`, `bridge_status` |
| **Documents** | `create_document`, `open_document`, `save_document`, `close_document`, `list_documents`, `inspect_active_document`, `set_active_document`, `export_active_document`, `canvas_snapshot` |
| **Layers** | `add_text_layer`, `add_shape_layer`, `duplicate_layer`, `delete_layer`, `get_layer_info`, `set_layer_properties`, `transform_layer` (move/scale/rotate), `copy_layer_to_document`, `flatten_image`, `merge_visible` |
| **Editing** | `resize_image`, `crop_document`, `fill_color`, `apply_adjustment` (brightness/contrast, hue/sat, curves, levels), `apply_filter` (gaussian blur, motion blur, sharpen, unsharp mask, noise) |
| **Selections** | `select_all`, `deselect`, `select_color_range` |
| **History** | `undo` (multi-step), `redo` (multi-step) |
| **Automation** | `run_action` (run Photoshop Actions), `run_script` (arbitrary UXP JavaScript) |

> All tool names are prefixed with `photoshop_` (e.g. `photoshop_create_document`).

`photoshop_run_script` accepts arbitrary UXP JavaScript, giving access to the full Photoshop API beyond the built-in tools.

`photoshop_canvas_snapshot` exports a scaled PNG so the AI can visually inspect the current canvas state.

### Illustrator Tools (7)

| Tool | Description |
|------|-------------|
| `illustrator_get_status` | Check availability, version, and bridge config |
| `illustrator_list_supported_operations` | List all supported operations |
| `illustrator_create_document` | Create new document (dimensions, artboards, color space) |
| `illustrator_open_document` | Open document from file path |
| `illustrator_inspect_document` | Get metadata (dimensions, artboards, layers, page items) |
| `illustrator_export_document` | Export to PNG, JPEG, SVG, PDF, AI, EPS |
| `illustrator_run_script` | Execute custom ExtendScript with full Illustrator DOM access |

> Illustrator bridge is **macOS only** (uses AppleScript + ExtendScript).

### Discovery-Only Apps (2 tools each)

InDesign, Acrobat, After Effects, and Premiere Pro each expose:
- `<app>_get_status` — check if the app is running and its version
- `<app>_list_supported_operations` — list what operations the bridge supports

These apps have adapter stubs ready for future plugin development but do not yet support automation commands.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADOBE_MCP_LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `ADOBE_MCP_TEMP_ROOT` | `~/.adobe-desktop-mcp` | Temp directory for bridge IPC files |
| `ADOBE_MCP_PROBE_CACHE_TTL_MS` | `15000` | How long to cache app status probes (ms) |
| `ADOBE_MCP_PHOTOSHOP_PLUGIN_PORT` | `47123` | HTTP bridge port for Photoshop UXP plugin |
| `ADOBE_MCP_PHOTOSHOP_PLUGIN_TOKEN` | `adobe-mcp-dev-token` | Auth token for bridge communication |
| `ADOBE_MCP_ILLUSTRATOR_PATH` | auto-detect | Path to Illustrator.app (macOS) |

### Per-App Overrides

Each app supports `ADOBE_MCP_<APP>_ENABLED`, `_PATH`, `_MIN_VERSION`, `_PLUGIN_PORT`, and `_PLUGIN_TOKEN` where `<APP>` is one of: `PHOTOSHOP`, `ILLUSTRATOR`, `INDESIGN`, `ACROBAT`, `AFTEREFFECTS`, `PREMIERE`.

Example: `ADOBE_MCP_PHOTOSHOP_ENABLED=false` disables the Photoshop adapter entirely.

## Do's and Don'ts

### Do

- **Do** keep the Photoshop plugin panel open while using Photoshop tools — the bridge only works when the panel is active
- **Do** use `photoshop_bridge_status` to check the connection before running a batch of commands
- **Do** use `photoshop_canvas_snapshot` to visually verify the result after making changes
- **Do** use `photoshop_run_script` for complex operations not covered by built-in tools — it has full Photoshop API access
- **Do** use `photoshop_inspect_active_document` before manipulating layers to get accurate layer IDs
- **Do** use `adobe_desktop_get_app_status` to check if an app is running before sending commands
- **Do** save your document before running destructive operations (flatten, merge, crop)
- **Do** use `photoshop_undo` if a command produces unexpected results — it supports multi-step undo
- **Do** use `illustrator_run_script` for Illustrator operations beyond the built-in 7 tools

### Don't

- **Don't** close the Photoshop plugin panel while automation is running — the bridge will disconnect
- **Don't** send commands to Photoshop while a modal dialog is open (e.g. Save As, Print) — commands will time out
- **Don't** assume layer IDs persist across sessions — always re-inspect the document to get current IDs
- **Don't** try to use Generative Fill/Expand via `run_script` — these are cloud-gated and have no API access
- **Don't** use Illustrator tools on Windows — the AppleScript bridge is macOS only
- **Don't** expect real-time canvas previews — `canvas_snapshot` captures a static PNG at the moment of the call
- **Don't** run multiple MCP server instances on the same port — they will conflict on port 47123
- **Don't** change the bridge token in the environment without also updating it in the plugin panel's Advanced settings
- **Don't** rely on discovery-only app tools (InDesign, Acrobat, etc.) for automation — they only report status

## Troubleshooting

### Plugin doesn't appear in Photoshop's Plugins menu

1. Make sure you ran the install script and **restarted Photoshop** afterward
2. Check that your Photoshop version is **25.0 or later** (`Help > About Photoshop`)
3. Try loading manually via [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/) → Add Plugin → select `plugins/photoshop-uxp`

### Bridge shows "Disconnected" in the plugin panel

1. Make sure the MCP server is running (it starts the HTTP bridge automatically)
2. Check that nothing else is using port **47123** (`lsof -i :47123` on macOS)
3. Verify the bridge URL in the plugin's Advanced section matches `http://127.0.0.1:47123`
4. Click **Reconnect** in the plugin panel

### Commands time out (60s default)

1. Check that Photoshop doesn't have a **modal dialog** open (Save As, alerts, etc.)
2. Verify the plugin panel shows **Connected** status
3. For long operations, some tools accept an optional `timeout` parameter (up to 300,000ms)

### Illustrator tools fail

1. Confirm you are on **macOS** — the Illustrator bridge uses AppleScript
2. Ensure Illustrator is running and has granted automation permissions (`System Settings > Privacy & Security > Automation`)
3. Check the `ADOBE_MCP_ILLUSTRATOR_PATH` env var if auto-detect fails

### MCP server won't start

1. Verify Node.js version: `node --version` (must be v20.11.0+)
2. Ensure you ran `npm install && npm run build` first
3. Check the `dist/index.js` file exists

## Known Limitations

- **Generative Fill/Expand**: Cloud-gated features with no API access
- **3D layers / Video timeline**: Not exposed via batchPlay
- **Canvas snapshots are static**: Not real-time previews, captured at the moment of the call
- **Photoshop panel must be open**: The UXP plugin bridge only works when the panel is visible
- **Illustrator is macOS-only**: The AppleScript bridge does not work on Windows
- **Discovery-only apps**: InDesign, Acrobat, After Effects, and Premiere have status reporting only — automation plugins are not yet implemented

## Development

```bash
npm run dev         # Run server locally with tsx (no build needed)
npm run typecheck   # Type check without emitting
npm test            # Run tests (vitest)
npm run build       # Production build to dist/
```

## License

MIT
