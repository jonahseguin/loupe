import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
import { BaseContentProvider, baseUriFor } from '../review/baseContentProvider';

function tempRepoWithCommit(): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loupe-base-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir });
  git('init', '-q');
  git('config', 'user.email', 'test@test.com');
  git('config', 'user.name', 'Test');
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'committed base\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  fs.writeFileSync(file, 'working tree change\n');
  return { dir, file };
}

suite('BaseContentProvider', () => {
  test('returns the committed (base) content for a modified file', async () => {
    const { file } = tempRepoWithCommit();
    const provider = new BaseContentProvider();
    const uri = baseUriFor(vscode.Uri.file(file), 'HEAD');
    const content = await provider.provideTextDocumentContent(uri);
    assert.strictEqual(content, 'committed base\n');
  });
});
