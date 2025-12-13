import { reverseEngineerToDbml, SupportedDb } from './dbmlReverseEngineer';
import * as vscode from 'vscode';
import { DbmlPreviewProvider } from './dbmlPreviewProvider';
import { DbmlCompletionItemProvider } from './dbmlCompletion';
import { DbmlDocumentFormatter } from './dbmlFormatter';
import { DbmlDefinitionProvider } from './dbmlDefinitionProvider';
import { generateSql, SqlGenerationOptions } from './sqlGenerator';
import { AntiPatternDetector } from './antiPatternDetector';
import { AntiPatternPanel } from './antiPatternPanel';
import { dbmlParser } from './core/DbmlParser';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogLevel } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { Validators } from './utils/Validators';

/**
 * Activa la extensión Noise-DBML
 */
export function activate(context: vscode.ExtensionContext) {
	// Configure logger
	logger.setMinLevel(LogLevel.INFO);
	logger.info('Activating Noise-DBML extension', 'Extension');

	// Register providers
	const previewProvider = new DbmlPreviewProvider(context.extensionUri);
	const antiPatternPanel = new AntiPatternPanel(context.extensionUri);

	// Register all commands
	registerCommands(context, previewProvider, antiPatternPanel);

	// Register language providers
	registerLanguageProviders(context);

	// Setup diagnostics
	setupDiagnostics(context);

	// Watch for document save
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(document => {
			if (document.languageId === 'dbml') {
				void previewProvider.updatePreview(document);
			}
		})
	);

	logger.info('Noise-DBML extension activated successfully', 'Extension');
}

/**
 * Registra todos los comandos de la extensión
 */
function registerCommands(
	context: vscode.ExtensionContext,
	previewProvider: DbmlPreviewProvider,
	antiPatternPanel: AntiPatternPanel
): void {
	// Preview command
	context.subscriptions.push(
		vscode.commands.registerCommand('noise-dbml.openPreview', () => {
			const editor = vscode.window.activeTextEditor;
			if (!validateActiveEditor(editor, 'dbml')) {
				return;
			}
			previewProvider.showPreview(editor!.document);
		})
	);

	// SQL generation command
	context.subscriptions.push(
		vscode.commands.registerCommand('noise-dbml.generateSql', () => handleGenerateSql())
	);

	// Anti-pattern detection command
	context.subscriptions.push(
		vscode.commands.registerCommand('noise-dbml.detectAntiPatterns', () =>
			handleDetectAntiPatterns(antiPatternPanel)
		)
	);

	// Reverse engineering command
	context.subscriptions.push(
		vscode.commands.registerCommand('noise-dbml.reverseEngineerDb', () => handleReverseEngineer())
	);
}

/**
 * Registra los language providers
 */
function registerLanguageProviders(context: vscode.ExtensionContext): void {
	const dbmlSelector = { language: 'dbml', scheme: 'file' };

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			dbmlSelector,
			new DbmlCompletionItemProvider(),
			'['
		),
		vscode.languages.registerDocumentFormattingEditProvider(
			dbmlSelector,
			new DbmlDocumentFormatter()
		),
		vscode.languages.registerDefinitionProvider(
			dbmlSelector,
			new DbmlDefinitionProvider()
		)
	);
}

/**
 * Valida que hay un editor activo con el lenguaje correcto
 */
function validateActiveEditor(editor: vscode.TextEditor | undefined, languageId: string): boolean {
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found');
		return false;
	}

	if (editor.document.languageId !== languageId) {
		vscode.window.showWarningMessage(`This command only works with ${languageId.toUpperCase()} files`);
		return false;
	}

	return true;
}

/**
 * Maneja el comando de generación de SQL
 */
async function handleGenerateSql(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!validateActiveEditor(editor, 'dbml')) {
		return;
	}

	try {
		logger.info('Starting SQL generation', 'GenerateSQL');

		// Select dialect
		const dialect = await vscode.window.showQuickPick(
			[
				{ label: 'PostgreSQL', value: 'postgresql' as const },
				{ label: 'MySQL', value: 'mysql' as const },
				{ label: 'SQLite', value: 'sqlite' as const }
			],
			{ placeHolder: 'Select SQL dialect', title: 'SQL Dialect' }
		);

		if (!dialect) {
			return;
		}

		// Ask for DROP statements
		const includeDropStatements = await vscode.window.showQuickPick(
			[
				{ label: 'No', value: false },
				{ label: 'Yes', value: true }
			],
			{ placeHolder: 'Include DROP TABLE statements?', title: 'Drop Statements' }
		);

		if (includeDropStatements === undefined) {
			return;
		}

		// Ask for saving to docs folder
		const saveToDocsFolder = await vscode.window.showQuickPick(
			[
				{ label: 'Open in editor', value: false },
				{ label: 'Save to docs folder', value: true }
			],
			{ placeHolder: 'How to output the SQL?', title: 'Output Method' }
		);

		if (saveToDocsFolder === undefined) {
			return;
		}

		// Parse DBML using centralized parser
		const { schema, indexes } = await dbmlParser.parse(editor!.document.getText(), {
			stripIndexes: true,
			validateSchema: true
		});

		schema.indexes = indexes;

		// Generate SQL
		const options: SqlGenerationOptions = {
			dialect: dialect.value,
			includeDropStatements: includeDropStatements.value,
			includeIfNotExists: true,
			indentSize: 2,
			separateBySchema: saveToDocsFolder.value
		};

		const sqlResult = generateSql(schema, options);

		if (saveToDocsFolder.value) {
			   // Save to engine-named folder in workspace root
			   const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor!.document.uri);
			   if (!workspaceFolder) {
				   vscode.window.showErrorMessage('No workspace folder found');
				   return;
			   }

			   const engineFolder = path.join(workspaceFolder.uri.fsPath, dialect.value);

			   // Remove existing engine folder (to avoid leaving obsolete files)
			   try {
				   await fs.rm(engineFolder, { recursive: true, force: true });
			   } catch (e) {
				   // Ignore if doesn't exist
			   }

			   // Create engine folder
			   await fs.mkdir(engineFolder, { recursive: true });

			   // Write files
			   const sqlFiles = sqlResult as Map<string, string>;
			   for (const [fileName, content] of sqlFiles) {
				   const filePath = path.join(engineFolder, fileName);
				   await fs.writeFile(filePath, content, 'utf8');
			   }

			   vscode.window.showInformationMessage(`SQL files generated in '${dialect.value}' folder (${sqlFiles.size} files)`);
		} else {
			// Open in editor
			const sqlContent = sqlResult as string;
			const doc = await vscode.workspace.openTextDocument({
				content: sqlContent,
				language: 'sql'
			});

			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
			vscode.window.showInformationMessage('SQL generated successfully');
		}
		logger.info('SQL generated successfully', 'GenerateSQL');

	} catch (error: any) {
		const normalized = ErrorHandler.normalize(error);
		logger.error('Error generando SQL', 'GenerateSQL', { error: normalized.message });
		vscode.window.showErrorMessage(normalized.getUserMessage());
	}
}

/**
 * Maneja el comando de detección de anti-patterns
 */
async function handleDetectAntiPatterns(antiPatternPanel: AntiPatternPanel): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!validateActiveEditor(editor, 'dbml')) {
		return;
	}

	try {
		logger.info('Starting anti-pattern detection', 'AntiPattern');

		// Parse DBML
		const { schema, indexes } = await dbmlParser.parse(editor!.document.getText(), {
			stripIndexes: true,
			validateSchema: true
		});

		schema.indexes = indexes;

		// Detect anti-patterns
		const detector = new AntiPatternDetector();
		const patterns = detector.detect(schema);

		// Show report
		antiPatternPanel.showAntiPatterns(patterns);

		// Summary notification
		if (patterns.length === 0) {
			vscode.window.showInformationMessage('No anti-patterns detected in the schema');
		} else {
			const errors = patterns.filter(p => p.type === 'error').length;
			const warnings = patterns.filter(p => p.type === 'warning').length;
			const infos = patterns.filter(p => p.type === 'info').length;
			vscode.window.showInformationMessage(
				`Detected ${patterns.length} issue(s): ${errors} error(s), ${warnings} warning(s), ${infos} info`
			);
		}

		logger.info(`Detection completed: ${patterns.length} patterns found`, 'AntiPattern');

	} catch (error: any) {
		const normalized = ErrorHandler.normalize(error);
		logger.error('Error detectando anti-patterns', 'AntiPattern', { error: normalized.message });
		vscode.window.showErrorMessage(normalized.getUserMessage());
	}
}

/**
 * Maneja el comando de reverse engineering
 */
async function handleReverseEngineer(): Promise<void> {
	try {
		logger.info('Starting reverse engineering', 'ReverseEngineer');

		// Select database type
		const dbTypePick = await vscode.window.showQuickPick([
			{ label: 'PostgreSQL', value: 'postgres' as SupportedDb },
			{ label: 'MySQL', value: 'mysql' as SupportedDb },
			{ label: 'SQLite', value: 'sqlite' as SupportedDb }
		], {
			placeHolder: 'Select database type',
			title: 'Database Type'
		});

		if (!dbTypePick) {
			return;
		}

		// Get connection string
		const connString = await getConnectionString(dbTypePick.value);
		if (!connString) {
			return;
		}

		// Validate connection string
		const validation = validateConnectionString(dbTypePick.value, connString);
		if (!validation.isValid) {
			vscode.window.showErrorMessage(
				validation.error + '\n\n' + (validation.suggestions?.join('\n') || '')
			);
			return;
		}

		// Execute reverse engineering with progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Reverse engineering database...',
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 10, message: 'Connecting to database...' });
			const dbml = await reverseEngineerToDbml({ type: dbTypePick.value, connectionString: connString });

			progress.report({ increment: 80, message: 'Creating DBML file...' });
			const doc = await vscode.workspace.openTextDocument({ content: dbml, language: 'dbml' });
			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

			progress.report({ increment: 10, message: 'Complete!' });
		});

		vscode.window.showInformationMessage('DBML generated successfully from database');
		logger.info('Reverse engineering completed', 'ReverseEngineer');

	} catch (error: any) {
		const normalized = ErrorHandler.normalize(error);
		logger.error('Error en reverse engineering', 'ReverseEngineer', { error: normalized.message });
		vscode.window.showErrorMessage(normalized.getUserMessage());
	}
}

/**
 * Gets connection string based on database type
 */
async function getConnectionString(dbType: SupportedDb): Promise<string | undefined> {
	if (dbType === 'sqlite') {
		const sqliteType = await vscode.window.showQuickPick([
			{ label: 'Local File', value: 'local' },
			{ label: 'Online (SQLite Cloud)', value: 'online' }
		], {
			placeHolder: 'Select SQLite database location',
			title: 'SQLite Type'
		});

		if (!sqliteType) {
			return undefined;
		}

		if (sqliteType.value === 'local') {
			const fileUri = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: 'Select SQLite database file',
				filters: { 'SQLite DB': ['db', 'sqlite', 'sqlite3'] }
			});
			return fileUri?.[0]?.fsPath;
		} else {
			return await vscode.window.showInputBox({
				prompt: 'Enter SQLite Cloud connection string',
				ignoreFocusOut: true,
				placeHolder: 'sqlitecloud://... or https://...'
			});
		}
	}

	const placeholder = dbType === 'postgres'
		? 'postgresql://user:password@host:port/database'
		: 'mysql://user:password@host:port/database';

	return await vscode.window.showInputBox({
		prompt: 'Enter database connection string',
		ignoreFocusOut: true,
		placeHolder: placeholder
	});
}

/**
 * Validates a connection string
 */
function validateConnectionString(dbType: SupportedDb, connString: string) {
	switch (dbType) {
		case 'postgres':
			return Validators.validatePostgresConnectionString(connString);
		case 'mysql':
			return Validators.validateMysqlConnectionString(connString);
		case 'sqlite':
			return Validators.validateSqlitePath(connString);
		default:
			return { isValid: true };
	}
}

/**
 * Sets up the diagnostics system
 */
function setupDiagnostics(context: vscode.ExtensionContext): void {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dbml');
	context.subscriptions.push(diagnosticCollection);

	async function refreshDiagnostics(document: vscode.TextDocument) {
		if (document.languageId !== 'dbml') { return; }

		try {
			// Try to parse document
			await dbmlParser.parse(document.getText(), { stripIndexes: true });
			diagnosticCollection.delete(document.uri);
		} catch (error: any) {
			const diagnostics: vscode.Diagnostic[] = [];
			const normalized = ErrorHandler.normalize(error);

			// Create diagnostic
			const range = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(0, 0)
			);

			const diagnostic = new vscode.Diagnostic(
				range,
				normalized.message,
				vscode.DiagnosticSeverity.Error
			);

			diagnostics.push(diagnostic);
			diagnosticCollection.set(document.uri, diagnostics);
		}
	}

	// Refresh on various events
	if (vscode.window.activeTextEditor) {
		void refreshDiagnostics(vscode.window.activeTextEditor.document);
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => void refreshDiagnostics(e.document)),
		vscode.workspace.onDidOpenTextDocument(doc => void refreshDiagnostics(doc))
	);
}

/**
 * Desactiva la extensión
 */
export function deactivate() {
	logger.info('Deactivating Noise-DBML extension', 'Extension');
	dbmlParser.clearCache();
}
