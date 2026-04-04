import { App, PluginSettingTab, Setting } from "obsidian";
import type LlmPlugin from "./main";
import { KNOWN_MODELS } from "./config";

export class LlmSettingTab extends PluginSettingTab {
    plugin: LlmPlugin;

    constructor(app: App, plugin: LlmPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // --- Model ---
        containerEl.createEl("h3", { text: "Model" });

        const allModels: { value: string; label: string }[] = [];
        for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
            const providerLabel = provider === "openai" ? "OpenAI" : "Anthropic";
            for (const m of models) {
                allModels.push({ value: m, label: `${providerLabel}: ${m}` });
            }
        }

        let customModelSetting: Setting | null = null;

        new Setting(containerEl)
            .setName("Model")
            .setDesc("Select an LLM model or choose Custom to enter a model ID")
            .addDropdown((dropdown) => {
                for (const { value, label } of allModels) {
                    dropdown.addOption(value, label);
                }
                dropdown.addOption("__custom__", "Custom...");

                const isKnown = allModels.some((m) => m.value === this.plugin.settings.model);
                dropdown.setValue(isKnown ? this.plugin.settings.model : "__custom__");

                dropdown.onChange(async (value) => {
                    if (value === "__custom__") {
                        customModelSetting?.settingEl.show();
                    } else {
                        this.plugin.settings.model = value;
                        customModelSetting?.settingEl.hide();
                        await this.plugin.saveSettings();
                    }
                });
            });

        customModelSetting = new Setting(containerEl)
            .setName("Custom Model ID")
            .setDesc("Enter any OpenAI-compatible or Anthropic model identifier")
            .addText((text) =>
                text
                    .setPlaceholder("model-id")
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    })
            );

        const isKnown = allModels.some((m) => m.value === this.plugin.settings.model);
        if (isKnown) {
            customModelSetting.settingEl.hide();
        }

        // --- OpenAI ---
        containerEl.createEl("h3", { text: "OpenAI" });

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("Your OpenAI API key")
            .addText((text) =>
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.plugin.settings.openaiApiKey)
                    .then((t) => { t.inputEl.type = "password"; })
                    .onChange(async (value) => {
                        this.plugin.settings.openaiApiKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Base URL")
            .setDesc("Custom API base URL (leave empty for OpenAI default)")
            .addText((text) =>
                text
                    .setPlaceholder("https://api.openai.com")
                    .setValue(this.plugin.settings.openaiBaseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiBaseUrl = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Anthropic ---
        containerEl.createEl("h3", { text: "Anthropic" });

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("Your Anthropic API key")
            .addText((text) =>
                text
                    .setPlaceholder("sk-ant-...")
                    .setValue(this.plugin.settings.anthropicApiKey)
                    .then((t) => { t.inputEl.type = "password"; })
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicApiKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Base URL")
            .setDesc("Custom API base URL (leave empty for Anthropic default)")
            .addText((text) =>
                text
                    .setPlaceholder("https://api.anthropic.com")
                    .setValue(this.plugin.settings.anthropicBaseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicBaseUrl = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- General ---
        containerEl.createEl("h3", { text: "General" });

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
