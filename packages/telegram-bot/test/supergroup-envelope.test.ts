import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramLongPollingTransport } from "../src/telegram.js";

function createJsonResponse<T>(payload: T): Response {
	return {
		ok: true,
		status: 200,
		json: async () => payload,
	} as Response;
}

describe("supergroup envelope", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("解析 supergroup topic 消息的 message_thread_id", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				createJsonResponse({
					ok: true,
					result: [
						{
							update_id: 1,
							message: {
								message_id: 10,
								text: "hello",
								message_thread_id: 777,
								is_topic_message: true,
								chat: {
									id: -100123,
									type: "supergroup",
								},
								from: {
									id: 1001,
								},
							},
						},
					],
				}),
			)
			.mockResolvedValue(createJsonResponse({ ok: true, result: [] }));

		globalThis.fetch = fetchMock as typeof fetch;

		const transport = new TelegramLongPollingTransport("token", "none");
		const messages: Array<{ chatType: string; messageThreadId: number | null; isTopicMessage: boolean | undefined }> =
			[];

		await transport.start(async (message) => {
			messages.push({
				chatType: message.chatType,
				messageThreadId: message.messageThreadId,
				isTopicMessage: message.isTopicMessage,
			});
			await transport.stop();
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({
			chatType: "supergroup",
			messageThreadId: 777,
			isTopicMessage: true,
		});
	});

	it("General topic 消息允许 messageThreadId 为 null（仅 is_forum=true）", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				createJsonResponse({
					ok: true,
					result: [
						{
							update_id: 2,
							message: {
								message_id: 11,
								text: "hello",
								chat: {
									id: -100124,
									type: "supergroup",
									is_forum: true,
								},
								from: {
									id: 1001,
								},
							},
						},
					],
				}),
			)
			.mockResolvedValue(createJsonResponse({ ok: true, result: [] }));

		globalThis.fetch = fetchMock as typeof fetch;

		const transport = new TelegramLongPollingTransport("token", "none");
		const messages: Array<{
			messageThreadId: number | null;
			isTopicMessage: boolean | undefined;
			isForum: boolean | undefined;
		}> = [];

		await transport.start(async (message) => {
			messages.push({
				messageThreadId: message.messageThreadId,
				isTopicMessage: message.isTopicMessage,
				isForum: message.isForum,
			});
			await transport.stop();
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({ messageThreadId: null, isTopicMessage: false, isForum: true });
	});
});
