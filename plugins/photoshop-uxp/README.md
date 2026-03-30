# photoshop-uxp companion

This is the Photoshop UXP companion plugin for `adobe-desktop-mcp`.

## What It Does

- connects to the local MCP bridge over `http://127.0.0.1`
- registers a Photoshop session with the MCP server
- polls for bounded commands
- executes Photoshop DOM operations through UXP
- posts structured results back to the MCP process

## Implemented Commands

- list documents
- create document
- open document
- inspect active document
- export active document
- add text layer

## Install In Photoshop

1. Open UXP Developer Tool.
2. Choose `Add Plugin`.
3. Select this folder: `plugins/photoshop-uxp`
4. Load the plugin into Photoshop.
5. Open the `Adobe MCP` panel.
6. Start the MCP server.
7. Click `Start Bridge` in the panel.

Default bridge settings:

- URL: `http://127.0.0.1:47123/photoshop-bridge`
- Token: `adobe-mcp-dev-token`

If you override `ADOBE_MCP_PHOTOSHOP_PLUGIN_PORT` or `ADOBE_MCP_PHOTOSHOP_PLUGIN_TOKEN` on the MCP side, update the panel values to match.
