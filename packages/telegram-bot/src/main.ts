#!/usr/bin/env node

import { mkdir } from "fs/promises";
import { loadConfig } from "./config.js";
import { logError, logInfo } from "./log.js";
import { AgentPool } from "./runtime/agent-pool.js";
import { PiProcessRuntime } from "./runtime/agent-runtime.js";
import { SessionPathManager } from "./storage/session-path.js";
import { TelegramBotApp, TelegramLongPollingTransport } from "./telegram.js";

const config = loadConfig();

await mkdir(config.sessionsDir, { recursive: true });

const sessionPaths = new SessionPathManager(config.sessionsDir);
const runtimeFactory = {
	create: (_chatId: string, sessionPath: string) =>
		new PiProcessRuntime({
			piBin: config.piBin,
			sessionPath,
			cwd: config.piCwd,
		}),
};

const pool = new AgentPool({
	idleTtlMs: config.idleTtlMs,
	runtimeFactory,
	sessionPaths,
});

const transport = new TelegramLongPollingTransport(config.telegramBotToken, config.parseMode);
const app = new TelegramBotApp({
	config,
	transport,
	pool,
});

logInfo("starting", {
	piBin: config.piBin,
	piCwd: config.piCwd,
	sessionsDir: config.sessionsDir,
	allowedUsers: config.allowedUserIds.size,
	parseMode: config.parseMode,
});

const shutdown = async (): Promise<void> => {
	logInfo("shutdown requested");
	await app.stop();
	await pool.dispose();
	process.exit(0);
};

process.on("SIGINT", () => {
	void shutdown();
});

process.on("SIGTERM", () => {
	void shutdown();
});

try {
	await app.start();
} catch (error) {
	logError("fatal startup error", {
		error: error instanceof Error ? error.message : String(error),
	});
	process.exit(1);
}
