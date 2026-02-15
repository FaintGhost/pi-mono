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

describe("Scenario 1: 白名单私聊可对话", () => {
	it("白名单私聊消息完成后一次性发送最终回答", async () => {
		const transport = new FakeTelegramTransport();
		const pool = {
			runPrompt: async () => ({ text: "你好", toolCalls: [] }),
			reset: async () => {},
			getSessionOverview: async () => ({ activeSession: "session-1.jsonl", sessions: ["session-1.jsonl"] }),
			createSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-2.jsonl" }),
			switchSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-1.jsonl" }),
			deleteSession: async () => ({
				deletedSession: "session-2.jsonl",
				wasActive: false,
				previousActiveSession: "session-1.jsonl",
				activeSession: "session-1.jsonl",
				remainingSessions: ["session-1.jsonl"],
			}),
		} as const;

		const app = new TelegramBotApp({
			config,
			transport,
			pool,
		});

		await app.handleMessage({
			chatId: "c-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "你好",
			messageId: 1,
		});

		expect(transport.typingCalls.length).toBeGreaterThan(0);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toBe("你好");
		expect(transport.editedMessages).toHaveLength(0);
	});
});
