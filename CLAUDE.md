# Obsidian LLM Plugin

Desktop-only Obsidian plugin that calls LLMs directly from notes via WASM (`llm-wasm` from `llm-rs`). Three commands: interactive prompt with streaming callout response, batch `{{llm: ...}}` template processing, and in-place translation with structured HTML comment output. TypeScript handles UI; WASM handles LLM API calls.

## Quick orientation

```
src/
  main.ts              Plugin entrypoint: commands, lifecycle, wires modules together
  config.ts            PluginSettings interface + DEFAULT_SETTINGS
  settings.ts          PluginSettingTab (API key, model, base URL, system prompt, temperature, translation language)
  bridge.ts            WasmBridge: WASM init, LlmClient lifecycle, streaming with concurrency guard
  template-parser.ts   Pure fn: find {{llm: ...}} blocks, skip code fences
  context-extractor.ts Pure fn: extract surrounding paragraphs, exclude template text
  prompt-formatter.ts  Pure fn: question + context + filePath → prompt string
  question-bar.ts      CM6 panel for question input (Cmd/Ctrl+Enter submit, Esc cancel)
  response-inserter.ts CalloutInserter (Ask Question) + StreamingTemplateReplacer (templates) + TranslationInserter (translate) + replaceTemplateBlock (non-streaming fallback)
  __tests__/           6 test files, 46 tests total
styles.css             Question bar + streaming indicator CSS
install.sh             Build + deploy to Obsidian vault
doc/implementation.md  Build history and design decisions
```

## Build commands

```bash
npm run build          # tsc + esbuild → main.js
npm run dev            # esbuild watch mode
npm test               # vitest run (46 tests)
npm run test:watch     # vitest watch mode
./install.sh [vault]   # build + test + install to vault (default: ~/Documents/Ekuro)
```

## Dependencies

- **llm-wasm** (`file:../llm-rs/crates/llm-wasm/pkg`): Pre-built WASM package from llm-rs. Rebuild with `wasm-pack build crates/llm-wasm --target web` in the llm-rs repo if the Rust source changes.
- **obsidian**: Obsidian API types (devDependency).
- **@codemirror/state**, **@codemirror/view**: Used by the question bar panel (externalized by esbuild, provided by Obsidian at runtime).

## Architecture

- **WASM bridge pattern**: Same as obsidian-annotation and turboref — `FileSystemAdapter.readBinary()` loads the `.wasm` binary, `initSync({ module })` initializes the WASM module, then construct `LlmClient`.
- **Question bar**: CM6 `showPanel` + `Compartment` lifecycle (adapted from obsidian-llm-helper). CSS prefix: `llm-prompt-bar`.
- **Concurrency guard**: `WasmBridge.isProcessing` prevents overlapping streaming requests (single HTTP connection in the WASM client).
- **Template processing**: Reverse document order to preserve char offsets when replacing blocks with different-length text. `StreamingTemplateReplacer` streams responses live (same UX as Ask Question callout).
- **Translation output**: `TranslationInserter` appends an HTML comment block (`<!-- tr ... -->`) after the source text. Streams live like other inserters. Uses bare `p` for single paragraphs, `p__` etc. for multi-paragraph selections.

## Plugin commands

| Command | ID | Behavior |
|---------|----|----------|
| Ask Question | `llm-prompt` | Shows question bar → formats prompt (question + selection + file path) → streams response into `> [!llm]+ Response` callout |
| Process Templates | `llm-process-templates` | Finds all `{{llm: instruction}}` blocks → extracts surrounding context → calls LLM → streams response live into each block position |
| Translate | `llm-translate` | Translates selection (or current paragraph) → streams translation into `<!-- tr ... -->` HTML comment block after source text |

## Settings (DEFAULT_SETTINGS)

| Field | Default | Notes |
|-------|---------|-------|
| apiKey | `""` | Required. Password input in settings |
| model | `"gpt-4o-mini"` | Any OpenAI-compatible model ID |
| baseUrl | `""` | Empty = OpenAI default. Set for compatible providers |
| systemPrompt | `""` | Sent with every request if non-empty |
| temperature | `0.7` | Slider 0–1, step 0.1 |
| translationLanguage | `"English"` | Target language for the Translate command |

## Testing

46 vitest tests across 6 files. Pure functions (template-parser, context-extractor, prompt-formatter, config) tested directly. Bridge tested with mocked WASM module via `Object.defineProperty` on private fields. Response inserter tested with a mock Editor object (`replaceTemplateBlock`, `StreamingTemplateReplacer`, and `TranslationInserter`). Question bar and main.ts are tested manually in Obsidian.

## Key files in other repos

| What | Where |
|------|-------|
| WASM Rust source | `~/Projects/llm-rs/crates/llm-wasm/src/lib.rs` |
| WASM built package | `~/Projects/llm-rs/crates/llm-wasm/pkg/` |
| Core Prompt type | `~/Projects/llm-rs/crates/llm-core/src/types.rs` |
| Bridge pattern reference | `~/Projects/obsidian-annotation/src/bridge.ts` |
| Question bar ancestor | `~/Projects/obsidian-llm-helper/src/question-input-bar.ts` |
