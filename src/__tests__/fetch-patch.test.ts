import { describe, it, expect } from "vitest";
import { hasXApiKeyHeader } from "../fetch-patch";

describe("hasXApiKeyHeader", () => {
    it("detects x-api-key in plain object headers via init", () => {
        expect(
            hasXApiKeyHeader("https://api.anthropic.com/v1/messages", {
                headers: { "x-api-key": "sk-ant-abc", "content-type": "application/json" },
            })
        ).toBe(true);
    });

    it("detects x-api-key case-insensitively in plain object", () => {
        expect(
            hasXApiKeyHeader("https://example.com", {
                headers: { "X-Api-Key": "sk-ant-abc" },
            })
        ).toBe(true);
    });

    it("detects x-api-key in Headers object via init", () => {
        const headers = new Headers();
        headers.set("x-api-key", "sk-ant-abc");
        expect(
            hasXApiKeyHeader("https://api.anthropic.com/v1/messages", { headers })
        ).toBe(true);
    });

    it("detects x-api-key in array headers via init", () => {
        expect(
            hasXApiKeyHeader("https://example.com", {
                headers: [["x-api-key", "sk-ant-abc"]],
            })
        ).toBe(true);
    });

    it("detects x-api-key on Request object", () => {
        const req = new Request("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": "sk-ant-abc" },
        });
        expect(hasXApiKeyHeader(req)).toBe(true);
    });

    it("returns false for OpenAI-style Authorization header", () => {
        expect(
            hasXApiKeyHeader("https://api.openai.com/v1/chat/completions", {
                headers: { Authorization: "Bearer sk-openai" },
            })
        ).toBe(false);
    });

    it("returns false for no headers", () => {
        expect(hasXApiKeyHeader("https://api.anthropic.com/v1/messages")).toBe(false);
    });

    it("returns false for URL object without headers", () => {
        expect(hasXApiKeyHeader(new URL("https://api.anthropic.com"))).toBe(false);
    });
});
