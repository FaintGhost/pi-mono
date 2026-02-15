import { RpcClient, type RpcEvent, type RpcResponse, type SpawnFunction } from "./rpc-client.js";

export interface PromptOptions {
	onTextUpdate?: (text: string) => Promise<void> | void;
}

export interface PromptResult {
	text: string;
}

export interface AgentRuntime {
	prompt(message: string, options?: PromptOptions): Promise<PromptResult>;
	isAlive(): boolean;
	dispose(): Promise<void>;
}

export interface PiProcessRuntimeOptions {
	piBin: string;
	sessionPath: string;
	cwd: string;
	spawnFn?: SpawnFunction;
}

interface LastAssistantTextData {
	text: string | null;
}

export class PiProcessRuntime implements AgentRuntime {
	private readonly rpcClient: RpcClient;
	private alive = true;

	constructor(options: PiProcessRuntimeOptions) {
		this.rpcClient = new RpcClient({
			piBin: options.piBin,
			sessionPath: options.sessionPath,
			cwd: options.cwd,
			spawnFn: options.spawnFn,
		});

		this.rpcClient.onExit(() => {
			this.alive = false;
		});
	}

	async prompt(message: string, options: PromptOptions = {}): Promise<PromptResult> {
		const promptResponse = await this.rpcClient.request({
			type: "prompt",
			message,
		});
		this.assertSuccess(promptResponse, "prompt");

		let streamedText = "";

		await new Promise<void>((resolve, reject) => {
			const removeExitListener = this.rpcClient.onExit(() => {
				removeExitListener();
				unsubscribe();
				reject(new Error("RPC process exited while waiting for prompt completion"));
			});

			const unsubscribe = this.rpcClient.subscribe((event) => {
				try {
					if (event.type === "message_update") {
						const maybeAssistantEvent = event.assistantMessageEvent;
						if (
							maybeAssistantEvent &&
							typeof maybeAssistantEvent === "object" &&
							"type" in maybeAssistantEvent &&
							"delta" in maybeAssistantEvent
						) {
							const deltaEvent = maybeAssistantEvent as { type: string; delta?: unknown };
							if (deltaEvent.type === "text_delta" && typeof deltaEvent.delta === "string") {
								streamedText += deltaEvent.delta;
								void options.onTextUpdate?.(streamedText);
							}
						}
					}

					if (event.type === "agent_end") {
						removeExitListener();
						unsubscribe();
						resolve();
					}
				} catch (error) {
					removeExitListener();
					unsubscribe();
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			});
		});

		const lastAssistantResponse = await this.rpcClient.request({
			type: "get_last_assistant_text",
		});
		this.assertSuccess(lastAssistantResponse, "get_last_assistant_text");

		const data = (lastAssistantResponse.data || {}) as LastAssistantTextData;
		const finalText = typeof data.text === "string" ? data.text : streamedText;

		return { text: finalText };
	}

	isAlive(): boolean {
		return this.alive && this.rpcClient.isAlive();
	}

	async dispose(): Promise<void> {
		this.alive = false;
		await this.rpcClient.dispose();
	}

	private assertSuccess(response: RpcResponse, commandName: string): void {
		if (!response.success) {
			const message = response.error || `RPC command '${commandName}' failed`;
			throw new Error(message);
		}
	}
}

export function extractTextDelta(event: RpcEvent): string | null {
	if (event.type !== "message_update") {
		return null;
	}

	const maybeAssistantEvent = event.assistantMessageEvent;
	if (!maybeAssistantEvent || typeof maybeAssistantEvent !== "object") {
		return null;
	}

	const deltaEvent = maybeAssistantEvent as { type?: unknown; delta?: unknown };
	if (deltaEvent.type !== "text_delta" || typeof deltaEvent.delta !== "string") {
		return null;
	}

	return deltaEvent.delta;
}
