function timestamp(): string {
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	const ss = String(now.getSeconds()).padStart(2, "0");
	return `[${hh}:${mm}:${ss}]`;
}

function formatMeta(meta?: Record<string, unknown>): string {
	if (!meta) {
		return "";
	}

	const entries = Object.entries(meta)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}=${String(value)}`);

	if (entries.length === 0) {
		return "";
	}

	return ` ${entries.join(" ")}`;
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
	console.log(`${timestamp()} [telegram-bot] ${message}${formatMeta(meta)}`);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
	console.warn(`${timestamp()} [telegram-bot] WARN ${message}${formatMeta(meta)}`);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
	console.error(`${timestamp()} [telegram-bot] ERROR ${message}${formatMeta(meta)}`);
}
