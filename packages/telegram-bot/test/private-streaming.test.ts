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
};

describe("Scenario 1: 白名单私聊可对话且流式更新", () => {
	it("白名单私聊消息会触发流式编辑", async () => {
		const transport = new FakeTelegramTransport();
		const pool = {
			runPrompt: async (
				_chatId: string,
				_message: string,
				options?: { onTextUpdate?: (text: string) => Promise<void> | void },
			) => {
				await options?.onTextUpdate?.("你");
				await options?.onTextUpdate?.("你好");
				return { text: "你好" };
			},
			reset: async () => {},
		} as const;

		const app = new TelegramBotApp({
			config,
			transport,
			pool,
		});

		await app.handleMessage({
			chatId: "c-1",
			chatType: "private",
			userId: 1001,
			text: "你好",
			messageId: 1,
		});

		expect(transport.typingCalls.length).toBeGreaterThan(0);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toBe("你");
		expect(transport.editedMessages.length).toBeGreaterThanOrEqual(1);
		expect(transport.editedMessages.at(-1)?.text).toBe("你好");
	});
});
