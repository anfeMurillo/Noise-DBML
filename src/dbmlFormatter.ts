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
        // Calculate max width for each column
        const maxNameLength = Math.max(...lines.map(l => l.parts[0].length));
        const maxTypeLength = Math.max(...lines.map(l => l.parts[1].length));

        for (const line of lines) {
            const parts = line.parts;
            const name = parts[0];
            const type = parts[1];
            const settings = parts[2] || '';

            // Construct formatted line
            // We use tabs or spaces based on options? 
            // The user asked for "tabulacion para alinear", which implies alignment.
            // We will align using spaces to ensure visual alignment regardless of tab size, 
            // or use tabs if insertSpaces is false?
            // Usually alignment is done with spaces to be consistent.
            // But if the user specifically asked for "tabulacion", maybe they want tabs?
            // "Tabulacion" in Spanish can mean "Tabulation" (using tabs) or just "Alignment".
            // Given "alinear el texto", I will assume visual alignment.
            // Using spaces is safer for alignment.
            
            // However, indentation should follow options.
            const indentation = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
            
            let formattedLine = `${indentation}${name.padEnd(maxNameLength)} ${type}`;
            
            if (settings) {
                formattedLine = `${indentation}${name.padEnd(maxNameLength)} ${type.padEnd(maxTypeLength)} ${settings}`;
            } else {
                 formattedLine = `${indentation}${name.padEnd(maxNameLength)} ${type}`;
            }

            const originalLine = document.lineAt(line.index);
            edits.push(vscode.TextEdit.replace(originalLine.range, formattedLine));
        }
    }
}
