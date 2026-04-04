# Obsidian LLM

An Obsidian plugin that calls LLMs directly from your notes. Ask questions about selected text, process inline `{{llm: ...}}` templates in batch, or translate text in place — all with live streaming responses.

Supports **OpenAI** and **Anthropic** models out of the box, plus any OpenAI-compatible provider via custom base URL.

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

Then run **LLM: Process Templates** from the command palette. Each template block is replaced live as the LLM responds — you see text streaming in, just like the Ask Question callout. Surrounding text is used as context.

Templates inside fenced code blocks are ignored.

### Translate

1. Select text (or just place your cursor in a paragraph)
2. Run **LLM: Translate** from the command palette
3. The translation streams in as an HTML comment block directly after the source text:

```markdown
Some text in French.

<!--
tr
p
@2026-04-04
---
Some text translated to English.
-->
```

The comment block is invisible in Obsidian's reading/preview mode, keeping your notes clean. The metadata lines encode:

- `tr` — translation marker
- `p` — single paragraph (`p__` for 2 paragraphs, `p___` for 3, etc.)
- `@YYYY-MM-DD` — date of translation

The target language defaults to English and can be changed in settings.

**Heading context**: The Translate command automatically includes the document's heading hierarchy in the prompt to improve translation quality. For example, if your cursor is inside a subsection, the LLM receives context like:

```
The text appears in: MyNote: # Philosophy > ## Chapter 2 > ### The Education of the Philosopher
```

This helps the LLM make better lexical choices for domain-specific terminology. If the selection spans multiple sections, a range is shown (e.g. `### Section 2.2 … ### Section 2.4`).

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

**Model** — Select from the dropdown (OpenAI and Anthropic models listed) or choose "Custom..." to enter any model ID.

**OpenAI**

| Setting | Description |
|---------|-------------|
| **API Key** | Your OpenAI API key (`sk-...`) |
| **Base URL** | Custom endpoint (leave empty for OpenAI default). Use this for compatible providers like Ollama, Together, or Azure OpenAI. |

**Anthropic**

| Setting | Description |
|---------|-------------|
| **API Key** | Your Anthropic API key (`sk-ant-...`) |
| **Base URL** | Custom endpoint (leave empty for Anthropic default) |

**General**

| Setting | Description |
|---------|-------------|
| **System Prompt** | Default system prompt sent with every request |
| **Temperature** | 0 (deterministic) to 1 (creative), default 0.7 |
| **Translation Language** | Target language for the Translate command (default: English) |

You only need to configure the API key for the provider whose models you want to use. You can configure both and switch between them by changing the model.

### Debugging

All three commands log the full prompt payload to Obsidian's developer console before each LLM call. Open the console with **Ctrl/Cmd+Shift+I** and filter for `[LLM]` to inspect the exact prompt, system prompt, and options being sent.

## Development

```bash
npm install
npm run dev          # esbuild watch mode
npm test             # run 93 tests
npm run test:watch   # vitest watch mode
npm run build        # production build (tsc + esbuild)
```

### Project structure

```
src/
  main.ts              Plugin entrypoint and command handlers
  config.ts            Settings interface, defaults, provider routing, migration
  settings.ts          Obsidian settings tab UI (per-provider sections, model dropdown)
  bridge.ts            WASM bridge (init, client lifecycle, streaming)
  fetch-patch.ts       CORS bypass for Anthropic API (Node.js https fetch patch)
  template-parser.ts   Find {{llm: ...}} blocks in markdown
  context-extractor.ts Extract surrounding paragraphs for context
  prompt-formatter.ts  Assemble prompt from question + context + metadata
  heading-context.ts   Build heading breadcrumb from document structure
  question-bar.ts      CodeMirror 6 panel for question input
  response-inserter.ts Streaming response insertion (callouts, templates, translation)
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

### Technical notes

**CORS and Anthropic**: The WASM module uses browser `fetch()` internally (via reqwest compiled to WASM). OpenAI's API sends CORS headers; Anthropic's does not. The plugin patches `globalThis.fetch` to detect Anthropic requests (by the `x-api-key` header) and routes them through Node.js `https`, which is available in Obsidian's Electron context and not subject to CORS. Streaming is preserved. See `src/fetch-patch.ts` and `doc/implementation.md` (Phase 13) for details.

**Settings migration**: Users upgrading from v0.1.0 (single API key) to v0.2.0 (per-provider keys) get automatic migration — the old `apiKey` and `baseUrl` fields are copied to `openaiApiKey` and `openaiBaseUrl`, then the legacy fields are removed.

## License

MIT
