import { type Component, Panel, truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import { theme } from "../theme/theme.js";

function getDisplayPath(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && cwd.startsWith(home)) {
		return `~${cwd.slice(home.length)}`;
	}
	return cwd;
}

/**
 * Codex-style startup header with model and directory metadata.
 */
export class StartupHeaderComponent implements Component {
	private panel = new Panel();

	constructor(
		private session: AgentSession,
		private version: string,
	) {}

	invalidate(): void {
		this.panel.invalidate();
	}

	render(width: number): string[] {
		const modelId = this.session.state.model?.id ?? "no-model";
		const thinking = this.session.state.model?.reasoning
			? this.session.state.thinkingLevel === "off"
				? "off"
				: this.session.state.thinkingLevel
			: "off";
		const modelLine = `model:     ${modelId} ${theme.fg("muted", thinking)}   ${theme.fg("muted", "/model to change")}`;
		const cwdLine = `directory: ${getDisplayPath(process.cwd())}`;

		const panelLines = [theme.bold(`>_ pi (v${this.version})`), "", modelLine, cwdLine];

		// Keep card from becoming too wide on large terminals.
		this.panel.setLines(panelLines);
		const panelLinesRendered = this.panel.render(Math.min(width, 72));

		const tip = `${theme.fg("muted", "Tip:")} ${truncateToWidth("? for shortcuts • /model to switch model", Math.max(1, width - 5), "")}`;

		return [...panelLinesRendered, "", `  ${tip}`];
	}
}
