#!/usr/bin/env bash
set -euo pipefail

# obsidian-llm — build and install into an Obsidian vault
#
# Usage:
#   ./install.sh                          # uses default vault
#   ./install.sh /path/to/vault           # specify vault
#   VAULT=/path/to/vault ./install.sh     # via env var

DEFAULT_VAULT="$HOME/Documents/Ekuro"
VAULT="${1:-${VAULT:-$DEFAULT_VAULT}}"
PLUGIN_DIR="$VAULT/.obsidian/plugins/obsidian-llm"
WASM_SRC="$HOME/Projects/llm-rs/crates/llm-wasm/pkg"

if [ ! -d "$VAULT/.obsidian" ]; then
    echo "Error: $VAULT does not contain .obsidian/ — not a valid vault."
    exit 1
fi

echo "==> Installing npm dependencies..."
npm install --silent

echo "==> Building TypeScript..."
node esbuild.config.mjs production

echo "==> Running tests..."
npx vitest run

echo "==> Installing to $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp main.js         "$PLUGIN_DIR/"
cp manifest.json   "$PLUGIN_DIR/"
cp styles.css      "$PLUGIN_DIR/"
cp "$WASM_SRC/llm_wasm_bg.wasm" "$PLUGIN_DIR/"

WASM_SIZE=$(du -h "$PLUGIN_DIR/llm_wasm_bg.wasm" | cut -f1)
JS_SIZE=$(du -h "$PLUGIN_DIR/main.js" | cut -f1)

echo ""
echo "==> Installed successfully!"
echo "    main.js              $JS_SIZE"
echo "    llm_wasm_bg.wasm     $WASM_SIZE"
echo "    manifest.json"
echo "    styles.css"
echo ""
echo "    Restart Obsidian and enable LLM in Community Plugins."
