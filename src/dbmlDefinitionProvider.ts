import * as vscode from 'vscode';

export class DbmlDefinitionProvider implements vscode.DefinitionProvider {
	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);
		const line = document.lineAt(position.line).text;

		// Check if we're in a reference context
		// Patterns to detect:
		// 1. Ref: table.column < other_table.column
		// 2. [ref: > table.column]
		// 3. TableGroup name { table1, table2 }
		
		const isInRef = line.includes('Ref:') || line.includes('ref:');
		const isInTableGroup = this.isInTableGroup(document, position);

		if (!isInRef && !isInTableGroup) {
			return null;
		}

		// Find the table definition
		const tableDefinition = this.findTableDefinition(document, word);
		
		if (tableDefinition) {
			return new vscode.Location(document.uri, tableDefinition);
		}

		return null;
	}

	private isInTableGroup(document: vscode.TextDocument, position: vscode.Position): boolean {
		// Look backwards to see if we're inside a TableGroup block
		for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
			const line = document.lineAt(i).text.trim();
			if (line.startsWith('TableGroup')) {
				// Check if we're before the closing brace
				for (let j = i; j <= Math.min(document.lineCount - 1, position.line + 5); j++) {
					const checkLine = document.lineAt(j).text;
					if (j === position.line) {
						return true;
					}
					if (checkLine.includes('}')) {
						return false;
					}
				}
			}
		}
		return false;
	}

	private findTableDefinition(document: vscode.TextDocument, tableName: string): vscode.Range | null {
		const text = document.getText();
		const lines = text.split('\n');

		// Pattern to match table definitions: Table tableName {
		const tableRegex = new RegExp(`^\\s*Table\\s+${this.escapeRegex(tableName)}\\s*{`, 'i');
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (tableRegex.test(line)) {
				// Find the position of the table name
				const match = line.match(new RegExp(`\\b${this.escapeRegex(tableName)}\\b`, 'i'));
				if (match && match.index !== undefined) {
					const startPos = new vscode.Position(i, match.index);
					const endPos = new vscode.Position(i, match.index + tableName.length);
					return new vscode.Range(startPos, endPos);
				}
			}
		}

		return null;
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
