import { describe, expect, it, vi } from "vitest";
import { getModel } from "../src/models.js";
import type { Context } from "../src/types.js";

const mockState = vi.hoisted(() => ({
	constructorOpts: undefined as Record<string, unknown> | undefined,
	streamParams: undefined as Record<string, unknown> | undefined,
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		constructor(opts: Record<string, unknown>) {
			mockState.constructorOpts = opts;
		}

		chat = {
			completions: {
				create: async (params: Record<string, unknown>) => {
					mockState.streamParams = params;
					return {
						async *[Symbol.asyncIterator]() {
							yield {
								choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									prompt_tokens_details: { cached_tokens: 0 },
									completion_tokens_details: { reasoning_tokens: 0 },
								},
							};
						},
					};
				},
			},
		};
	}

	return { default: FakeOpenAI };
});

describe("Copilot Claude via OpenAI Completions", () => {
	const context: Context = {
		systemPrompt: "You are a helpful assistant.",
		messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
	};

	it("uses Copilot headers and valid OpenAI Completions payload", async () => {
		const model = getModel("github-copilot", "claude-sonnet-4");
		expect(model.api).toBe("openai-completions");

		const { streamOpenAICompletions } = await import("../src/providers/openai-completions.js");
		const s = streamOpenAICompletions(model, context, { apiKey: "tid_copilot_session_test_token" });
		for await (const event of s) {
			if (event.type === "error" || event.type === "done") break;
		}

		const opts = mockState.constructorOpts;
		expect(opts).toBeDefined();
		expect(opts?.apiKey).toBe("tid_copilot_session_test_token");

		const headers = opts?.defaultHeaders as Record<string, string>;
		expect(headers["User-Agent"]).toContain("GitHubCopilotChat");
		expect(headers["Copilot-Integration-Id"]).toBe("vscode-chat");
		expect(headers["X-Initiator"]).toBe("user");
		expect(headers["Openai-Intent"]).toBe("conversation-edits");

		const params = mockState.streamParams;
		expect(params?.model).toBe("claude-sonnet-4");
		expect(params?.stream).toBe(true);
		expect(Array.isArray(params?.messages)).toBe(true);
	});

	it("adds Copilot-Vision-Request header when images are present", async () => {
		const model = getModel("github-copilot", "claude-sonnet-4");
		const contextWithImage: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "describe image" },
						{ type: "image", mimeType: "image/png", data: "ZmFrZQ==" },
					],
					timestamp: Date.now(),
				},
			],
		};

		const { streamOpenAICompletions } = await import("../src/providers/openai-completions.js");
		const s = streamOpenAICompletions(model, contextWithImage, { apiKey: "tid_copilot_session_test_token" });
		for await (const event of s) {
			if (event.type === "error" || event.type === "done") break;
		}

		const headers = mockState.constructorOpts?.defaultHeaders as Record<string, string>;
		expect(headers["Copilot-Vision-Request"]).toBe("true");
	});
});
