import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { AgentPool } from "../src/runtime/agent-pool.js";
import { SessionPathManager } from "../src/storage/session-path.js";
import { FakeRuntime } from "./doubles/fake-runtime.js";

describe("Scenario 4: runtime 异常退出后自动恢复", () => {
	it("已失活 runtime 在下一次请求时会自动重建", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-runtime-recovery-"));
		const sessionPaths = new SessionPathManager(tempDir);
		const runtimes: FakeRuntime[] = [];

		let createCount = 0;
		const pool = new AgentPool({
			idleTtlMs: 60_000,
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

			runtimes[0].alive = false;

			await pool.runPrompt("chat-1", "second");
			expect(createCount).toBe(2);
		} finally {
			await pool.dispose();
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
