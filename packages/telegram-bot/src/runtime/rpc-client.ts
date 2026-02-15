import { type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio, spawn } from "child_process";
import { createInterface, type Interface as ReadlineInterface } from "readline";

export interface RpcRequest {
	type: string;
	[key: string]: unknown;
}

export interface RpcResponse {
	type: "response";
	id?: string;
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export interface RpcEvent {
	type: string;
	[key: string]: unknown;
}

export type SpawnFunction = (
	command: string,
	args: readonly string[],
	options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

interface PendingRequest {
	resolve: (value: RpcResponse) => void;
	reject: (reason: Error) => void;
}

export interface RpcClientOptions {
	piBin: string;
	sessionPath: string;
	cwd: string;
	spawnFn?: SpawnFunction;
	env?: NodeJS.ProcessEnv;
}

export class RpcClient {
	private readonly process: ChildProcessWithoutNullStreams;
	private readonly readline: ReadlineInterface;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly eventListeners = new Set<(event: RpcEvent) => void>();
	private readonly exitListeners = new Set<(code: number | null, signal: NodeJS.Signals | null) => void>();
	private requestCounter = 0;
	private disposed = false;

	constructor(options: RpcClientOptions) {
		const spawnFn = options.spawnFn || spawn;
		const args = ["--mode", "rpc", "--session", options.sessionPath];
		this.process = spawnFn(options.piBin, args, {
			cwd: options.cwd,
			env: options.env || process.env,
			stdio: "pipe",
		});

		this.readline = createInterface({ input: this.process.stdout });
		this.readline.on("line", (line) => {
			this.handleLine(line);
		});

		this.process.on("exit", (code, signal) => {
			this.handleExit(code, signal);
		});

		this.process.on("error", (error) => {
			this.rejectAllPending(error);
		});
	}

	subscribe(listener: (event: RpcEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}

	onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void {
		this.exitListeners.add(listener);
		return () => {
			this.exitListeners.delete(listener);
		};
	}

	async request(request: RpcRequest): Promise<RpcResponse> {
		if (this.disposed) {
			throw new Error("RPC client is disposed");
		}

		const id = `req-${this.requestCounter++}`;
		const payload = { ...request, id };

		const responsePromise = new Promise<RpcResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});

		const line = `${JSON.stringify(payload)}\n`;
		const written = this.process.stdin.write(line);
		if (!written) {
			await new Promise<void>((resolve, reject) => {
				this.process.stdin.once("drain", () => resolve());
				this.process.stdin.once("error", (error) => reject(error));
			});
		}

		return responsePromise;
	}

	isAlive(): boolean {
		return !this.disposed && this.process.exitCode === null && !this.process.killed;
	}

	async dispose(): Promise<void> {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.readline.close();

		if (this.process.exitCode === null && !this.process.killed) {
			this.process.kill();
		}

		this.rejectAllPending(new Error("RPC client disposed"));
	}

	private handleLine(line: string): void {
		let payload: unknown;
		try {
			payload = JSON.parse(line) as unknown;
		} catch {
			return;
		}

		if (!payload || typeof payload !== "object") {
			return;
		}

		const maybeResponse = payload as RpcResponse;
		if (maybeResponse.type === "response") {
			const id = maybeResponse.id;
			if (id && this.pending.has(id)) {
				const pending = this.pending.get(id)!;
				this.pending.delete(id);
				pending.resolve(maybeResponse);
			}
			return;
		}

		const event = payload as RpcEvent;
		for (const listener of this.eventListeners) {
			listener(event);
		}
	}

	private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
		this.disposed = true;
		this.rejectAllPending(new Error(`RPC process exited (code=${code}, signal=${signal ?? "none"})`));

		for (const listener of this.exitListeners) {
			listener(code, signal);
		}
	}

	private rejectAllPending(error: Error): void {
		for (const [id, pending] of this.pending.entries()) {
			this.pending.delete(id);
			pending.reject(error);
		}
	}
}
