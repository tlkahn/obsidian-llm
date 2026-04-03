import { describe, it, expect } from "vitest";
import { formatLlmPrompt } from "../prompt-formatter";

describe("formatLlmPrompt", () => {
    it("formats question only (no context)", () => {
        const result = formatLlmPrompt({ question: "What is Rust?" });
        expect(result).toBe("What is Rust?");
    });

    it("formats question with selected text context", () => {
        const result = formatLlmPrompt({
            question: "Explain this",
            context: "fn main() {}",
        });
        expect(result).toContain("Context:\nfn main() {}");
        expect(result).toContain("Explain this");
    });

    it("formats with file path metadata", () => {
        const result = formatLlmPrompt({
            question: "Summarize",
            filePath: "notes/test.md",
        });
        expect(result).toContain("File: notes/test.md");
        expect(result).toContain("Summarize");
    });

    it("formats template instruction with extracted context", () => {
        const result = formatLlmPrompt({
            question: "explain the concept",
            context: "Machine learning is a subset of AI.",
            filePath: "research/ml.md",
        });
        expect(result).toContain("File: research/ml.md");
        expect(result).toContain("Context:\nMachine learning is a subset of AI.");
        expect(result).toContain("explain the concept");
    });

    it("trims whitespace from question", () => {
        const result = formatLlmPrompt({ question: "  hello world  " });
        expect(result).toBe("hello world");
    });
});
