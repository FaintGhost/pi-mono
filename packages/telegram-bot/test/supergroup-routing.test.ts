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

describe("supergroup routing", () => {
	it("主聊天区消息静默忽略", async () => {
		const transport = new FakeTelegramTransport();
		let runPromptCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => {
					runPromptCalls += 1;
					return { text: "unused" };
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
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: null,
			userId: 1001,
			text: "hello",
			messageId: 1,
		});

		expect(runPromptCalls).toBe(0);
		expect(transport.sentMessages).toHaveLength(0);
	});

	it("topic 内非白名单消息静默忽略", async () => {
		const transport = new FakeTelegramTransport();
		let runPromptCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => {
					runPromptCalls += 1;
					return { text: "unused" };
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
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 99,
			userId: 9999,
			text: "hello",
			messageId: 2,
		});

		expect(runPromptCalls).toBe(0);
		expect(transport.sentMessages).toHaveLength(0);
	});

	it("General topic 白名单消息可触发对话", async () => {
		const transport = new FakeTelegramTransport();
		const contextIds: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async (contextId: string) => {
					contextIds.push(contextId);
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
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: null,
			isForum: true,
			userId: 1001,
			text: "hello general",
			messageId: 3,
		});

		expect(contextIds).toEqual(["supergroup--100123-topic-general"]);
		expect(transport.sentMessages.length).toBeGreaterThan(0);
		expect(transport.sentMessages[0].target).toBeUndefined();
	});

	it("topic 内白名单消息可触发对话", async () => {
		const transport = new FakeTelegramTransport();
		const contextIds: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async (contextId: string) => {
					contextIds.push(contextId);
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
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 99,
			userId: 1001,
			text: "hello",
			messageId: 3,
		});

		expect(contextIds).toEqual(["supergroup--100123-topic-99"]);
		expect(transport.sentMessages.length).toBeGreaterThan(0);
		expect(transport.sentMessages[0].target?.messageThreadId).toBe(99);
	});
});
