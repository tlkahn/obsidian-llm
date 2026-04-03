import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../config";

describe("DEFAULT_SETTINGS", () => {
    it("has correct default model", () => {
        expect(DEFAULT_SETTINGS.model).toBe("gpt-4o-mini");
    });

    it("has correct default temperature", () => {
        expect(DEFAULT_SETTINGS.temperature).toBe(0.7);
    });

    it("has empty apiKey", () => {
        expect(DEFAULT_SETTINGS.apiKey).toBe("");
    });

    it("has empty baseUrl", () => {
        expect(DEFAULT_SETTINGS.baseUrl).toBe("");
    });

    it("has empty systemPrompt", () => {
        expect(DEFAULT_SETTINGS.systemPrompt).toBe("");
    });
});
