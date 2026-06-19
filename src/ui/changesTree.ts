import * as vscode from 'vscode';
import * as path from 'node:path';
import { LoupeController } from '../loupeController';

export class ChangesTreeProvider implements vscode.TreeDataProvider<string> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly controller: LoupeController) {
    controller.onDidChange(() => this.emitter.fire());
  }

  getChildren(): string[] {
    return this.controller.active ? this.controller.changedFiles : [];
  }

  getTreeItem(relPath: string): vscode.TreeItem {
    const item = new vscode.TreeItem(relPath, vscode.TreeItemCollapsibleState.None);
    const count = this.controller.currentSession?.commentCount(relPath) ?? 0;
    if (count > 0) item.description = `${count} comment${count === 1 ? '' : 's'}`;
    const root = this.controller.repoRootPath;
    if (root) {
      const fileUri = vscode.Uri.file(path.join(root, relPath));
      item.resourceUri = fileUri;
      item.command = { command: 'vscode.open', title: 'Open', arguments: [fileUri] };
    }
    return item;
  }
}
