import { mkdir, readdir, readFile, rm, unlink, writeFile } from "fs/promises";
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

	async getActiveSessionPath(contextId: string): Promise<string> {
		const contextDir = await this.ensureContextDir(contextId);
		const pointerPath = this.getPointerPath(contextDir);

		try {
			const fileName = (await readFile(pointerPath, "utf8")).trim();
			if (fileName.length > 0) {
				return join(contextDir, fileName);
			}
		} catch {
			// ignore missing pointer file
		}

		const nextPath = await this.createSessionFile(contextDir);
		await this.writePointer(pointerPath, nextPath);
		return nextPath;
	}

	async getSessionState(contextId: string): Promise<SessionState> {
		const contextDir = await this.ensureContextDir(contextId);
		const activePath = await this.getActiveSessionPath(contextId);
		const activeFileName = basename(activePath);
		const sessionFileNames = await this.listSessionFileNames(contextDir);

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

	async rotateSession(contextId: string): Promise<SessionRotationResult> {
		const contextDir = await this.ensureContextDir(contextId);
		const pointerPath = this.getPointerPath(contextDir);
		const previousPath = await this.getActiveSessionPath(contextId);
		const nextPath = await this.createSessionFile(contextDir);
		await this.writePointer(pointerPath, nextPath);

		return {
			previousPath,
			nextPath,
		};
	}

	async switchSession(contextId: string, sessionFileName: string): Promise<SessionRotationResult> {
		const safeSessionFileName = this.validateSessionFileName(sessionFileName);
		const contextDir = await this.ensureContextDir(contextId);
		const pointerPath = this.getPointerPath(contextDir);
		const state = await this.getSessionState(contextId);

		if (!state.sessionFileNames.includes(safeSessionFileName)) {
			throw new Error(`Session not found: ${safeSessionFileName}`);
		}

		const nextPath = join(contextDir, safeSessionFileName);
		await this.writePointer(pointerPath, nextPath);
		return {
			previousPath: state.activePath,
			nextPath,
		};
	}

	async deleteSession(contextId: string, sessionFileName: string): Promise<SessionDeleteResult> {
		const safeSessionFileName = this.validateSessionFileName(sessionFileName);
		const contextDir = await this.ensureContextDir(contextId);
		const pointerPath = this.getPointerPath(contextDir);
		const state = await this.getSessionState(contextId);

		if (!state.sessionFileNames.includes(safeSessionFileName)) {
			throw new Error(`Session not found: ${safeSessionFileName}`);
		}

		const deletedPath = join(contextDir, safeSessionFileName);
		await unlink(deletedPath);

		const remainingSessionFileNames = state.sessionFileNames.filter((session) => session !== safeSessionFileName);
		const wasActive = state.activeFileName === safeSessionFileName;
		let nextActivePath = state.activePath;

		if (wasActive) {
			if (remainingSessionFileNames.length === 0) {
				nextActivePath = await this.createSessionFile(contextDir);
				remainingSessionFileNames.push(basename(nextActivePath));
			} else {
				nextActivePath = join(contextDir, remainingSessionFileNames[0]);
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

	async deleteContext(contextId: string): Promise<void> {
		const safeContextId = this.validateContextId(contextId);
		const contextDir = join(this.sessionsDir, safeContextId);
		await rm(contextDir, { recursive: true, force: true });
	}

	async listContextIds(): Promise<string[]> {
		await mkdir(this.sessionsDir, { recursive: true });
		const entries = await readdir(this.sessionsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((left, right) => left.localeCompare(right));
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

	private getPointerPath(contextDir: string): string {
		return join(contextDir, ACTIVE_POINTER_FILE);
	}

	private async createSessionFile(contextDir: string): Promise<string> {
		const timestamp = new Date().toISOString().replaceAll(":", "-");
		const sessionFileName = `session-${timestamp}-${Math.random().toString(16).slice(2, 8)}.jsonl`;
		const sessionPath = join(contextDir, sessionFileName);
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

	private async listSessionFileNames(contextDir: string): Promise<string[]> {
		const entries = await readdir(contextDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && this.isSessionFileName(entry.name))
			.map((entry) => entry.name)
			.sort((left, right) => right.localeCompare(left));
	}

	private isSessionFileName(fileName: string): boolean {
		return fileName.startsWith(SESSION_FILE_PREFIX) && fileName.endsWith(SESSION_FILE_SUFFIX);
	}
}
