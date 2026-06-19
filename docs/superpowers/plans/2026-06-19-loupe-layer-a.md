# Loupe — Layer A (Local / Agent-Code Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VSCode/Cursor extension that overlays a git diff onto your *real* editor files, lets you leave inline comments, and exports them formatted for Claude Code — toggled on and off.

**Architecture:** A source-agnostic core. Pure logic (git CLI wrappers, name-status parsing, the Claude formatter, the review session) lives in `vscode`-free modules with fast unit tests. Thin `vscode`-coupled adapters (a `QuickDiffProvider` via an SCM source control for gutter bars, a `CommentController` for inline threads, a `LoupeController` orchestrator, a tree view, a status bar) wire that logic into the editor. Layer A's `DiffSource` is the local working tree vs a chosen git ref; its `CommentSink` is a clipboard markdown export.

**Tech Stack:** TypeScript, VSCode Extension API, `git` CLI (via `node:child_process`), esbuild (production bundle), `tsc` + `@vscode/test-cli`/`@vscode/test-electron` + Mocha (tests).

## Global Constraints

- **Language:** TypeScript, `"strict": true`.
- **VSCode engine floor:** `^1.85.0` (Comment API + SCM quick diff are stable well before this).
- **No native dependencies.** Git access is via shelling out to the `git` binary only.
- **Extension entry (bundle):** `./dist/extension.js`. Test output: `./out/`.
- **Extension/command namespace:** everything is prefixed `loupe.` (commands, context keys, scheme, ids).
- **Comments are 1-based line numbers** in all persisted/exported data; VSCode `Range` lines are 0-based — convert only at the VSCode boundary.
- **No `Math.random` ban here** — this is extension runtime, not a workflow script; `Math.random` is fine for id generation.
- **TDD:** failing test first, minimal code, green, commit. Frequent commits.

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Manifest: engine, main, scripts, deps, `contributes` (commands, views, menus). |
| `tsconfig.json` | TS config → emits to `out/`. |
| `esbuild.js` | Production bundle → `dist/extension.js`. |
| `.vscode-test.mjs` | Test runner config (`out/test/**/*.test.js`). |
| `src/extension.ts` | `activate`/`deactivate`; constructs everything and registers commands. |
| `src/review/types.ts` | Shared pure types: `ChangedFile`, `ReviewComment`, `FileComments`, `PersistedSession`. |
| `src/review/nameStatus.ts` | `parseNameStatus(stdout)` — pure parse of `git diff --name-status`. |
| `src/git/gitCli.ts` | `runGit`, `repoRoot`, `diffNameStatus`, `showFile`, `mergeBase`, `resolveDefaultBranch`. |
| `src/export/claudeFormatter.ts` | `formatForClaude`, `extractSnippet`, `langForPath` — pure markdown export. |
| `src/review/session.ts` | `ReviewSession` — in-memory state + `Memento` persistence. |
| `src/review/baseContentProvider.ts` | `loupe-base:` `TextDocumentContentProvider` + `baseUriFor`. |
| `src/review/overlay.ts` | `DiffOverlay` — SCM source control wiring the `QuickDiffProvider`. |
| `src/loupeController.ts` | `LoupeController` — orchestrates enable/disable, session, comments, export, status. |
| `src/ui/changesTree.ts` | `ChangesTreeProvider` — sidebar list of changed files + comment counts. |
| `src/test/*.test.ts` | Mocha tests (pure + integration). |

---

### Task 1: Scaffold the extension

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.js`, `.vscode-test.mjs`, `.vscodeignore`
- Create: `src/extension.ts`
- Test: `src/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `activate(context)`/`deactivate()` exported from `src/extension.ts`; `npm run compile`, `npm run bundle`, `npm test` scripts.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "loupe",
  "displayName": "Loupe",
  "description": "Review changes inline in your real files. Comment in the margin, hand notes to Claude.",
  "version": "0.0.1",
  "publisher": "internetbackyard",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "loupe.toggle", "title": "Loupe: Toggle Review Mode" }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "bundle": "node esbuild.js",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile",
    "test": "vscode-test"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/test-cli": "^0.0.6",
    "@vscode/test-electron": "^2.3.9",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "outDir": "out",
    "lib": ["ES2022"],
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `esbuild.js`**

```js
const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
}).catch(() => process.exit(1));
```

- [ ] **Step 4: Write `.vscode-test.mjs` and `.vscodeignore`**

`.vscode-test.mjs`:
```js
import { defineConfig } from '@vscode/test-cli';
export default defineConfig({ files: 'out/test/**/*.test.js' });
```

`.vscodeignore`:
```
src/**
out/**
**/*.map
.vscode-test.mjs
esbuild.js
tsconfig.json
node_modules/**
!dist/**
```

- [ ] **Step 5: Write minimal `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('loupe.toggle', () => {
      vscode.window.showInformationMessage('Loupe: hello');
    }),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 6: Write the smoke test `src/test/smoke.test.ts`**

```ts
import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('extension', () => {
  test('activates and registers the toggle command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('loupe.toggle'), 'loupe.toggle should be registered');
  });
});
```

- [ ] **Step 7: Install deps and run the test**

Run: `cd ~/Projects/jonah/loupe && npm install && npm test`
Expected: VSCode test host boots; output ends with `1 passing`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Loupe extension with passing smoke test"
```

---

### Task 2: Shared types + name-status parser

**Files:**
- Create: `src/review/types.ts`, `src/review/nameStatus.ts`
- Test: `src/test/nameStatus.test.ts`

**Interfaces:**
- Produces:
  - `type ChangeStatus = 'A'|'M'|'D'|'R'|'C'`
  - `interface ChangedFile { status: ChangeStatus; path: string; oldPath?: string }`
  - `interface ReviewComment { id: string; body: string; startLine: number; endLine: number }` (1-based lines)
  - `interface FileComments { path: string; comments: ReviewComment[] }`
  - `interface PersistedSession { baseRef: string; files: FileComments[] }`
  - `function parseNameStatus(stdout: string): ChangedFile[]`

- [ ] **Step 1: Write `src/review/types.ts`**

```ts
export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C';

export interface ChangedFile {
  status: ChangeStatus;
  path: string;       // repo-relative current path
  oldPath?: string;   // present for renames/copies
}

export interface ReviewComment {
  id: string;
  body: string;
  startLine: number;  // 1-based, inclusive
  endLine: number;    // 1-based, inclusive
}

export interface FileComments {
  path: string;       // repo-relative
  comments: ReviewComment[];
}

export interface PersistedSession {
  baseRef: string;
  files: FileComments[];
}
```

- [ ] **Step 2: Write the failing test `src/test/nameStatus.test.ts`**

```ts
import * as assert from 'node:assert';
import { parseNameStatus } from '../review/nameStatus';

suite('parseNameStatus', () => {
  test('parses added, modified, deleted', () => {
    const out = 'A\tsrc/new.ts\nM\tsrc/changed.ts\nD\tsrc/gone.ts\n';
    assert.deepStrictEqual(parseNameStatus(out), [
      { status: 'A', path: 'src/new.ts' },
      { status: 'M', path: 'src/changed.ts' },
      { status: 'D', path: 'src/gone.ts' },
    ]);
  });

  test('parses renames with old and new path', () => {
    const out = 'R100\tsrc/old.ts\tsrc/new.ts\n';
    assert.deepStrictEqual(parseNameStatus(out), [
      { status: 'R', path: 'src/new.ts', oldPath: 'src/old.ts' },
    ]);
  });

  test('ignores blank lines', () => {
    assert.deepStrictEqual(parseNameStatus('\n\n'), []);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../review/nameStatus'`.

- [ ] **Step 4: Write `src/review/nameStatus.ts`**

```ts
import { ChangedFile, ChangeStatus } from './types';

export function parseNameStatus(stdout: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0][0] as ChangeStatus;
    if ((status === 'R' || status === 'C') && parts.length >= 3) {
      files.push({ status, oldPath: parts[1], path: parts[2] });
    } else {
      files.push({ status, path: parts[1] });
    }
  }
  return files;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS — `4 passing` (smoke + 3 new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shared types and git name-status parser"
```

---

### Task 3: Git CLI layer

**Files:**
- Create: `src/git/gitCli.ts`
- Test: `src/test/gitCli.test.ts`

**Interfaces:**
- Consumes: `parseNameStatus` (Task 2), `ChangedFile` (Task 2).
- Produces:
  - `runGit(cwd: string, args: string[]): Promise<string>`
  - `repoRoot(cwd: string): Promise<string>`
  - `diffNameStatus(cwd: string, baseRef: string): Promise<ChangedFile[]>`
  - `showFile(cwd: string, ref: string, repoRelPath: string): Promise<string>` (returns `''` if absent in ref)
  - `mergeBase(cwd: string, a: string, b: string): Promise<string>`
  - `resolveDefaultBranch(cwd: string): Promise<string>`

- [ ] **Step 1: Write `src/git/gitCli.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseNameStatus } from '../review/nameStatus';
import { ChangedFile } from '../review/types';

const pexec = promisify(execFile);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function repoRoot(cwd: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
}

export async function diffNameStatus(cwd: string, baseRef: string): Promise<ChangedFile[]> {
  const out = await runGit(cwd, ['diff', '--name-status', '-M', baseRef]);
  return parseNameStatus(out);
}

export async function showFile(cwd: string, ref: string, repoRelPath: string): Promise<string> {
  try {
    return await runGit(cwd, ['show', `${ref}:${repoRelPath}`]);
  } catch {
    return ''; // file does not exist at ref (e.g. a newly added file)
  }
}

export async function mergeBase(cwd: string, a: string, b: string): Promise<string> {
  return (await runGit(cwd, ['merge-base', a, b])).trim();
}

export async function resolveDefaultBranch(cwd: string): Promise<string> {
  try {
    const ref = (await runGit(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim();
    if (ref) return ref.replace('refs/remotes/', ''); // e.g. "origin/main"
  } catch { /* no origin/HEAD configured */ }
  for (const candidate of ['main', 'master']) {
    try {
      await runGit(cwd, ['rev-parse', '--verify', candidate]);
      return candidate;
    } catch { /* not present */ }
  }
  return 'HEAD';
}
```

- [ ] **Step 2: Write the failing test `src/test/gitCli.test.ts`**

```ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../git/gitCli'` (if Step 1 not yet saved) or assertion failures.

- [ ] **Step 4: Confirm implementation from Step 1 satisfies the tests**

The implementation in Step 1 is the minimal code. Re-run.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS — `8 passing`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add git CLI access layer"
```

---

### Task 4: Claude export formatter

**Files:**
- Create: `src/export/claudeFormatter.ts`
- Test: `src/test/claudeFormatter.test.ts`

**Interfaces:**
- Consumes: `FileComments` (Task 2).
- Produces:
  - `interface FileForExport extends FileComments { content?: string }`
  - `langForPath(path: string): string`
  - `extractSnippet(content: string, startLine: number, endLine: number): string` (1-based, inclusive)
  - `formatForClaude(files: FileForExport[]): string`

- [ ] **Step 1: Write the failing test `src/test/claudeFormatter.test.ts`**

```ts
import * as assert from 'node:assert';
import { formatForClaude, extractSnippet, langForPath } from '../export/claudeFormatter';

suite('claudeFormatter', () => {
  test('langForPath maps extensions', () => {
    assert.strictEqual(langForPath('src/a.ts'), 'ts');
    assert.strictEqual(langForPath('x.unknown'), '');
  });

  test('extractSnippet pulls inclusive 1-based line range', () => {
    const content = 'l1\nl2\nl3\nl4\n';
    assert.strictEqual(extractSnippet(content, 2, 3), 'l2\nl3');
  });

  test('formatForClaude renders path, range, snippet, and note', () => {
    const md = formatForClaude([
      {
        path: 'src/auth.ts',
        content: 'a\nb\nconst user = getUser()\nreturn user.token\n',
        comments: [{ id: '1', body: 'guard the null case', startLine: 3, endLine: 4 }],
      },
    ]);
    assert.ok(md.includes('# Review comments (1)'));
    assert.ok(md.includes('## src/auth.ts:3–4'));
    assert.ok(md.includes('```ts'));
    assert.ok(md.includes('const user = getUser()'));
    assert.ok(md.includes('> guard the null case'));
  });

  test('single-line range omits the dash', () => {
    const md = formatForClaude([
      { path: 'a.ts', content: 'x\n', comments: [{ id: '1', body: 'note', startLine: 1, endLine: 1 }] },
    ]);
    assert.ok(md.includes('## a.ts:1\n'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../export/claudeFormatter'`.

- [ ] **Step 3: Write `src/export/claudeFormatter.ts`**

```ts
import { FileComments } from '../review/types';

const LANG: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
  py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
  c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
  kt: 'kotlin', sh: 'bash', json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', html: 'html', css: 'css', sql: 'sql',
};

export interface FileForExport extends FileComments {
  content?: string;
}

export function langForPath(path: string): string {
  const ext = path.includes('.') ? path.split('.').pop()! : '';
  return LANG[ext] ?? '';
}

export function extractSnippet(content: string, startLine: number, endLine: number): string {
  return content.split('\n').slice(startLine - 1, endLine).join('\n');
}

export function formatForClaude(files: FileForExport[]): string {
  const total = files.reduce((n, f) => n + f.comments.length, 0);
  const out: string[] = [`# Review comments (${total})`, ''];
  for (const file of files) {
    for (const c of file.comments) {
      const range = c.startLine === c.endLine ? `${c.startLine}` : `${c.startLine}–${c.endLine}`;
      out.push(`## ${file.path}:${range}`);
      if (file.content) {
        const snippet = extractSnippet(file.content, c.startLine, c.endLine);
        if (snippet.trim()) {
          out.push('```' + langForPath(file.path), snippet, '```');
        }
      }
      out.push(`> ${c.body.replace(/\n/g, '\n> ')}`, '');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — `12 passing`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Claude-Code export formatter"
```

---

### Task 5: ReviewSession + persistence

**Files:**
- Create: `src/review/session.ts`
- Test: `src/test/session.test.ts`

**Interfaces:**
- Consumes: `FileComments`, `ReviewComment`, `PersistedSession` (Task 2).
- Produces:
  - `interface Memento { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> }`
  - class `ReviewSession`:
    - `constructor(baseRef: string, files?: FileComments[])`
    - `baseRef: string`
    - `files: Map<string, ReviewComment[]>` (path → comments)
    - `addComment(path: string, c: ReviewComment): void`
    - `removeComment(path: string, id: string): void`
    - `commentCount(path: string): number`
    - `totalCount(): number`
    - `toPersisted(): PersistedSession`
    - `save(m: Memento): Thenable<void>`
    - `static load(m: Memento): ReviewSession | undefined`
    - `static clear(m: Memento): Thenable<void>`

- [ ] **Step 1: Write the failing test `src/test/session.test.ts`**

```ts
import * as assert from 'node:assert';
import { ReviewSession, Memento } from '../review/session';

function fakeMemento(): Memento & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get<T>(key: string) { return store.get(key) as T | undefined; },
    update(key: string, value: unknown) { store.set(key, value); return Promise.resolve(); },
  };
}

suite('ReviewSession', () => {
  test('tracks comments per file and totals', () => {
    const s = new ReviewSession('HEAD');
    s.addComment('a.ts', { id: '1', body: 'x', startLine: 1, endLine: 1 });
    s.addComment('a.ts', { id: '2', body: 'y', startLine: 5, endLine: 6 });
    assert.strictEqual(s.commentCount('a.ts'), 2);
    assert.strictEqual(s.totalCount(), 2);
  });

  test('removeComment drops by id', () => {
    const s = new ReviewSession('HEAD');
    s.addComment('a.ts', { id: '1', body: 'x', startLine: 1, endLine: 1 });
    s.removeComment('a.ts', '1');
    assert.strictEqual(s.commentCount('a.ts'), 0);
  });

  test('round-trips through Memento', async () => {
    const m = fakeMemento();
    const s = new ReviewSession('abc123');
    s.addComment('a.ts', { id: '1', body: 'note', startLine: 2, endLine: 3 });
    await s.save(m);

    const loaded = ReviewSession.load(m);
    assert.ok(loaded);
    assert.strictEqual(loaded!.baseRef, 'abc123');
    assert.strictEqual(loaded!.commentCount('a.ts'), 1);
  });

  test('clear removes persisted data', async () => {
    const m = fakeMemento();
    await new ReviewSession('HEAD').save(m);
    await ReviewSession.clear(m);
    assert.strictEqual(ReviewSession.load(m), undefined);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../review/session'`.

- [ ] **Step 3: Write `src/review/session.ts`**

```ts
import { FileComments, PersistedSession, ReviewComment } from './types';

export interface Memento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'loupe.session';

export class ReviewSession {
  baseRef: string;
  files: Map<string, ReviewComment[]>;

  constructor(baseRef: string, files: FileComments[] = []) {
    this.baseRef = baseRef;
    this.files = new Map(files.map((f) => [f.path, f.comments]));
  }

  addComment(path: string, c: ReviewComment): void {
    const list = this.files.get(path) ?? [];
    list.push(c);
    this.files.set(path, list);
  }

  removeComment(path: string, id: string): void {
    const list = this.files.get(path);
    if (list) this.files.set(path, list.filter((c) => c.id !== id));
  }

  commentCount(path: string): number {
    return this.files.get(path)?.length ?? 0;
  }

  totalCount(): number {
    let n = 0;
    for (const list of this.files.values()) n += list.length;
    return n;
  }

  toPersisted(): PersistedSession {
    const files: FileComments[] = [];
    for (const [path, comments] of this.files) files.push({ path, comments });
    return { baseRef: this.baseRef, files };
  }

  save(m: Memento): Thenable<void> {
    return m.update(KEY, this.toPersisted());
  }

  static load(m: Memento): ReviewSession | undefined {
    const data = m.get<PersistedSession>(KEY);
    return data ? new ReviewSession(data.baseRef, data.files) : undefined;
  }

  static clear(m: Memento): Thenable<void> {
    return m.update(KEY, undefined);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — `16 passing`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add review session with workspaceState persistence"
```

---

### Task 6: Diff overlay (base content provider + SCM quick diff)

**Files:**
- Create: `src/review/baseContentProvider.ts`, `src/review/overlay.ts`
- Test: `src/test/baseContentProvider.test.ts`

**Interfaces:**
- Consumes: `repoRoot`, `showFile` (Task 3).
- Produces:
  - `const SCHEME = 'loupe-base'`
  - `baseUriFor(fileUri: vscode.Uri, baseRef: string): vscode.Uri`
  - class `BaseContentProvider implements vscode.TextDocumentContentProvider`
  - class `DiffOverlay implements vscode.Disposable` — `constructor(baseRef: string, isChanged: (uri: vscode.Uri) => boolean)`

- [ ] **Step 1: Write `src/review/baseContentProvider.ts`**

```ts
import * as vscode from 'vscode';
import * as path from 'node:path';
import { repoRoot, showFile } from '../git/gitCli';

export const SCHEME = 'loupe-base';

// Encode the original (base) resource as a same-path URI on our scheme, with the
// git ref carried in the query. VSCode's quick-diff compares the on-disk document
// against the content this provider returns for that URI.
export function baseUriFor(fileUri: vscode.Uri, baseRef: string): vscode.Uri {
  return fileUri.with({ scheme: SCHEME, query: baseRef });
}

export class BaseContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const fsPath = uri.with({ scheme: 'file', query: '' }).fsPath;
    const root = await repoRoot(path.dirname(fsPath));
    const rel = path.relative(root, fsPath);
    return showFile(root, uri.query, rel);
  }
}
```

- [ ] **Step 2: Write `src/review/overlay.ts`**

```ts
import * as vscode from 'vscode';
import { baseUriFor } from './baseContentProvider';

export class DiffOverlay implements vscode.Disposable {
  private readonly sc: vscode.SourceControl;

  constructor(baseRef: string, isChanged: (uri: vscode.Uri) => boolean) {
    this.sc = vscode.scm.createSourceControl('loupe', 'Loupe');
    this.sc.quickDiffProvider = {
      provideOriginalResource: (uri) =>
        isChanged(uri) ? baseUriFor(uri, baseRef) : undefined,
    };
  }

  dispose(): void {
    this.sc.dispose();
  }
}
```

- [ ] **Step 3: Write the failing integration test `src/test/baseContentProvider.test.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../review/baseContentProvider'` (until Steps 1–2 compiled).

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS — `17 passing`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add base-content provider and quick-diff overlay"
```

---

### Task 7: Orchestrator, comments, commands, status bar (end-to-end)

**Files:**
- Create: `src/loupeController.ts`
- Modify: `src/extension.ts` (replace placeholder body)
- Modify: `package.json` (full `contributes`)
- Test: `src/test/controller.test.ts`

**Interfaces:**
- Consumes: `ReviewSession` (Task 5), `DiffOverlay` (Task 6), `BaseContentProvider`/`SCHEME` (Task 6), `repoRoot`/`diffNameStatus`/`mergeBase`/`resolveDefaultBranch` (Task 3), `formatForClaude`/`FileForExport` (Task 4), `ChangedFile` (Task 2).
- Produces:
  - class `LoupeController`:
    - `constructor(ctx, statusItem)`
    - `get active(): boolean`
    - `get currentSession(): ReviewSession | undefined`
    - `get changedFiles(): string[]` (repo-relative paths)
    - `get repoRootPath(): string | undefined`
    - `isChanged(uri: vscode.Uri): boolean`
    - `toggle(): Promise<void>`
    - `addComment(uri, startLine, endLine, body, id): void`
    - `removeComment(uri, id): void`
    - `copyForClaude(): Promise<void>`
    - `readonly onDidChange: vscode.Event<void>`

- [ ] **Step 1: Write `src/loupeController.ts`**

```ts
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ReviewSession } from './review/session';
import { DiffOverlay } from './review/overlay';
import { repoRoot, diffNameStatus, mergeBase, resolveDefaultBranch } from './git/gitCli';
import { formatForClaude, FileForExport } from './export/claudeFormatter';

export class LoupeController implements vscode.Disposable {
  private session?: ReviewSession;
  private overlay?: DiffOverlay;
  private root?: string;
  private changedRel: string[] = [];
  private changedAbs = new Set<string>();
  private threads: vscode.CommentThread[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly status: vscode.StatusBarItem,
  ) {
    this.updateStatus();
  }

  get active(): boolean { return !!this.session; }
  get currentSession(): ReviewSession | undefined { return this.session; }
  get changedFiles(): string[] { return this.changedRel; }
  get repoRootPath(): string | undefined { return this.root; }
  isChanged(uri: vscode.Uri): boolean { return this.changedAbs.has(uri.fsPath); }

  async toggle(): Promise<void> {
    if (this.active) await this.disable();
    else await this.enable();
  }

  private async enable(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('Loupe: open a folder first.');
      return;
    }
    let root: string;
    try {
      root = await repoRoot(folder.uri.fsPath);
    } catch {
      vscode.window.showErrorMessage('Loupe: not a git repository.');
      return;
    }

    const baseRef = await this.pickBaseRef(root);
    if (!baseRef) return;

    const files = await diffNameStatus(root, baseRef);
    if (files.length === 0) {
      vscode.window.showInformationMessage('Loupe: no changes to review.');
      return;
    }

    this.root = root;
    this.changedRel = files.map((f) => f.path);
    this.changedAbs = new Set(
      files.filter((f) => f.status !== 'D').map((f) => path.join(root, f.path)),
    );
    this.session = new ReviewSession(baseRef, []);
    this.overlay = new DiffOverlay(baseRef, (uri) => this.isChanged(uri));
    await this.session.save(this.ctx.workspaceState);
    await vscode.commands.executeCommand('setContext', 'loupe.active', true);
    this.updateStatus();
    this.emitter.fire();
  }

  private async disable(): Promise<void> {
    this.overlay?.dispose();
    this.overlay = undefined;
    for (const t of this.threads) t.dispose();
    this.threads = [];
    this.session = undefined;
    this.root = undefined;
    this.changedRel = [];
    this.changedAbs.clear();
    await ReviewSession.clear(this.ctx.workspaceState);
    await vscode.commands.executeCommand('setContext', 'loupe.active', false);
    this.updateStatus();
    this.emitter.fire();
  }

  private async pickBaseRef(root: string): Promise<string | undefined> {
    const def = await resolveDefaultBranch(root);
    const items = [
      { label: 'Uncommitted changes', detail: 'Review working-tree changes vs HEAD', ref: 'HEAD' },
      { label: `Whole branch vs ${def}`, detail: `Everything since merge-base with ${def}`, ref: '__merge_base__' },
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Loupe: what do you want to review?',
    });
    if (!pick) return undefined;
    if (pick.ref === '__merge_base__') return mergeBase(root, 'HEAD', def);
    return pick.ref;
  }

  registerThread(thread: vscode.CommentThread): void {
    this.threads.push(thread);
  }

  addComment(uri: vscode.Uri, startLine: number, endLine: number, body: string, id: string): void {
    if (!this.session || !this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.addComment(rel, { id, body, startLine, endLine });
    void this.session.save(this.ctx.workspaceState);
    this.updateStatus();
    this.emitter.fire();
  }

  removeComment(uri: vscode.Uri, id: string): void {
    if (!this.session || !this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.removeComment(rel, id);
    void this.session.save(this.ctx.workspaceState);
    this.updateStatus();
    this.emitter.fire();
  }

  async copyForClaude(): Promise<void> {
    if (!this.session || !this.root) {
      vscode.window.showInformationMessage('Loupe: review mode is not active.');
      return;
    }
    const files: FileForExport[] = [];
    for (const [rel, comments] of this.session.files) {
      if (comments.length === 0) continue;
      let content: string | undefined;
      try {
        content = await fs.readFile(path.join(this.root, rel), 'utf8');
      } catch { /* deleted/binary — export without snippet */ }
      files.push({ path: rel, comments, content });
    }
    if (files.length === 0) {
      vscode.window.showInformationMessage('Loupe: no comments to copy yet.');
      return;
    }
    await vscode.env.clipboard.writeText(formatForClaude(files));
    vscode.window.showInformationMessage(
      `Loupe: copied ${this.session.totalCount()} comment(s) for Claude.`,
    );
  }

  private updateStatus(): void {
    if (this.active) {
      this.status.text = `$(eye) Loupe: ${this.session!.totalCount()}`;
      this.status.tooltip = 'Copy review comments for Claude';
      this.status.command = 'loupe.copyForClaude';
    } else {
      this.status.text = '$(eye-closed) Loupe';
      this.status.tooltip = 'Toggle Loupe review mode';
      this.status.command = 'loupe.toggle';
    }
    this.status.show();
  }

  dispose(): void {
    this.overlay?.dispose();
    this.emitter.dispose();
  }
}
```

- [ ] **Step 2: Replace `src/extension.ts`**

```ts
import * as vscode from 'vscode';
import { LoupeController } from './loupeController';
import { BaseContentProvider, SCHEME } from './review/baseContentProvider';

class LoupeComment implements vscode.Comment {
  mode = vscode.CommentMode.Preview;
  author: vscode.CommentAuthorInformation = { name: 'You' };
  constructor(public body: vscode.MarkdownString, public id: string) {}
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const controller = new LoupeController(context, status);

  const commentCtrl = vscode.comments.createCommentController('loupe', 'Loupe Review');
  commentCtrl.commentingRangeProvider = {
    provideCommentingRanges: (document) => {
      if (!controller.active || document.uri.scheme !== 'file') return [];
      if (!controller.isChanged(document.uri)) return [];
      return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
    },
  };

  context.subscriptions.push(
    status,
    controller,
    commentCtrl,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new BaseContentProvider()),

    vscode.commands.registerCommand('loupe.toggle', () => controller.toggle()),
    vscode.commands.registerCommand('loupe.copyForClaude', () => controller.copyForClaude()),

    vscode.commands.registerCommand('loupe.createComment', (reply: vscode.CommentReply) => {
      const id = newId();
      const thread = reply.thread;
      thread.comments = [...thread.comments, new LoupeComment(new vscode.MarkdownString(reply.text), id)];
      controller.registerThread(thread);
      controller.addComment(
        thread.uri,
        thread.range.start.line + 1,
        thread.range.end.line + 1,
        reply.text,
        id,
      );
    }),

    vscode.commands.registerCommand('loupe.deleteComment', (comment: LoupeComment & { parent?: vscode.CommentThread }) => {
      const thread = comment.parent;
      if (!thread) return;
      thread.comments = thread.comments.filter((c) => (c as LoupeComment).id !== comment.id);
      controller.removeComment(thread.uri, comment.id);
      if (thread.comments.length === 0) thread.dispose();
    }),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 3: Replace the `contributes` block and `activationEvents` in `package.json`**

```json
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "loupe.toggle", "title": "Toggle Review Mode", "category": "Loupe" },
      { "command": "loupe.copyForClaude", "title": "Copy Comments for Claude", "category": "Loupe", "icon": "$(clippy)" },
      { "command": "loupe.createComment", "title": "Add Comment", "category": "Loupe" },
      { "command": "loupe.deleteComment", "title": "Delete Comment", "category": "Loupe", "icon": "$(trash)" }
    ],
    "menus": {
      "commandPalette": [
        { "command": "loupe.createComment", "when": "false" },
        { "command": "loupe.deleteComment", "when": "false" },
        { "command": "loupe.copyForClaude", "when": "loupe.active" }
      ],
      "comments/commentThread/context": [
        { "command": "loupe.createComment", "group": "inline" }
      ],
      "comments/comment/title": [
        { "command": "loupe.deleteComment", "group": "inline", "when": "commentController == loupe" }
      ],
      "view/title": [
        { "command": "loupe.copyForClaude", "when": "view == loupe.changes", "group": "navigation" }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        { "id": "loupe", "title": "Loupe", "icon": "$(eye)" }
      ]
    },
    "views": {
      "loupe": [
        { "id": "loupe.changes", "name": "Changed Files", "when": "loupe.active" }
      ]
    }
  },
```

- [ ] **Step 4: Write the failing test `src/test/controller.test.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify it fails, then passes**

Run: `npm test`
Expected: after Steps 1–4 compile, PASS — `19 passing`.

- [ ] **Step 6: Manual verification (UI behavior the harness can't assert)**

Run: `npm run bundle`, then press `F5` in VSCode/Cursor to launch the Extension Development Host. In a git repo with uncommitted changes:
1. Run `Loupe: Toggle Review Mode` → pick "Uncommitted changes". Expected: changed files show **gutter change bars** (blue/green/red) in their normal editors; status bar shows `$(eye) Loupe: 0`.
2. Hover the gutter on a changed line → click the `+` → type a note → submit. Expected: an inline comment thread appears; status bar increments.
3. Run `Loupe: Copy Comments for Claude` (or click the status bar). Expected: clipboard holds the markdown; info toast confirms the count.
4. Toggle again → gutter bars and threads disappear.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire toggle, inline comments, status bar, and Claude export"
```

---

### Task 8: Changed-files sidebar

**Files:**
- Create: `src/ui/changesTree.ts`
- Modify: `src/extension.ts` (register the tree view)
- Test: `src/test/changesTree.test.ts`

**Interfaces:**
- Consumes: `LoupeController` (Task 7) — `changedFiles`, `currentSession`, `repoRootPath`, `onDidChange`.
- Produces: class `ChangesTreeProvider implements vscode.TreeDataProvider<string>`.

- [ ] **Step 1: Write `src/ui/changesTree.ts`**

```ts
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
```

- [ ] **Step 2: Register the tree view in `src/extension.ts`**

Add the import at the top:
```ts
import { ChangesTreeProvider } from './ui/changesTree';
```

Add inside `activate`, appended to the `context.subscriptions.push(...)` call (add as another argument):
```ts
    vscode.window.registerTreeDataProvider('loupe.changes', new ChangesTreeProvider(controller)),
```

- [ ] **Step 3: Write the failing test `src/test/changesTree.test.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it fails, then passes**

Run: `npm test`
Expected: PASS — `21 passing`.

- [ ] **Step 5: Manual verification**

`F5` → toggle review on. Expected: a **Loupe** icon appears in the activity bar; its "Changed Files" view lists the changed files; files with comments show an `N comments` description; clicking a file opens it; the view's title bar has the "Copy Comments for Claude" action.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add changed-files sidebar with comment counts"
```

---

## Self-Review

**1. Spec coverage** (against `2026-06-19-loupe-design.md`, §4 Layer A):
- Toggle overlay on current branch → Task 7 (`toggle`/`enable`) + Task 6 (overlay). ✓
- Base-ref quick-pick (uncommitted vs whole-branch) → Task 7 `pickBaseRef`. ✓
- Gutter bars in real editors → Task 6 `DiffOverlay` + `BaseContentProvider`. ✓
- Inline comment threads in real files → Task 7 comment controller + commands. ✓
- Session persistence via `workspaceState` → Task 5 + Task 7. ✓
- "Copy for Claude" format → Task 4 + Task 7 `copyForClaude`. ✓
- Sidebar with changed files + comment counts → Task 8. ✓
- Status bar with mode + count → Task 7. ✓
- Error/edge cases (not a repo, no changes, deleted files) → Task 7 `enable`/`copyForClaude`. ✓
- Stack/testing (TS, git CLI, esbuild, vscode-test) → Task 1. ✓
- **Deferred per spec (not in this plan):** the optional `.review/comments.md` file write (clipboard is the MVP sink), extra green/red full-line `TextEditorDecorationType` (quick-diff gutter + peek covers it), Layers B and C. Intentional.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders; every code step contains complete code.

**3. Type consistency:** `ReviewComment`/`FileComments`/`PersistedSession`/`ChangedFile` defined in Task 2 and consumed unchanged in Tasks 3–8. `LoupeController` method names (`toggle`, `addComment`, `removeComment`, `copyForClaude`, `isChanged`, `registerThread`, `changedFiles`, `currentSession`, `repoRootPath`, `onDidChange`) match between Task 7 (definition) and Tasks 7–8 (callers). `baseUriFor`/`SCHEME`/`BaseContentProvider`/`DiffOverlay` consistent between Task 6 and Task 7. `formatForClaude`/`FileForExport` consistent between Task 4 and Task 7.
