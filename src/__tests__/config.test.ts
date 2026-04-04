import { describe, it, expect } from "vitest";
import {
    DEFAULT_SETTINGS,
    KNOWN_MODELS,
    getProviderForModel,
    migrateSettings,
    getActiveApiKey,
    getActiveBaseUrl,
} from "../config";
import type { PluginSettings } from "../config";

describe("DEFAULT_SETTINGS", () => {
    it("has correct default model", () => {
        expect(DEFAULT_SETTINGS.model).toBe("gpt-4o-mini");
    });

    it("has correct default temperature", () => {
        expect(DEFAULT_SETTINGS.temperature).toBe(0.7);
    });

    it("has empty openaiApiKey", () => {
        expect(DEFAULT_SETTINGS.openaiApiKey).toBe("");
    });

    it("has empty openaiBaseUrl", () => {
        expect(DEFAULT_SETTINGS.openaiBaseUrl).toBe("");
    });

    it("has empty anthropicApiKey", () => {
        expect(DEFAULT_SETTINGS.anthropicApiKey).toBe("");
    });

    it("has empty anthropicBaseUrl", () => {
        expect(DEFAULT_SETTINGS.anthropicBaseUrl).toBe("");
    });

    it("has empty systemPrompt", () => {
        expect(DEFAULT_SETTINGS.systemPrompt).toBe("");
    });

    it("has English as default translation language", () => {
        expect(DEFAULT_SETTINGS.translationLanguage).toBe("English");
    });
});

describe("KNOWN_MODELS", () => {
    it("has openai models", () => {
        expect(KNOWN_MODELS.openai).toContain("gpt-4o");
        expect(KNOWN_MODELS.openai).toContain("gpt-4o-mini");
    });

    it("has anthropic models", () => {
        expect(KNOWN_MODELS.anthropic).toContain("claude-opus-4-6");
        expect(KNOWN_MODELS.anthropic).toContain("claude-sonnet-4-6");
        expect(KNOWN_MODELS.anthropic).toContain("claude-haiku-4-5");
    });
});

describe("getProviderForModel", () => {
    it("returns anthropic for claude-opus-4-6", () => {
        expect(getProviderForModel("claude-opus-4-6")).toBe("anthropic");
    });

    it("returns anthropic for claude-sonnet-4-6", () => {
        expect(getProviderForModel("claude-sonnet-4-6")).toBe("anthropic");
    });

    it("returns openai for gpt-4o", () => {
        expect(getProviderForModel("gpt-4o")).toBe("openai");
    });

    it("returns openai for gpt-4o-mini", () => {
        expect(getProviderForModel("gpt-4o-mini")).toBe("openai");
    });

    it("returns openai as default for unknown model", () => {
        expect(getProviderForModel("some-future-model")).toBe("openai");
    });

    it("returns anthropic for any claude-prefixed model", () => {
        expect(getProviderForModel("claude-3-haiku")).toBe("anthropic");
        expect(getProviderForModel("claude-anything")).toBe("anthropic");
    });
});

describe("migrateSettings", () => {
    it("migrates legacy apiKey to openaiApiKey", () => {
        const result = migrateSettings({ apiKey: "sk-old" });
        expect(result.openaiApiKey).toBe("sk-old");
        expect((result as any).apiKey).toBeUndefined();
    });

    it("migrates legacy baseUrl to openaiBaseUrl", () => {
        const result = migrateSettings({ baseUrl: "https://custom.com" });
        expect(result.openaiBaseUrl).toBe("https://custom.com");
        expect((result as any).baseUrl).toBeUndefined();
    });

    it("does not overwrite existing openaiApiKey with empty legacy apiKey", () => {
        const result = migrateSettings({
            apiKey: "",
            openaiApiKey: "sk-new",
        });
        expect(result.openaiApiKey).toBe("sk-new");
    });

    it("passes new-format settings through unchanged", () => {
        const settings: PluginSettings = {
            openaiApiKey: "sk-openai",
            openaiBaseUrl: "https://openai.example.com",
            anthropicApiKey: "sk-ant-abc",
            anthropicBaseUrl: "",
            model: "claude-sonnet-4-6",
            systemPrompt: "Be helpful",
            temperature: 0.5,
            translationLanguage: "Japanese",
        };
        const result = migrateSettings(settings);
        expect(result).toEqual(settings);
    });

    it("fills missing fields with defaults", () => {
        const result = migrateSettings({});
        expect(result.openaiApiKey).toBe("");
        expect(result.anthropicApiKey).toBe("");
        expect(result.model).toBe("gpt-4o-mini");
        expect(result.temperature).toBe(0.7);
    });

    it("strips legacy apiKey and baseUrl keys from result", () => {
        const result = migrateSettings({
            apiKey: "sk-old",
            baseUrl: "https://old.com",
        });
        expect(result).not.toHaveProperty("apiKey");
        expect(result).not.toHaveProperty("baseUrl");
    });
});

describe("getActiveApiKey", () => {
    it("returns openaiApiKey for openai model", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            openaiApiKey: "sk-openai",
            model: "gpt-4o",
        };
        expect(getActiveApiKey(settings)).toBe("sk-openai");
    });

    it("returns anthropicApiKey for claude model", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            anthropicApiKey: "sk-ant-abc",
            model: "claude-sonnet-4-6",
        };
        expect(getActiveApiKey(settings)).toBe("sk-ant-abc");
    });

    it("returns empty string when key not set", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            model: "claude-sonnet-4-6",
        };
        expect(getActiveApiKey(settings)).toBe("");
    });
});

describe("getActiveBaseUrl", () => {
    it("returns openaiBaseUrl for openai model", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            openaiBaseUrl: "https://openai.example.com",
            model: "gpt-4o",
        };
        expect(getActiveBaseUrl(settings)).toBe("https://openai.example.com");
    });

    it("returns anthropicBaseUrl for claude model", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            anthropicBaseUrl: "https://anthropic.example.com",
            model: "claude-sonnet-4-6",
        };
        expect(getActiveBaseUrl(settings)).toBe("https://anthropic.example.com");
    });

    it("returns empty string when base url not set", () => {
        const settings: PluginSettings = {
            ...DEFAULT_SETTINGS,
            model: "gpt-4o",
        };
        expect(getActiveBaseUrl(settings)).toBe("");
    });
});
