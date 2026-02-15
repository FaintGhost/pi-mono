import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { RpcClient, type SpawnFunction } from "../src/runtime/rpc-client.js";

class FakeChildProcess extends EventEmitter {
	public readonly stdin = new PassThrough();
	public readonly stdout = new PassThrough();
	public readonly stderr = new PassThrough();
	public killed = false;
	public exitCode: number | null = null;

	kill(): boolean {
		this.killed = true;
		this.exitCode = 0;
		this.emit("exit", 0, null);
		return true;
	}
}

describe("Scenario 6: provider/model 继承 pi 默认解析", () => {
	it("pi rpc 启动参数不注入 provider/model", async () => {
		const fakeChild = new FakeChildProcess();

		let capturedCommand = "";
		let capturedArgs: readonly string[] = [];
		let capturedCwd: SpawnOptionsWithoutStdio["cwd"];

		const spawnFn: SpawnFunction = ((command, args, options) => {
			capturedCommand = command;
			capturedArgs = args;
			capturedCwd = options.cwd;
			return fakeChild as unknown as ChildProcessWithoutNullStreams;
		}) as SpawnFunction;

		const client = new RpcClient({
			piBin: "pi",
			sessionPath: "/tmp/session.jsonl",
			cwd: "/workspace",
			spawnFn,
		});

		expect(capturedCommand).toBe("pi");
		expect(capturedArgs).toEqual(["--mode", "rpc", "--session", "/tmp/session.jsonl"]);
		expect(capturedArgs.includes("--provider")).toBe(false);
		expect(capturedArgs.includes("--model")).toBe(false);
		expect(capturedCwd).toBe("/workspace");

		await client.dispose();
	});
});
