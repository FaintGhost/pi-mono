import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { AgentPool } from "../src/runtime/agent-pool.js";
import { SessionPathManager } from "../src/storage/session-path.js";
import { FakeRuntime } from "./doubles/fake-runtime.js";

describe("Scenario 7: 空闲 TTL 仅回收进程不删除会话", () => {
	it("超时后回收 runtime 并在后续消息重建", async () => {
		vi.useFakeTimers();

		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-idle-ttl-"));
		const sessionPaths = new SessionPathManager(tempDir);
		const runtimes: FakeRuntime[] = [];

		let createCount = 0;
		const pool = new AgentPool({
			idleTtlMs: 1_000,
			sessionPaths,
			runtimeFactory: {
				create: () => {
					createCount += 1;
					const runtime = new FakeRuntime(async (message) => ({ text: message }));
					runtimes.push(runtime);
					return runtime;
				},
			},
		});

		try {
			await pool.runPrompt("chat-1", "first");
			expect(createCount).toBe(1);

			const sessionPath = await sessionPaths.getActiveSessionPath("chat-1");
			vi.advanceTimersByTime(1_500);
			await pool.sweepIdle(Date.now());

			expect(runtimes[0].disposed).toBe(true);
			expect(existsSync(sessionPath)).toBe(true);

			await pool.runPrompt("chat-1", "second");
			expect(createCount).toBe(2);
		} finally {
			await pool.dispose();
			vi.useRealTimers();
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
