import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { TelegramBotConfig } from "../src/config.js";
import { AgentPool } from "../src/runtime/agent-pool.js";
import { SessionPathManager } from "../src/storage/session-path.js";
import { TelegramBotApp } from "../src/telegram.js";
import { FakeRuntime } from "./doubles/fake-runtime.js";
import { FakeTelegramTransport } from "./doubles/fake-telegram-transport.js";

describe("Scenario 5: /reset 执行会话轮转（软重置）", () => {
	it("reset 后保留旧会话并切换到新会话", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-reset-rotation-"));
		const sessionPaths = new SessionPathManager(tempDir);

		let createCount = 0;
		const pool = new AgentPool({
			idleTtlMs: 60_000,
			sessionPaths,
			runtimeFactory: {
				create: () => {
					createCount += 1;
					return new FakeRuntime(async (message) => ({ text: message }));
				},
			},
		});

		try {
			await pool.runPrompt("chat-1", "before-reset");
			const oldSessionPath = await sessionPaths.getActiveSessionPath("chat-1");

			await pool.reset("chat-1");

			const newSessionPath = await sessionPaths.getActiveSessionPath("chat-1");
			expect(newSessionPath).not.toBe(oldSessionPath);
			expect(existsSync(oldSessionPath)).toBe(true);

			await pool.runPrompt("chat-1", "after-reset");
			expect(createCount).toBe(2);
		} finally {
			await pool.dispose();
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("收到 /reset 时会调用 pool.reset 并回复确认", async () => {
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

		const transport = new FakeTelegramTransport();
		let resetCalls = 0;

		const app = new TelegramBotApp({
			config,
			transport,
			pool: {
				runPrompt: async () => ({ text: "" }),
				reset: async () => {
					resetCalls += 1;
				},
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
			text: "/reset@my_bot",
			messageId: 1,
		});

		expect(resetCalls).toBe(1);
		expect(transport.sentMessages).toHaveLength(1);
		expect(transport.sentMessages[0].text).toContain("会话已重置");
	});
});
