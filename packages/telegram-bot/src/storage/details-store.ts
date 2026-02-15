import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { basename, join, resolve } from "path";
import type { ToolCallSummary } from "../runtime/agent-runtime.js";

const DETAILS_FILE_NAME = "latest-response.json";

export interface PromptDetailsRecord {
	updatedAt: string;
	prompt: string;
	fullText: string;
	toolCalls: ToolCallSummary[];
}

export interface PromptDetailsStore {
	saveLatest(contextId: string, details: PromptDetailsRecord): Promise<void>;
	getLatest(contextId: string): Promise<PromptDetailsRecord | null>;
	clear(contextId: string): Promise<void>;
}

export class FilePromptDetailsStore implements PromptDetailsStore {
	private readonly sessionsDir: string;

	constructor(sessionsDir: string) {
		this.sessionsDir = resolve(sessionsDir);
	}

	async saveLatest(contextId: string, details: PromptDetailsRecord): Promise<void> {
		const contextDir = await this.ensureContextDir(contextId);
		const detailsPath = this.getDetailsPath(contextDir);
		await writeFile(detailsPath, `${JSON.stringify(details)}\n`, "utf8");
	}

	async getLatest(contextId: string): Promise<PromptDetailsRecord | null> {
		const contextDir = await this.ensureContextDir(contextId);
		const detailsPath = this.getDetailsPath(contextDir);

		let raw: string;
		try {
			raw = await readFile(detailsPath, "utf8");
		} catch {
			return null;
		}

		try {
			const parsed = JSON.parse(raw) as Partial<PromptDetailsRecord>;
			if (
				typeof parsed.updatedAt !== "string" ||
				typeof parsed.prompt !== "string" ||
				typeof parsed.fullText !== "string" ||
				!Array.isArray(parsed.toolCalls)
			) {
				return null;
			}

			const toolCalls = parsed.toolCalls
				.map((call) => this.normalizeToolCall(call))
				.filter((call): call is ToolCallSummary => call !== null);

			return {
				updatedAt: parsed.updatedAt,
				prompt: parsed.prompt,
				fullText: parsed.fullText,
				toolCalls,
			};
		} catch {
			return null;
		}
	}

	async clear(contextId: string): Promise<void> {
		const contextDir = await this.ensureContextDir(contextId);
		const detailsPath = this.getDetailsPath(contextDir);
		await rm(detailsPath, { force: true });
	}

	private async ensureContextDir(contextId: string): Promise<string> {
		const safeContextId = this.validateContextId(contextId);
		const contextDir = join(this.sessionsDir, safeContextId);
		await mkdir(contextDir, { recursive: true });
		return contextDir;
	}

	private validateContextId(contextId: string): string {
		const safeContextId = contextId.trim();
		if (safeContextId.length === 0) {
			throw new Error("contextId cannot be empty");
		}

		if (basename(safeContextId) !== safeContextId) {
			throw new Error(`Invalid contextId: ${contextId}`);
		}

		return safeContextId;
	}

	private getDetailsPath(contextDir: string): string {
		return join(contextDir, DETAILS_FILE_NAME);
	}

	private normalizeToolCall(value: unknown): ToolCallSummary | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return null;
		}

		const maybe = value as {
			toolCallId?: unknown;
			toolName?: unknown;
			args?: unknown;
		};

		if (typeof maybe.toolCallId !== "string" || typeof maybe.toolName !== "string") {
			return null;
		}

		const args =
			maybe.args && typeof maybe.args === "object" && !Array.isArray(maybe.args)
				? (maybe.args as Record<string, unknown>)
				: null;

		return {
			toolCallId: maybe.toolCallId,
			toolName: maybe.toolName,
			args,
		};
	}
}
