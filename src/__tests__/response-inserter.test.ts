import { describe, it, expect, vi, beforeEach } from "vitest";
import { replaceTemplateBlock, StreamingTemplateReplacer } from "../response-inserter";

// Mock Obsidian Editor
function createMockEditor(initialContent: string) {
    let lines = initialContent.split("\n");

    const editor = {
        getLine(n: number) {
            return lines[n] || "";
        },
        lineCount() {
            return lines.length;
        },
        getSelection() {
            return "";
        },
        getCursor(_type?: string) {
            return { line: 0, ch: 0 };
        },
        getValue() {
            return lines.join("\n");
        },
        replaceRange(text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) {
            const content = lines.join("\n");
            const fromOffset = getOffset(lines, from.line, from.ch);
            const toOffset = to ? getOffset(lines, to.line, to.ch) : fromOffset;
            const newContent = content.slice(0, fromOffset) + text + content.slice(toOffset);
            lines = newContent.split("\n");
        },
        offsetToPos(offset: number) {
            const content = lines.join("\n");
            let line = 0;
            let ch = 0;
            for (let i = 0; i < offset && i < content.length; i++) {
                if (content[i] === "\n") {
                    line++;
                    ch = 0;
                } else {
                    ch++;
                }
            }
            return { line, ch };
        },
    };
    return editor;
}

function getOffset(lines: string[], line: number, ch: number): number {
    let offset = 0;
    for (let i = 0; i < line; i++) {
        offset += lines[i].length + 1; // +1 for newline
    }
    return offset + ch;
}

describe("replaceTemplateBlock", () => {
    it("replaces template block with response text", () => {
        const editor = createMockEditor("Hello {{llm: explain}} world");
        const charStart = 6;
        const charEnd = 22;
        replaceTemplateBlock(editor as any, charStart, charEnd, "replaced text");
        expect(editor.getValue()).toBe("Hello replaced text world");
    });

    it("preserves surrounding text", () => {
        const editor = createMockEditor("Before\n\n{{llm: test}}\n\nAfter");
        const charStart = 8;
        const charEnd = 21;
        replaceTemplateBlock(editor as any, charStart, charEnd, "RESPONSE");
        const value = editor.getValue();
        expect(value).toContain("Before");
        expect(value).toContain("RESPONSE");
        expect(value).toContain("After");
        expect(value).not.toContain("{{llm:");
    });

    it("handles multiline response", () => {
        const editor = createMockEditor("{{llm: test}}");
        replaceTemplateBlock(editor as any, 0, 13, "Line one\nLine two\nLine three");
        expect(editor.getValue()).toBe("Line one\nLine two\nLine three");
    });

    it("handles empty response", () => {
        const editor = createMockEditor("A {{llm: test}} B");
        replaceTemplateBlock(editor as any, 2, 15, "");
        expect(editor.getValue()).toBe("A  B");
    });
});

describe("StreamingTemplateReplacer", () => {
    it("removes template block on construction", () => {
        const editor = createMockEditor("Hello {{llm: explain}} world");
        new StreamingTemplateReplacer(editor as any, 6, 22);
        expect(editor.getValue()).toBe("Hello  world");
    });

    it("streams chunks into the replaced position", () => {
        const editor = createMockEditor("Hello {{llm: explain}} world");
        const replacer = new StreamingTemplateReplacer(editor as any, 6, 22);
        replacer.appendChunk("streaming ");
        replacer.appendChunk("text");
        expect(editor.getValue()).toBe("Hello streaming text world");
    });

    it("handles multiline streamed response", () => {
        const editor = createMockEditor("Before\n{{llm: test}}\nAfter");
        const replacer = new StreamingTemplateReplacer(editor as any, 7, 20);
        replacer.appendChunk("Line one\n");
        replacer.appendChunk("Line two");
        expect(editor.getValue()).toBe("Before\nLine one\nLine two\nAfter");
    });

    it("handles empty stream (no chunks)", () => {
        const editor = createMockEditor("A {{llm: test}} B");
        new StreamingTemplateReplacer(editor as any, 2, 15);
        expect(editor.getValue()).toBe("A  B");
    });

    it("produces same result as replaceTemplateBlock for complete text", () => {
        const content = "Start {{llm: q}} End";
        const editor1 = createMockEditor(content);
        const editor2 = createMockEditor(content);

        replaceTemplateBlock(editor1 as any, 6, 16, "answer");

        const replacer = new StreamingTemplateReplacer(editor2 as any, 6, 16);
        replacer.appendChunk("ans");
        replacer.appendChunk("wer");

        expect(editor2.getValue()).toBe(editor1.getValue());
    });
});
