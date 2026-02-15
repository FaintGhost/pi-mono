import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

describe("dotenv config loading", () => {
	it("loads TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS from .env", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "telegram-bot-env-"));
		process.chdir(workDir);

		await writeFile(
			join(workDir, ".env"),
			"TELEGRAM_BOT_TOKEN=file-token\nTELEGRAM_ALLOWED_USER_IDS=1001,1002\n",
			"utf8",
		);

		const config = loadConfig({} as NodeJS.ProcessEnv);

		expect(config.telegramBotToken).toBe("file-token");
		expect(Array.from(config.allowedUserIds)).toEqual([1001, 1002]);
		expect(config.parseMode).toBe("Markdown");

		await rm(workDir, { recursive: true, force: true });
	});

	it("prefers process env over .env", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "telegram-bot-env-override-"));
		process.chdir(workDir);

		await writeFile(join(workDir, ".env"), "TELEGRAM_BOT_TOKEN=file-token\nTELEGRAM_ALLOWED_USER_IDS=1001\n", "utf8");

		const config = loadConfig({
			TELEGRAM_BOT_TOKEN: "env-token",
			TELEGRAM_ALLOWED_USER_IDS: "2002",
		} as NodeJS.ProcessEnv);

		expect(config.telegramBotToken).toBe("env-token");
		expect(Array.from(config.allowedUserIds)).toEqual([2002]);
		expect(config.parseMode).toBe("Markdown");

		await rm(workDir, { recursive: true, force: true });
	});

	it("supports TELEGRAM_ENV_FILE custom path", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "telegram-bot-env-custom-"));
		process.chdir(workDir);

		await writeFile(
			join(workDir, "bot.env"),
			"TELEGRAM_BOT_TOKEN=custom-token\nTELEGRAM_ALLOWED_USER_IDS=3003\nTELEGRAM_PARSE_MODE=html\n",
			"utf8",
		);

		const config = loadConfig({
			TELEGRAM_ENV_FILE: "bot.env",
		} as NodeJS.ProcessEnv);

		expect(config.telegramBotToken).toBe("custom-token");
		expect(Array.from(config.allowedUserIds)).toEqual([3003]);
		expect(config.parseMode).toBe("HTML");

		await rm(workDir, { recursive: true, force: true });
	});
});
