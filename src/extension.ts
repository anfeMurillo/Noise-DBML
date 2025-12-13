import * as vscode from 'vscode';
import { Parser } from '@dbml/core';
import { DbmlPreviewProvider } from './dbmlPreviewProvider';
import { DbmlCompletionItemProvider } from './dbmlCompletion';
import { DbmlDocumentFormatter } from './dbmlFormatter';
import { DbmlDefinitionProvider } from './dbmlDefinitionProvider';
import { generateSql, SqlGenerationOptions } from './sqlGenerator';
import { ParsedSchema } from './svgGenerator';

export function activate(context: vscode.ExtensionContext) {
	console.log('DBML Diagram Viewer extension is now active!');

	// Register the DBML preview provider
	const provider = new DbmlPreviewProvider(context.extensionUri);

	// Register completion item provider
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: 'dbml', scheme: 'file' },
			new DbmlCompletionItemProvider(),
			'[' // Trigger completion when '[' is typed, though usually snippets trigger on typing prefix
		)
	);

	// Register document formatting provider
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			{ language: 'dbml', scheme: 'file' },
			new DbmlDocumentFormatter()
		)
	);

	// Register definition provider (Go to Definition)
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ language: 'dbml', scheme: 'file' },
			new DbmlDefinitionProvider()
		)
	);

	// Register the command to open preview
	const disposable = vscode.commands.registerCommand('noise-dbml.openPreview', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		if (editor.document.languageId !== 'dbml') {
			vscode.window.showWarningMessage('This command only works with DBML files');
			return;
		}

		provider.showPreview(editor.document);
	});

	context.subscriptions.push(disposable);

	// Register the command to generate SQL
	const generateSqlCommand = vscode.commands.registerCommand('noise-dbml.generateSql', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		if (editor.document.languageId !== 'dbml') {
			vscode.window.showWarningMessage('This command only works with DBML files');
			return;
		}

		try {
			// Ask user to select SQL dialect
			const dialect = await vscode.window.showQuickPick(
				[
					{ label: 'PostgreSQL', value: 'postgresql' as const },
					{ label: 'MySQL', value: 'mysql' as const },
					{ label: 'SQLite', value: 'sqlite' as const },
					{ label: 'SQL Server', value: 'sqlserver' as const }
				],
				{
					placeHolder: 'Select SQL dialect',
					title: 'SQL Dialect'
				}
			);

			if (!dialect) {
				return; // User cancelled
			}

			// Ask if user wants DROP statements
			const includeDropStatements = await vscode.window.showQuickPick(
				[
					{ label: 'No', value: false },
					{ label: 'Yes', value: true }
				],
				{
					placeHolder: 'Include DROP TABLE statements?',
					title: 'Drop Statements'
				}
			);

			if (includeDropStatements === undefined) {
				return; // User cancelled
			}

			const dbmlContent = editor.document.getText();
			
			// Parse DBML
			let database: any;
			try {
				// @ts-ignore
				database = Parser.parse(dbmlContent, 'dbml');
			} catch (parseError: any) {
				if (parseError.diags && Array.isArray(parseError.diags)) {
					const messages = parseError.diags.map((d: any) => 
						`Line ${d.location?.start?.line}: ${d.message || d.error}`
					).join('\n');
					vscode.window.showErrorMessage(`DBML Parse Error:\n${messages}`);
				} else {
					vscode.window.showErrorMessage(`Failed to parse DBML: ${parseError.message}`);
				}
				console.error('Parse error:', parseError);
				return;
			}

			// Convert to ParsedSchema format
			try {
				const schema: ParsedSchema = {
					tables: database.schemas.flatMap((s: any) => 
						s.tables.map((t: any) => ({
							name: t.name,
							schema: s.name !== 'public' ? s.name : undefined,
							fields: t.fields.map((f: any) => ({
								name: f.name,
								type: f.type.type_name,
								pk: f.pk,
								unique: f.unique,
								notNull: f.not_null,
								increment: f.increment,
								note: f.note
							})),
							note: t.note
						}))
					),
					refs: database.schemas.flatMap((s: any) => 
						s.refs.map((r: any) => ({
							name: r.name,
							endpoints: r.endpoints.map((e: any) => ({
								tableName: e.tableName,
								fieldNames: e.fieldNames,
								relation: e.relation
							})),
							onDelete: r.onDelete,
							onUpdate: r.onUpdate
						}))
					),
					groups: []
				};

				// Generate SQL
				const options: SqlGenerationOptions = {
					dialect: dialect.value,
					includeDropStatements: includeDropStatements.value,
					includeIfNotExists: true,
					indentSize: 2
				};

				const sqlContent = generateSql(schema, options);

				// Create a new document with the SQL content
				const doc = await vscode.workspace.openTextDocument({
					content: sqlContent,
					language: 'sql'
				});

				await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
				vscode.window.showInformationMessage('SQL generated successfully!');
			} catch (conversionError: any) {
				vscode.window.showErrorMessage(`Failed to convert schema: ${conversionError.message}`);
				console.error('Conversion error:', conversionError);
				console.error('Database structure:', database);
			}

		} catch (error: any) {
			vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
			console.error('SQL generation error:', error);
		}
	});

	context.subscriptions.push(generateSqlCommand);

	// Watch for document save to update preview
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(document => {
			if (document.languageId === 'dbml') {
				void provider.updatePreview(document);
			}
		})
	);

	// Diagnostics
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dbml');
	context.subscriptions.push(diagnosticCollection);

	function refreshDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
		if (document.languageId !== 'dbml') {
			return;
		}

		const dbmlContent = document.getText();
		try {
			// @ts-ignore
			Parser.parse(dbmlContent, 'dbml');
			collection.delete(document.uri);
		} catch (e: any) {
			const diagnostics: vscode.Diagnostic[] = [];

			if (e.diags && Array.isArray(e.diags)) {
				e.diags.forEach((diag: any) => {
					const start = new vscode.Position(diag.location.start.line - 1, diag.location.start.column - 1);
					const end = new vscode.Position(diag.location.end.line - 1, diag.location.end.column - 1);
					const range = new vscode.Range(start, end);

					const diagnostic = new vscode.Diagnostic(
						range,
						diag.message,
						vscode.DiagnosticSeverity.Error
					);
					diagnostics.push(diagnostic);
				});
			} else if (e.location) {
				const start = new vscode.Position(e.location.start.line - 1, e.location.start.column - 1);
				const end = new vscode.Position(e.location.end.line - 1, e.location.end.column - 1);
				const range = new vscode.Range(start, end);
				const diagnostic = new vscode.Diagnostic(
					range,
					e.message || 'Syntax Error',
					vscode.DiagnosticSeverity.Error
				);
				diagnostics.push(diagnostic);
			}

			collection.set(document.uri, diagnostics);
		}
	}

	if (vscode.window.activeTextEditor) {
		refreshDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => {
			refreshDiagnostics(e.document, diagnosticCollection);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			refreshDiagnostics(doc, diagnosticCollection);
		})
	);
}

export function deactivate() {}
