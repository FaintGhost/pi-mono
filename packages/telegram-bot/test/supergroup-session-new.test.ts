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

describe("supergroup /session new", () => {
	it("创建新 topic 并返回深链", async () => {
		const transport = new FakeTelegramTransport();
		const requestedContexts: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async (contextId: string) => {
					requestedContexts.push(contextId);
					return { activeSession: "session-1.jsonl", sessions: ["session-1.jsonl"] };
				},
				createSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-2.jsonl" }),
				switchSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-1.jsonl" }),
				deleteSession: async () => ({
					deletedSession: "session-1.jsonl",
					wasActive: true,
					previousActiveSession: "session-1.jsonl",
					activeSession: "session-2.jsonl",
					remainingSessions: ["session-2.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 88,
			userId: 1001,
			text: "/session new",
			messageId: 1,
		});

		expect(transport.createdTopics).toHaveLength(1);
		expect(transport.createdTopics[0].name).toMatch(/^session-\d{8}-\d{6}$/);

		const createdThreadId = transport.createdTopics[0].messageThreadId;
		expect(requestedContexts).toContain(`supergroup--100123-topic-${createdThreadId}`);

		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].target?.messageThreadId).toBe(88);
		expect(transport.sentMessages[0].text).toContain("https://t.me/c/");
	});
});
