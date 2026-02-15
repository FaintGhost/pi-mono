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

describe("session command", () => {
	it("/session list 返回当前会话与列表", async () => {
		const transport = new FakeTelegramTransport();

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2026-02-15-b.jsonl",
					sessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl", "session-2026-02-15-a.jsonl"],
				}),
				createSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-d.jsonl",
				}),
				switchSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-b.jsonl",
				}),
				deleteSession: async () => ({
					deletedSession: "session-2026-02-15-a.jsonl",
					wasActive: false,
					previousActiveSession: "session-2026-02-15-b.jsonl",
					activeSession: "session-2026-02-15-b.jsonl",
					remainingSessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session list",
			messageId: 1,
		});

		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("当前会话: session-2026-02-15-b.jsonl");
		expect(transport.sentMessages[0].text).toContain("2) [*] session-2026-02-15-b.jsonl");
	});

	it("/session use 支持编号切换", async () => {
		const transport = new FakeTelegramTransport();
		const switchCalls: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2026-02-15-b.jsonl",
					sessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl", "session-2026-02-15-a.jsonl"],
				}),
				createSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-d.jsonl",
				}),
				switchSession: async (_chatId: string, sessionFileName: string) => {
					switchCalls.push(sessionFileName);
					return {
						previousSession: "session-2026-02-15-b.jsonl",
						nextSession: sessionFileName,
					};
				},
				deleteSession: async () => ({
					deletedSession: "session-2026-02-15-a.jsonl",
					wasActive: false,
					previousActiveSession: "session-2026-02-15-b.jsonl",
					activeSession: "session-2026-02-15-b.jsonl",
					remainingSessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session@my_bot use 3",
			messageId: 2,
		});

		expect(switchCalls).toEqual(["session-2026-02-15-a.jsonl"]);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("会话已切换");
	});

	it("/session delete 支持按编号删除", async () => {
		const transport = new FakeTelegramTransport();
		const deleteCalls: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2026-02-15-b.jsonl",
					sessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl", "session-2026-02-15-a.jsonl"],
				}),
				createSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-d.jsonl",
				}),
				switchSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-b.jsonl",
				}),
				deleteSession: async (_chatId: string, sessionFileName: string) => {
					deleteCalls.push(sessionFileName);
					return {
						deletedSession: sessionFileName,
						wasActive: false,
						previousActiveSession: "session-2026-02-15-b.jsonl",
						activeSession: "session-2026-02-15-b.jsonl",
						remainingSessions: ["session-2026-02-15-c.jsonl", "session-2026-02-15-b.jsonl"],
					};
				},
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session delete 3",
			messageId: 3,
		});

		expect(deleteCalls).toEqual(["session-2026-02-15-a.jsonl"]);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("已删除会话");
	});

	it("/session use 输入无效编号时会提示未找到", async () => {
		const transport = new FakeTelegramTransport();
		let switchCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2026-02-15-b.jsonl",
					sessions: ["session-2026-02-15-b.jsonl"],
				}),
				createSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-c.jsonl",
				}),
				switchSession: async () => {
					switchCalls += 1;
					return {
						previousSession: "session-2026-02-15-b.jsonl",
						nextSession: "session-2026-02-15-b.jsonl",
					};
				},
				deleteSession: async () => ({
					deletedSession: "session-2026-02-15-a.jsonl",
					wasActive: false,
					previousActiveSession: "session-2026-02-15-b.jsonl",
					activeSession: "session-2026-02-15-b.jsonl",
					remainingSessions: ["session-2026-02-15-b.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session use 9",
			messageId: 4,
		});

		expect(switchCalls).toBe(0);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("未找到会话");
	});

	it("/session new 会创建并切换到新会话", async () => {
		const transport = new FakeTelegramTransport();
		let createCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2026-02-15-b.jsonl",
					sessions: ["session-2026-02-15-b.jsonl"],
				}),
				createSession: async () => {
					createCalls += 1;
					return {
						previousSession: "session-2026-02-15-b.jsonl",
						nextSession: "session-2026-02-15-c.jsonl",
					};
				},
				switchSession: async () => ({
					previousSession: "session-2026-02-15-b.jsonl",
					nextSession: "session-2026-02-15-b.jsonl",
				}),
				deleteSession: async () => ({
					deletedSession: "session-2026-02-15-a.jsonl",
					wasActive: false,
					previousActiveSession: "session-2026-02-15-b.jsonl",
					activeSession: "session-2026-02-15-b.jsonl",
					remainingSessions: ["session-2026-02-15-b.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session new",
			messageId: 5,
		});

		expect(createCalls).toBe(1);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("session-2026-02-15-c.jsonl");
	});
});
