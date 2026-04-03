import { App, PluginSettingTab, Setting } from "obsidian";
import type LlmPlugin from "./main";

export class LlmSettingTab extends PluginSettingTab {
    plugin: LlmPlugin;

    constructor(app: App, plugin: LlmPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("Your LLM provider API key")
            .addText((text) =>
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.plugin.settings.apiKey)
                    .then((t) => { t.inputEl.type = "password"; })
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Model")
            .setDesc("Model identifier (e.g. gpt-4o-mini, gpt-4o)")
            .addText((text) =>
                text
                    .setPlaceholder("gpt-4o-mini")
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Base URL")
            .setDesc("Custom API base URL (leave empty for OpenAI default)")
            .addText((text) =>
                text
                    .setPlaceholder("https://api.openai.com")
                    .setValue(this.plugin.settings.baseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.baseUrl = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("System Prompt")
            .setDesc("Default system prompt sent with every request")
            .addTextArea((text) =>
                text
                    .setPlaceholder("You are a helpful assistant.")
                    .setValue(this.plugin.settings.systemPrompt)
                    .onChange(async (value) => {
                        this.plugin.settings.systemPrompt = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Temperature")
            .setDesc("Controls randomness (0 = deterministic, 1 = creative)")
            .addSlider((slider) =>
                slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.plugin.settings.temperature)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.temperature = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Translation Language")
            .setDesc("Target language for the Translate command")
            .addText((text) =>
                text
                    .setPlaceholder("English")
                    .setValue(this.plugin.settings.translationLanguage)
                    .onChange(async (value) => {
                        this.plugin.settings.translationLanguage = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
