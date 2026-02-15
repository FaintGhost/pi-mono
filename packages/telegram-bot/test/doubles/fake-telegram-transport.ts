import type { TelegramInboundMessage, TelegramTransport } from "../../src/telegram.js";

export interface SentMessage {
	chatId: string;
	text: string;
	messageId: number;
}

export interface EditedMessage {
	chatId: string;
	messageId: number;
	text: string;
}

export class FakeTelegramTransport implements TelegramTransport {
	public startCalls = 0;
	public stopCalls = 0;
	public readonly typingCalls: string[] = [];
	public readonly sentMessages: SentMessage[] = [];
	public readonly editedMessages: EditedMessage[] = [];
	private nextMessageId = 1;
	private handler: ((message: TelegramInboundMessage) => Promise<void>) | null = null;

	async start(onMessage: (message: TelegramInboundMessage) => Promise<void>): Promise<void> {
		this.startCalls += 1;
		this.handler = onMessage;
	}

	async stop(): Promise<void> {
		this.stopCalls += 1;
	}

	async setTyping(chatId: string): Promise<void> {
		this.typingCalls.push(chatId);
	}

	async sendMessage(chatId: string, text: string): Promise<number> {
		const messageId = this.nextMessageId++;
		this.sentMessages.push({ chatId, text, messageId });
		return messageId;
	}

	async editMessage(chatId: string, messageId: number, text: string): Promise<void> {
		this.editedMessages.push({ chatId, messageId, text });
	}

	async emitMessage(message: TelegramInboundMessage): Promise<void> {
		if (!this.handler) {
			throw new Error("transport not started");
		}

		await this.handler(message);
	}
}
