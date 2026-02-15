import { describe, expect, it } from "vitest";
import type { TelegramBotConfig } from "../src/config.js";
import type { PromptDetailsRecord, PromptDetailsStore } from "../src/storage/details-store.js";
import { TelegramBotApp } from "../src/telegram.js";
import { FakeTelegramTransport } from "./doubles/fake-telegram-transport.js";

function createMemoryDetailsStore(): PromptDetailsStore {
	const records = new Map<string, PromptDetailsRecord>();

	return {
		saveLatest: async (contextId, details) => {
			records.set(contextId, details);
		},
		getLatest: async (contextId) => records.get(contextId) ?? null,
		clear: async (contextId) => {
			records.delete(contextId);
		},
	};
}

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

describe("details command", () => {
	it("私聊 /details 返回最近一次完整回答和工具摘要", async () => {
		const transport = new FakeTelegramTransport();
		const app = new TelegramBotApp({
			config,
			transport,
			detailsStore: createMemoryDetailsStore(),
			pool: {
				runPrompt: async () => ({
					text: "最终回答正文",
					toolCalls: [
						{
							toolCallId: "tool-1",
							toolName: "bash",
							args: { command: "ls -la" },
						},
					],
				}),
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
			text: "帮我分析",
			messageId: 1,
		});

		await app.handleMessage({
			chatId: "chat-1",
			chatType: "private",
			messageThreadId: null,
			userId: 1001,
			text: "/details",
			messageId: 2,
		});

		expect(transport.sentMessages).toHaveLength(2);
		expect(transport.sentMessages[1].text).toContain("最近一次回答详情");
		expect(transport.sentMessages[1].text).toContain("bash command=ls -la");
		expect(transport.sentMessages[1].text).toContain("最终回答正文");
	});

	it("超级群 /details 仅返回当前 topic 最近一次详情", async () => {
		const transport = new FakeTelegramTransport();
		const app = new TelegramBotApp({
			config,
			transport,
			detailsStore: createMemoryDetailsStore(),
			pool: {
				runPrompt: async (contextId: string) => {
					if (contextId === "supergroup--100123-topic-10") {
						return { text: "topic10 响应", toolCalls: [] };
					}
					return { text: "topic20 响应", toolCalls: [] };
				},
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
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 10,
			userId: 1001,
			text: "topic10",
			messageId: 1,
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 20,
			userId: 1001,
			text: "topic20",
			messageId: 2,
		});

		await app.handleMessage({
			chatId: "-100123",
			chatType: "supergroup",
			messageThreadId: 20,
			userId: 1001,
			text: "/details",
			messageId: 3,
		});

		expect(transport.sentMessages.at(-1)?.text).toContain("topic20 响应");
		expect(transport.sentMessages.at(-1)?.text).not.toContain("topic10 响应");
	});
});
