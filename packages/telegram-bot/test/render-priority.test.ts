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

describe("render priority", () => {
	it("长回答时主消息改为 /details 提示，避免截断 markdown", async () => {
		const transport = new FakeTelegramTransport();
		const longAnswer = `# 标题\n\n${"这是很长的内容。".repeat(500)}`;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: longAnswer, toolCalls: [] }),
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
			text: "给我长回答",
			messageId: 1,
		});

		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("为保证 Markdown 渲染稳定");
		expect(transport.sentMessages[0].text).toContain("/details");
		expect(transport.sentMessages[0].text).not.toContain("这是很长的内容");
	});
});
