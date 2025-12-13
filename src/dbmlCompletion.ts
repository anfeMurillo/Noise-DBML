import * as vscode from 'vscode';

export class DbmlCompletionItemProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        
        // Check if we are inside a settings block [ ... ]
        // We look for the last '[' and ']' before the cursor.
        // If last '[' is after last ']', we are inside.
        const lastOpen = linePrefix.lastIndexOf('[');
        const lastClose = linePrefix.lastIndexOf(']');
        
        const isInsideSettings = lastOpen > lastClose;

        const items: vscode.CompletionItem[] = [];

        if (isInsideSettings) {
            // Inline snippets
            const oto = new vscode.CompletionItem('oto', vscode.CompletionItemKind.Snippet);
            oto.detail = 'Inline One-to-one Reference';
            oto.insertText = new vscode.SnippetString('ref: - ${1:table}.${2:column}');
            oto.documentation = new vscode.MarkdownString('Creates an inline one-to-one reference: `[ref: - table.column]`');
            items.push(oto);

            const otm = new vscode.CompletionItem('otm', vscode.CompletionItemKind.Snippet);
            otm.detail = 'Inline One-to-many Reference';
            otm.insertText = new vscode.SnippetString('ref: < ${1:table}.${2:column}');
            otm.documentation = new vscode.MarkdownString('Creates an inline one-to-many reference: `[ref: < table.column]`');
            items.push(otm);

            const mto = new vscode.CompletionItem('mto', vscode.CompletionItemKind.Snippet);
            mto.detail = 'Inline Many-to-one Reference';
            mto.insertText = new vscode.SnippetString('ref: > ${1:table}.${2:column}');
            mto.documentation = new vscode.MarkdownString('Creates an inline many-to-one reference: `[ref: > table.column]`');
            items.push(mto);
        } else {
            // Top-level snippets
            const oto = new vscode.CompletionItem('oto', vscode.CompletionItemKind.Snippet);
            oto.detail = 'One-to-one Reference';
            oto.insertText = new vscode.SnippetString('Ref: ${1:table1}.${2:column1} - ${3:table2}.${4:column2}');
            oto.documentation = new vscode.MarkdownString('Creates a top-level one-to-one reference block');
            items.push(oto);

            const otm = new vscode.CompletionItem('otm', vscode.CompletionItemKind.Snippet);
            otm.detail = 'One-to-many Reference';
            otm.insertText = new vscode.SnippetString('Ref: ${1:table1}.${2:column1} < ${3:table2}.${4:column2}');
            otm.documentation = new vscode.MarkdownString('Creates a top-level one-to-many reference block');
            items.push(otm);

            const mto = new vscode.CompletionItem('mto', vscode.CompletionItemKind.Snippet);
            mto.detail = 'Many-to-one Reference';
            mto.insertText = new vscode.SnippetString('Ref: ${1:table1}.${2:column1} > ${3:table2}.${4:column2}');
            mto.documentation = new vscode.MarkdownString('Creates a top-level many-to-one reference block');
            items.push(mto);

            const mtm = new vscode.CompletionItem('mtm', vscode.CompletionItemKind.Snippet);
            mtm.detail = 'Many-to-many Join Table';
            mtm.insertText = new vscode.SnippetString(
                'Table ${1:join_table} {\n' +
                '  ${2:table1}_id int [ref: > ${2:table1}.id]\n' +
                '  ${3:table2}_id int [ref: > ${3:table2}.id]\n' +
                '  indexes {\n' +
                '    (${2:table1}_id, ${3:table2}_id) [pk]\n' +
                '  }\n' +
                '}'
            );
            mtm.documentation = new vscode.MarkdownString('Creates a join table for many-to-many relationship');
            items.push(mtm);
        }

        return items;
    }
}
