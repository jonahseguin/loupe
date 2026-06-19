import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LoupeController } from '../loupeController';

suite('LoupeController', () => {
  test('review mode starts off with an empty changed-file set', () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    assert.strictEqual(controller.reviewActive, false);
    assert.deepStrictEqual(controller.changedFiles, []);
    controller.dispose();
    status.dispose();
  });

  test('copyForClaude before init (no root) is a no-op (no throw)', async () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    await controller.copyForClaude(); // should not throw
    controller.dispose();
    status.dispose();
  });

  test('clearAllComments before init does not throw', () => {
    const status = vscode.window.createStatusBarItem();
    const controller = new LoupeController({ workspaceState: fakeState() } as any, status);
    controller.clearAllComments();
    assert.strictEqual(controller.currentSession.totalCount(), 0);
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
