import * as vscode from 'vscode';
import { AntiPattern } from './antiPatternDetector';

export class AntiPatternPanel {
	private panel: vscode.WebviewPanel | undefined;

	constructor(private readonly extensionUri: vscode.Uri) { }

	public showAntiPatterns(patterns: AntiPattern[]): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
		} else {
			this.panel = vscode.window.createWebviewPanel(
				'dbmlAntiPatterns',
				'DBML Anti-Patterns',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});
		}

		this.panel.webview.html = this.getHtmlContent(patterns);
	}

	private getHtmlContent(patterns: AntiPattern[]): string {
		const errors = patterns.filter(p => p.type === 'error');
		const warnings = patterns.filter(p => p.type === 'warning');
		const infos = patterns.filter(p => p.type === 'info');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Anti-Pattern Detection Report</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 0;
			margin: 0;
		}

		.header {
			padding: 20px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background-color: var(--vscode-sideBar-background);
		}

		.header h1 {
			margin: 0 0 10px 0;
			font-size: 18px;
			font-weight: 600;
		}

		.summary {
			display: flex;
			gap: 20px;
			margin-top: 10px;
			font-size: 13px;
		}

		.summary-item {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.badge {
			padding: 2px 8px;
			border-radius: 10px;
			font-weight: 600;
			font-size: 11px;
		}

		.badge-error {
			background-color: var(--vscode-errorForeground);
			color: var(--vscode-editor-background);
		}

		.badge-warning {
			background-color: var(--vscode-notificationsWarningIcon-foreground);
			color: var(--vscode-editor-background);
		}

		.badge-info {
			background-color: var(--vscode-notificationsInfoIcon-foreground);
			color: var(--vscode-editor-background);
		}

		.content {
			padding: 20px;
		}

		.section {
			margin-bottom: 30px;
		}

		.section-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 15px;
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			user-select: none;
		}

		.section-header:hover {
			opacity: 0.8;
		}

		.icon {
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.icon-error {
			color: var(--vscode-errorForeground);
		}

		.icon-warning {
			color: var(--vscode-notificationsWarningIcon-foreground);
		}

		.icon-info {
			color: var(--vscode-notificationsInfoIcon-foreground);
		}

		.tree {
			margin-left: 10px;
		}

		.tree-item {
			margin-bottom: 15px;
			border-left: 2px solid var(--vscode-panel-border);
			padding-left: 15px;
		}

		.tree-item-header {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			cursor: pointer;
			padding: 8px;
			border-radius: 4px;
			transition: background-color 0.1s;
		}

		.tree-item-header:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.tree-item-header.expanded {
			background-color: var(--vscode-list-activeSelectionBackground);
		}

		.tree-item-icon {
			flex-shrink: 0;
			margin-top: 2px;
		}

		.tree-item-content {
			flex: 1;
		}

		.tree-item-message {
			font-weight: 500;
			margin-bottom: 4px;
		}

		.tree-item-location {
			font-size: 12px;
			opacity: 0.7;
		}

		.tree-item-details {
			margin-top: 10px;
			padding: 12px;
			background-color: transparent;
			border: 1px solid var(--vscode-widget-border); /* Changed from border-left to full border for better definition without background */
			border-radius: 3px;
			display: none;
		}

		.tree-item-details.visible {
			display: block;
		}

		.detail-section {
			margin-bottom: 12px;
		}

		.detail-section:last-child {
			margin-bottom: 0;
		}

		.detail-label {
			font-weight: 600;
			font-size: 12px;
			text-transform: uppercase;
			opacity: 0.7;
			margin-bottom: 4px;
		}

		.detail-text {
			font-size: 13px;
			line-height: 1.5;
		}

		.recommendation {
			color: var(--vscode-textLink-foreground);
		}

		.chevron {
			transition: transform 0.2s;
		}

		.chevron.expanded {
			transform: rotate(90deg);
		}

		.empty-state {
			text-align: center;
			padding: 60px 20px;
			color: var(--vscode-descriptionForeground);
		}

		.empty-state-icon {
			font-size: 48px;
			margin-bottom: 20px;
		}

		.empty-state-message {
			font-size: 16px;
			font-weight: 500;
			margin-bottom: 8px;
		}

		.empty-state-description {
			font-size: 13px;
			opacity: 0.7;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>Anti-Pattern Detection Report</h1>
		<div class="summary">
			<div class="summary-item">
				<span>Total Issues:</span>
				<span class="badge badge-error">${patterns.length}</span>
			</div>
			${errors.length > 0 ? `
			<div class="summary-item">
				<span>Errors:</span>
				<span class="badge badge-error">${errors.length}</span>
			</div>
			` : ''}
			${warnings.length > 0 ? `
			<div class="summary-item">
				<span>Warnings:</span>
				<span class="badge badge-warning">${warnings.length}</span>
			</div>
			` : ''}
			${infos.length > 0 ? `
			<div class="summary-item">
				<span>Info:</span>
				<span class="badge badge-info">${infos.length}</span>
			</div>
			` : ''}
		</div>
	</div>

	<div class="content">
		${patterns.length === 0 ? this.getEmptyState() : ''}
		${errors.length > 0 ? this.renderSection('ERRORS', errors, 'error') : ''}
		${warnings.length > 0 ? this.renderSection('WARNINGS', warnings, 'warning') : ''}
		${infos.length > 0 ? this.renderSection('INFORMATION', infos, 'info') : ''}
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function toggleItem(itemId) {
			const details = document.getElementById('details-' + itemId);
			const header = document.getElementById('header-' + itemId);
			const chevron = document.getElementById('chevron-' + itemId);
			
			if (details && header && chevron) {
				details.classList.toggle('visible');
				header.classList.toggle('expanded');
				chevron.classList.toggle('expanded');
			}
		}

		function toggleSection(sectionId) {
			const tree = document.getElementById('tree-' + sectionId);
			const chevron = document.getElementById('section-chevron-' + sectionId);
			
			if (tree && chevron) {
				tree.style.display = tree.style.display === 'none' ? 'block' : 'none';
				chevron.classList.toggle('expanded');
			}
		}
	</script>
</body>
</html>`;
	}

	private getEmptyState(): string {
		return `
		<div class="empty-state">
			<div class="empty-state-icon">✓</div>
			<div class="empty-state-message">No Anti-Patterns Detected</div>
			<div class="empty-state-description">Your schema appears to be well designed!</div>
		</div>
		`;
	}

	private renderSection(title: string, patterns: AntiPattern[], type: 'error' | 'warning' | 'info'): string {
		const iconClass = `icon-${type}`;
		const iconSymbol = type === 'error' ? '×' : type === 'warning' ? '⚠' : 'ⓘ';

		return `
		<div class="section">
			<div class="section-header" onclick="toggleSection('${type}')">
				<span class="chevron expanded" id="section-chevron-${type}">▶</span>
				<span class="icon ${iconClass}">${iconSymbol}</span>
				<span>${title} (${patterns.length})</span>
			</div>
			<div class="tree" id="tree-${type}">
				${patterns.map((pattern, index) => this.renderTreeItem(pattern, index, type)).join('')}
			</div>
		</div>
		`;
	}

	private renderTreeItem(pattern: AntiPattern, index: number, type: string): string {
		const itemId = `${type}-${index}`;
		const location = pattern.tableName
			? (pattern.fieldName ? `Table: ${pattern.tableName}, Field: ${pattern.fieldName}` : `Table: ${pattern.tableName}`)
			: '';

		return `
		<div class="tree-item">
			<div class="tree-item-header" id="header-${itemId}" onclick="toggleItem('${itemId}')">
				<span class="chevron" id="chevron-${itemId}">▶</span>
				<div class="tree-item-content">
					<div class="tree-item-message">${this.escapeHtml(pattern.message)}</div>
					${location ? `<div class="tree-item-location">${this.escapeHtml(location)}</div>` : ''}
				</div>
			</div>
			<div class="tree-item-details" id="details-${itemId}">
				<div class="detail-section">
					<div class="detail-label">Description</div>
					<div class="detail-text">${this.escapeHtml(pattern.description)}</div>
				</div>
				<div class="detail-section">
					<div class="detail-label">Recommendation</div>
					<div class="detail-text recommendation">${this.escapeHtml(pattern.recommendation)}</div>
				</div>
				${pattern.tableName ? `
				<div class="detail-section">
					<div class="detail-label">Location</div>
					<div class="detail-text">
						${pattern.tableName ? `Table: <strong>${this.escapeHtml(pattern.tableName)}</strong>` : ''}
						${pattern.fieldName ? `<br>Field: <strong>${this.escapeHtml(pattern.fieldName)}</strong>` : ''}
					</div>
				</div>
				` : ''}
			</div>
		</div>
		`;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}
