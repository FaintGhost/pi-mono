const SUPERGROUP_PREFIX = "supergroup-";
const TOPIC_SEPARATOR = "-topic-";
const GENERAL_TOPIC_ID = "general";

export function buildSupergroupTopicContextKey(chatId: string, messageThreadId: number | null): string {
	const topicId = messageThreadId === null ? GENERAL_TOPIC_ID : `${messageThreadId}`;
	return `${SUPERGROUP_PREFIX}${chatId}${TOPIC_SEPARATOR}${topicId}`;
}

export function parseSupergroupTopicContextKey(
	contextId: string,
): { chatId: string; messageThreadId: number | null } | null {
	if (!contextId.startsWith(SUPERGROUP_PREFIX)) {
		return null;
	}

	const separatorIndex = contextId.lastIndexOf(TOPIC_SEPARATOR);
	if (separatorIndex <= SUPERGROUP_PREFIX.length - 1) {
		return null;
	}

	const chatId = contextId.slice(SUPERGROUP_PREFIX.length, separatorIndex);
	const rawThreadId = contextId.slice(separatorIndex + TOPIC_SEPARATOR.length);
	if (!chatId) {
		return null;
	}

	if (rawThreadId === GENERAL_TOPIC_ID) {
		return {
			chatId,
			messageThreadId: null,
		};
	}

	const messageThreadId = Number.parseInt(rawThreadId, 10);
	if (!Number.isFinite(messageThreadId) || messageThreadId <= 0) {
		return null;
	}

	return {
		chatId,
		messageThreadId,
	};
}
