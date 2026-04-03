# Obsidian LLM

An Obsidian plugin that calls LLMs directly from your notes. Ask questions about selected text and get streaming responses as callouts, or place `{{llm: ...}}` templates in your notes and process them in batch.

Uses a WASM-compiled Rust client ([llm-rs](https://github.com/simonw/llm)) for LLM API calls — no external processes, no Electron IPC, just the plugin and the API.

Desktop only.

## Features

### Ask Question

1. Select text in a note (optional)
2. Open command palette and run **LLM: Ask Question**
3. Type your question in the input bar that appears at the bottom of the editor
4. Press **Cmd/Ctrl+Enter** to submit (or **Esc** to cancel)
5. The response streams in as a foldable callout below your cursor:

```markdown
> [!llm]+ Response
> The selected code defines a function that...
```

### Process Templates

Write `{{llm: ...}}` blocks anywhere in your note:

```markdown
## My Research Notes

The transformer architecture was introduced in 2017.

{{llm: summarize the key innovation of transformers in one sentence}}

Some more notes here...

{{llm: suggest three follow-up questions based on this section}}
```

Then run **LLM: Process Templates** from the command palette. Each template block is replaced with the LLM's response, using the surrounding text as context.

Templates inside fenced code blocks are ignored.

## Setup

### Prerequisites

- [llm-rs](https://github.com/simonw/llm) cloned at `~/Projects/llm-rs` with the WASM package built:
  ```bash
  cd ~/Projects/llm-rs
  wasm-pack build crates/llm-wasm --target web
  ```

### Install

```bash
git clone <this-repo> ~/Projects/obsidian-llm
cd ~/Projects/obsidian-llm
./install.sh              # builds, tests, and installs to ~/Documents/Ekuro
# or
./install.sh /path/to/your/vault
```

This copies `main.js`, `manifest.json`, `styles.css`, and `llm_wasm_bg.wasm` into `<vault>/.obsidian/plugins/obsidian-llm/`.

Restart Obsidian, then enable **LLM** under Settings > Community Plugins.

### Configuration

Open Settings > LLM and configure:

| Setting | Description |
|---------|-------------|
| **API Key** | Your OpenAI (or compatible provider) API key |
| **Model** | Model identifier, e.g. `gpt-4o-mini`, `gpt-4o` |
| **Base URL** | Custom API endpoint (leave empty for OpenAI default) |
| **System Prompt** | Default system prompt sent with every request |
| **Temperature** | 0 (deterministic) to 1 (creative), default 0.7 |

The plugin works with any OpenAI-compatible API. Set the **Base URL** to use providers like Ollama, Together, or Azure OpenAI.

## Development

```bash
npm install
npm run dev          # esbuild watch mode
npm test             # run 35 tests
npm run test:watch   # vitest watch mode
npm run build        # production build (tsc + esbuild)
```

### Project structure

```
src/
  main.ts              Plugin entrypoint and command handlers
  config.ts            Settings interface and defaults
  settings.ts          Obsidian settings tab UI
  bridge.ts            WASM bridge (init, client lifecycle, streaming)
  template-parser.ts   Find {{llm: ...}} blocks in markdown
  context-extractor.ts Extract surrounding paragraphs for context
  prompt-formatter.ts  Assemble prompt from question + context + metadata
  question-bar.ts      CodeMirror 6 panel for question input
  response-inserter.ts Insert responses into the editor
  __tests__/           Test files (vitest)
```

### Rebuilding the WASM dependency

If you modify the Rust source in `llm-rs`:

```bash
cd ~/Projects/llm-rs
wasm-pack build crates/llm-wasm --target web
cd ~/Projects/obsidian-llm
npm install    # re-links the file: dependency
npm run build
```

## License

MIT
