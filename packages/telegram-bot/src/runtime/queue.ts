export class SerialQueue {
	private tail: Promise<void> = Promise.resolve();
	private pendingCount = 0;

	enqueue<T>(task: () => Promise<T>): Promise<T> {
		this.pendingCount += 1;

		const run = async (): Promise<T> => {
			try {
				return await task();
			} finally {
				this.pendingCount -= 1;
			}
		};

		const result = this.tail.then(run, run);
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);

		return result;
	}

	isIdle(): boolean {
		return this.pendingCount === 0;
	}
}
