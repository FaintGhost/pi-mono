import { describe, expect, it } from "vitest";
import type { TelegramBotConfig } from "../src/config.js";
import { TelegramBotApp } from "../src/telegram.js";
import { FakeTelegramTransport } from "./doubles/fake-telegram-transport.js";

const config: TelegramBotConfig = {
	telegramBotToken: "token",
	allowedUserIds: new Set([1001]),
	piBin: "pi",
	piCwd: "/workspace",
	dataDir: "/workspace/data",
	sessionsDir: "/workspace/data/sessions",
	idleTtlMs: 10_000,
	streamEditThrottleMs: 0,
	parseMode: "Markdown",
};

describe("Scenario 2: 非授权或非私聊消息被静默忽略", () => {
	it("非白名单私聊与群聊消息不会触发任何处理", async () => {
		const transport = new FakeTelegramTransport();
		let runPromptCalls = 0;

		const pool = {
			runPrompt: async () => {
				runPromptCalls += 1;
				return { text: "unused" };
			},
			reset: async () => {
				throw new Error("reset should not be called");
			},
		} as const;

		const app = new TelegramBotApp({
			config,
			transport,
			pool,
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			userId: 9999,
			text: "hello",
			messageId: 1,
		});

		await app.handleMessage({
			chatId: "chat-2",
			chatType: "group",
			userId: 1001,
			text: "hello",
			messageId: 2,
		});

		expect(runPromptCalls).toBe(0);
		expect(transport.sentMessages).toHaveLength(0);
		expect(transport.editedMessages).toHaveLength(0);
	});
});
