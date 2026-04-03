import {
    Editor,
    FileSystemAdapter,
    MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
} from "obsidian";
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { PluginSettings, DEFAULT_SETTINGS } from "./config";
import { WasmBridge } from "./bridge";
import { LlmSettingTab } from "./settings";
import { showQuestionBar } from "./question-bar";
import { formatLlmPrompt } from "./prompt-formatter";
import { parseTemplates } from "./template-parser";
import { extractContext } from "./context-extractor";
import { CalloutInserter, StreamingTemplateReplacer, TranslationInserter } from "./response-inserter";

export default class LlmPlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    bridge: WasmBridge = new WasmBridge();
    private questionBarCompartment = new Compartment();

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new LlmSettingTab(this.app, this));
        this.registerEditorExtension(this.questionBarCompartment.of([]));

        // Init WASM bridge
        try {
            const adapter = this.app.vault.adapter;
            if (adapter instanceof FileSystemAdapter) {
                await this.bridge.init(this.manifest.dir!, adapter);

                if (this.settings.apiKey) {
                    this.bridge.createClient(
                        this.settings.apiKey,
                        this.settings.model,
                        this.settings.baseUrl || undefined
                    );
                }
            }
        } catch (e) {
            console.error("[LLM] Failed to initialize WASM:", e);
        }

        // Command: Ask Question
        this.addCommand({
            id: "llm-prompt",
            name: "Ask Question",
            editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
                this.handlePrompt(editor, ctx);
            },
        });

        // Command: Process Templates
        this.addCommand({
            id: "llm-process-templates",
            name: "Process Templates",
            editorCallback: (editor: Editor) => {
                this.handleProcessTemplates(editor);
            },
        });

        // Command: Translate
        this.addCommand({
            id: "llm-translate",
            name: "Translate",
            editorCallback: (editor: Editor) => {
                this.handleTranslate(editor);
            },
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Recreate client when settings change
        if (this.settings.apiKey) {
            try {
                this.bridge.createClient(
                    this.settings.apiKey,
                    this.settings.model,
                    this.settings.baseUrl || undefined
                );
            } catch (e) {
                console.error("[LLM] Failed to recreate client:", e);
            }
        }
    }

    private getEditorView(ctx: MarkdownView | MarkdownFileInfo): EditorView | null {
        if (ctx instanceof MarkdownView) {
            const cm = (ctx.editor as any)?.cm;
            if (cm instanceof EditorView) return cm;
        }
        return null;
    }

    private async handlePrompt(editor: Editor, ctx: MarkdownView | MarkdownFileInfo) {
        if (!this.settings.apiKey) {
            new Notice("LLM: Please set your API key in settings.");
            return;
        }

        const selection = editor.getSelection();
        const filePath = this.app.workspace.getActiveFile()?.path;

        // Show question bar
        const cmView = this.getEditorView(ctx);
        let question: string | null = null;
        if (cmView) {
            question = await showQuestionBar(
                this.app,
                cmView,
                this.questionBarCompartment
            );
        }
        if (!question) return;

        const prompt = formatLlmPrompt({
            question,
            context: selection || undefined,
            filePath,
        });

        const systemPrompt = this.settings.systemPrompt || null;
        const options: Record<string, unknown> = {
            temperature: this.settings.temperature,
        };

        // Determine insert position
        const cursor = editor.getCursor("to");
        const inserter = new CalloutInserter(editor, cursor.line);

        try {
            await this.bridge.promptStreaming(prompt, systemPrompt, options, (chunk: string) => {
                inserter.appendChunk(chunk);
            });
        } catch (e: any) {
            new Notice(`LLM Error: ${e.message}`);
        }
    }

    private async handleProcessTemplates(editor: Editor) {
        if (!this.settings.apiKey) {
            new Notice("LLM: Please set your API key in settings.");
            return;
        }

        const content = editor.getValue();
        const templates = parseTemplates(content);

        if (templates.length === 0) {
            new Notice("LLM: No {{llm: ...}} templates found.");
            return;
        }

        const systemPrompt = this.settings.systemPrompt || null;
        const options: Record<string, unknown> = {
            temperature: this.settings.temperature,
        };

        // Process in reverse order to preserve offsets
        const sorted = [...templates].sort((a, b) => b.charStart - a.charStart);
        let processed = 0;

        for (const tmpl of sorted) {
            const ctx = extractContext(content, tmpl.charStart, tmpl.charEnd);
            const prompt = formatLlmPrompt({
                question: tmpl.instruction,
                context: ctx.text || undefined,
                filePath: this.app.workspace.getActiveFile()?.path,
            });

            try {
                const replacer = new StreamingTemplateReplacer(editor, tmpl.charStart, tmpl.charEnd);
                await this.bridge.promptStreaming(prompt, systemPrompt, options, (chunk: string) => {
                    replacer.appendChunk(chunk);
                });
                processed++;
            } catch (e: any) {
                new Notice(`LLM Error processing template: ${e.message}`);
            }
        }

        new Notice(`LLM: Processed ${processed}/${templates.length} templates.`);
    }

    private findParagraphBounds(content: string, cursorOffset: number): { start: number; end: number } {
        let start = cursorOffset;
        while (start > 0) {
            if (content[start - 1] === "\n" && start >= 2 && content[start - 2] === "\n") {
                break;
            }
            start--;
        }

        let end = cursorOffset;
        while (end < content.length) {
            if (content[end] === "\n" && end + 1 < content.length && content[end + 1] === "\n") {
                break;
            }
            end++;
        }

        return { start, end };
    }

    private async handleTranslate(editor: Editor) {
        if (!this.settings.apiKey) {
            new Notice("LLM: Please set your API key in settings.");
            return;
        }

        let sourceText: string;
        let afterOffset: number;

        const selection = editor.getSelection();
        if (selection) {
            sourceText = selection;
            afterOffset = editor.posToOffset(editor.getCursor("to"));
        } else {
            const content = editor.getValue();
            const cursorOffset = editor.posToOffset(editor.getCursor());
            const bounds = this.findParagraphBounds(content, cursorOffset);
            sourceText = content.slice(bounds.start, bounds.end);
            afterOffset = bounds.end;
        }

        if (!sourceText.trim()) {
            new Notice("LLM: No text to translate.");
            return;
        }

        const paragraphCount = sourceText.split("\n\n").filter((s) => s.trim()).length;
        const date = new Date().toISOString().slice(0, 10);
        const targetLang = this.settings.translationLanguage || "English";
        const systemPrompt = `Translate the following text to ${targetLang}. Output only the translation, no commentary.`;
        const options: Record<string, unknown> = {
            temperature: this.settings.temperature,
        };

        const inserter = new TranslationInserter(editor, afterOffset, paragraphCount, date);

        try {
            await this.bridge.promptStreaming(sourceText, systemPrompt, options, (chunk: string) => {
                inserter.appendChunk(chunk);
            });
        } catch (e: any) {
            new Notice(`LLM Error: ${e.message}`);
        } finally {
            inserter.finalize();
        }
    }
}
