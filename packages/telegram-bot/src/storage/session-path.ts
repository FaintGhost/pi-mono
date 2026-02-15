import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join, resolve } from "path";

const ACTIVE_POINTER_FILE = "active-session.txt";

export interface SessionRotationResult {
	previousPath: string;
	nextPath: string;
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
}
