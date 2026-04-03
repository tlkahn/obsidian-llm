import { describe, it, expect, vi, beforeEach } from "vitest";
import { WasmBridge } from "../bridge";

// We test the bridge logic without real WASM by manipulating internal state

describe("WasmBridge", () => {
    let bridge: WasmBridge;

    beforeEach(() => {
        bridge = new WasmBridge();
    });

    it("throws if prompt called before init", async () => {
        await expect(
            bridge.promptStreaming("test", null, {}, () => {})
        ).rejects.toThrow("not initialized");
    });

    it("starts uninitialized", () => {
        // Attempting to create a client should throw
        expect(() => bridge.createClient("key", "model")).toThrow("not initialized");
    });

    it("rejects concurrent requests", async () => {
        // Set up a bridge that appears initialized with a mock client
        const mockBridge = new WasmBridge();
        // Use Object.defineProperty to set private fields for testing
        Object.defineProperty(mockBridge, "initialized", { value: true });
        Object.defineProperty(mockBridge, "client", {
            value: {
                free: vi.fn(),
                promptStreamingWithOptions: vi.fn(
                    () => new Promise((resolve) => setTimeout(() => resolve("done"), 100))
                ),
            },
        });

        // Start first request
        const first = mockBridge.promptStreaming("test", null, {}, () => {});

        // Second concurrent request should be rejected
        await expect(
            mockBridge.promptStreaming("test2", null, {}, () => {})
        ).rejects.toThrow("already in progress");

        await first;
    });

    it("passes options as JSON to streaming method", async () => {
        const mockPromptFn = vi.fn().mockResolvedValue("response");
        const mockBridge = new WasmBridge();
        Object.defineProperty(mockBridge, "initialized", { value: true });
        Object.defineProperty(mockBridge, "client", {
            value: {
                free: vi.fn(),
                promptStreamingWithOptions: mockPromptFn,
            },
        });

        const callback = vi.fn();
        await mockBridge.promptStreaming(
            "hello",
            "system msg",
            { temperature: 0.7, max_tokens: 100 },
            callback
        );

        expect(mockPromptFn).toHaveBeenCalledWith(
            "hello",
            "system msg",
            JSON.stringify({ temperature: 0.7, max_tokens: 100 }),
            callback
        );
    });

    it("invokes callback for each chunk", async () => {
        const chunks: string[] = [];
        const mockPromptFn = vi.fn(async (_text, _sys, _opts, cb) => {
            cb("hello ");
            cb("world");
            return "hello world";
        });

        const mockBridge = new WasmBridge();
        Object.defineProperty(mockBridge, "initialized", { value: true });
        Object.defineProperty(mockBridge, "client", {
            value: {
                free: vi.fn(),
                promptStreamingWithOptions: mockPromptFn,
            },
        });

        await mockBridge.promptStreaming("test", null, {}, (chunk) => {
            chunks.push(chunk);
        });

        expect(chunks).toEqual(["hello ", "world"]);
    });

    it("resets isProcessing after error", async () => {
        const mockPromptFn = vi.fn().mockRejectedValue(new Error("network error"));
        const mockBridge = new WasmBridge();
        Object.defineProperty(mockBridge, "initialized", { value: true });
        Object.defineProperty(mockBridge, "client", {
            value: {
                free: vi.fn(),
                promptStreamingWithOptions: mockPromptFn,
            },
        });

        await expect(
            mockBridge.promptStreaming("test", null, {}, () => {})
        ).rejects.toThrow("network error");

        // Should be able to make another request after error
        mockPromptFn.mockResolvedValue("ok");
        const result = await mockBridge.promptStreaming("test2", null, {}, () => {});
        expect(result).toBe("ok");
    });
});
