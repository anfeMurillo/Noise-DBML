import * as vscode from 'vscode';
import { DbmlPreviewProvider } from './dbmlPreviewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('DBML Diagram Viewer extension is now active!');

	// Register the DBML preview provider
	const provider = new DbmlPreviewProvider(context.extensionUri);

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
}

export function deactivate() {}
