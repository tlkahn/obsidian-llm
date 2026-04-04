# Implementation Notes

## Overview

obsidian-llm v0.1.0 — Obsidian plugin that calls LLMs directly from notes via a WASM-compiled Rust client (`llm-wasm` from the `llm-rs` project). Three features: interactive prompt dialog, inline template processing, and in-place translation with structured HTML comment output.

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

**context-extractor.ts** — Given a document and a target range (the template block), splits on `\n\n` into paragraphs, finds the paragraph containing the target, expands by N surrounding paragraphs (default 1), and splices out the template block text itself. Returns `ContextResult` with the extracted text and char boundaries.

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

### Phase 9: Translate command

Added a third LLM command: **Translate** (`llm-translate`). Translates selected text (or the current paragraph when nothing is selected) and appends the result in a structured HTML comment block.

**New setting**: `translationLanguage` (default `"English"`) added to `PluginSettings` and the settings tab. Controls the target language for translation.

**Output format**: The translation is wrapped in an HTML comment with metadata headers:

```
\n\n<!--
tr
p
@2026-04-04
---
translated text here
-->
```

- `tr` — identifies this as a translation block
- `p` / `p__` / `p___` — paragraph marker; bare `p` for a single paragraph, underscores count multi-paragraph selections (e.g. `p___` = 3 paragraphs)
- `@YYYY-MM-DD` — date stamp
- `---` — separator before the translated content
- An empty line separates the source text from the comment block

**TranslationInserter** (in `response-inserter.ts`): Same offset-based streaming pattern as `StreamingTemplateReplacer`. Constructor inserts the header block and records the content start offset. `appendChunk()` streams text in. `finalize()` appends `\n-->` to close the comment — called in a `finally` block so unclosed comments can't be left behind on errors.

**Paragraph detection** (`findParagraphBounds` in `main.ts`): When no text is selected, scans backward/forward from the cursor offset for `\n\n` boundaries (or document edges) to identify the current paragraph. The source text and its end offset are then used identically to the selection path.

**System prompt override**: The Translate command uses a purpose-built system prompt (`"Translate the following text to ${targetLang}. Output only the translation, no commentary."`) rather than the user's general `systemPrompt` setting, since the instruction must be precise.

### Phase 10: Main plugin

`LlmPlugin` extends `Plugin`, wires everything together:

**"Ask Question" command** (`llm-prompt`): Captures selection, shows question bar, formats prompt (question + selection as context + file path), calls `bridge.promptStreaming()`, and drives `CalloutInserter` with each chunk.

**"Process Templates" command** (`llm-process-templates`): Parses all `{{llm: ...}}` blocks in the document, processes them in reverse document order (to preserve char offsets), extracts surrounding context for each, calls `bridge.promptStreaming()`, and replaces the template block with the response.

**"Translate" command** (`llm-translate`): Gets selected text or detects the current paragraph, counts paragraphs, creates a `TranslationInserter`, streams the translation into an HTML comment block after the source text. Uses a dedicated system prompt that overrides the general setting.

All commands check for API key presence and show a `Notice` on error.

## Design decisions

**Why WASM instead of HTTP fetch?** The llm-rs WASM library handles SSE parsing, error mapping, and stream-to-callback conversion. Using it directly avoids reimplementing OpenAI's streaming protocol in TypeScript and stays consistent with the user's other WASM-consuming plugins.

**Why reverse order for template processing?** Templates are replaced by text of different length. Processing front-to-back would invalidate subsequent char offsets. Reverse order preserves earlier offsets.

**Why a concurrency guard?** The underlying WASM client shares a single HTTP connection. Concurrent streaming calls would corrupt the response. The guard prevents this with a clear error message.

**Why `file:` dependency for llm-wasm?** The WASM package is built separately via `wasm-pack` in the llm-rs repo. A `file:` link means no npm publishing needed — `npm install` just symlinks the pre-built package.

## Test inventory

57 tests across 7 test files (vitest):

| File | Tests | What's covered |
|------|-------|----------------|
| template-parser.test.ts | 8 | Single/multiple blocks, empty, offsets, multiline, code fence exclusion, whitespace |
| context-extractor.test.ts | 7 | Target paragraph, surrounding expansion, start/end of doc, short doc, template exclusion, custom count |
| prompt-formatter.test.ts | 5 | Question only, question+context, with file path, full combination, whitespace trim |
| bridge.test.ts | 6 | Uninit throw, concurrent reject, options JSON passthrough, chunk callback, error recovery |
| config.test.ts | 5 | Default model, temperature, apiKey, baseUrl, systemPrompt |
| response-inserter.test.ts | 15 | Template replacement (4), StreamingTemplateReplacer (5), TranslationInserter: header format with multi-paragraph underscores, bare `p` for single paragraph, streaming chunks, finalize close, full round-trip output, surrounding text preservation (6) |
| heading-context.test.ts | 11 | No headings, selection before headings, single/nested/deep ancestors, sibling exclusion, exact-offset boundary, cross-section ranges, cross-parent ranges, level gaps, same-section identity |

### Phase 11: Heading breadcrumb context for translation

The Translate command's system prompt was bare — no document structure context. For domain-specific texts (philosophy, technical manuals), knowing *where* in the document the text sits helps the LLM make better lexical choices.

**New module: `heading-context.ts`** — pure function `buildHeadingBreadcrumb(headings, startOffset, endOffset)`:

1. `ancestorChain(headings, offset)` builds a heading stack at a given offset: walks the sorted heading list maintaining a stack (when heading level N is encountered, pop everything >= N, then push). Result is the ancestor chain from root to leaf.
2. Computes ancestor chains for both selection start and end.
3. Finds the longest common prefix. If chains are identical, formats as `# Title > ## Chapter > ### Section`. If they diverge at position *i*, appends a range: `### Section 2.2 … ### Section 2.4`.

**Integration in `handleTranslate()`**: After resolving the selection range, fetches `app.metadataCache.getFileCache(file).headings`, maps to the `Heading` interface, calls `buildHeadingBreadcrumb()`, and appends a context hint to the system prompt:

```
Translate the following text to English. Output only the translation, no commentary.
The text appears in: MyNote: # Main Title > ## Chapter 2 > ### Section 2.2.
```

Falls back to just the filename if the file has no headings, and omits the hint entirely if there's no active file.

**Tests**: 11 new test cases in `heading-context.test.ts` covering: no headings, selection before all headings, single/nested/deep ancestor chains, sibling exclusion, exact-offset boundary, cross-section ranges, cross-parent ranges, and level gaps.

### Phase 12: Prompt logging (GitHub issue #1)

Added `console.debug` logging before each `bridge.promptStreaming()` call to make the full prompt payload inspectable in Obsidian's developer console (Ctrl/Cmd+Shift+I). All logs use the `[LLM]` prefix, matching the existing error logging convention.

| Command | Log key | Payload |
|---------|---------|---------|
| Ask Question | `[LLM] Ask Question prompt:` | `{ prompt, systemPrompt, options }` |
| Process Templates | `[LLM] Process Template prompt:` | `{ instruction, prompt, systemPrompt, options }` |
| Translate | `[LLM] Translate prompt:` | `{ sourceText, systemPrompt, options }` |

Uses `console.debug` (not `console.log`) so messages are hidden by default unless the console filter includes debug-level output.

### Phase 13: Multi-provider support (OpenAI + Anthropic)

The llm-rs backend already supported Anthropic models alongside OpenAI, but the plugin was hardwired to a single API key, single base URL, and OpenAI-only bridge constructors.

#### WASM prerequisite

Rebuilt `llm-wasm` (`wasm-pack build crates/llm-wasm --target web`) to export all four `LlmClient` constructors:
- `new(apiKey, model)` — OpenAI default
- `newWithBaseUrl(apiKey, model, baseUrl)` — OpenAI custom endpoint
- `newAnthropic(apiKey, model)` — Anthropic default
- `newAnthropicWithBaseUrl(apiKey, model, baseUrl)` — Anthropic custom endpoint

The Rust source already had these (`lib.rs` lines 39–69), but the previous WASM build predated the Anthropic additions, so the `.d.ts` only had the OpenAI pair.

#### config.ts — provider routing and settings migration (TDD)

All new logic in `config.ts`, driven by 28 tests in `config.test.ts`:

**`getProviderForModel(model)`** — returns `"anthropic"` for any `claude*` prefix, `"openai"` otherwise. Mirrors the Rust auto-detect logic in `LlmClient::new()`.

**`KNOWN_MODELS`** — `Record<Provider, string[]>` with known model IDs per provider. Used by the settings dropdown.

**`PluginSettings` interface** — replaced single `apiKey`/`baseUrl` with per-provider fields:
- `openaiApiKey`, `openaiBaseUrl`
- `anthropicApiKey`, `anthropicBaseUrl`
- `model`, `systemPrompt`, `temperature`, `translationLanguage` unchanged

**`migrateSettings(data)`** — handles legacy settings that had `apiKey`/`baseUrl`. Copies legacy values to `openaiApiKey`/`openaiBaseUrl` if the new fields are empty, then strips legacy keys. New-format settings pass through unchanged. Missing fields get `DEFAULT_SETTINGS` values.

**`getActiveApiKey(settings)` / `getActiveBaseUrl(settings)`** — look up the provider for the current model and return the corresponding field. Used by `main.ts` everywhere the old `settings.apiKey` / `settings.baseUrl` was used.

#### bridge.ts — provider-routed constructor (TDD)

`LlmWasmModule` interface expanded with `newAnthropic` and `newAnthropicWithBaseUrl` static methods.

`createClient()` now calls `getProviderForModel(model)` and routes to the correct constructor — four branches for (openai|anthropic) × (default|custom baseUrl).

5 new tests in `bridge.test.ts` verify each routing path and old-client freeing. Mock setup required `mockImplementation(function() { return mockClient })` (not arrow function) because Vitest's `vi.fn()` arrow-function mocks aren't valid `new` targets.

#### main.ts — integration

- `loadSettings()`: `migrateSettings(await this.loadData() || {})` replaces `Object.assign({}, DEFAULT_SETTINGS, ...)`
- Client creation in `onload()` and `saveSettings()`: uses `getActiveApiKey(settings)` and `getActiveBaseUrl(settings)`
- All three command handlers check `!getActiveApiKey(settings)` instead of `!settings.apiKey`, with provider-specific notice messages (e.g. "Please set your anthropic API key")

#### settings.ts — per-provider UI

Replaced single API key / base URL inputs with three sections:
- **Model**: dropdown grouped by provider label (`"OpenAI: gpt-4o"`, `"Anthropic: claude-sonnet-4-6"`, etc.) plus a `"Custom..."` option that reveals a free-text input
- **OpenAI**: API key (password input), base URL
- **Anthropic**: API key (password input), base URL
- **General**: system prompt, temperature, translation language (unchanged)

#### CORS bypass — the hard part

**Problem**: The Anthropic API does not send `Access-Control-Allow-Origin` headers. Obsidian runs in Electron's Chromium renderer, which enforces CORS on browser `fetch()`. OpenAI's API allows CORS; Anthropic's does not. The WASM module (`reqwest` compiled to WASM) uses browser `fetch()` internally — no way to inject a custom HTTP client from the Rust side.

**Discovery path**: First error was the CORS block itself. Fixed by patching `globalThis.fetch` to route Anthropic requests through Node.js `https` (available in Electron, not subject to CORS). Second error was `"url parse"` — the synthetic `Response` from `new Response(body, init)` has `url` property `""`, and reqwest's WASM layer calls `Url::parse(response.url())` which fails on empty input.

**Solution** (`fetch-patch.ts`):

1. `patchFetchForCORS()` — called once from `WasmBridge.init()` before WASM initialization. Saves the original `globalThis.fetch` and replaces it with a wrapper.
2. **Detection**: `hasXApiKeyHeader(input, init)` checks for the `x-api-key` HTTP header, which is Anthropic-specific (OpenAI uses `Authorization: Bearer`). Handles all `HeadersInit` variants: plain object, `Headers` instance, array of tuples, and `Request` object.
3. **Extraction**: `extractFetchArgs(input, init)` extracts URL, method, headers, and body from either a `Request` object (what reqwest passes) or separate `input`+`init` arguments. For `Request` objects, calls `input.text()` to read the body.
4. **Node.js fetch**: `nodeFetch(args)` uses `https.request()` / `http.request()` to make the HTTP call. Wraps the Node.js `IncomingMessage` in a `ReadableStream` → `Response`, preserving streaming for SSE. Sets `Object.defineProperty(response, "url", { value: args.url })` to fix the empty-URL parse error.
5. **Passthrough**: Non-Anthropic requests delegate to the original `fetch()` unchanged.

**Why `x-api-key` header detection**: It's the most robust way to identify Anthropic requests regardless of base URL. If users have a custom Anthropic-compatible proxy, the header still identifies the request correctly. OpenAI and all OpenAI-compatible providers use `Authorization: Bearer`, so there's no false-positive risk.

**Why Node.js `https` instead of Obsidian's `requestUrl`**: `requestUrl` returns the full response body at once — no streaming. Node.js `https.request()` returns an `IncomingMessage` stream that can be wrapped in a `ReadableStream`, which the browser `Response` constructor accepts. This preserves reqwest's SSE streaming pipeline without changes.

**Why `Object.defineProperty` for `Response.url`**: The `Response` constructor doesn't accept a `url` parameter — `Response.url` is a readonly property set by the browser's fetch machinery, defaulting to `""` for constructed responses. reqwest's WASM layer reads `response.url()` and passes it to Rust's `Url::parse()`, which rejects empty strings. The `Object.defineProperty` override is the cleanest way to set it without subclassing.

8 tests in `fetch-patch.test.ts` cover header detection across all `HeadersInit` variants.

#### Test count

93 tests across 8 files (was 57 across 7):

| File | Tests | What's covered |
|------|-------|----------------|
| template-parser.test.ts | 8 | Single/multiple blocks, empty, offsets, multiline, code fence exclusion, whitespace |
| context-extractor.test.ts | 7 | Target paragraph, surrounding expansion, start/end of doc, short doc, template exclusion, custom count |
| prompt-formatter.test.ts | 5 | Question only, question+context, with file path, full combination, whitespace trim |
| bridge.test.ts | 11 | Uninit throw, concurrent reject, options JSON passthrough, chunk callback, error recovery, provider-routed constructor (OpenAI default/custom, Anthropic default/custom, old client freed) |
| config.test.ts | 28 | DEFAULT_SETTINGS fields, KNOWN_MODELS, getProviderForModel (6 models), migrateSettings (6 cases), getActiveApiKey (3), getActiveBaseUrl (3) |
| response-inserter.test.ts | 15 | Template replacement (4), StreamingTemplateReplacer (5), TranslationInserter (6) |
| heading-context.test.ts | 11 | No headings, selection before headings, single/nested/deep ancestors, sibling exclusion, exact-offset boundary, cross-section ranges |
| fetch-patch.test.ts | 8 | hasXApiKeyHeader: plain object, case-insensitive, Headers instance, array, Request object, Authorization-only (false), no headers (false), URL object (false) |

### Phase 14: Narrow default context window (surrounding 2 → 1)

Changed `extractContext`'s default `surrounding` parameter from 2 to 1, so template processing includes only the immediately adjacent paragraphs (1 before, 1 after the target) instead of 2 in each direction. The wider window was pulling in too much irrelevant text for typical use.

**Code change**: One-line default parameter change in `context-extractor.ts:11`.

**Test cascading**: The primary test rename ("default 2" → "default 1") was straightforward, but the "handles end of document" test also broke. That test had a 3-paragraph document (`First para. / Second para. / Last para target.`) and asserted both "First para." and "Second para." were present. With `surrounding=2`, the window reached back 2 paragraphs to include "First para." — but with `surrounding=1`, only the immediately adjacent "Second para." is reachable. The test was implicitly coupled to the default window size rather than testing end-of-document boundary behavior specifically. Fixed by changing the "First para." assertion from `toContain` to `not.toContain`.

**Lesson**: Tests that assert on content reachability in context-extraction are sensitive to the default window size, even when they appear to be testing a different concern (boundary handling). When changing defaults, check all tests that rely on the default path — not just the ones whose names reference the default value.

## Known limitations / future work

- No fallback modal for when CM6 view is unavailable (e.g., reading mode). The question bar simply won't appear.
- Template processing is sequential (one template at a time). Parallel processing would be faster for many templates but requires removing the concurrency guard or using multiple clients.
- No conversation history — each prompt is stateless.
- ~~No streaming indicator in the editor during template processing~~ — resolved: `StreamingTemplateReplacer` now streams template responses live, matching "Ask Question" behavior.
- The `import.meta` esbuild warning is cosmetic — the dead code path (URL-based WASM init) is never reached.
