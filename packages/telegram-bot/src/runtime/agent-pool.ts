import { basename } from "path";
import { logInfo } from "../log.js";
import type { SessionPathManager, SessionDeleteResult as StorageSessionDeleteResult } from "../storage/session-path.js";
import type { AgentRuntime, PromptOptions, PromptResult } from "./agent-runtime.js";
import { SerialQueue } from "./queue.js";

export interface RuntimeFactory {
	create(chatId: string, sessionPath: string): AgentRuntime;
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

	async runPrompt(chatId: string, message: string, options?: PromptOptions): Promise<PromptResult> {
		const queue = this.getQueue(chatId);

		return queue.enqueue(async () => {
			const entry = await this.getOrCreateEntry(chatId);
			entry.lastUsedAt = Date.now();
			const result = await entry.runtime.prompt(message, options);
			entry.lastUsedAt = Date.now();
			return result;
		});
	}

	async reset(chatId: string): Promise<void> {
		await this.createSession(chatId);
	}

	async getSessionOverview(chatId: string): Promise<SessionOverview> {
		const queue = this.getQueue(chatId);
		return queue.enqueue(async () => {
			const state = await this.sessionPaths.getSessionState(chatId);
			return {
				activeSession: state.activeFileName,
				sessions: state.sessionFileNames,
			};
		});
	}

	async createSession(chatId: string): Promise<SessionSwitchResult> {
		const queue = this.getQueue(chatId);

		return queue.enqueue(async () => {
			const rotated = await this.sessionPaths.rotateSession(chatId);
			await this.disposeEntry(chatId);

			const result = {
				previousSession: this.toSessionFileName(rotated.previousPath),
				nextSession: this.toSessionFileName(rotated.nextPath),
			};
			logInfo("session rotated", {
				chatId,
				previousSession: result.previousSession,
				nextSession: result.nextSession,
			});
			return result;
		});
	}

	async switchSession(chatId: string, sessionFileName: string): Promise<SessionSwitchResult> {
		const queue = this.getQueue(chatId);

		return queue.enqueue(async () => {
			const switched = await this.sessionPaths.switchSession(chatId, sessionFileName);
			const result = {
				previousSession: this.toSessionFileName(switched.previousPath),
				nextSession: this.toSessionFileName(switched.nextPath),
			};

			if (switched.previousPath !== switched.nextPath) {
				await this.disposeEntry(chatId);
				logInfo("session switched", {
					chatId,
					previousSession: result.previousSession,
					nextSession: result.nextSession,
				});
			}

			return result;
		});
	}

	async deleteSession(chatId: string, sessionFileName: string): Promise<SessionDeleteResult> {
		const queue = this.getQueue(chatId);

		return queue.enqueue(async () => {
			const deleted = await this.sessionPaths.deleteSession(chatId, sessionFileName);
			if (deleted.wasActive) {
				await this.disposeEntry(chatId);
			}

			const result = this.mapDeleteResult(deleted);
			logInfo("session deleted", {
				chatId,
				deletedSession: result.deletedSession,
				wasActive: result.wasActive,
				activeSession: result.activeSession,
				remainingCount: result.remainingSessions.length,
			});
			return result;
		});
	}

	async sweepIdle(now = Date.now()): Promise<void> {
		const entries = Array.from(this.entries.entries());

		for (const [chatId, entry] of entries) {
			const queue = this.queues.get(chatId);
			if (queue && !queue.isIdle()) {
				continue;
			}

			const inactiveForMs = now - entry.lastUsedAt;
			if (inactiveForMs < this.idleTtlMs) {
				continue;
			}

			await this.disposeEntry(chatId);
			if (!queue || queue.isIdle()) {
				this.queues.delete(chatId);
			}
			logInfo("runtime swept", { chatId, inactiveForMs });
		}
	}

	async dispose(): Promise<void> {
		clearInterval(this.sweepTimer);
		const entries = Array.from(this.entries.keys());
		for (const chatId of entries) {
			await this.disposeEntry(chatId);
		}
		this.queues.clear();
	}

	private getQueue(chatId: string): SerialQueue {
		const existing = this.queues.get(chatId);
		if (existing) {
			return existing;
		}

		const queue = new SerialQueue();
		this.queues.set(chatId, queue);
		return queue;
	}

	private async getOrCreateEntry(chatId: string): Promise<RuntimeEntry> {
		const existing = this.entries.get(chatId);
		if (existing?.runtime.isAlive()) {
			return existing;
		}

		if (existing && !existing.runtime.isAlive()) {
			await this.disposeEntry(chatId);
		}

		const sessionPath = await this.sessionPaths.getActiveSessionPath(chatId);
		const runtime = this.runtimeFactory.create(chatId, sessionPath);

		const entry: RuntimeEntry = {
			runtime,
			lastUsedAt: Date.now(),
		};

		this.entries.set(chatId, entry);
		logInfo("runtime created", { chatId, sessionPath });
		return entry;
	}

	private async disposeEntry(chatId: string): Promise<void> {
		const entry = this.entries.get(chatId);
		if (!entry) {
			return;
		}

		this.entries.delete(chatId);
		await entry.runtime.dispose();
		logInfo("runtime disposed", { chatId });
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
