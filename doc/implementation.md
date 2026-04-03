# Implementation Notes

## Overview

obsidian-llm v0.1.0 — Obsidian plugin that calls LLMs directly from notes via a WASM-compiled Rust client (`llm-wasm` from the `llm-rs` project). Two features: interactive prompt dialog and inline template processing.

Built 2026-04-04.

## Pre-existing context

The user's ecosystem already contained:
- **llm-rs** (`~/Projects/llm-rs`): Rust LLM CLI with a WASM library crate (`llm-wasm`) exposing `LlmClient` with prompt/streaming methods. Core library supports options (`Prompt.with_option("temperature", ...)`), but the WASM API did not expose them.
- **obsidian-annotation** and **turboref**: Two Obsidian plugins consuming WASM, establishing a shared bridge pattern (`FileSystemAdapter.readBinary()` + `initSync()`).
- **obsidian-llm-helper**: An earlier plugin that formats LLM prompts for clipboard. Its CodeMirror 6 question bar panel was the direct ancestor of this plugin's question bar.

This plugin closes the loop: instead of copying prompts to clipboard, it calls the LLM directly and inserts responses back into notes.

## What was built

### Phase 0: llm-wasm extension

Added two methods to `LlmClient` in `/Users/toeinriver/Projects/llm-rs/crates/llm-wasm/src/lib.rs`:

- `promptWithOptions(text, system, options_json)` — non-streaming with options
- `promptStreamingWithOptions(text, system, options_json, callback)` — streaming with options

Both parse `options_json` as `HashMap<String, serde_json::Value>` and call `Prompt::with_option()` for each entry. This is a thin layer — the core library already handled options, the WASM API just wasn't passing them through.

WASM was rebuilt with `wasm-pack build crates/llm-wasm --target web`. The generated types in `pkg/llm_wasm.d.ts` confirm the new methods are available to TypeScript consumers.

### Phase 1: Project scaffold

Modeled after obsidian-annotation's structure. Key choices:

- **WASM dependency**: `"llm-wasm": "file:../llm-rs/crates/llm-wasm/pkg"` in package.json. This means `npm install` links the pre-built WASM package directly — no Rust build step in this project's pipeline.
- **esbuild config**: Copied from obsidian-annotation. The `wasmPlugin` marks `.wasm` imports as external so esbuild doesn't try to bundle the binary. The `import.meta` warning in the llm-wasm glue code is harmless (we use `initSync` with a binary buffer, never the default URL-based init path).
- **install.sh**: Copies `main.js`, `manifest.json`, `styles.css` to the vault, plus `llm_wasm_bg.wasm` from the llm-rs build output. Default vault: `~/Documents/Ekuro`.
- **Desktop only**: `isDesktopOnly: true` in manifest — WASM + `FileSystemAdapter` requires Node.js filesystem access.

### Phases 2–4: Pure functions (TDD)

Three modules with no Obsidian dependencies, fully testable in vitest:

**template-parser.ts** — Finds `{{llm: instruction}}` blocks in markdown. Returns `TemplateBlock[]` with instruction text, char offsets, and full match string. Skips templates inside fenced code blocks (scans for ` ``` ` boundaries first, filters matches inside them).

**context-extractor.ts** — Given a document and a target range (the template block), splits on `\n\n` into paragraphs, finds the paragraph containing the target, expands by N surrounding paragraphs (default 2), and splices out the template block text itself. Returns `ContextResult` with the extracted text and char boundaries.

**prompt-formatter.ts** — Assembles a prompt string from `{ question, context?, filePath? }`. Order: file path metadata line, context block, question. Trims whitespace.

### Phase 5: WASM bridge

`WasmBridge` class following the same pattern as obsidian-annotation and turboref:

1. `init()` reads WASM binary via `FileSystemAdapter.readBinary()`, calls `initSync({ module: wasmBinary })`
2. `createClient()` constructs `LlmClient` (with or without custom base URL), frees previous client if any
3. `promptStreaming()` serializes options to JSON, calls `promptStreamingWithOptions`, enforces a concurrency guard (`isProcessing` flag) to prevent overlapping requests

The concurrency guard exists because `LlmClient` uses a single HTTP connection internally — concurrent calls would interleave SSE streams.

Tests mock the WASM module by setting private fields via `Object.defineProperty` (no real WASM binary loaded in tests).

### Phase 6: Settings & config

`PluginSettings` interface with five fields: `apiKey`, `model` (default `gpt-4o-mini`), `baseUrl`, `systemPrompt`, `temperature` (default 0.7).

`LlmSettingTab` renders the Obsidian settings UI. API key uses a password input. Temperature uses a slider (0–1, step 0.1). On save, `plugin.saveSettings()` triggers `bridge.createClient()` to recreate the client with new settings.

### Phase 7: Response inserter

Two modes:

**CalloutInserter** (for "Ask Question" command): Inserts a `> [!llm]+ Response` callout skeleton after the cursor/selection. Tracks a line offset and appends chunks as they stream in. Handles newlines within chunks by inserting `> ` prefixes for each new callout line.

**replaceTemplateBlock** (for "Process Templates" command): Single `editor.replaceRange()` call using char offsets from the template parser.

### Phase 8: Question bar

CodeMirror 6 panel adapted from obsidian-llm-helper's `question-input-bar.ts`. Uses a `Compartment` to manage panel lifecycle:
- Show: `compartment.reconfigure(showPanel.of(panelConstructor))`
- Hide: `compartment.reconfigure([])`

CSS class prefix changed from `llm-question-bar` to `llm-prompt-bar` to avoid collision with the helper plugin.

Returns `Promise<string | null>` — resolves with question text on Cmd/Ctrl+Enter, null on Escape.

### Phase 8b: Streaming template replacer

The original "Process Templates" flow accumulated the full LLM response in memory, then called `replaceTemplateBlock` in one shot. This meant template users saw nothing until the entire response was ready — a noticeably worse experience than the "Ask Question" callout, which streams live.

`StreamingTemplateReplacer` (added to `response-inserter.ts`) gives templates the same live-streaming behavior:

1. **Constructor**: immediately deletes the `{{llm: ...}}` block via `editor.replaceRange("", from, to)` and records the `startOffset` where text will be inserted.
2. **`appendChunk(chunk)`**: inserts each chunk at `startOffset + insertedLength`, then advances `insertedLength`.

Because templates are still processed in reverse document order (highest offset first), deleting/expanding one block never shifts offsets of unprocessed blocks that appear earlier in the document.

`main.ts` was updated to replace the accumulate-then-replace pattern:

```typescript
// Before
let response = "";
await this.bridge.promptStreaming(prompt, systemPrompt, options, (chunk) => {
    response += chunk;
});
replaceTemplateBlock(editor, tmpl.charStart, tmpl.charEnd, response);

// After
const replacer = new StreamingTemplateReplacer(editor, tmpl.charStart, tmpl.charEnd);
await this.bridge.promptStreaming(prompt, systemPrompt, options, (chunk) => {
    replacer.appendChunk(chunk);
});
```

`replaceTemplateBlock` is retained for any non-streaming callers but is no longer imported by `main.ts`.

### Phase 9: Main plugin

`LlmPlugin` extends `Plugin`, wires everything together:

**"Ask Question" command** (`llm-prompt`): Captures selection, shows question bar, formats prompt (question + selection as context + file path), calls `bridge.promptStreaming()`, and drives `CalloutInserter` with each chunk.

**"Process Templates" command** (`llm-process-templates`): Parses all `{{llm: ...}}` blocks in the document, processes them in reverse document order (to preserve char offsets), extracts surrounding context for each, calls `bridge.promptStreaming()`, and replaces the template block with the response.

Both commands check for API key presence and show a `Notice` on error.

## Design decisions

**Why WASM instead of HTTP fetch?** The llm-rs WASM library handles SSE parsing, error mapping, and stream-to-callback conversion. Using it directly avoids reimplementing OpenAI's streaming protocol in TypeScript and stays consistent with the user's other WASM-consuming plugins.

**Why reverse order for template processing?** Templates are replaced by text of different length. Processing front-to-back would invalidate subsequent char offsets. Reverse order preserves earlier offsets.

**Why a concurrency guard?** The underlying WASM client shares a single HTTP connection. Concurrent streaming calls would corrupt the response. The guard prevents this with a clear error message.

**Why `file:` dependency for llm-wasm?** The WASM package is built separately via `wasm-pack` in the llm-rs repo. A `file:` link means no npm publishing needed — `npm install` just symlinks the pre-built package.

## Test inventory

40 tests across 6 test files (vitest):

| File | Tests | What's covered |
|------|-------|----------------|
| template-parser.test.ts | 8 | Single/multiple blocks, empty, offsets, multiline, code fence exclusion, whitespace |
| context-extractor.test.ts | 7 | Target paragraph, surrounding expansion, start/end of doc, short doc, template exclusion, custom count |
| prompt-formatter.test.ts | 5 | Question only, question+context, with file path, full combination, whitespace trim |
| bridge.test.ts | 6 | Uninit throw, concurrent reject, options JSON passthrough, chunk callback, error recovery |
| config.test.ts | 5 | Default model, temperature, apiKey, baseUrl, systemPrompt |
| response-inserter.test.ts | 9 | Template replacement, surrounding preservation, multiline response, empty response, streaming construction, streaming chunks, streaming multiline, streaming empty, streaming equivalence with replaceTemplateBlock |

## Known limitations / future work

- No fallback modal for when CM6 view is unavailable (e.g., reading mode). The question bar simply won't appear.
- Template processing is sequential (one template at a time). Parallel processing would be faster for many templates but requires removing the concurrency guard or using multiple clients.
- No conversation history — each prompt is stateless.
- ~~No streaming indicator in the editor during template processing~~ — resolved: `StreamingTemplateReplacer` now streams template responses live, matching "Ask Question" behavior.
- The `import.meta` esbuild warning is cosmetic — the dead code path (URL-based WASM init) is never reached.
