import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { ChangesTreeProvider } from '../ui/changesTree';
import { LoupeController } from '../loupeController';

function fakeState() {
  const m = new Map<string, unknown>();
  return {
    get: (k: string) => m.get(k),
    update: (k: string, v: unknown) => { m.set(k, v); return Promise.resolve(); },
  };
}

suite('ChangesTreeProvider', () => {
  test('returns no children when review mode is inactive', () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    const tree = new ChangesTreeProvider(controller);
    assert.deepStrictEqual(tree.getChildren(), []);
    controller.dispose();
    status.dispose();
  });

  test('getTreeItem renders the path as a tree item', () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    const tree = new ChangesTreeProvider(controller);
    const item = tree.getTreeItem('src/a.ts');
    assert.strictEqual(item.label, 'src/a.ts');
    controller.dispose();
    status.dispose();
  });
});
