import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramLongPollingTransport } from "../src/telegram.js";

function createJsonResponse<T>(payload: T): Response {
	return {
		ok: true,
		status: 200,
		json: async () => payload,
	} as Response;
}

function createErrorJsonResponse<T>(status: number, payload: T): Response {
	return {
		ok: false,
		status,
		json: async () => payload,
	} as Response;
}

function getRequestInit(calls: unknown[][], index: number): RequestInit {
	const call = calls.at(index);
	if (!call || call.length < 2) {
		throw new Error(`Missing fetch call at index ${index}`);
	}

	return call[1] as RequestInit;
}

describe("Telegram transport parse mode", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("sends parse_mode by default for sendMessage", async () => {
		const fetchMock = vi.fn(async () => createJsonResponse({ ok: true, result: { message_id: 10 } }));
		globalThis.fetch = fetchMock as typeof fetch;

		const transport = new TelegramLongPollingTransport("token", "Markdown");
		await transport.sendMessage("123", "**hello**");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const request = getRequestInit(fetchMock.mock.calls, 0);
		const body = JSON.parse(String(request.body)) as Record<string, unknown>;
		expect(body.parse_mode).toBe("Markdown");
	});

	it("falls back to plain text when Telegram rejects entities", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				createErrorJsonResponse(400, {
					ok: false,
					description: "Bad Request: can't parse entities: Can't find end of entity",
				}),
			)
			.mockResolvedValueOnce(createJsonResponse({ ok: true, result: { message_id: 11 } }));

		globalThis.fetch = fetchMock as typeof fetch;

		const transport = new TelegramLongPollingTransport("token", "Markdown");
		await transport.sendMessage("123", "_broken_markdown_");

		expect(fetchMock).toHaveBeenCalledTimes(2);

		const firstRequest = getRequestInit(fetchMock.mock.calls, 0);
		const firstBody = JSON.parse(String(firstRequest.body)) as Record<string, unknown>;
		expect(firstBody.parse_mode).toBe("Markdown");

		const secondRequest = getRequestInit(fetchMock.mock.calls, 1);
		const secondBody = JSON.parse(String(secondRequest.body)) as Record<string, unknown>;
		expect(secondBody.parse_mode).toBeUndefined();
	});

	it("ignores 'message is not modified' on editMessage", async () => {
		const fetchMock = vi.fn(async () =>
			createErrorJsonResponse(400, {
				ok: false,
				description: "Bad Request: message is not modified",
			}),
		);

		globalThis.fetch = fetchMock as typeof fetch;

		const transport = new TelegramLongPollingTransport("token", "Markdown");
		await expect(transport.editMessage("123", 1, "same text")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
