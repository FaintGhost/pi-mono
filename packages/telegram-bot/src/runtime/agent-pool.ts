import { basename } from "path";
import { logInfo } from "../log.js";
import { parseSupergroupTopicContextKey } from "../storage/context-key.js";
import type { SessionPathManager, SessionDeleteResult as StorageSessionDeleteResult } from "../storage/session-path.js";
import type { AgentRuntime, PromptOptions, PromptResult } from "./agent-runtime.js";
import { SerialQueue } from "./queue.js";

export interface RuntimeFactory {
	create(contextId: string, sessionPath: string): AgentRuntime;
}

export interface SessionOverview {
	activeSession: string;
	sessions: string[];
}

export interface SessionSwitchResult {
	previousSession: string;
	nextSession: string;
}

export interface SessionDeleteResult {
	deletedSession: string;
	wasActive: boolean;
	previousActiveSession: string;
	activeSession: string;
	remainingSessions: string[];
}

export interface SupergroupTopicBinding {
	contextId: string;
	chatId: string;
	messageThreadId: number | null;
	activeSession: string;
	sessionCount: number;
}

interface RuntimeEntry {
	runtime: AgentRuntime;
	lastUsedAt: number;
}

export class AgentPool {
	private readonly queues = new Map<string, SerialQueue>();
	private readonly entries = new Map<string, RuntimeEntry>();
	private readonly idleTtlMs: number;
	private readonly runtimeFactory: RuntimeFactory;
	private readonly sessionPaths: SessionPathManager;
	private readonly sweepTimer: NodeJS.Timeout;

	constructor(options: {
		idleTtlMs: number;
		runtimeFactory: RuntimeFactory;
		sessionPaths: SessionPathManager;
	}) {
		this.idleTtlMs = options.idleTtlMs;
		this.runtimeFactory = options.runtimeFactory;
		this.sessionPaths = options.sessionPaths;

		const intervalMs = Math.max(1_000, Math.min(60_000, this.idleTtlMs));
		this.sweepTimer = setInterval(() => {
			void this.sweepIdle();
		}, intervalMs);
		this.sweepTimer.unref();
	}

	async runPrompt(contextId: string, message: string, options?: PromptOptions): Promise<PromptResult> {
		const queue = this.getQueue(contextId);

		return queue.enqueue(async () => {
			const entry = await this.getOrCreateEntry(contextId);
			entry.lastUsedAt = Date.now();
			const result = await entry.runtime.prompt(message, options);
			entry.lastUsedAt = Date.now();
			return result;
		});
	}

	async reset(contextId: string): Promise<void> {
		await this.createSession(contextId);
	}

	async getSessionOverview(contextId: string): Promise<SessionOverview> {
		const queue = this.getQueue(contextId);
		return queue.enqueue(async () => {
			const state = await this.sessionPaths.getSessionState(contextId);
			return {
				activeSession: state.activeFileName,
				sessions: state.sessionFileNames,
			};
		});
	}

	async listSupergroupTopicBindings(chatId: string): Promise<SupergroupTopicBinding[]> {
		const contextIds = await this.sessionPaths.listContextIds();
		const bindings: SupergroupTopicBinding[] = [];

		for (const contextId of contextIds) {
			const parsed = parseSupergroupTopicContextKey(contextId);
			if (!parsed || parsed.chatId !== chatId) {
				continue;
			}

			const state = await this.sessionPaths.getSessionState(contextId);
			bindings.push({
				contextId,
				chatId,
				messageThreadId: parsed.messageThreadId,
				activeSession: state.activeFileName,
				sessionCount: state.sessionFileNames.length,
			});
		}

		return bindings.sort((left, right) => {
			if (left.messageThreadId === null && right.messageThreadId === null) {
				return 0;
			}
			if (left.messageThreadId === null) {
				return -1;
			}
			if (right.messageThreadId === null) {
				return 1;
			}
			return left.messageThreadId - right.messageThreadId;
		});
	}

	async createSession(contextId: string): Promise<SessionSwitchResult> {
		const queue = this.getQueue(contextId);

		return queue.enqueue(async () => {
			const rotated = await this.sessionPaths.rotateSession(contextId);
			await this.disposeEntry(contextId);

			const result = {
				previousSession: this.toSessionFileName(rotated.previousPath),
				nextSession: this.toSessionFileName(rotated.nextPath),
			};
			logInfo("session rotated", {
				contextId,
				previousSession: result.previousSession,
				nextSession: result.nextSession,
			});
			return result;
		});
	}

	async switchSession(contextId: string, sessionFileName: string): Promise<SessionSwitchResult> {
		const queue = this.getQueue(contextId);

		return queue.enqueue(async () => {
			const switched = await this.sessionPaths.switchSession(contextId, sessionFileName);
			const result = {
				previousSession: this.toSessionFileName(switched.previousPath),
				nextSession: this.toSessionFileName(switched.nextPath),
			};

			if (switched.previousPath !== switched.nextPath) {
				await this.disposeEntry(contextId);
				logInfo("session switched", {
					contextId,
					previousSession: result.previousSession,
					nextSession: result.nextSession,
				});
			}

			return result;
		});
	}

	async deleteSession(contextId: string, sessionFileName: string): Promise<SessionDeleteResult> {
		const queue = this.getQueue(contextId);

		return queue.enqueue(async () => {
			const deleted = await this.sessionPaths.deleteSession(contextId, sessionFileName);
			if (deleted.wasActive) {
				await this.disposeEntry(contextId);
			}

			const result = this.mapDeleteResult(deleted);
			logInfo("session deleted", {
				contextId,
				deletedSession: result.deletedSession,
				wasActive: result.wasActive,
				activeSession: result.activeSession,
				remainingCount: result.remainingSessions.length,
			});
			return result;
		});
	}

	async deleteContext(contextId: string): Promise<void> {
		const queue = this.getQueue(contextId);

		await queue.enqueue(async () => {
			await this.disposeEntry(contextId);
			await this.sessionPaths.deleteContext(contextId);
			logInfo("context deleted", { contextId });
		});

		if (queue.isIdle()) {
			this.queues.delete(contextId);
		}
	}

	async sweepIdle(now = Date.now()): Promise<void> {
		const entries = Array.from(this.entries.entries());

		for (const [contextId, entry] of entries) {
			const queue = this.queues.get(contextId);
			if (queue && !queue.isIdle()) {
				continue;
			}

			const inactiveForMs = now - entry.lastUsedAt;
			if (inactiveForMs < this.idleTtlMs) {
				continue;
			}

			await this.disposeEntry(contextId);
			if (!queue || queue.isIdle()) {
				this.queues.delete(contextId);
			}
			logInfo("runtime swept", { contextId, inactiveForMs });
		}
	}

	async dispose(): Promise<void> {
		clearInterval(this.sweepTimer);
		const entries = Array.from(this.entries.keys());
		for (const contextId of entries) {
			await this.disposeEntry(contextId);
		}
		this.queues.clear();
	}

	private getQueue(contextId: string): SerialQueue {
		const existing = this.queues.get(contextId);
		if (existing) {
			return existing;
		}

		const queue = new SerialQueue();
		this.queues.set(contextId, queue);
		return queue;
	}

	private async getOrCreateEntry(contextId: string): Promise<RuntimeEntry> {
		const existing = this.entries.get(contextId);
		if (existing?.runtime.isAlive()) {
			return existing;
		}

		if (existing && !existing.runtime.isAlive()) {
			await this.disposeEntry(contextId);
		}

		const sessionPath = await this.sessionPaths.getActiveSessionPath(contextId);
		const runtime = this.runtimeFactory.create(contextId, sessionPath);

		const entry: RuntimeEntry = {
			runtime,
			lastUsedAt: Date.now(),
		};

		this.entries.set(contextId, entry);
		logInfo("runtime created", { contextId, sessionPath });
		return entry;
	}

	private async disposeEntry(contextId: string): Promise<void> {
		const entry = this.entries.get(contextId);
		if (!entry) {
			return;
		}

		this.entries.delete(contextId);
		await entry.runtime.dispose();
		logInfo("runtime disposed", { contextId });
	}

	private mapDeleteResult(deleted: StorageSessionDeleteResult): SessionDeleteResult {
		return {
			deletedSession: this.toSessionFileName(deleted.deletedPath),
			wasActive: deleted.wasActive,
			previousActiveSession: this.toSessionFileName(deleted.previousActivePath),
			activeSession: this.toSessionFileName(deleted.nextActivePath),
			remainingSessions: deleted.remainingSessionFileNames,
		};
	}

	private toSessionFileName(sessionPath: string): string {
		return basename(sessionPath);
	}
}
