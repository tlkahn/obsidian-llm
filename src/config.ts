export interface PluginSettings {
    apiKey: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    temperature: number;
    translationLanguage: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: "",
    model: "gpt-4o-mini",
    baseUrl: "",
    systemPrompt: "",
    temperature: 0.7,
    translationLanguage: "English",
};
