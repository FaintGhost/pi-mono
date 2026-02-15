import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const DEFAULT_IDLE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_STREAM_EDIT_THROTTLE_MS = 600;
const DEFAULT_ENV_FILE = ".env";

export type TelegramParseMode = "none" | "Markdown" | "MarkdownV2" | "HTML";

export interface TelegramBotConfig {
	telegramBotToken: string;
	allowedUserIds: Set<number>;
	piBin: string;
	piCwd: string;
	dataDir: string;
	sessionsDir: string;
	idleTtlMs: number;
	streamEditThrottleMs: number;
	parseMode: TelegramParseMode;
}

function parsePositiveInteger(value: string | undefined, fallback: number, key: string): number {
	if (!value || value.trim().length === 0) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`Invalid ${key}: expected a non-negative integer, got '${value}'`);
	}

	return parsed;
}

function parseAllowedUserIds(value: string | undefined): Set<number> {
	if (!value || value.trim().length === 0) {
		throw new Error("Missing TELEGRAM_ALLOWED_USER_IDS");
	}

	const ids = value
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.map((part) => Number.parseInt(part, 10));

	if (ids.length === 0 || ids.some((id) => !Number.isFinite(id) || id <= 0)) {
		throw new Error("Invalid TELEGRAM_ALLOWED_USER_IDS: expected comma-separated positive integers");
	}

	return new Set(ids);
}

function parseParseMode(value: string | undefined): TelegramParseMode {
	if (!value || value.trim().length === 0) {
		return "Markdown";
	}

	const normalized = value.trim().toLowerCase();
	switch (normalized) {
		case "none":
			return "none";
		case "markdown":
			return "Markdown";
		case "markdownv2":
			return "MarkdownV2";
		case "html":
			return "HTML";
		default:
			throw new Error(`Invalid TELEGRAM_PARSE_MODE: '${value}'`);
	}
}

function resolveEnvFilePath(env: NodeJS.ProcessEnv): string {
	const configuredPath = env.TELEGRAM_ENV_FILE?.trim();
	const filePath = configuredPath && configuredPath.length > 0 ? configuredPath : DEFAULT_ENV_FILE;
	return resolve(process.cwd(), filePath);
}

function parseDotEnvFile(content: string): Record<string, string> {
	const parsed: Record<string, string> = {};
	const lines = content.split(/\r?\n/);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) {
			continue;
		}

		const equalsIndex = line.indexOf("=");
		if (equalsIndex <= 0) {
			continue;
		}

		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();

		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
}

function mergeEnvWithDotenv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const envFilePath = resolveEnvFilePath(env);
	if (!existsSync(envFilePath)) {
		return env;
	}

	const parsed = parseDotEnvFile(readFileSync(envFilePath, "utf8"));
	return {
		...parsed,
		...env,
	};
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TelegramBotConfig {
	const mergedEnv = mergeEnvWithDotenv(env);

	const telegramBotToken = mergedEnv.TELEGRAM_BOT_TOKEN?.trim();
	if (!telegramBotToken) {
		throw new Error("Missing TELEGRAM_BOT_TOKEN");
	}

	const allowedUserIds = parseAllowedUserIds(mergedEnv.TELEGRAM_ALLOWED_USER_IDS);
	const piBin = mergedEnv.PI_BIN?.trim() || "pi";
	const piCwd = resolve(mergedEnv.PI_CWD?.trim() || process.cwd());
	const dataDir = resolve(mergedEnv.TELEGRAM_DATA_DIR?.trim() || join(process.cwd(), "data", "telegram-bot"));
	const sessionsDir = resolve(join(dataDir, "sessions"));

	return {
		telegramBotToken,
		allowedUserIds,
		piBin,
		piCwd,
		dataDir,
		sessionsDir,
		idleTtlMs: parsePositiveInteger(mergedEnv.TELEGRAM_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS, "TELEGRAM_IDLE_TTL_MS"),
		streamEditThrottleMs: parsePositiveInteger(
			mergedEnv.TELEGRAM_STREAM_EDIT_THROTTLE_MS,
			DEFAULT_STREAM_EDIT_THROTTLE_MS,
			"TELEGRAM_STREAM_EDIT_THROTTLE_MS",
		),
		parseMode: parseParseMode(mergedEnv.TELEGRAM_PARSE_MODE),
	};
}
