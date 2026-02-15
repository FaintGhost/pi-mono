import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { basename, join, resolve } from "path";

const ACTIVE_POINTER_FILE = "active-session.txt";
const SESSION_FILE_PREFIX = "session-";
const SESSION_FILE_SUFFIX = ".jsonl";

export interface SessionRotationResult {
	previousPath: string;
	nextPath: string;
}

export interface SessionDeleteResult {
	deletedPath: string;
	wasActive: boolean;
	previousActivePath: string;
	nextActivePath: string;
	remainingSessionFileNames: string[];
}

export interface SessionState {
	activePath: string;
	activeFileName: string;
	sessionFileNames: string[];
}

export class SessionPathManager {
	private readonly sessionsDir: string;

	constructor(sessionsDir: string) {
		this.sessionsDir = resolve(sessionsDir);
	}

	async getActiveSessionPath(chatId: string): Promise<string> {
		const chatDir = await this.ensureChatDir(chatId);
		const pointerPath = this.getPointerPath(chatDir);

		try {
			const fileName = (await readFile(pointerPath, "utf8")).trim();
			if (fileName.length > 0) {
				return join(chatDir, fileName);
			}
		} catch {
			// ignore missing pointer file
		}

		const nextPath = await this.createSessionFile(chatDir);
		await this.writePointer(pointerPath, nextPath);
		return nextPath;
	}

	async getSessionState(chatId: string): Promise<SessionState> {
		const chatDir = await this.ensureChatDir(chatId);
		const activePath = await this.getActiveSessionPath(chatId);
		const activeFileName = basename(activePath);
		const sessionFileNames = await this.listSessionFileNames(chatDir);

		if (!sessionFileNames.includes(activeFileName)) {
			sessionFileNames.push(activeFileName);
			sessionFileNames.sort((left, right) => right.localeCompare(left));
		}

		return {
			activePath,
			activeFileName,
			sessionFileNames,
		};
	}

	async rotateSession(chatId: string): Promise<SessionRotationResult> {
		const chatDir = await this.ensureChatDir(chatId);
		const pointerPath = this.getPointerPath(chatDir);
		const previousPath = await this.getActiveSessionPath(chatId);
		const nextPath = await this.createSessionFile(chatDir);
		await this.writePointer(pointerPath, nextPath);

		return {
			previousPath,
			nextPath,
		};
	}

	async switchSession(chatId: string, sessionFileName: string): Promise<SessionRotationResult> {
		const safeSessionFileName = this.validateSessionFileName(sessionFileName);
		const chatDir = await this.ensureChatDir(chatId);
		const pointerPath = this.getPointerPath(chatDir);
		const state = await this.getSessionState(chatId);

		if (!state.sessionFileNames.includes(safeSessionFileName)) {
			throw new Error(`Session not found: ${safeSessionFileName}`);
		}

		const nextPath = join(chatDir, safeSessionFileName);
		await this.writePointer(pointerPath, nextPath);
		return {
			previousPath: state.activePath,
			nextPath,
		};
	}

	async deleteSession(chatId: string, sessionFileName: string): Promise<SessionDeleteResult> {
		const safeSessionFileName = this.validateSessionFileName(sessionFileName);
		const chatDir = await this.ensureChatDir(chatId);
		const pointerPath = this.getPointerPath(chatDir);
		const state = await this.getSessionState(chatId);

		if (!state.sessionFileNames.includes(safeSessionFileName)) {
			throw new Error(`Session not found: ${safeSessionFileName}`);
		}

		const deletedPath = join(chatDir, safeSessionFileName);
		await unlink(deletedPath);

		const remainingSessionFileNames = state.sessionFileNames.filter((session) => session !== safeSessionFileName);
		const wasActive = state.activeFileName === safeSessionFileName;
		let nextActivePath = state.activePath;

		if (wasActive) {
			if (remainingSessionFileNames.length === 0) {
				nextActivePath = await this.createSessionFile(chatDir);
				remainingSessionFileNames.push(basename(nextActivePath));
			} else {
				nextActivePath = join(chatDir, remainingSessionFileNames[0]);
			}
			await this.writePointer(pointerPath, nextActivePath);
		}

		remainingSessionFileNames.sort((left, right) => right.localeCompare(left));

		return {
			deletedPath,
			wasActive,
			previousActivePath: state.activePath,
			nextActivePath,
			remainingSessionFileNames,
		};
	}

	private async ensureChatDir(chatId: string): Promise<string> {
		const safeChatId = chatId.trim();
		if (safeChatId.length === 0) {
			throw new Error("chatId cannot be empty");
		}

		const chatDir = join(this.sessionsDir, safeChatId);
		await mkdir(chatDir, { recursive: true });
		return chatDir;
	}

	private getPointerPath(chatDir: string): string {
		return join(chatDir, ACTIVE_POINTER_FILE);
	}

	private async createSessionFile(chatDir: string): Promise<string> {
		const timestamp = new Date().toISOString().replaceAll(":", "-");
		const sessionFileName = `session-${timestamp}-${Math.random().toString(16).slice(2, 8)}.jsonl`;
		const sessionPath = join(chatDir, sessionFileName);
		await writeFile(sessionPath, "", { flag: "a" });
		return sessionPath;
	}

	private async writePointer(pointerPath: string, sessionPath: string): Promise<void> {
		await writeFile(pointerPath, `${basename(sessionPath)}\n`, "utf8");
	}

	private validateSessionFileName(value: string): string {
		const sessionFileName = value.trim();
		if (sessionFileName.length === 0) {
			throw new Error("Session file name cannot be empty");
		}

		if (basename(sessionFileName) !== sessionFileName) {
			throw new Error(`Invalid session file name: ${value}`);
		}

		if (!this.isSessionFileName(sessionFileName)) {
			throw new Error(`Invalid session file name: ${value}`);
		}

		return sessionFileName;
	}

	private async listSessionFileNames(chatDir: string): Promise<string[]> {
		const entries = await readdir(chatDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && this.isSessionFileName(entry.name))
			.map((entry) => entry.name)
			.sort((left, right) => right.localeCompare(left));
	}

	private isSessionFileName(fileName: string): boolean {
		return fileName.startsWith(SESSION_FILE_PREFIX) && fileName.endsWith(SESSION_FILE_SUFFIX);
	}
}
