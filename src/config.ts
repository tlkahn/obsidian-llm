export type Provider = "openai" | "anthropic";

export const KNOWN_MODELS: Record<Provider, string[]> = {
    openai: ["gpt-4o", "gpt-4o-mini"],
    anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
};

export function getProviderForModel(model: string): Provider {
    return model.startsWith("claude") ? "anthropic" : "openai";
}

export interface PluginSettings {
    openaiApiKey: string;
    openaiBaseUrl: string;
    anthropicApiKey: string;
    anthropicBaseUrl: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    translationLanguage: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    openaiApiKey: "",
    openaiBaseUrl: "",
    anthropicApiKey: "",
    anthropicBaseUrl: "",
    model: "gpt-4o-mini",
    systemPrompt: "",
    temperature: 0.7,
    translationLanguage: "English",
};

export function migrateSettings(data: any): PluginSettings {
    const result: PluginSettings = { ...DEFAULT_SETTINGS, ...data };

    // Migrate legacy apiKey → openaiApiKey
    if (data.apiKey && !data.openaiApiKey) {
        result.openaiApiKey = data.apiKey;
    }

    // Migrate legacy baseUrl → openaiBaseUrl
    if (data.baseUrl && !data.openaiBaseUrl) {
        result.openaiBaseUrl = data.baseUrl;
    }

    // Strip legacy keys
    delete (result as any).apiKey;
    delete (result as any).baseUrl;

    return result;
}

export function getActiveApiKey(settings: PluginSettings): string {
    const provider = getProviderForModel(settings.model);
    return provider === "anthropic" ? settings.anthropicApiKey : settings.openaiApiKey;
}

export function getActiveBaseUrl(settings: PluginSettings): string {
    const provider = getProviderForModel(settings.model);
    return provider === "anthropic" ? settings.anthropicBaseUrl : settings.openaiBaseUrl;
}
