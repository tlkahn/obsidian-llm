# Obsidian LLM Plugin

Desktop-only Obsidian plugin that calls LLMs (OpenAI and Anthropic) directly from notes via WASM (`llm-wasm` from `llm-rs`). Three commands: interactive prompt with streaming callout response, batch `{{llm: ...}}` template processing, and in-place translation with structured HTML comment output. TypeScript handles UI; WASM handles LLM API calls.

## Quick orientation

```
src/
  main.ts              Plugin entrypoint: commands, lifecycle, wires modules together
  config.ts            PluginSettings, DEFAULT_SETTINGS, Provider type, KNOWN_MODELS,
                       getProviderForModel(), migrateSettings(), getActiveApiKey(), getActiveBaseUrl()
  settings.ts          PluginSettingTab (per-provider API keys/URLs, model dropdown,
                       system prompt, temperature, translation language)
  bridge.ts            WasmBridge: WASM init, fetch CORS patch, LlmClient lifecycle,
                       streaming with concurrency guard
  fetch-patch.ts       Patches globalThis.fetch to bypass CORS for Anthropic API
                       (routes via Node.js https, preserves streaming)
  template-parser.ts   Pure fn: find {{llm: ...}} blocks, skip code fences
  context-extractor.ts Pure fn: extract surrounding paragraphs, exclude template text
  prompt-formatter.ts  Pure fn: question + context + filePath → prompt string
  heading-context.ts   Pure fn: build heading breadcrumb from metadataCache headings + selection range
  question-bar.ts      CM6 panel for question input (Cmd/Ctrl+Enter submit, Esc cancel)
  response-inserter.ts CalloutInserter (Ask Question) + StreamingTemplateReplacer (templates)
                       + TranslationInserter (translate) + replaceTemplateBlock (non-streaming fallback)
  __tests__/           8 test files, 93 tests total
styles.css             Question bar + streaming indicator CSS
install.sh             Build + deploy to Obsidian vault
doc/implementation.md  Build history, design decisions, and debugging notes
```

## Build commands

```bash
npm run build          # tsc + esbuild → main.js
npm run dev            # esbuild watch mode
npm test               # vitest run (93 tests)
npm run test:watch     # vitest watch mode
./install.sh [vault]   # build + test + install to vault (default: ~/Documents/Ekuro)
```

## Dependencies

- **llm-wasm** (`file:../llm-rs/crates/llm-wasm/pkg`): Pre-built WASM package from llm-rs. Rebuild with `wasm-pack build crates/llm-wasm --target web` in the llm-rs repo if the Rust source changes. Exports four `LlmClient` constructors (OpenAI default/custom, Anthropic default/custom).
- **obsidian**: Obsidian API types (devDependency).
- **@codemirror/state**, **@codemirror/view**: Used by the question bar panel (externalized by esbuild, provided by Obsidian at runtime).

## Architecture

- **Multi-provider support**: `getProviderForModel()` routes by `claude` prefix → `"anthropic"`, else `"openai"`. Per-provider API key/URL fields in settings. `WasmBridge.createClient()` routes to the correct WASM constructor. `migrateSettings()` handles legacy single-key format (v0.1.0 → v0.2.0).
- **CORS bypass**: Anthropic's API doesn't send CORS headers, so browser `fetch()` from Obsidian's Electron origin is blocked. `fetch-patch.ts` monkey-patches `globalThis.fetch` (called once in `WasmBridge.init()`) to detect Anthropic requests by the `x-api-key` header and route them through Node.js `https` (not subject to CORS). Streaming is preserved via `ReadableStream` wrapping the Node.js `IncomingMessage`. The synthetic `Response.url` is overridden via `Object.defineProperty` because reqwest's WASM layer calls `Url::parse(response.url())` which fails on empty string.
- **WASM bridge pattern**: Same as obsidian-annotation and turboref — `FileSystemAdapter.readBinary()` loads the `.wasm` binary, `initSync({ module })` initializes the WASM module, then construct `LlmClient` via provider-routed constructors.
- **Question bar**: CM6 `showPanel` + `Compartment` lifecycle (adapted from obsidian-llm-helper). CSS prefix: `llm-prompt-bar`.
- **Concurrency guard**: `WasmBridge.isProcessing` prevents overlapping streaming requests (single HTTP connection in the WASM client).
- **Template processing**: Reverse document order to preserve char offsets when replacing blocks with different-length text. `StreamingTemplateReplacer` streams responses live (same UX as Ask Question callout).
- **Translation output**: `TranslationInserter` appends an HTML comment block (`<!-- tr ... -->`) after the source text. Streams live like other inserters. Uses bare `p` for single paragraphs, `p__` etc. for multi-paragraph selections.
- **Heading breadcrumb**: `heading-context.ts` builds a breadcrumb from `app.metadataCache` headings (e.g. `# Title > ## Ch2 > ### Sec 2.2`). Used by Translate to give the LLM document-structure context. Handles cross-section selections with range notation (`### 2.2 … ### 2.4`).
- **Prompt logging**: All three commands log the full prompt payload to the developer console via `console.debug("[LLM] ...")` before each LLM call.

## Plugin commands

| Command | ID | Behavior |
|---------|----|----------|
| Ask Question | `llm-prompt` | Shows question bar → formats prompt (question + selection + file path) → streams response into `> [!llm]+ Response` callout |
| Process Templates | `llm-process-templates` | Finds all `{{llm: instruction}}` blocks → extracts surrounding context → calls LLM → streams response live into each block position |
| Translate | `llm-translate` | Translates selection (or current paragraph) → streams translation into `<!-- tr ... -->` HTML comment block after source text. System prompt includes heading breadcrumb context from `metadataCache`. |

## Settings (DEFAULT_SETTINGS)

| Field | Default | Notes |
|-------|---------|-------|
| openaiApiKey | `""` | OpenAI API key. Password input in settings |
| openaiBaseUrl | `""` | Custom OpenAI-compatible base URL (empty = default) |
| anthropicApiKey | `""` | Anthropic API key. Password input in settings |
| anthropicBaseUrl | `""` | Custom Anthropic base URL (empty = default) |
| model | `"gpt-4o-mini"` | Model ID. Dropdown with known models + custom option |
| systemPrompt | `""` | Sent with every request if non-empty |
| temperature | `0.7` | Slider 0–1, step 0.1 |
| translationLanguage | `"English"` | Target language for the Translate command |

## Testing

93 vitest tests across 8 files. Pure functions (template-parser, context-extractor, prompt-formatter, heading-context, config, fetch-patch) tested directly. Config tests cover `getProviderForModel`, `migrateSettings`, `getActiveApiKey`/`getActiveBaseUrl`, and `KNOWN_MODELS`. Bridge tested with mocked WASM module via `Object.defineProperty` on private fields, including provider-based constructor routing. Fetch-patch tests cover `hasXApiKeyHeader` across all `HeadersInit` variants. Response inserter tested with a mock Editor object. Question bar and main.ts are tested manually in Obsidian.

## Key files in other repos

| What | Where |
|------|-------|
| WASM Rust source | `~/Projects/llm-rs/crates/llm-wasm/src/lib.rs` |
| WASM built package | `~/Projects/llm-rs/crates/llm-wasm/pkg/` |
| Anthropic provider | `~/Projects/llm-rs/crates/llm-anthropic/src/provider.rs` |
| OpenAI provider | `~/Projects/llm-rs/crates/llm-openai/src/provider.rs` |
| Core Prompt type | `~/Projects/llm-rs/crates/llm-core/src/types.rs` |
| Bridge pattern reference | `~/Projects/obsidian-annotation/src/bridge.ts` |
| Question bar ancestor | `~/Projects/obsidian-llm-helper/src/question-input-bar.ts` |
