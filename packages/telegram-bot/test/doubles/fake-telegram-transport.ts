import type {
	TelegramBotCommand,
	TelegramCommandScope,
	TelegramCreatedForumTopic,
	TelegramInboundMessage,
	TelegramThreadTarget,
	TelegramTransport,
} from "../../src/telegram.js";

export interface SentMessage {
	chatId: string;
	text: string;
	messageId: number;
	target?: TelegramThreadTarget;
}

export interface EditedMessage {
	chatId: string;
	messageId: number;
	text: string;
}

export interface CreatedTopic {
	chatId: string;
	name: string;
	messageThreadId: number;
}

export interface DeletedTopic {
	chatId: string;
	messageThreadId: number;
}

export class FakeTelegramTransport implements TelegramTransport {
	public startCalls = 0;
	public stopCalls = 0;
	public readonly commandsCalls: Array<{ commands: TelegramBotCommand[]; scope: TelegramCommandScope }> = [];
	public readonly typingCalls: Array<{ chatId: string; target?: TelegramThreadTarget }> = [];
	public readonly sentMessages: SentMessage[] = [];
	public readonly editedMessages: EditedMessage[] = [];
	public readonly createdTopics: CreatedTopic[] = [];
	public readonly deletedTopics: DeletedTopic[] = [];
	public readonly sendErrors: Error[] = [];
	public readonly editErrors: Error[] = [];
	public failDeleteTopic = false;
	private nextMessageId = 1;
	private nextThreadId = 1_000;
	private handler: ((message: TelegramInboundMessage) => Promise<void>) | null = null;

	async start(onMessage: (message: TelegramInboundMessage) => Promise<void>): Promise<void> {
		this.startCalls += 1;
		this.handler = onMessage;
	}

	async stop(): Promise<void> {
		this.stopCalls += 1;
	}

	async setCommands(
		commands: TelegramBotCommand[],
		scope: TelegramCommandScope = { type: "all_private_chats" },
	): Promise<void> {
		this.commandsCalls.push({
			commands,
			scope,
		});
	}

	async setTyping(chatId: string, target?: TelegramThreadTarget): Promise<void> {
		this.typingCalls.push({ chatId, target });
	}

	async sendMessage(chatId: string, text: string, target?: TelegramThreadTarget): Promise<number> {
		const error = this.sendErrors.shift();
		if (error) {
			throw error;
		}

		const messageId = this.nextMessageId++;
		this.sentMessages.push({ chatId, text, messageId, target });
		return messageId;
	}

	async editMessage(chatId: string, messageId: number, text: string): Promise<void> {
		const error = this.editErrors.shift();
		if (error) {
			throw error;
		}

		this.editedMessages.push({ chatId, messageId, text });
	}

	async createForumTopic(chatId: string, name: string): Promise<TelegramCreatedForumTopic> {
		const messageThreadId = this.nextThreadId++;
		this.createdTopics.push({ chatId, name, messageThreadId });
		return {
			messageThreadId,
			name,
		};
	}

	async deleteForumTopic(chatId: string, messageThreadId: number): Promise<void> {
		if (this.failDeleteTopic) {
			throw new Error("delete topic failed");
		}
		this.deletedTopics.push({ chatId, messageThreadId });
	}

	async emitMessage(message: TelegramInboundMessage): Promise<void> {
		if (!this.handler) {
			throw new Error("transport not started");
		}

		await this.handler(message);
	}
}
