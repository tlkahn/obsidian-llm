import { FileSystemAdapter } from "obsidian";

// Types will be available at runtime from the WASM module
interface LlmClientInstance {
    free(): void;
    promptStreamingWithOptions(
        text: string,
        system: string | null | undefined,
        optionsJson: string,
        callback: Function
    ): Promise<string>;
}

interface LlmWasmModule {
    initSync(opts: { module: ArrayBuffer }): void;
    LlmClient: {
        new (apiKey: string, model: string): LlmClientInstance;
        newWithBaseUrl(apiKey: string, model: string, baseUrl: string): LlmClientInstance;
    };
}

export class WasmBridge {
    private initialized = false;
    private wasmModule: LlmWasmModule | null = null;
    private client: LlmClientInstance | null = null;
    private isProcessing = false;

    async init(pluginDir: string, adapter: FileSystemAdapter): Promise<void> {
        if (this.initialized) return;

        const wasmPath = `${pluginDir}/llm_wasm_bg.wasm`;
        const wasmBinary = await adapter.readBinary(wasmPath);

        const mod = await import("llm-wasm") as unknown as LlmWasmModule;
        mod.initSync({ module: wasmBinary });
        this.wasmModule = mod;

        this.initialized = true;
        console.log("[LLM] WASM initialized successfully");
    }

    createClient(apiKey: string, model: string, baseUrl?: string): void {
        if (!this.initialized || !this.wasmModule) {
            throw new Error("[LLM] WASM not initialized. Call init() first.");
        }

        // Free old client if exists
        if (this.client) {
            this.client.free();
            this.client = null;
        }

        if (baseUrl) {
            this.client = this.wasmModule.LlmClient.newWithBaseUrl(apiKey, model, baseUrl);
        } else {
            this.client = new this.wasmModule.LlmClient(apiKey, model);
        }
    }

    async promptStreaming(
        text: string,
        system: string | null,
        options: Record<string, unknown>,
        onChunk: (chunk: string) => void
    ): Promise<string> {
        if (!this.initialized || !this.client) {
            throw new Error("[LLM] WASM not initialized or client not created.");
        }

        if (this.isProcessing) {
            throw new Error("[LLM] A request is already in progress.");
        }

        this.isProcessing = true;
        try {
            const optionsJson = JSON.stringify(options);
            const result = await this.client.promptStreamingWithOptions(
                text,
                system,
                optionsJson,
                onChunk
            );
            return result;
        } finally {
            this.isProcessing = false;
        }
    }
}
