#!/usr/bin/env bash
# One-time installation of the Adobe MCP Photoshop UXP plugin.
# After running this script, the plugin loads automatically whenever Photoshop starts.
#
# Usage:
#   chmod +x scripts/install-photoshop-plugin.sh
#   ./scripts/install-photoshop-plugin.sh

set -euo pipefail

PLUGIN_ID="com.digibranders.adobe-desktop-mcp.photoshop"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_SRC="$PROJECT_ROOT/plugins/photoshop-uxp"

# UXP managed plugins directory (Photoshop)
UXP_PLUGINS_BASE="$HOME/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP"

if [ ! -d "$PLUGIN_SRC" ]; then
  echo "Error: Plugin source not found at $PLUGIN_SRC"
  exit 1
fi

echo "Adobe MCP Photoshop Plugin Installer"
echo "====================================="
echo ""

# Find or create the plugins directory
# UXP Developer Tool uses a versioned structure; we target the latest PS version dir if it exists
TARGET_DIR=""
if [ -d "$UXP_PLUGINS_BASE" ]; then
  # Find the most recent PS version directory
  LATEST_VERSION_DIR=$(find "$UXP_PLUGINS_BASE" -maxdepth 1 -type d -name "[0-9]*" 2>/dev/null | sort -V | tail -1)
  if [ -n "$LATEST_VERSION_DIR" ]; then
    TARGET_DIR="$LATEST_VERSION_DIR/Internal/$PLUGIN_ID"
  fi
fi

# Fallback: use the base directory with a default version
if [ -z "$TARGET_DIR" ]; then
  mkdir -p "$UXP_PLUGINS_BASE"
  TARGET_DIR="$UXP_PLUGINS_BASE/Internal/$PLUGIN_ID"
fi

echo "Source:  $PLUGIN_SRC"
echo "Target:  $TARGET_DIR"
echo ""

# Remove previous installation if it exists
if [ -d "$TARGET_DIR" ]; then
  echo "Removing previous installation..."
  rm -rf "$TARGET_DIR"
fi

# Copy plugin files
mkdir -p "$TARGET_DIR"
cp "$PLUGIN_SRC/manifest.json" "$TARGET_DIR/"
cp "$PLUGIN_SRC/main.js" "$TARGET_DIR/"
cp "$PLUGIN_SRC/index.html" "$TARGET_DIR/"
cp "$PLUGIN_SRC/styles.css" "$TARGET_DIR/"

echo "Plugin files copied."
echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Restart Photoshop (if it is currently running)"
echo "  2. Go to Plugins > Adobe MCP to open the panel"
echo "  3. The bridge will auto-connect to the MCP server"
echo ""
echo "NOTE: If the plugin does not appear in Photoshop's Plugins menu,"
echo "you may need to load it once via UXP Developer Tool:"
echo "  1. Open UXP Developer Tool"
echo "  2. Click 'Add Plugin' and select: $PLUGIN_SRC"
echo "  3. Click 'Load' to activate it in Photoshop"
echo "  4. After the first load, it will persist across restarts"
