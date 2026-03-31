# adobe-desktop-mcp

Local MCP server enabling AI agents to automate Adobe Creative Cloud desktop apps.

| App | Status | Commands |
|-----|--------|----------|
| **Photoshop** | Full automation (UXP plugin) | 31 tools + arbitrary script execution |
| **Illustrator** | Full automation (macOS) | 7 tools (AppleScript + ExtendScript) |
| InDesign, Acrobat, After Effects, Premiere | Discovery only | Status + capability reporting |

## Quick Start

```bash
git clone https://github.com/digibranders/adobe-mcp.git
cd adobe-mcp
npm install && npm run build
```

### Claude Desktop Config

Add to your Claude Desktop MCP config (replace paths):

```json
{
  "mcpServers": {
    "adobe-desktop-mcp": {
      "command": "node",
      "args": ["/path/to/adobe-mcp/dist/index.js"],
      "env": {
        "ADOBE_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Photoshop Setup (One-Time)

Requires **Photoshop 25.0+**.

```bash
# macOS
./scripts/install-photoshop-plugin.sh

# Windows — double-click scripts/install-photoshop-plugin.bat
```

Then open Photoshop → **Plugins > Adobe MCP**. The bridge auto-connects and auto-reconnects. No manual steps after this.

If the plugin doesn't appear, load it once via [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/) → **Add Plugin** → select `plugins/photoshop-uxp`.

## Photoshop Tools (31)

| Category | Tools |
|----------|-------|
| **Documents** | create, open, save, close, list, inspect, set active, canvas snapshot |
| **Layers** | add text, add shape, duplicate, delete, set properties, transform (move/scale/rotate), copy to other document, flatten, merge visible |
| **Editing** | resize image, crop, fill color, apply adjustment (brightness/contrast, hue/sat, curves, levels), apply filter (blur, sharpen, noise, unsharp mask) |
| **Selections** | select all, deselect, select by color range |
| **History** | undo (multi-step), redo (multi-step) |
| **Automation** | run Photoshop Actions, **run arbitrary UXP/batchPlay scripts** |
| **Status** | bridge status, app status, supported operations |

`photoshop_run_script` accepts arbitrary UXP JavaScript, giving access to the full Photoshop API beyond the built-in tools.

`photoshop_canvas_snapshot` exports a scaled PNG so the AI can visually inspect the canvas.

## Illustrator Tools (7)

create, open, inspect, export (PNG/SVG/PDF/AI/EPS), run custom ExtendScript. macOS only.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADOBE_MCP_LOG_LEVEL` | `info` | Log level |
| `ADOBE_MCP_ILLUSTRATOR_PATH` | auto-detect | Path to Illustrator.app |
| `ADOBE_MCP_PHOTOSHOP_PLUGIN_PORT` | `47123` | Bridge port |
| `ADOBE_MCP_PHOTOSHOP_PLUGIN_TOKEN` | `adobe-mcp-dev-token` | Bridge auth token |

Per-app overrides: `ADOBE_MCP_<APP>_ENABLED`, `_PATH`, `_MIN_VERSION`, `_PLUGIN_PORT`, `_PLUGIN_TOKEN`

## Known Limitations

- **Generative Fill/Expand**: Cloud-gated, no API access
- **3D / Video timeline**: Not exposed via batchPlay
- **Canvas snapshots are static**, not real-time previews
- Photoshop panel must be open for the bridge to work
- Illustrator bridge is macOS-only

## Development

```bash
npm run typecheck   # Type check
npm test            # Run tests
npm run build       # Production build
npm run dev         # Run locally
```
