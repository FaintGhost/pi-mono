import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FilePromptDetailsStore } from "../src/storage/details-store.js";

describe("details store persistence", () => {
	it("跨实例可读取最近一次详情并支持清理", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "telegram-bot-details-store-"));

		try {
			const store1 = new FilePromptDetailsStore(tempDir);
			await store1.saveLatest("chat-1", {
				updatedAt: "2026-02-15T12:00:00.000Z",
				prompt: "hello",
				fullText: "world",
				toolCalls: [
					{
						toolCallId: "tool-1",
						toolName: "read",
						args: { path: "README.md" },
					},
				],
			});

			const store2 = new FilePromptDetailsStore(tempDir);
			const loaded = await store2.getLatest("chat-1");
			expect(loaded).not.toBeNull();
			expect(loaded?.prompt).toBe("hello");
			expect(loaded?.toolCalls[0]?.toolName).toBe("read");

			await store2.clear("chat-1");
			const cleared = await store2.getLatest("chat-1");
			expect(cleared).toBeNull();
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
