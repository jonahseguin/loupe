import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('extension', () => {
  test('activates and registers the toggle command', async () => {
    const ext = vscode.extensions.getExtension('internetbackyard.loupe');
    await ext?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('loupe.toggle'), 'loupe.toggle should be registered');
  });
});
