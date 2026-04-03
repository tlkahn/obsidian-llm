import { Editor } from "obsidian";

export class CalloutInserter {
    private editor: Editor;
    private insertOffset: number;
    private lineCount: number;

    constructor(editor: Editor, insertLine: number) {
        this.editor = editor;
        this.lineCount = 0;

        // Insert the callout skeleton after the given line
        const skeleton = "\n\n> [!llm]+ Response\n> ";
        const insertPos = { line: insertLine, ch: editor.getLine(insertLine).length };
        editor.replaceRange(skeleton, insertPos);
        // Track position after the skeleton (where response text goes)
        this.insertOffset = insertLine + 3; // line after "> "
    }

    appendChunk(chunk: string): void {
        const lines = chunk.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i > 0) {
                // New line within the callout: insert "> " prefix
                const pos = {
                    line: this.insertOffset + this.lineCount,
                    ch: this.editor.getLine(this.insertOffset + this.lineCount).length,
                };
                this.editor.replaceRange("\n> ", pos);
                this.lineCount++;
            }
            // Append text to current line
            const currentLine = this.insertOffset + this.lineCount;
            const ch = this.editor.getLine(currentLine).length;
            this.editor.replaceRange(line, { line: currentLine, ch });
        }
    }
}

export class StreamingTemplateReplacer {
    private editor: Editor;
    private startOffset: number;
    private insertedLength: number = 0;

    constructor(editor: Editor, charStart: number, charEnd: number) {
        this.editor = editor;
        const from = editor.offsetToPos(charStart);
        const to = editor.offsetToPos(charEnd);
        editor.replaceRange("", from, to);
        this.startOffset = charStart;
    }

    appendChunk(chunk: string): void {
        const insertPos = this.editor.offsetToPos(this.startOffset + this.insertedLength);
        this.editor.replaceRange(chunk, insertPos);
        this.insertedLength += chunk.length;
    }
}

export function replaceTemplateBlock(
    editor: Editor,
    charStart: number,
    charEnd: number,
    response: string
): void {
    const from = editor.offsetToPos(charStart);
    const to = editor.offsetToPos(charEnd);
    editor.replaceRange(response, from, to);
}
