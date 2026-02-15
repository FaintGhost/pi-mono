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

describe("topic auto bind", () => {
	it("同一超级群不同 topic 使用不同会话上下文", async () => {
		const transport = new FakeTelegramTransport();
		const contexts: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async (contextId: string) => {
					contexts.push(contextId);
					return { text: "ok" };
				},
				reset: async () => {},
				getSessionOverview: async () => ({ activeSession: "session-1.jsonl", sessions: ["session-1.jsonl"] }),
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
			chatId: "-100200",
			chatType: "supergroup",
			messageThreadId: 11,
			userId: 1001,
			text: "hello topic 11",
			messageId: 1,
		});

		await app.handleMessage({
			chatId: "-100200",
			chatType: "supergroup",
			messageThreadId: 12,
			userId: 1001,
			text: "hello topic 12",
			messageId: 2,
		});

		expect(contexts).toEqual(["supergroup--100200-topic-11", "supergroup--100200-topic-12"]);
	});

	it("私聊与超级群 topic 会话上下文隔离", async () => {
		const transport = new FakeTelegramTransport();
		const contexts: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async (contextId: string) => {
					contexts.push(contextId);
					return { text: "ok" };
				},
				reset: async () => {},
				getSessionOverview: async () => ({ activeSession: "session-1.jsonl", sessions: ["session-1.jsonl"] }),
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
			chatId: "1001",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "hello private",
			messageId: 3,
		});

		await app.handleMessage({
			chatId: "-100200",
			chatType: "supergroup",
			messageThreadId: 11,
			userId: 1001,
			text: "hello topic",
			messageId: 4,
		});

		expect(contexts).toEqual(["1001", "supergroup--100200-topic-11"]);
	});
});
