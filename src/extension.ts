import * as vscode from 'vscode';
import { Parser } from '@dbml/core';
import { DbmlPreviewProvider } from './dbmlPreviewProvider';
import { DbmlCompletionItemProvider } from './dbmlCompletion';
import { DbmlDocumentFormatter } from './dbmlFormatter';
import { DbmlDefinitionProvider } from './dbmlDefinitionProvider';

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
