import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LoupeController } from '../loupeController';

suite('LoupeController', () => {
  test('starts inactive with empty changed files', () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    assert.strictEqual(controller.active, false);
    assert.deepStrictEqual(controller.changedFiles, []);
    controller.dispose();
    status.dispose();
  });

  test('copyForClaude on inactive session is a no-op (no throw)', async () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    await controller.copyForClaude(); // should not throw
    controller.dispose();
    status.dispose();
  });
});

function fakeState() {
  const m = new Map<string, unknown>();
  return {
    get: (k: string) => m.get(k),
    update: (k: string, v: unknown) => { m.set(k, v); return Promise.resolve(); },
  };
}
