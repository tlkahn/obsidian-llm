import { describe, it, expect } from "vitest";
import { parseTemplates } from "../template-parser";

describe("parseTemplates", () => {
    it("finds a single template block", () => {
        const content = "Hello {{llm: explain this}} world";
        const results = parseTemplates(content);
        expect(results).toHaveLength(1);
        expect(results[0].instruction).toBe("explain this");
        expect(results[0].charStart).toBe(6);
        expect(results[0].charEnd).toBe(27);
        expect(results[0].fullMatch).toBe("{{llm: explain this}}");
    });

    it("finds multiple template blocks", () => {
        const content = "{{llm: first}} some text {{llm: second}}";
        const results = parseTemplates(content);
        expect(results).toHaveLength(2);
        expect(results[0].instruction).toBe("first");
        expect(results[1].instruction).toBe("second");
    });

    it("returns empty array when none found", () => {
        const content = "No templates here.";
        const results = parseTemplates(content);
        expect(results).toHaveLength(0);
    });

    it("captures char offsets correctly", () => {
        const content = "abc {{llm: test}} def";
        const results = parseTemplates(content);
        expect(results[0].charStart).toBe(4);
        expect(results[0].charEnd).toBe(17);
    });

    it("handles multiline instructions", () => {
        const content = "{{llm: explain\nthis concept\nin detail}}";
        const results = parseTemplates(content);
        expect(results).toHaveLength(1);
        expect(results[0].instruction).toBe("explain\nthis concept\nin detail");
    });

    it("ignores templates inside fenced code blocks", () => {
        const content = "before\n```\n{{llm: inside code}}\n```\n{{llm: outside code}}";
        const results = parseTemplates(content);
        expect(results).toHaveLength(1);
        expect(results[0].instruction).toBe("outside code");
    });

    it("handles whitespace in instructions", () => {
        const content = "{{llm:   lots of   space   }}";
        const results = parseTemplates(content);
        expect(results).toHaveLength(1);
        expect(results[0].instruction).toBe("lots of   space");
    });

    it("ignores templates inside code blocks with language tag", () => {
        const content = "```python\n{{llm: generate code}}\n```\n{{llm: real one}}";
        const results = parseTemplates(content);
        expect(results).toHaveLength(1);
        expect(results[0].instruction).toBe("real one");
    });
});
