import type { TelegramBotConfig } from "./config.js";
import { logError, logInfo, logWarn } from "./log.js";
import type { PromptOptions, PromptResult } from "./runtime/agent-runtime.js";

export interface TelegramInboundMessage {
	chatId: string;
	chatType: string;
	userId: number;
	text: string;
	messageId: number;
}

export interface TelegramTransport {
	start(onMessage: (message: TelegramInboundMessage) => Promise<void>): Promise<void>;
	stop(): Promise<void>;
	setTyping(chatId: string): Promise<void>;
	sendMessage(chatId: string, text: string): Promise<number>;
	editMessage(chatId: string, messageId: number, text: string): Promise<void>;
}

interface TelegramApiResponse<T> {
	ok: boolean;
	result: T;
	description?: string;
}

interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
}

interface TelegramMessage {
	message_id: number;
	text?: string;
	chat: {
		id: number;
		type: string;
	};
	from?: {
		id: number;
	};
}

interface TelegramSendMessageResult {
	message_id: number;
}

export interface PromptRuntimePool {
	runPrompt(chatId: string, message: string, options?: PromptOptions): Promise<PromptResult>;
	reset(chatId: string): Promise<void>;
}

export class TelegramLongPollingTransport implements TelegramTransport {
	private readonly apiBaseUrl: string;
	private running = false;
	private nextOffset = 0;
	private activeController: AbortController | null = null;

	constructor(token: string) {
		this.apiBaseUrl = `https://api.telegram.org/bot${token}`;
	}

	async start(onMessage: (message: TelegramInboundMessage) => Promise<void>): Promise<void> {
		this.running = true;

		while (this.running) {
			try {
				const updates = await this.getUpdates();

				for (const update of updates) {
					this.nextOffset = update.update_id + 1;

					const message = update.message;
					if (!message || !message.text || !message.from) {
						continue;
					}

					await onMessage({
						chatId: String(message.chat.id),
						chatType: message.chat.type,
						userId: message.from.id,
						text: message.text,
						messageId: message.message_id,
					});
				}
			} catch (error) {
				if (!this.running) {
					return;
				}

				if (error instanceof Error && error.name === "AbortError") {
					continue;
				}

				logWarn("long polling failed, retrying", {
					error: error instanceof Error ? error.message : String(error),
				});
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		this.activeController?.abort();
		this.activeController = null;
	}

	async setTyping(chatId: string): Promise<void> {
		await this.callApi("sendChatAction", {
			chat_id: chatId,
			action: "typing",
		});
	}

	async sendMessage(chatId: string, text: string): Promise<number> {
		const response = await this.callApi<TelegramSendMessageResult>("sendMessage", {
			chat_id: chatId,
			text,
		});

		return response.message_id;
	}

	async editMessage(chatId: string, messageId: number, text: string): Promise<void> {
		await this.callApi("editMessageText", {
			chat_id: chatId,
			message_id: messageId,
			text,
		});
	}

	private async getUpdates(): Promise<TelegramUpdate[]> {
		this.activeController = new AbortController();
		const response = await this.callApi<TelegramUpdate[]>(
			"getUpdates",
			{
				timeout: 30,
				offset: this.nextOffset,
			},
			this.activeController.signal,
		);
		this.activeController = null;
		return response;
	}

	private async callApi<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
		const response = await fetch(`${this.apiBaseUrl}/${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
			signal,
		});

		if (!response.ok) {
			throw new Error(`Telegram API HTTP error: ${response.status}`);
		}

		const json = (await response.json()) as TelegramApiResponse<T>;
		if (!json.ok) {
			throw new Error(`Telegram API error: ${json.description || "unknown error"}`);
		}

		return json.result;
	}
}

export class TelegramBotApp {
	private readonly config: TelegramBotConfig;
	private readonly transport: TelegramTransport;
	private readonly pool: PromptRuntimePool;

	constructor(options: { config: TelegramBotConfig; transport: TelegramTransport; pool: PromptRuntimePool }) {
		this.config = options.config;
		this.transport = options.transport;
		this.pool = options.pool;
	}

	async start(): Promise<void> {
		logInfo("bot started");
		await this.transport.start(async (message) => {
			await this.handleMessage(message);
		});
	}

	async stop(): Promise<void> {
		logInfo("bot stopping");
		await this.transport.stop();
	}

	async handleMessage(message: TelegramInboundMessage): Promise<void> {
		if (message.chatType !== "private") {
			return;
		}

		if (!this.config.allowedUserIds.has(message.userId)) {
			return;
		}

		const text = message.text.trim();
		if (text.length === 0) {
			return;
		}

		logInfo("incoming message", {
			chatId: message.chatId,
			userId: message.userId,
			text: text.slice(0, 80),
		});

		if (text === "/reset") {
			await this.pool.reset(message.chatId);
			await this.transport.sendMessage(message.chatId, "会话已重置");
			logInfo("session reset", { chatId: message.chatId, userId: message.userId });
			return;
		}

		let responseMessageId: number | null = null;
		let latestText = "";
		let lastEditAt = 0;
		let renderChain = Promise.resolve();

		const renderText = async (textToRender: string): Promise<void> => {
			const normalized = this.normalizeText(textToRender);
			if (responseMessageId === null) {
				responseMessageId = await this.transport.sendMessage(message.chatId, normalized);
				return;
			}
			await this.transport.editMessage(message.chatId, responseMessageId, normalized);
		};

		const enqueueRender = (textToRender: string): void => {
			renderChain = renderChain.then(async () => {
				await renderText(textToRender);
			});
		};

		const stopTyping = this.startTypingLoop(message.chatId);

		try {
			const result = await this.pool.runPrompt(message.chatId, text, {
				onTextUpdate: async (updatedText) => {
					latestText = updatedText;
					const now = Date.now();
					if (now - lastEditAt < this.config.streamEditThrottleMs) {
						return;
					}

					lastEditAt = now;
					enqueueRender(latestText);
				},
			});

			latestText = result.text;
			enqueueRender(latestText);
			await renderChain;

			logInfo("message handled", {
				chatId: message.chatId,
				userId: message.userId,
				responseLength: latestText.length,
			});
		} catch (error) {
			const messageText = error instanceof Error ? error.message : String(error);
			logError("message handling failed", {
				chatId: message.chatId,
				userId: message.userId,
				error: messageText,
			});

			await renderChain;
			if (responseMessageId === null) {
				await this.transport.sendMessage(message.chatId, `请求失败: ${messageText}`);
			} else {
				await this.transport.editMessage(message.chatId, responseMessageId, `请求失败: ${messageText}`);
			}
		} finally {
			stopTyping();
		}
	}

	private startTypingLoop(chatId: string): () => void {
		let active = true;

		const sendTyping = async () => {
			if (!active) {
				return;
			}
			try {
				await this.transport.setTyping(chatId);
			} catch (error) {
				logWarn("set typing failed", {
					chatId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		};

		void sendTyping();

		const timer = setInterval(() => {
			void sendTyping();
		}, 4_000);
		timer.unref();

		return () => {
			active = false;
			clearInterval(timer);
		};
	}

	private normalizeText(text: string): string {
		const trimmed = text.trim();
		return trimmed.length > 0 ? text : "...";
	}
}
