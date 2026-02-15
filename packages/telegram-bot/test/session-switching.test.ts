import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { AgentPool } from "../src/runtime/agent-pool.js";
import { SessionPathManager } from "../src/storage/session-path.js";
import { FakeRuntime } from "./doubles/fake-runtime.js";

describe("session switching", () => {
	it("可创建并切换到历史会话", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-session-switch-"));
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
			await pool.runPrompt("chat-1", "first");
			expect(createCount).toBe(1);

			const initialOverview = await pool.getSessionOverview("chat-1");
			expect(initialOverview.sessions).toHaveLength(1);
			expect(initialOverview.activeSession).toBe(initialOverview.sessions[0]);

			const created = await pool.createSession("chat-1");
			expect(created.previousSession).toBe(initialOverview.activeSession);
			expect(created.nextSession).not.toBe(initialOverview.activeSession);

			await pool.runPrompt("chat-1", "second");
			expect(createCount).toBe(2);

			const switched = await pool.switchSession("chat-1", created.previousSession);
			expect(switched.nextSession).toBe(created.previousSession);

			await pool.runPrompt("chat-1", "third");
			expect(createCount).toBe(3);

			const finalOverview = await pool.getSessionOverview("chat-1");
			expect(finalOverview.activeSession).toBe(created.previousSession);
			expect(finalOverview.sessions).toContain(created.nextSession);
		} finally {
			await pool.dispose();
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("删除会话时会保持可用并在删除当前会话时自动切换", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-session-delete-"));
		const sessionPaths = new SessionPathManager(tempDir);

		const pool = new AgentPool({
			idleTtlMs: 60_000,
			sessionPaths,
			runtimeFactory: {
				create: () => new FakeRuntime(async (message) => ({ text: message })),
			},
		});

		try {
			await pool.runPrompt("chat-1", "first");
			const initial = await pool.getSessionOverview("chat-1");
			const firstSession = initial.activeSession;

			const created = await pool.createSession("chat-1");
			const secondSession = created.nextSession;
			expect(secondSession).not.toBe(firstSession);

			const deleteFirst = await pool.deleteSession("chat-1", firstSession);
			expect(deleteFirst.wasActive).toBe(false);
			expect(deleteFirst.activeSession).toBe(secondSession);
			expect(deleteFirst.remainingSessions).toEqual([secondSession]);

			const deleteActive = await pool.deleteSession("chat-1", secondSession);
			expect(deleteActive.wasActive).toBe(true);
			expect(deleteActive.activeSession).not.toBe(secondSession);
			expect(deleteActive.remainingSessions).toHaveLength(1);

			const activePath = await sessionPaths.getActiveSessionPath("chat-1");
			expect(existsSync(activePath)).toBe(true);
		} finally {
			await pool.dispose();
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
