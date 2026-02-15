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

describe("supergroup command scope", () => {
	it("白名单成员首次发言时懒注册 chat_member 命令", async () => {
		const transport = new FakeTelegramTransport();

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "ok" }),
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
			},
		});

		await app.start();

		expect(transport.commandsCalls).toHaveLength(1);
		expect(transport.commandsCalls[0].scope).toEqual({ type: "all_private_chats" });

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 1001,
			text: "hello",
			messageId: 1,
		});

		expect(transport.commandsCalls).toHaveLength(2);
		expect(transport.commandsCalls[1].scope).toEqual({
			type: "chat_member",
			chatId: "-100123",
			userId: 1001,
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 1001,
			text: "hello again",
			messageId: 2,
		});

		expect(transport.commandsCalls).toHaveLength(2);

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 31,
			userId: 9999,
			text: "hello non-whitelist",
			messageId: 3,
		});

		expect(transport.commandsCalls).toHaveLength(2);
	});
});
