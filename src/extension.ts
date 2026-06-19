import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('loupe.toggle', () => {
      vscode.window.showInformationMessage('Loupe: hello');
    }),
  );
}

export function deactivate(): void {}
