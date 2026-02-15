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

describe("supergroup reset/delete", () => {
	it("/reset 仅重置当前 topic 会话", async () => {
		const transport = new FakeTelegramTransport();
		const resetContexts: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async (contextId: string) => {
					resetContexts.push(contextId);
				},
				getSessionOverview: async () => ({
					activeSession: "session-current.jsonl",
					sessions: ["session-current.jsonl"],
				}),
				createSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-2.jsonl" }),
				switchSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-1.jsonl" }),
				deleteSession: async () => ({
					deletedSession: "session-1.jsonl",
					wasActive: false,
					previousActiveSession: "session-current.jsonl",
					activeSession: "session-current.jsonl",
					remainingSessions: ["session-current.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 1001,
			text: "/reset",
			messageId: 1,
		});

		expect(resetContexts).toEqual(["supergroup--100123-topic-31"]);
		expect(transport.createdTopics).toHaveLength(0);
	});

	it("/session delete 成功时先删 topic 再删 session context", async () => {
		const transport = new FakeTelegramTransport();
		const deletedContexts: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-current.jsonl",
					sessions: ["session-current.jsonl"],
				}),
				createSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-2.jsonl" }),
				switchSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-1.jsonl" }),
				deleteSession: async () => ({
					deletedSession: "session-1.jsonl",
					wasActive: false,
					previousActiveSession: "session-current.jsonl",
					activeSession: "session-current.jsonl",
					remainingSessions: ["session-current.jsonl"],
				}),
				deleteContext: async (contextId: string) => {
					deletedContexts.push(contextId);
				},
			},
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 1001,
			text: "/session delete",
			messageId: 2,
		});

		expect(transport.deletedTopics).toEqual([
			{
				chatId: "-100123",
				messageThreadId: 31,
			},
		]);
		expect(deletedContexts).toEqual(["supergroup--100123-topic-31"]);
	});

	it("/session delete 删除 topic 失败时不删除 session", async () => {
		const transport = new FakeTelegramTransport();
		transport.failDeleteTopic = true;
		let deleteContextCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-current.jsonl",
					sessions: ["session-current.jsonl"],
				}),
				createSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-2.jsonl" }),
				switchSession: async () => ({ previousSession: "session-1.jsonl", nextSession: "session-1.jsonl" }),
				deleteSession: async () => ({
					deletedSession: "session-1.jsonl",
					wasActive: false,
					previousActiveSession: "session-current.jsonl",
					activeSession: "session-current.jsonl",
					remainingSessions: ["session-current.jsonl"],
				}),
				deleteContext: async () => {
					deleteContextCalls += 1;
				},
			},
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 1001,
			text: "/session delete",
			messageId: 3,
		});

		expect(deleteContextCalls).toBe(0);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("操作已回滚");
	});
});
