import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { repoRoot, diffNameStatus, showFile, mergeBase } from '../git/gitCli';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loupe-git-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@test.com');
  git(dir, 'config', 'user.name', 'Test');
  return dir;
}

suite('gitCli', () => {
  test('repoRoot resolves the repository root', async () => {
    const dir = tempRepo();
    const sub = path.join(dir, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    assert.strictEqual(fs.realpathSync(await repoRoot(sub)), fs.realpathSync(dir));
  });

  test('diffNameStatus reports working-tree changes vs HEAD', async () => {
    const dir = tempRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'new\n');
    git(dir, 'add', '.');
    const files = await diffNameStatus(dir, 'HEAD');
    assert.deepStrictEqual(files.sort((x, y) => x.path.localeCompare(y.path)), [
      { status: 'M', path: 'a.txt' },
      { status: 'A', path: 'b.txt' },
    ]);
  });

  test('showFile returns content at a ref and empty for missing', async () => {
    const dir = tempRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'base\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    assert.strictEqual(await showFile(dir, 'HEAD', 'a.txt'), 'base\n');
    assert.strictEqual(await showFile(dir, 'HEAD', 'missing.txt'), '');
  });

  test('mergeBase finds the common ancestor', async () => {
    const dir = tempRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'c1');
    const base = (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }) + '').trim();
    assert.strictEqual(await mergeBase(dir, 'HEAD', 'HEAD'), base);
  });
});
