import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { json } from 'stream/consumers';

type Ctx = {
	documentUri: vscode.Uri | undefined,
	extensionContext: vscode.ExtensionContext,
	decorations: Decorations,
	proofInfo: any,
};

function ctxEditor(ctx: Ctx): vscode.TextEditor | undefined {
	return vscode.window.visibleTextEditors.find((editor) => {
		return ctx.documentUri === editor.document.uri;
	});
}

type Decorations = {
	currentPoofNode: vscode.TextEditorDecorationType,
};

export function activate(context: vscode.ExtensionContext) {
	const decorationCurrentProofNode = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'var(--vscode-textBlockQuote-background)',
	});

	let ctx: Ctx = {
		documentUri: vscode.window.activeTextEditor?.document.uri,
		extensionContext: context,
		decorations: {
			currentPoofNode: decorationCurrentProofNode,
		},
		proofInfo: {},
	};

	const evaluator = vscode.commands.registerCommand('nuprl.evaluator', () => {
		const panel = vscode.window.createWebviewPanel(
			'nuprl_evaluator_view',
			'Nuprl Evaluator',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true
			}
		);

		panel.webview.html = evaluatorHtml(context, panel.webview);

		// FIXME: dispose
		panel.webview.onDidReceiveMessage((message) => {
			if (message.command === 'reduce') {
					let args = ['reduce'];
				
					if (message.maxSteps || message.maxSteps === 0) {
						args.push('-s', message.maxSteps.toString());
					}

					const workingPath = getWorkingPath();
					if (workingPath) {
						args.push('-l', workingPath);
						
						const editor = getActiveEditor();
						if (editor) {
							const filePath = editor.document.uri.fsPath;
							args.push('-f', filePath);
						}
					}

					const nuprl = child_process.spawnSync('nuprl', args, {
						encoding : 'utf8',
						input: message.expr
					});

					const reduceResult = JSON.parse(nuprl.stdout);

					panel.webview.postMessage({
						command: 'display_reduced',
						original: reduceResult.result?.original,
						reduced: reduceResult.result?.reduced
					});

					// FIXME: do something with `reduceResult.errors`

					// if (reduceResult.errors) {
					// 	vscode.window.showErrorMessage('Error evaluating expression');
					// }
			}
		});
	});

	context.subscriptions.push(evaluator);

	const proofView = vscode.commands.registerCommand('nuprl.proof_view', () => {
		const panel = vscode.window.createWebviewPanel(
			'nuprl_proof_view',
			'Nuprl Proof View',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true
			}
		);

		panel.webview.html = proofViewHtml(context, panel.webview);

		if (vscode.window.activeTextEditor) {
			ctx.documentUri = vscode.window.activeTextEditor.document.uri;

			let newProofInfo = syncProof(
				vscode.window.activeTextEditor.document.fileName,
				vscode.window.activeTextEditor.document.getText()
			);

			if (newProofInfo) {
				ctx.proofInfo = newProofInfo;
				updateProofView(ctx, vscode.window.activeTextEditor, panel.webview);
			}
		}

		vscode.window.onDidChangeActiveTextEditor((editor) => {
			const document = editor?.document;
			if (document) {
				let newProofInfo = syncProof(document.fileName, document.getText());

				if (newProofInfo) {
					ctx.proofInfo = newProofInfo;
	
					ctx.documentUri = document.uri;
					updateProofView(ctx, editor, panel.webview);
				}
			}
		});

		// FIXME: dispose
		const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
			let newProofInfo = syncProof(document.fileName, document.getText());
			
			if (newProofInfo) {
				ctx.proofInfo = newProofInfo;

				const savedEditor = vscode.window.visibleTextEditors.find((editor) => {
					return document.uri === editor.document.uri;
				});

				if (savedEditor) {
					ctx.documentUri = savedEditor.document.uri;
					updateProofView(ctx, savedEditor, panel.webview);
				}
			}
		});

		// FIXME: dispose
		const selectionChangeHandler = vscode.window.onDidChangeTextEditorSelection((event) => {
			updateProofView(ctx, event.textEditor, panel.webview);
		});

		// FIXME: dispose
		const messageHandler = panel.webview.onDidReceiveMessage((message) => {
			if (message.command === 'jump_to_proof_node') {
				const objId = message.objId;
				const nodeId = message.nodeId;

				if (ctx.proofInfo && ctx.proofInfo.result) {
					const objMeta = ctx.proofInfo.result.meta[objId];

					if (objMeta && typeof objMeta.kind === 'object' && objMeta.kind.thm) {
						const proofNodeMeta = objMeta.kind.thm.nodes[nodeId];
						const position = new vscode.Position(
							proofNodeMeta.span.visual.start.line,
							proofNodeMeta.span.visual.start.col
						);

						// FIXME: make sure this is the same editor as the one the proof is
						// actually written in
						const editor = ctxEditor(ctx);
						if (editor) {
							editor.selections = [
								new vscode.Selection(position, position)
							];
							editor.revealRange(
								new vscode.Range(position, position),
								vscode.TextEditorRevealType.InCenter
							);
						}
					}
				}
			} else if (message.command === 'next_hole') {
				const editor = ctxEditor(ctx);
				if (editor) {
					const cursorPos = editor.selection.active;

					if (ctx.proofInfo && ctx.proofInfo.result) {
						const holes = getHoleSpans(ctx, editor);
						
						if (holes.length > 0) {
							let nextHole;

							holes.every((hole) => {
								if (cursorPos.line < hole.visual.start.line
									|| (cursorPos.line === hole.visual.start.line
										&& cursorPos.character < hole.visual.start.col)
								) {
									nextHole = hole;
									return false;
								}
								return true;
							});

							if (!nextHole) {
								nextHole = holes[0];
							}

							const nextPos = new vscode.Position(
								nextHole.visual.start.line,
								nextHole.visual.start.col
							);

							// vscode.window.showTextDocument(editor.document);
							editor.selections = [
								new vscode.Selection(nextPos, nextPos)
							];
							editor.revealRange(
								new vscode.Range(nextPos, nextPos),
								vscode.TextEditorRevealType.InCenter
							);
						}
					}
				}
			} else if (message.command === 'previous_hole') {
				const editor = ctxEditor(ctx);
				if (editor) {
					const cursorPos = editor.selection.active;
					
					if (ctx.proofInfo && ctx.proofInfo.result) {
						const holes = getHoleSpans(ctx, editor).reverse();
						
						if (holes.length > 0) {
							let previousHole;

							holes.every((hole) => {
								if (cursorPos.line > hole.visual.start.line
									|| (cursorPos.line === hole.visual.start.line
										&& cursorPos.character > hole.visual.start.col)
								) {
									previousHole = hole;
									return false;
								}
								return true;
							});

							if (!previousHole) {
								previousHole = holes[0];
							}

							const nextPos = new vscode.Position(
								previousHole.visual.start.line,
								previousHole.visual.start.col
							);

							// vscode.window.showTextDocument(activeEditor.document);
							editor.selections = [
								new vscode.Selection(nextPos, nextPos)
							];
							editor.revealRange(
								new vscode.Range(nextPos, nextPos),
								vscode.TextEditorRevealType.InCenter
							);
						}
					}
				}
			}
		});
	});

	context.subscriptions.push(proofView);
}

export function deactivate() {}

function getActiveEditor(): vscode.TextEditor | undefined {
	if (vscode.window.activeTextEditor) {
		return vscode.window.activeTextEditor;
	} else if (vscode.window.visibleTextEditors) {
		return vscode.window.visibleTextEditors[0];
	} else {
		return undefined;
	}
}

function getWorkingPath(): string | undefined {
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
	} else if (vscode.window.activeTextEditor) {
		return vscode.window.activeTextEditor.document.uri.fsPath;
	} else {
		return undefined;
	}
}

function syncProof(fileName: string, text: string): object | undefined {
	const workingPath = getWorkingPath();
	if (workingPath) {
		const nuprl = child_process.spawnSync('nuprl', ['check', workingPath], {
			encoding : 'utf8',
			input: text
		});
		return JSON.parse(nuprl.stdout);
	} else {
		return undefined;
	}
}

function getCurrentSourceId(ctx: Ctx, editor: vscode.TextEditor): number | undefined {
	const editorPath = editor.document.uri.fsPath;
	if (ctx.proofInfo) {
		const sources = ctx.proofInfo.sources;
		for (const [idStr, source] of Object.entries<any>(sources)) {
			const id = parseInt(idStr);
			if (source.path === editorPath) {
				return id;
			}
		}
	}
	return undefined;
}

// FIXME: take file into account
function updateProofView(
	ctx: Ctx,
	editor: vscode.TextEditor,
	webview: vscode.Webview
) {
	const editorPath = editor.document.uri.path;
	const position = editor.selection.active;

	let currentObj: any;
	let currentObjMeta: any;
	let currentProofNode: any;
	let currentProofNodeMeta: any;
	let numHoles: number | null = null;

	if (ctx.proofInfo) {
		if (ctx.proofInfo.result) {
			const sourceId = getCurrentSourceId(ctx, editor);

			if (sourceId !== undefined) {
				const objects = ctx.proofInfo.result.lib.objects;
				const meta = ctx.proofInfo.result.meta;

				outer:
				for (const [objName, obj] of Object.entries<any>(objects)) {
					const objMeta = meta[obj.id];

					if (!objMeta) {
						continue;
					}

					if (obj.kind.tag === 'thm' && objMeta.kind.thm) {
						// FIXME: first node found may not be root. Store root node id in proof.
						const rootNodeId = objMeta.kind.thm.root_id;
						const rootNode = obj.kind.proof.find((node: any) => {
							return node.node_id === rootNodeId;
						});
						const rootNodeMeta = objMeta.kind.thm.nodes[rootNodeId];

						for (const proofNode of obj.kind.proof) {
							// FIXME: check the whole proof belongs to the same file as `sourceId`

							const proofNodeMeta = objMeta.kind.thm.nodes[proofNode.node_id];

							if (!proofNodeMeta) {
								continue;
							}

							if (proofNodeMeta.span.source_id === sourceId && isWithinSpan(
								position.line,
								position.character,
								proofNodeMeta.span.visual.start.line,
								proofNodeMeta.span.visual.start.col,
								proofNodeMeta.span.visual.end.line,
								proofNodeMeta.span.visual.end.col
							)) {
								currentObj = obj;
								currentObjMeta = objMeta;
								currentProofNode = proofNode;
								currentProofNodeMeta = proofNodeMeta;
								break outer;
							}
						}

						if (objMeta.span.source_id === sourceId && isWithinSpan(
							position.line,
							position.character,
							objMeta.span.visual.start.line,
							objMeta.span.visual.start.col,
							objMeta.span.visual.end.line,
							objMeta.span.visual.end.col
						)) {
	
							if (rootNodeMeta === undefined || isBeforeSpan(
								position.line,
								position.character,
								rootNodeMeta.span.visual.start.line,
								rootNodeMeta.span.visual.start.col
							)) {
								currentObj = obj;
								currentObjMeta = objMeta;
								currentProofNode = rootNode;
								currentProofNodeMeta = rootNodeMeta;
							}
						}
					}

					// FIXME: do somthing when cursor is over a definition
				}

				numHoles = getHoleSpans(ctx, editor).length;
			}
		}

		if (ctx.proofInfo.errors && ctx.proofInfo.errors[0]) {
			const firstErr = ctx.proofInfo.errors[0];

			const firstErrMessage = firstErr.message;
			const firstErrSpan = firstErr.span;

			let firstErrSource;
			if (firstErrSpan) {
				firstErrSource = ctx.proofInfo.sources[firstErrSpan.source_id];
			}

			let displayMessage;

			if (firstErrSource) {
				displayMessage = 'Error in `' +
					firstErrSource.path +
					'` at line ' +
					(firstErrSpan.visual.start.line + 1) + ':' + (firstErrSpan.visual.start.col + 1) +
					' \u2013 ' +
					(firstErrSpan.visual.end.line + 1) + ':' + (firstErrSpan.visual.end.col + 1) +
					': ';
			} else {
				displayMessage = 'Error: ';
			}

			displayMessage += firstErrMessage;

			vscode.window.showErrorMessage(displayMessage);
		}
	}

	let currentProofNodeDecorations: vscode.DecorationOptions[] = [];

	if (currentObj && currentObjMeta && currentProofNode && currentProofNodeMeta) {
		const nodeRange = new vscode.Range(
			new vscode.Position(
				currentProofNodeMeta.span.visual.start.line,
				currentProofNodeMeta.span.visual.start.col
			),
			new vscode.Position(
				currentProofNodeMeta.span.visual.end.line,
				currentProofNodeMeta.span.visual.end.col
			)
		);

		currentProofNodeDecorations.push({
			range: nodeRange
		});

		webview.postMessage({
			command: 'display_current_proof',
			obj: currentObj,
			proofNode: currentProofNode,
			numHoles: numHoles
		});
	} else {
		webview.postMessage({
			command: 'display_current_proof',
			obj: null,
			proofNode: null,
			numHoles: numHoles
		});
	}

	editor.setDecorations(
		ctx.decorations.currentPoofNode,
		currentProofNodeDecorations
	);
}

function getHoleSpans(ctx: Ctx, editor: vscode.TextEditor): any[] {
	const sourceId = getCurrentSourceId(ctx, editor);
	if (sourceId === undefined) {
		return [];
	}

	const theorems = Object.entries(ctx.proofInfo.result.lib.objects)
		.filter(([key, obj]: [any, any]) => {
			return obj.kind.tag === 'thm';
		})
		.map(([key, obj]: [any, any]) => {
			return obj;
		});

	let holes: any[] = [];

	theorems.forEach((theorem: any) => {
		theorem.kind.proof.forEach((node: any) => {
			if (node.children === null && node.extract === null) {
				const objMeta = ctx.proofInfo.result.meta[theorem.id];
				if (objMeta && typeof objMeta.kind === 'object' && objMeta.kind.thm) {
					const nodeMeta = objMeta.kind.thm.nodes[node.node_id];
					if (nodeMeta && nodeMeta.span.source_id === sourceId) {
						holes.push(nodeMeta.span);
					}
				}
			}
		});
	});

	holes.sort((a, b) => {
		return a.range.start - b.range.start;
	});

	return holes;
}

function isBeforeSpan(
	line: number,
	col: number,
	startLine: number,
	startCol: number
): boolean
{
	if (line === startLine) {
		return col < startCol;
	}

	return line < startLine;
}

function isWithinSpan(
	line: number,
	col: number,
	startLine: number,
	startCol: number,
	endLine: number,
	endCol: number
): boolean
{
	if (line === startLine && col < startCol) {
		return false;
	}

	if (line === endLine && col > endCol) {
		return false;
	}

	return startLine <= line && line <= endLine;
}

function proofViewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
	const stylesheetPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'proof_view.css');
	const stylesheetUri = webview.asWebviewUri(stylesheetPath);

	const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'proof_view.js');
	const scriptUri = webview.asWebviewUri(scriptPath);

	const codiconsPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
	const codiconsUri = webview.asWebviewUri(codiconsPath);

	const toolkitPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js');
	const toolkitUri = webview.asWebviewUri(toolkitPath);

	return `<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script type="module" src="${toolkitUri}"></script>
				<link href="${stylesheetUri}" rel="stylesheet">
				<link href="${codiconsUri}" rel="stylesheet">
				<title>Nuprl Evaluator</title>
			</head>
			<body>
				<h2>Proof View</h2>
				<h3>Holes</h3>
				<p id="num_holes"></p>
				<div>
					<vscode-button id="button_previous_hole" appearance="icon" title="Previous proof hole">
						<span class="codicon codicon-arrow-circle-left"></span>
					</vscode-button>
					<vscode-button id="button_next_hole" appearance="icon" title="Next proof hole">
						<span class="codicon codicon-arrow-circle-right"></span>
					</vscode-button>
				</div>
				<h3>Goal</h3>
				<div id="current_proof" class="proof">
					<ol class="hypotheses"></ol>
					<div id="current_proof_concl"></div>
				</div>
				<div id="current_proof_warnings" class="warnings"></div>
				<h3>Subgoals</h3>
				<div id="current_proof_children" class="proofs"></div>
				<script src="${scriptUri}">
			</body>
			</html>`;
}

function evaluatorHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
	const stylesheetPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'evaluator.css');
	const stylesheetUri = webview.asWebviewUri(stylesheetPath);

	const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'evaluator.js');
	const scriptUri = webview.asWebviewUri(scriptPath);

	const codiconsPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
	const codiconsUri = webview.asWebviewUri(codiconsPath);

	const toolkitPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js');
	const toolkitUri = webview.asWebviewUri(toolkitPath);

	return `<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script type="module" src="${toolkitUri}"></script>
				<link href="${stylesheetUri}" rel="stylesheet">
				<link href="${codiconsUri}" rel="stylesheet">
				<title>Nuprl Evaluator</title>
			</head>
			<body>
				<h2>Evaluator</h2>
				<div id="eval_container">
					<div class="reduce_button_container">
						<vscode-button id="reduce" appearance="icon" title="Reduce 1 step">
							<span class="codicon codicon-run-below"></span>
						</vscode-button>
					</div>
					<div class="reduce_button_container">
						<vscode-button id="reduce_all" appearance="icon" title="Reduce all">
							<span class="codicon codicon-run-all"></span>
						</vscode-button>
					</div>
					<p id="expr_input" contenteditable></p>
				</div>
				<p id="error_text"></p>

				<h2>History</h2>
				<div id="history">
				<h3 id="history_input_heading">Expression</h3>
				<h3 id="history_reduced_heading">Reduced</h3>
				</div>

				<script src="${scriptUri}">
			</body>
			</html>`;
}
