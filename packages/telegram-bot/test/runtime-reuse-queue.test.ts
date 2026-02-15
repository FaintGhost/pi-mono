import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { AgentPool } from "../src/runtime/agent-pool.js";
import { SessionPathManager } from "../src/storage/session-path.js";
import { FakeRuntime } from "./doubles/fake-runtime.js";

describe("Scenario 3: 同一 chat 复用常驻进程并串行处理", () => {
	it("同一 chat 连续请求时复用 runtime 且顺序执行", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-runtime-reuse-"));
		const sessionPaths = new SessionPathManager(tempDir);
		const order: string[] = [];

		let createCount = 0;
		const pool = new AgentPool({
			idleTtlMs: 60_000,
			sessionPaths,
			runtimeFactory: {
				create: () => {
					createCount += 1;
					return new FakeRuntime(async (message) => {
						order.push(`start:${message}`);
						await new Promise((resolve) => setTimeout(resolve, 20));
						order.push(`end:${message}`);
						return { text: message };
					});
				},
			},
		});

		try {
			await Promise.all([pool.runPrompt("chat-1", "first"), pool.runPrompt("chat-1", "second")]);

			expect(createCount).toBe(1);
			expect(order).toEqual(["start:first", "end:first", "start:second", "end:second"]);
		} finally {
			await pool.dispose();
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
