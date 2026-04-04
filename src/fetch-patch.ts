/**
 * Patches globalThis.fetch to bypass CORS for Anthropic API requests.
 *
 * The WASM module (reqwest) uses browser fetch() which is subject to CORS.
 * OpenAI's API allows cross-origin requests; Anthropic's does not.
 * In Obsidian's Electron context, Node.js 'https' module is available
 * and not subject to CORS. This patch intercepts Anthropic requests
 * (identified by the x-api-key header) and routes them through Node.js.
 */

import * as https from "https";
import * as http from "http";

export function hasXApiKeyHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
    // Check init.headers
    if (init?.headers) {
        if (init.headers instanceof Headers) {
            return init.headers.has("x-api-key");
        }
        if (Array.isArray(init.headers)) {
            return init.headers.some(([k]) => k.toLowerCase() === "x-api-key");
        }
        return Object.keys(init.headers).some(
            (k) => k.toLowerCase() === "x-api-key"
        );
    }
    // Check Request object headers
    if (input instanceof Request) {
        return input.headers.has("x-api-key");
    }
    return false;
}

async function extractFetchArgs(
    input: RequestInfo | URL,
    init?: RequestInit
): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
    let url: string;
    let method = "GET";
    const headers: Record<string, string> = {};
    let body: string | undefined;

    if (typeof input === "string") {
        url = input;
    } else if (input instanceof URL) {
        url = input.toString();
    } else {
        // Request object — extract all properties
        url = input.url;
        method = input.method;
        input.headers.forEach((v, k) => {
            headers[k] = v;
        });
        body = await input.text();
    }

    // init overrides Request properties
    if (init) {
        if (init.method) method = init.method;
        if (init.headers) {
            if (init.headers instanceof Headers) {
                init.headers.forEach((v, k) => {
                    headers[k] = v;
                });
            } else if (Array.isArray(init.headers)) {
                for (const [k, v] of init.headers) {
                    headers[k] = v;
                }
            } else {
                for (const [k, v] of Object.entries(init.headers)) {
                    if (v !== undefined) headers[k] = v;
                }
            }
        }
        if (init.body != null) {
            body = typeof init.body === "string" ? init.body : String(init.body);
        }
    }

    return { url, method, headers, body: body || undefined };
}

function nodeFetch(args: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}): Promise<Response> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(args.url);
        const mod = parsed.protocol === "https:" ? https : http;

        const req = mod.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || undefined,
                path: parsed.pathname + parsed.search,
                method: args.method,
                headers: args.headers,
            },
            (res: http.IncomingMessage) => {
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value == null) continue;
                    if (Array.isArray(value)) {
                        for (const v of value) responseHeaders.append(key, v);
                    } else {
                        responseHeaders.set(key, value as string);
                    }
                }

                const stream = new ReadableStream({
                    start(controller) {
                        res.on("data", (chunk: Buffer) => {
                            controller.enqueue(new Uint8Array(chunk));
                        });
                        res.on("end", () => controller.close());
                        res.on("error", (err: Error) => controller.error(err));
                    },
                });

                const response = new Response(stream, {
                    status: res.statusCode || 200,
                    statusText: res.statusMessage || "",
                    headers: responseHeaders,
                });
                // Response.url is readonly ("") by default for constructed
                // Responses. reqwest's WASM layer calls Url::parse(resp.url())
                // which fails on empty string. Override with the request URL.
                Object.defineProperty(response, "url", { value: args.url });
                resolve(response);
            }
        );

        req.on("error", reject);
        if (args.body) req.write(args.body);
        req.end();
    });
}

export function patchFetchForCORS(): void {
    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> => {
        if (hasXApiKeyHeader(input, init)) {
            const args = await extractFetchArgs(input, init);
            console.debug("[LLM] Routing request via Node.js (CORS bypass):", args.url);
            return nodeFetch(args);
        }
        return originalFetch(input, init);
    };
}
