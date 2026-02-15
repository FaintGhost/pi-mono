import type { TelegramBotConfig, TelegramParseMode } from "./config.js";
import { logError, logInfo, logWarn } from "./log.js";
import type {
	SessionDeleteResult,
	SessionOverview,
	SessionSwitchResult,
	SupergroupTopicBinding,
} from "./runtime/agent-pool.js";
import type { PromptOptions, PromptResult, ToolCallSummary } from "./runtime/agent-runtime.js";
import { buildSupergroupTopicContextKey } from "./storage/context-key.js";
import type { PromptDetailsRecord, PromptDetailsStore } from "./storage/details-store.js";

const TELEGRAM_MESSAGE_LIMIT = 3_500;
const DEFAULT_CONCISE_REPLY_LIMIT = 1_200;
const MAX_TELEGRAM_RETRY_ATTEMPTS = 20;

export interface TelegramInboundMessage {
	chatId: string;
	chatType: string;
	userId: number;
	text: string;
	messageId: number;
	messageThreadId: number | null;
	isTopicMessage?: boolean;
	isForum?: boolean;
}

export interface TelegramBotCommand {
	command: string;
	description: string;
}

export type TelegramCommandScope =
	| {
			type: "all_private_chats";
	  }
	| {
			type: "chat_member";
			chatId: string;
			userId: number;
	  };

export interface TelegramThreadTarget {
	messageThreadId?: number;
}

export interface TelegramCreatedForumTopic {
	messageThreadId: number;
	name: string;
}

export interface TelegramTransport {
	start(onMessage: (message: TelegramInboundMessage) => Promise<void>): Promise<void>;
	stop(): Promise<void>;
	setCommands(commands: TelegramBotCommand[], scope?: TelegramCommandScope): Promise<void>;
	setTyping(chatId: string, target?: TelegramThreadTarget): Promise<void>;
	sendMessage(chatId: string, text: string, target?: TelegramThreadTarget): Promise<number>;
	editMessage(chatId: string, messageId: number, text: string): Promise<void>;
	createForumTopic(chatId: string, name: string): Promise<TelegramCreatedForumTopic>;
	deleteForumTopic(chatId: string, messageThreadId: number): Promise<void>;
}

interface TelegramApiResponse<T> {
	ok: boolean;
	result: T;
	description?: string;
	error_code?: number;
	parameters?: {
		retry_after?: number;
	};
}

interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
}

interface TelegramMessage {
	message_id: number;
	text?: string;
	message_thread_id?: number;
	is_topic_message?: boolean;
	chat: {
		id: number;
		type: string;
		is_forum?: boolean;
	};
	from?: {
		id: number;
	};
}

interface TelegramSendMessageResult {
	message_id: number;
}

interface TelegramForumTopicResult {
	message_thread_id: number;
	name: string;
}

class TelegramApiError extends Error {
	readonly errorCode: number | null;
	readonly retryAfterSeconds: number | null;

	constructor(message: string, options?: { errorCode?: number | null; retryAfterSeconds?: number | null }) {
		super(message);
		this.name = "TelegramApiError";
		this.errorCode = options?.errorCode ?? null;
		this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
	}
}

export interface PromptRuntimePool {
	runPrompt(contextId: string, message: string, options?: PromptOptions): Promise<PromptResult>;
	reset(contextId: string): Promise<void>;
	getSessionOverview(contextId: string): Promise<SessionOverview>;
	createSession(contextId: string): Promise<SessionSwitchResult>;
	switchSession(contextId: string, sessionFileName: string): Promise<SessionSwitchResult>;
	deleteSession(contextId: string, sessionFileName: string): Promise<SessionDeleteResult>;
	listSupergroupTopicBindings?(chatId: string): Promise<SupergroupTopicBinding[]>;
	deleteContext?(contextId: string): Promise<void>;
}

export class TelegramLongPollingTransport implements TelegramTransport {
	private readonly apiBaseUrl: string;
	private readonly parseMode: Exclude<TelegramParseMode, "none"> | null;
	private running = false;
	private nextOffset = 0;
	private activeController: AbortController | null = null;

	constructor(token: string, parseMode: TelegramParseMode = "Markdown") {
		this.apiBaseUrl = `https://api.telegram.org/bot${token}`;
		this.parseMode = parseMode === "none" ? null : parseMode;
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
						messageThreadId: message.message_thread_id ?? null,
						isTopicMessage: message.is_topic_message ?? false,
						isForum: message.chat.is_forum ?? false,
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

	async setCommands(
		commands: TelegramBotCommand[],
		scope: TelegramCommandScope = { type: "all_private_chats" },
	): Promise<void> {
		const payload: Record<string, unknown> = {
			commands: commands.map((command) => ({
				command: command.command,
				description: command.description,
			})),
		};

		if (scope.type === "all_private_chats") {
			payload.scope = { type: "all_private_chats" };
		} else {
			payload.scope = {
				type: "chat_member",
				chat_id: scope.chatId,
				user_id: scope.userId,
			};
		}

		await this.callApi("setMyCommands", payload);
	}

	async setTyping(chatId: string, target?: TelegramThreadTarget): Promise<void> {
		const payload: Record<string, unknown> = {
			chat_id: chatId,
			action: "typing",
		};

		if (target?.messageThreadId) {
			payload.message_thread_id = target.messageThreadId;
		}

		await this.callApi("sendChatAction", payload);
	}

	async sendMessage(chatId: string, text: string, target?: TelegramThreadTarget): Promise<number> {
		const payload: Record<string, unknown> = {
			chat_id: chatId,
			text,
		};

		if (target?.messageThreadId) {
			payload.message_thread_id = target.messageThreadId;
		}

		const response = await this.callApiWithOptionalParseMode<TelegramSendMessageResult>("sendMessage", payload);
		return response.message_id;
	}

	async editMessage(chatId: string, messageId: number, text: string): Promise<void> {
		try {
			await this.callApiWithOptionalParseMode("editMessageText", {
				chat_id: chatId,
				message_id: messageId,
				text,
			});
		} catch (error) {
			if (this.isMessageNotModifiedError(error)) {
				return;
			}
			throw error;
		}
	}

	async createForumTopic(chatId: string, name: string): Promise<TelegramCreatedForumTopic> {
		const result = await this.callApi<TelegramForumTopicResult>("createForumTopic", {
			chat_id: chatId,
			name,
		});

		return {
			messageThreadId: result.message_thread_id,
			name: result.name,
		};
	}

	async deleteForumTopic(chatId: string, messageThreadId: number): Promise<void> {
		await this.callApi("deleteForumTopic", {
			chat_id: chatId,
			message_thread_id: messageThreadId,
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

	private async callApiWithOptionalParseMode<T>(method: string, payload: Record<string, unknown>): Promise<T> {
		if (!this.parseMode) {
			return this.callApi<T>(method, payload);
		}

		const payloadWithParseMode = {
			...payload,
			parse_mode: this.parseMode,
		};

		try {
			return await this.callApi<T>(method, payloadWithParseMode);
		} catch (error) {
			if (!this.isParseEntityError(error)) {
				throw error;
			}

			logWarn("parse mode failed, fallback to plain text", {
				method,
				parseMode: this.parseMode,
				error: error instanceof Error ? error.message : String(error),
			});
			return this.callApi<T>(method, payload);
		}
	}

	private isParseEntityError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		const message = error.message.toLowerCase();
		return message.includes("parse entities") || message.includes("parse entity");
	}

	private isMessageNotModifiedError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		return error.message.toLowerCase().includes("message is not modified");
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

		let json: TelegramApiResponse<T> | null = null;
		try {
			json = (await response.json()) as TelegramApiResponse<T>;
		} catch {
			if (!response.ok) {
				throw new TelegramApiError(`Telegram API HTTP error: ${response.status}`, {
					errorCode: response.status,
				});
			}
			throw new TelegramApiError("Telegram API returned invalid JSON response");
		}

		if (!response.ok || !json.ok) {
			const description = json.description || `HTTP ${response.status}`;
			throw new TelegramApiError(`Telegram API error: ${description}`, {
				errorCode: typeof json.error_code === "number" ? json.error_code : response.status,
				retryAfterSeconds: typeof json.parameters?.retry_after === "number" ? json.parameters.retry_after : null,
			});
		}

		return json.result;
	}
}

export class TelegramBotApp {
	private readonly config: TelegramBotConfig;
	private readonly transport: TelegramTransport;
	private readonly pool: PromptRuntimePool;
	private readonly detailsStore: PromptDetailsStore;
	private readonly sleepFn: (ms: number) => Promise<void>;
	private readonly commands: TelegramBotCommand[] = [
		{
			command: "reset",
			description: "重置当前会话",
		},
		{
			command: "session",
			description: "查看与切换会话",
		},
		{
			command: "details",
			description: "查看最近一次详细回答",
		},
	];
	private readonly supergroupCommandScopes = new Set<string>();

	constructor(options: {
		config: TelegramBotConfig;
		transport: TelegramTransport;
		pool: PromptRuntimePool;
		detailsStore?: PromptDetailsStore;
		sleepFn?: (ms: number) => Promise<void>;
	}) {
		this.config = options.config;
		this.transport = options.transport;
		this.pool = options.pool;
		this.detailsStore = options.detailsStore ?? {
			saveLatest: async () => {},
			getLatest: async () => null,
			clear: async () => {},
		};
		this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	}

	async start(): Promise<void> {
		await this.registerPrivateCommands();
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
		if (!this.isSupportedChatType(message.chatType)) {
			return;
		}

		if (!this.config.allowedUserIds.has(message.userId)) {
			return;
		}

		if (this.isSupergroup(message.chatType) && !this.isSupergroupTopicMessage(message)) {
			logInfo("supergroup message ignored: no topic markers", {
				chatId: message.chatId,
				userId: message.userId,
				messageId: message.messageId,
			});
			return;
		}

		const text = message.text.trim();
		if (text.length === 0) {
			return;
		}

		if (this.isSupergroup(message.chatType)) {
			await this.ensureSupergroupMemberCommands(message.chatId, message.userId);
		}

		logInfo("incoming message", {
			chatId: message.chatId,
			userId: message.userId,
			chatType: message.chatType,
			messageThreadId: message.messageThreadId ?? "none",
			text: text.slice(0, 80),
		});

		const command = this.parseCommand(text);
		const contextId = this.getContextId(message);
		const threadTarget = this.toThreadTarget(message);

		if (command?.name === "reset") {
			await this.pool.reset(contextId);
			await this.clearPromptDetails(contextId);
			await this.sendText(
				message.chatId,
				this.isSupergroup(message.chatType) ? "当前 topic 会话已重置" : "会话已重置",
				threadTarget,
			);
			logInfo("session reset", { contextId, userId: message.userId });
			return;
		}

		if (command?.name === "session" || command?.name === "sessions") {
			if (this.isSupergroup(message.chatType)) {
				await this.handleSupergroupSessionCommand(message, contextId, command.args);
			} else {
				await this.handlePrivateSessionCommand(message.chatId, contextId, command.args);
			}
			return;
		}

		if (command?.name === "details") {
			await this.handleDetailsCommand(message, contextId);
			return;
		}

		const stopTyping = this.startTypingLoop(message.chatId, threadTarget);

		try {
			const result = await this.pool.runPrompt(contextId, text);
			await this.persistPromptDetails(contextId, text, result);

			const conciseReply = this.buildConciseReply(result.text);
			await this.sendFinalResponseWithRateLimitNotice(message.chatId, conciseReply, threadTarget);

			logInfo("message handled", {
				contextId,
				userId: message.userId,
				responseLength: result.text.length,
				toolCalls: (result.toolCalls ?? []).length,
			});
		} catch (error) {
			const messageText = error instanceof Error ? error.message : String(error);
			logError("message handling failed", {
				contextId,
				userId: message.userId,
				error: messageText,
			});

			try {
				await this.sendText(message.chatId, `请求失败: ${messageText}`, threadTarget);
			} catch (notifyError) {
				logError("failed to notify user about error", {
					contextId,
					error: notifyError instanceof Error ? notifyError.message : String(notifyError),
				});
			}
		} finally {
			stopTyping();
		}
	}

	private isSupportedChatType(chatType: string): boolean {
		return chatType === "private" || chatType === "supergroup";
	}

	private isSupergroup(chatType: string): boolean {
		return chatType === "supergroup";
	}

	private isSupergroupTopicMessage(message: TelegramInboundMessage): boolean {
		return message.messageThreadId !== null || message.isTopicMessage === true || message.isForum === true;
	}

	private getContextId(message: TelegramInboundMessage): string {
		if (!this.isSupergroup(message.chatType)) {
			return message.chatId;
		}

		if (!this.isSupergroupTopicMessage(message)) {
			throw new Error("supergroup topic message is required");
		}

		return buildSupergroupTopicContextKey(message.chatId, message.messageThreadId);
	}

	private toThreadTarget(message: TelegramInboundMessage): TelegramThreadTarget | undefined {
		if (!this.isSupergroup(message.chatType) || message.messageThreadId === null) {
			return undefined;
		}

		return {
			messageThreadId: message.messageThreadId,
		};
	}

	private startTypingLoop(chatId: string, target?: TelegramThreadTarget): () => void {
		let active = true;

		const sendTyping = async () => {
			if (!active) {
				return;
			}
			try {
				await this.transport.setTyping(chatId, target);
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

	private async registerPrivateCommands(): Promise<void> {
		try {
			await this.transport.setCommands(this.commands, { type: "all_private_chats" });
			logInfo("commands registered", {
				scope: "all_private_chats",
				count: this.commands.length,
				commands: this.commands.map((command) => command.command).join(","),
			});
		} catch (error) {
			logWarn("failed to register private commands", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async ensureSupergroupMemberCommands(chatId: string, userId: number): Promise<void> {
		const scopeKey = `${chatId}:${userId}`;
		if (this.supergroupCommandScopes.has(scopeKey)) {
			return;
		}

		try {
			await this.transport.setCommands(this.commands, {
				type: "chat_member",
				chatId,
				userId,
			});
			this.supergroupCommandScopes.add(scopeKey);
			logInfo("commands registered", {
				scope: "chat_member",
				chatId,
				userId,
			});
		} catch (error) {
			logWarn("failed to register supergroup member commands", {
				chatId,
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async handlePrivateSessionCommand(chatId: string, contextId: string, args: string[]): Promise<void> {
		const action = args[0]?.toLowerCase() ?? "status";

		if (action === "status" || action === "current") {
			const overview = await this.pool.getSessionOverview(contextId);
			await this.sendText(chatId, this.renderSessionStatus(overview));
			return;
		}

		if (action === "list") {
			const overview = await this.pool.getSessionOverview(contextId);
			await this.sendText(chatId, this.renderSessionList(overview));
			return;
		}

		if (action === "new") {
			const created = await this.pool.createSession(contextId);
			await this.clearPromptDetails(contextId);
			await this.sendText(chatId, `已切换到新会话: ${created.nextSession}`);
			return;
		}

		if (action === "use") {
			const selector = args[1]?.trim();
			if (!selector) {
				await this.sendText(chatId, "用法: /session use <编号|会话文件名>");
				return;
			}

			const overview = await this.pool.getSessionOverview(contextId);
			const sessionFileName = this.resolveSessionSelector(selector, overview.sessions);
			if (!sessionFileName) {
				await this.sendText(chatId, `未找到会话: ${selector}`);
				return;
			}

			const switched = await this.pool.switchSession(contextId, sessionFileName);
			if (switched.previousSession === switched.nextSession) {
				await this.sendText(chatId, `当前已在会话: ${switched.nextSession}`);
				return;
			}

			await this.clearPromptDetails(contextId);
			await this.sendText(chatId, `会话已切换: ${switched.previousSession} -> ${switched.nextSession}`);
			return;
		}

		if (action === "delete" || action === "rm") {
			const selector = args[1]?.trim();
			if (!selector) {
				await this.sendText(chatId, "用法: /session delete <编号|会话文件名>");
				return;
			}

			const overview = await this.pool.getSessionOverview(contextId);
			const sessionFileName = this.resolveSessionSelector(selector, overview.sessions);
			if (!sessionFileName) {
				await this.sendText(chatId, `未找到会话: ${selector}`);
				return;
			}

			const deleted = await this.pool.deleteSession(contextId, sessionFileName);
			if (deleted.wasActive) {
				await this.clearPromptDetails(contextId);
				await this.sendText(
					chatId,
					`已删除当前会话: ${deleted.deletedSession}\n已切换到: ${deleted.activeSession}\n剩余会话数: ${deleted.remainingSessions.length}`,
				);
				return;
			}

			await this.sendText(
				chatId,
				`已删除会话: ${deleted.deletedSession}\n当前会话: ${deleted.activeSession}\n剩余会话数: ${deleted.remainingSessions.length}`,
			);
			return;
		}

		await this.sendText(chatId, this.renderSessionHelp());
	}

	private async handleSupergroupSessionCommand(
		message: TelegramInboundMessage,
		contextId: string,
		args: string[],
	): Promise<void> {
		const chatId = message.chatId;
		const currentThreadId = message.messageThreadId;
		const threadTarget = this.toThreadTarget(message);
		const action = args[0]?.toLowerCase() ?? "status";

		if (action === "status" || action === "current") {
			const overview = await this.pool.getSessionOverview(contextId);
			await this.sendText(chatId, this.renderSupergroupSessionStatus(currentThreadId, overview), threadTarget);
			return;
		}

		if (action === "list") {
			if (!this.pool.listSupergroupTopicBindings) {
				await this.sendText(chatId, "当前运行时不支持超级群会话列表", threadTarget);
				return;
			}

			const bindings = await this.pool.listSupergroupTopicBindings(chatId);
			await this.sendText(chatId, this.renderSupergroupSessionList(chatId, currentThreadId, bindings), threadTarget);
			return;
		}

		if (action === "new") {
			const topicName = this.generateSessionTopicName();
			const createdTopic = await this.transport.createForumTopic(chatId, topicName);
			const createdContextId = buildSupergroupTopicContextKey(chatId, createdTopic.messageThreadId);
			const createdOverview = await this.pool.getSessionOverview(createdContextId);
			const deepLink = this.buildTopicDeepLink(chatId, createdTopic.messageThreadId);

			await this.sendText(
				chatId,
				`已创建新 Topic: ${createdTopic.name}\nSession: ${createdOverview.activeSession}\n打开: ${deepLink}`,
				threadTarget,
			);
			return;
		}

		if (action === "use") {
			await this.sendText(chatId, "超级群模式下 /session use 已禁用，请直接切换到目标 Topic。", threadTarget);
			return;
		}

		if (action === "delete" || action === "rm") {
			if (args.length > 1) {
				await this.sendText(chatId, "超级群仅支持删除当前 Topic：/session delete", threadTarget);
				return;
			}

			if (currentThreadId === null) {
				await this.sendText(chatId, "General Topic 不支持删除，请切换到其他 Topic。", threadTarget);
				return;
			}

			const activeOverview = await this.pool.getSessionOverview(contextId);

			try {
				await this.transport.deleteForumTopic(chatId, currentThreadId);
			} catch (error) {
				const errorText = error instanceof Error ? error.message : String(error);
				await this.sendText(chatId, `删除 Topic 失败，操作已回滚：${errorText}`, threadTarget);
				return;
			}

			try {
				if (this.pool.deleteContext) {
					await this.pool.deleteContext(contextId);
				} else {
					await this.pool.deleteSession(contextId, activeOverview.activeSession);
					await this.clearPromptDetails(contextId);
				}
			} catch (error) {
				logError("session cleanup failed after topic deletion", {
					contextId,
					error: error instanceof Error ? error.message : String(error),
				});
			}

			await this.sendText(chatId, `当前 Topic 已删除，原会话: ${activeOverview.activeSession}`);
			return;
		}

		await this.sendText(chatId, this.renderSupergroupSessionHelp(), threadTarget);
	}

	private async handleDetailsCommand(message: TelegramInboundMessage, contextId: string): Promise<void> {
		const details = await this.detailsStore.getLatest(contextId);
		const threadTarget = this.toThreadTarget(message);
		if (!details) {
			const emptyMessage = this.isSupergroup(message.chatType)
				? "当前 Topic 暂无可用详情。"
				: "当前会话暂无可用详情。";
			await this.sendText(message.chatId, emptyMessage, threadTarget);
			return;
		}

		await this.sendText(message.chatId, this.renderDetails(details), threadTarget);
	}

	private parseCommand(text: string): { name: string; args: string[] } | null {
		if (!text.startsWith("/")) {
			return null;
		}

		const segments = text.split(/\s+/).filter((segment) => segment.length > 0);
		const firstToken = segments[0];
		if (!firstToken) {
			return null;
		}

		const commandWithSlash = firstToken.split("@")[0];
		if (!commandWithSlash || commandWithSlash.length <= 1) {
			return null;
		}

		return {
			name: commandWithSlash.slice(1).toLowerCase(),
			args: segments.slice(1),
		};
	}

	private resolveSessionSelector(selector: string, sessions: string[]): string | null {
		if (/^\d+$/.test(selector)) {
			const index = Number.parseInt(selector, 10);
			if (Number.isFinite(index) && index >= 1 && index <= sessions.length) {
				return sessions[index - 1];
			}
		}

		const matched = sessions.find((session) => session === selector);
		return matched ?? null;
	}

	private generateSessionTopicName(): string {
		const now = new Date();
		const year = now.getUTCFullYear();
		const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
		const day = `${now.getUTCDate()}`.padStart(2, "0");
		const hours = `${now.getUTCHours()}`.padStart(2, "0");
		const minutes = `${now.getUTCMinutes()}`.padStart(2, "0");
		const seconds = `${now.getUTCSeconds()}`.padStart(2, "0");
		return `session-${year}${month}${day}-${hours}${minutes}${seconds}`;
	}

	private buildTopicDeepLink(chatId: string, messageThreadId: number): string {
		const internalChatId = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace(/^-/, "");
		return `https://t.me/c/${internalChatId}/${messageThreadId}`;
	}

	private renderSessionStatus(overview: SessionOverview): string {
		return `当前会话: ${overview.activeSession}\n会话总数: ${overview.sessions.length}\n\n${this.renderSessionHelp()}`;
	}

	private renderSessionList(overview: SessionOverview): string {
		const rows = overview.sessions.map((session, index) => {
			const marker = session === overview.activeSession ? "*" : " ";
			return `${index + 1}) [${marker}] ${session}`;
		});

		return `当前会话: ${overview.activeSession}\n\n会话列表:\n${rows.join("\n")}\n\n${this.renderSessionHelp()}`;
	}

	private renderSessionHelp(): string {
		return [
			"会话命令:",
			"/session - 查看当前会话",
			"/session list - 列出会话",
			"/session new - 新建并切换会话",
			"/session use <编号|文件名> - 切换会话",
			"/session delete <编号|文件名> - 删除会话",
			"/details - 查看最近一次详细回答",
		].join("\n");
	}

	private renderSupergroupSessionStatus(messageThreadId: number | null, overview: SessionOverview): string {
		const topicLabel = this.formatTopicLabel(messageThreadId);
		return `当前 Topic: ${topicLabel}\n当前会话: ${overview.activeSession}\n会话总数: ${overview.sessions.length}\n\n${this.renderSupergroupSessionHelp()}`;
	}

	private renderSupergroupSessionList(
		chatId: string,
		currentThreadId: number | null,
		bindings: SupergroupTopicBinding[],
	): string {
		if (bindings.length === 0) {
			return `当前群暂无 Topic 会话绑定。\n\n${this.renderSupergroupSessionHelp()}`;
		}

		const rows = bindings.map((binding, index) => {
			const marker = binding.messageThreadId === currentThreadId ? "*" : " ";
			const topicLabel = this.formatTopicLabel(binding.messageThreadId);
			const link = binding.messageThreadId === null ? "" : this.buildTopicDeepLink(chatId, binding.messageThreadId);
			const linkSuffix = link.length > 0 ? ` ${link}` : "";
			return `${index + 1}) [${marker}] topic=${topicLabel} session=${binding.activeSession} (${binding.sessionCount})${linkSuffix}`;
		});

		return `当前 Topic: ${this.formatTopicLabel(currentThreadId)}\n\nTopic 会话列表:\n${rows.join("\n")}\n\n${this.renderSupergroupSessionHelp()}`;
	}

	private formatTopicLabel(messageThreadId: number | null): string {
		return messageThreadId === null ? "General" : `${messageThreadId}`;
	}

	private renderSupergroupSessionHelp(): string {
		return [
			"超级群会话命令:",
			"/session - 查看当前 Topic 会话",
			"/session list - 列出本群所有 Topic 会话",
			"/session new - 新建 Topic + 新会话",
			"/session use - 已禁用（请直接切 Topic）",
			"/session delete - 删除当前 Topic 与会话",
			"/details - 查看当前 Topic 最近一次详细回答",
		].join("\n");
	}

	private renderDetails(details: PromptDetailsRecord): string {
		const promptPreview = details.prompt.trim().length > 0 ? details.prompt.trim() : "(空输入)";
		const toolSummary = this.renderToolSummary(details.toolCalls);
		const fullText = this.normalizeText(details.fullText);

		return [
			"最近一次回答详情",
			`时间: ${details.updatedAt}`,
			`提问: ${promptPreview}`,
			"",
			"关键工具调用摘要:",
			toolSummary,
			"",
			"详细回答:",
			fullText,
		].join("\n");
	}

	private renderToolSummary(toolCalls: ToolCallSummary[]): string {
		if (toolCalls.length === 0) {
			return "- 本次回答未调用工具";
		}

		const lines = toolCalls.slice(0, 10).map((call, index) => {
			const argsText = this.renderToolArgs(call.args);
			return `${index + 1}) ${call.toolName}${argsText.length > 0 ? ` ${argsText}` : ""}`;
		});

		if (toolCalls.length > 10) {
			lines.push(`... 其余 ${toolCalls.length - 10} 条已省略`);
		}

		return lines.join("\n");
	}

	private renderToolArgs(args: Record<string, unknown> | null): string {
		if (!args) {
			return "";
		}

		const entries = Object.entries(args);
		if (entries.length === 0) {
			return "";
		}

		const parts = entries.slice(0, 3).map(([key, value]) => `${key}=${this.formatToolArgValue(value)}`);
		if (entries.length > 3) {
			parts.push("...");
		}
		return parts.join(" ");
	}

	private formatToolArgValue(value: unknown): string {
		if (typeof value === "string") {
			return this.truncateSingleLine(value, 80);
		}

		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}

		if (value === null || value === undefined) {
			return String(value);
		}

		try {
			return this.truncateSingleLine(JSON.stringify(value), 80);
		} catch {
			return "[unserializable]";
		}
	}

	private truncateSingleLine(value: string, maxLength: number): string {
		const normalized = value.replaceAll(/\s+/g, " ").trim();
		if (normalized.length <= maxLength) {
			return normalized;
		}
		return `${normalized.slice(0, maxLength)}...`;
	}

	private buildConciseReply(text: string): string {
		const normalized = this.normalizeText(text);
		if (normalized.length <= DEFAULT_CONCISE_REPLY_LIMIT) {
			return normalized;
		}

		const concise = normalized.slice(0, DEFAULT_CONCISE_REPLY_LIMIT);
		const omitted = normalized.length - DEFAULT_CONCISE_REPLY_LIMIT;
		return `${concise}\n\n（为便于手机阅读，已省略 ${omitted} 字。发送 /details 查看完整回答与关键工具摘要。）`;
	}

	private async persistPromptDetails(contextId: string, prompt: string, result: PromptResult): Promise<void> {
		try {
			await this.detailsStore.saveLatest(contextId, {
				updatedAt: new Date().toISOString(),
				prompt,
				fullText: result.text,
				toolCalls: result.toolCalls ?? [],
			});
		} catch (error) {
			logWarn("failed to persist prompt details", {
				contextId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async clearPromptDetails(contextId: string): Promise<void> {
		try {
			await this.detailsStore.clear(contextId);
		} catch (error) {
			logWarn("failed to clear prompt details", {
				contextId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private normalizeText(text: string): string {
		const trimmed = text.trim();
		return trimmed.length > 0 ? text : "...";
	}

	private splitText(text: string): string[] {
		const normalized = this.normalizeText(text);
		if (normalized.length <= TELEGRAM_MESSAGE_LIMIT) {
			return [normalized];
		}

		const chunks: string[] = [];
		let remaining = normalized;

		while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
			let splitIndex = remaining.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT);
			if (splitIndex <= 0 || splitIndex < TELEGRAM_MESSAGE_LIMIT / 2) {
				splitIndex = TELEGRAM_MESSAGE_LIMIT;
			}

			chunks.push(remaining.slice(0, splitIndex).trimEnd());
			remaining = remaining.slice(splitIndex).trimStart();
		}

		if (remaining.length > 0) {
			chunks.push(remaining);
		}

		return chunks.length > 0 ? chunks : ["..."];
	}

	private async sendText(chatId: string, text: string, target?: TelegramThreadTarget): Promise<void> {
		const chunks = this.splitText(text);
		for (const chunk of chunks) {
			await this.retryTelegramAction({
				chatId,
				operation: "sendMessage",
				action: async () => {
					await this.transport.sendMessage(chatId, chunk, target);
				},
			});
		}
	}

	private async sendFinalResponseWithRateLimitNotice(
		chatId: string,
		text: string,
		target?: TelegramThreadTarget,
	): Promise<void> {
		const chunks = this.splitText(text);
		if (chunks.length !== 1) {
			await this.sendText(chatId, text, target);
			return;
		}

		const finalText = chunks[0];
		let statusMessageId: number | null = null;

		await this.retryTelegramAction({
			chatId,
			operation: "final response",
			action: async () => {
				if (statusMessageId === null) {
					await this.transport.sendMessage(chatId, finalText, target);
					return;
				}

				await this.transport.editMessage(chatId, statusMessageId, finalText);
			},
			onRateLimit: async (retryAfterSeconds) => {
				if (statusMessageId === null) {
					statusMessageId = await this.trySendRateLimitStatus(chatId, retryAfterSeconds, target);
					return;
				}

				await this.tryUpdateRateLimitStatus(chatId, statusMessageId, retryAfterSeconds);
			},
		});
	}

	private async trySendRateLimitStatus(
		chatId: string,
		retryAfterSeconds: number,
		target?: TelegramThreadTarget,
	): Promise<number | null> {
		const text = `消息发送受限，正在重试（约 ${retryAfterSeconds} 秒）...`;
		try {
			return await this.transport.sendMessage(chatId, text, target);
		} catch (error) {
			logWarn("failed to send rate limit status", {
				chatId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private async tryUpdateRateLimitStatus(
		chatId: string,
		statusMessageId: number,
		retryAfterSeconds: number,
	): Promise<void> {
		const text = `消息发送受限，继续重试（约 ${retryAfterSeconds} 秒）...`;
		try {
			await this.transport.editMessage(chatId, statusMessageId, text);
		} catch (error) {
			if (this.isRateLimitError(error)) {
				return;
			}
			logWarn("failed to update rate limit status", {
				chatId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async retryTelegramAction<T>(options: {
		chatId: string;
		operation: string;
		action: () => Promise<T>;
		onRateLimit?: (retryAfterSeconds: number, attempt: number) => Promise<void>;
	}): Promise<T> {
		for (let attempt = 1; attempt <= MAX_TELEGRAM_RETRY_ATTEMPTS; attempt += 1) {
			try {
				return await options.action();
			} catch (error) {
				const retryAfterSeconds = this.extractRetryAfterSeconds(error);
				if (retryAfterSeconds === null || attempt >= MAX_TELEGRAM_RETRY_ATTEMPTS) {
					throw error;
				}

				logWarn("telegram request throttled, waiting to retry", {
					chatId: options.chatId,
					operation: options.operation,
					attempt,
					retryAfterSeconds,
				});

				if (options.onRateLimit) {
					try {
						await options.onRateLimit(retryAfterSeconds, attempt);
					} catch (notifyError) {
						logWarn("rate limit callback failed", {
							chatId: options.chatId,
							operation: options.operation,
							error: notifyError instanceof Error ? notifyError.message : String(notifyError),
						});
					}
				}

				await this.sleepFn(Math.max(1, retryAfterSeconds) * 1_000);
			}
		}

		throw new Error(`Retry budget exhausted for ${options.operation}`);
	}

	private extractRetryAfterSeconds(error: unknown): number | null {
		if (error instanceof TelegramApiError && typeof error.retryAfterSeconds === "number") {
			if (Number.isFinite(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
				return error.retryAfterSeconds;
			}
		}

		if (!(error instanceof Error)) {
			return null;
		}

		const match = error.message.match(/retry after\s+(\d+)/i);
		if (!match) {
			return null;
		}

		const seconds = Number.parseInt(match[1], 10);
		if (!Number.isFinite(seconds) || seconds <= 0) {
			return null;
		}

		return seconds;
	}

	private isRateLimitError(error: unknown): boolean {
		return this.extractRetryAfterSeconds(error) !== null;
	}
}
