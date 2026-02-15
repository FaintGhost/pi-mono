import type { AgentRuntime, PromptOptions, PromptResult } from "../../src/runtime/agent-runtime.js";

export class FakeRuntime implements AgentRuntime {
	public disposed = false;
	public alive = true;
	public readonly prompts: string[] = [];

	constructor(private readonly promptHandler?: (message: string, options?: PromptOptions) => Promise<PromptResult>) {}

	async prompt(message: string, options?: PromptOptions): Promise<PromptResult> {
		this.prompts.push(message);

		if (!this.alive) {
			throw new Error("runtime is not alive");
		}

		if (this.promptHandler) {
			return this.promptHandler(message, options);
		}

		return { text: message };
	}

	isAlive(): boolean {
		return this.alive;
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.alive = false;
	}
}
