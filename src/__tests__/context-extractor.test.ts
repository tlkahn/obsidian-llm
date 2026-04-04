import { describe, it, expect } from "vitest";
import { extractContext } from "../context-extractor";

describe("extractContext", () => {
    it("extracts paragraph containing target offset", () => {
        const content = "Para one.\n\nPara two {{llm: test}} more text.\n\nPara three.";
        // "{{llm: test}}" starts at 20
        const templateStart = content.indexOf("{{llm:");
        const templateEnd = content.indexOf("}}") + 2;
        const result = extractContext(content, templateStart, templateEnd);
        expect(result.text).toContain("Para two");
        expect(result.text).toContain("more text.");
        expect(result.text).not.toContain("{{llm:");
    });

    it("includes surrounding paragraphs (default 1)", () => {
        const content = "P1.\n\nP2.\n\nP3 target.\n\nP4.\n\nP5.";
        // P3 starts at 10
        const result = extractContext(content, 10, 20);
        expect(result.text).toContain("P2.");
        expect(result.text).toContain("P4.");
        expect(result.text).not.toContain("P1.");
        expect(result.text).not.toContain("P5.");
    });

    it("handles start of document", () => {
        const content = "First para target.\n\nSecond para.\n\nThird para.";
        const result = extractContext(content, 0, 18);
        expect(result.text).toContain("Second para.");
        expect(result.charStart).toBe(0);
    });

    it("handles end of document", () => {
        const content = "First para.\n\nSecond para.\n\nLast para target.";
        const targetStart = content.indexOf("Last para target.");
        const result = extractContext(content, targetStart, content.length);
        expect(result.text).not.toContain("First para.");
        expect(result.text).toContain("Second para.");
    });

    it("returns entire doc when short", () => {
        const content = "A short {{llm: test}} document.";
        const templateStart = content.indexOf("{{llm:");
        const templateEnd = content.indexOf("}}") + 2;
        const result = extractContext(content, templateStart, templateEnd);
        expect(result.text).toContain("A short");
        expect(result.text).toContain("document.");
        expect(result.text).not.toContain("{{llm:");
    });

    it("excludes template block text from context", () => {
        const content = "Paragraph one.\n\nSome text {{llm: explain this}} more text.\n\nParagraph three.";
        const templateStart = content.indexOf("{{llm:");
        const templateEnd = content.indexOf("}}") + 2;
        const result = extractContext(content, templateStart, templateEnd);
        expect(result.text).not.toContain("{{llm:");
        expect(result.text).toContain("Some text");
        expect(result.text).toContain("more text.");
    });

    it("respects custom surrounding count", () => {
        const content = "P1.\n\nP2.\n\nP3.\n\nP4 target.\n\nP5.\n\nP6.\n\nP7.";
        const targetStart = content.indexOf("P4 target.");
        const result = extractContext(content, targetStart, targetStart + 10, 1);
        expect(result.text).toContain("P3.");
        expect(result.text).toContain("P5.");
        expect(result.text).not.toContain("P1.");
        expect(result.text).not.toContain("P7.");
    });
});
