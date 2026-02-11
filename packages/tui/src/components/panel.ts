import type { Component } from "../tui.js";
import { truncateToWidth, visibleWidth } from "../utils.js";

export interface PanelOptions {
	maxWidth?: number;
}

/**
 * Panel component that renders content inside a Unicode box border.
 */
export class Panel implements Component {
	private lines: string[];
	private maxWidth?: number;

	constructor(lines: string[] = [], options: PanelOptions = {}) {
		this.lines = lines;
		this.maxWidth = options.maxWidth;
	}

	setLines(lines: string[]): void {
		this.lines = lines;
	}

	invalidate(): void {
		// No cached state
	}

	render(width: number): string[] {
		const availableWidth = Math.max(2, Math.min(width, this.maxWidth ?? width));
		const innerMaxWidth = Math.max(1, availableWidth - 2);

		let contentWidth = 1;
		for (const line of this.lines) {
			contentWidth = Math.max(contentWidth, Math.min(innerMaxWidth, visibleWidth(line)));
		}

		const top = `╭${"─".repeat(contentWidth)}╮`;
		const bottom = `╰${"─".repeat(contentWidth)}╯`;

		const body = this.lines.map((line) => {
			const clipped = truncateToWidth(line, contentWidth, "", true);
			return `│${clipped}│`;
		});

		return [top, ...body, bottom];
	}
}
