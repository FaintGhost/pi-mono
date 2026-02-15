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

describe("rate limit retry", () => {
	it("最终回答发送遇到 429 时先提示再自动更新结果", async () => {
		const transport = new FakeTelegramTransport();
		transport.sendErrors.push(new Error("Telegram API error: Too Many Requests: retry after 1"));

		const sleepCalls: number[] = [];
		const app = new TelegramBotApp({
			config,
			transport,
			sleepFn: async (ms: number) => {
				sleepCalls.push(ms);
			},
			pool: {
				runPrompt: async () => ({ text: "最终答案", toolCalls: [] }),
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
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "你好",
			messageId: 1,
		});

		expect(sleepCalls).toEqual([1_000]);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("消息发送受限");
		expect(transport.editedMessages).toHaveLength(1);
		expect(transport.editedMessages[0].text).toBe("最终答案");
	});
});
