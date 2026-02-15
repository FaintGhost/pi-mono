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

describe("Scenario 0: 基础运行骨架可启动", () => {
	it("启动时会进入 transport 监听流程", async () => {
		const transport = new FakeTelegramTransport();
		const pool = {
			runPrompt: async () => ({ text: "" }),
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

		await app.start();

		expect(transport.commandsCalls).toHaveLength(1);
		expect(transport.commandsCalls[0].scope).toEqual({ type: "all_private_chats" });
		expect(transport.commandsCalls[0].commands.map((command) => command.command)).toEqual([
			"reset",
			"session",
			"details",
		]);
		expect(transport.startCalls).toBe(1);
	});
});
