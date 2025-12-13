import * as vscode from 'vscode';

export class DbmlDocumentFormatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits: vscode.TextEdit[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        let insideTable = false;
        let tableStartIndex = -1;
        let tableLines: { index: number; parts: string[] }[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.toLowerCase().startsWith('table ')) {
                insideTable = true;
                tableStartIndex = i;
                continue;
            }

            if (insideTable) {
                if (trimmedLine === '}') {
                    // End of table, process the collected lines
                    if (tableLines.length > 0) {
                        this.formatTableLines(document, tableLines, edits, options);
                    }
                    insideTable = false;
                    tableLines = [];
                } else if (trimmedLine && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('Note:')) {
                    // Process column definition line
                    // Simple regex to capture: name type [settings]
                    // This is a simplified parser and might need refinement
                    // DBML column: name type [settings]
                    // We split by whitespace but need to handle settings which might contain spaces
                    
                    const parts = this.parseColumnLine(trimmedLine);
                    if (parts) {
                        tableLines.push({ index: i, parts });
                    }
                }
            }
        }

        return edits;
    }

    private parseColumnLine(line: string): string[] | null {
        // Regex to match: name type [settings]
        // Name can be quoted "name" or simple name
        // Type is everything between name and settings
        // Settings is optional, enclosed in [] at the end
        
        const settingsMatch = line.match(/\[(.*?)\]$/);
        let settings = '';
        let content = line;

        if (settingsMatch) {
            settings = settingsMatch[0];
            content = line.substring(0, settingsMatch.index).trim();
        }

        // Match name and type
        // Name: "something" or something
        const match = content.match(/^(".*?"|\S+)\s+(.+)$/);
        
        if (!match) {
            return null;
        }

        const name = match[1];
        const type = match[2];
        
        const parts = [name, type];
        if (settings) {
            parts.push(settings);
        }
        return parts;
    }

    private formatTableLines(
        document: vscode.TextDocument, 
        lines: { index: number; parts: string[] }[], 
        edits: vscode.TextEdit[],
        options: vscode.FormattingOptions
    ) {
        // Calculate max width for name column across all lines
        const maxNameLength = Math.max(...lines.map(l => l.parts[0].length));
        
        // Only calculate max type length for lines that have settings (brackets)
        // This prevents unnecessary spacing on lines without brackets
        const linesWithSettings = lines.filter(l => l.parts.length > 2);
        const maxTypeLength = linesWithSettings.length > 0 
            ? Math.max(...linesWithSettings.map(l => l.parts[1].length))
            : 0;

        // Get indentation based on editor options
        const indentation = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

        for (const line of lines) {
            const parts = line.parts;
            const name = parts[0];
            const type = parts[1];
            const settings = parts[2] || '';

            // Construct formatted line with aligned brackets
            const formattedLine = settings
                ? `${indentation}${name.padEnd(maxNameLength)} ${type.padEnd(maxTypeLength)} ${settings}`
                : `${indentation}${name.padEnd(maxNameLength)} ${type}`;

            const originalLine = document.lineAt(line.index);
            edits.push(vscode.TextEdit.replace(originalLine.range, formattedLine));
        }
    }
}
