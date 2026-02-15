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

describe("supergroup session list/use", () => {
	it("/session list 返回群内 topic 会话列表", async () => {
		const transport = new FakeTelegramTransport();

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
					wasActive: true,
					previousActiveSession: "session-1.jsonl",
					activeSession: "session-2.jsonl",
					remainingSessions: ["session-2.jsonl"],
				}),
				listSupergroupTopicBindings: async () => [
					{
						contextId: "supergroup--100123-topic-10",
						chatId: "-100123",
						messageThreadId: 10,
						activeSession: "session-a.jsonl",
						sessionCount: 2,
					},
					{
						contextId: "supergroup--100123-topic-20",
						chatId: "-100123",
						messageThreadId: 20,
						activeSession: "session-b.jsonl",
						sessionCount: 1,
					},
				],
			},
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 20,
			userId: 1001,
			text: "/session list",
			messageId: 1,
		});

		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("topic=20 session=session-b.jsonl");
		expect(transport.sentMessages[0].text).toContain("[*]");
	});

	it("/session use 在超级群禁用", async () => {
		const transport = new FakeTelegramTransport();

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
			messageThreadId: 20,
			userId: 1001,
			text: "/session use 1",
			messageId: 2,
		});

		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("已禁用");
	});

	it("私聊 /session use 保持可用", async () => {
		const transport = new FakeTelegramTransport();
		const switchCalls: string[] = [];

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {},
				getSessionOverview: async () => ({
					activeSession: "session-2.jsonl",
					sessions: ["session-3.jsonl", "session-2.jsonl", "session-1.jsonl"],
				}),
				createSession: async () => ({ previousSession: "session-2.jsonl", nextSession: "session-4.jsonl" }),
				switchSession: async (_contextId: string, sessionFileName: string) => {
					switchCalls.push(sessionFileName);
					return { previousSession: "session-2.jsonl", nextSession: sessionFileName };
				},
				deleteSession: async () => ({
					deletedSession: "session-1.jsonl",
					wasActive: false,
					previousActiveSession: "session-2.jsonl",
					activeSession: "session-2.jsonl",
					remainingSessions: ["session-3.jsonl", "session-2.jsonl"],
				}),
			},
		});

		await app.handleMessage({
			chatId: "1001",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/session use 3",
			messageId: 3,
		});

		expect(switchCalls).toEqual(["session-1.jsonl"]);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("会话已切换");
	});
});
