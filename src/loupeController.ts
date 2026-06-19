import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ReviewSession } from './review/session';
import { DiffOverlay } from './review/overlay';
import { repoRoot, diffNameStatus, mergeBase, resolveDefaultBranch } from './git/gitCli';
import { formatForClaude, FileForExport } from './export/claudeFormatter';
import { ReviewComment } from './review/types';

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

  /** Re-enter review mode from a persisted session, if one exists and the repo is available.
   *  Returns the stored comments (with absolute file URIs) so the caller can recreate threads,
   *  or undefined if there was nothing to restore. */
  async restore(): Promise<Array<{ uri: vscode.Uri; startLine: number; endLine: number; body: string; id: string }> | undefined> {
    const persisted = ReviewSession.load(this.ctx.workspaceState);
    if (!persisted) return undefined;

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return undefined;

    let root: string;
    try {
      root = await repoRoot(folder.uri.fsPath);
    } catch {
      return undefined; // not a repo anymore; leave persisted state untouched
    }

    let files;
    try {
      files = await diffNameStatus(root, persisted.baseRef);
    } catch {
      return undefined; // stored baseRef no longer valid; best-effort, skip
    }

    this.root = root;
    this.changedRel = files.map((f) => f.path);
    this.changedAbs = new Set(files.filter((f) => f.status !== 'D').map((f) => path.join(root, f.path)));
    this.session = persisted;
    this.overlay = new DiffOverlay(persisted.baseRef, (uri) => this.isChanged(uri));
    await vscode.commands.executeCommand('setContext', 'loupe.active', true);
    this.updateStatus();
    this.emitter.fire();

    const out: Array<{ uri: vscode.Uri; startLine: number; endLine: number; body: string; id: string }> = [];
    for (const [rel, comments] of this.session.files) {
      const uri = vscode.Uri.file(path.join(root, rel));
      for (const c of comments) {
        out.push({ uri, startLine: c.startLine, endLine: c.endLine, body: c.body, id: c.id });
      }
    }
    return out;
  }

  registerThread(thread: vscode.CommentThread): void {
    this.threads.push(thread);
  }

  forgetThread(thread: vscode.CommentThread): void {
    this.threads = this.threads.filter((t) => t !== thread);
  }

  addComment(uri: vscode.Uri, startLine: number, endLine: number, body: string, id: string): void {
    if (!this.session || !this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.addComment(rel, { id, body, startLine, endLine });
    Promise.resolve(this.session.save(this.ctx.workspaceState)).catch((err: unknown) => {
      console.error('Loupe: failed to persist comment:', err);
    });
    this.updateStatus();
    this.emitter.fire();
  }

  removeComment(uri: vscode.Uri, id: string): void {
    if (!this.session || !this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.removeComment(rel, id);
    Promise.resolve(this.session.save(this.ctx.workspaceState)).catch((err: unknown) => {
      console.error('Loupe: failed to persist comment:', err);
    });
    this.updateStatus();
    this.emitter.fire();
  }

  async copyForClaude(): Promise<void> {
    if (!this.session || !this.root) {
      vscode.window.showInformationMessage('Loupe: review mode is not active.');
      return;
    }

    // Group live comments by repo-relative path, using each thread's CURRENT range.
    const byPath = new Map<string, ReviewComment[]>();
    for (const thread of this.threads) {
      const range = thread.range;
      if (!range || thread.comments.length === 0) continue;
      const rel = path.relative(this.root, thread.uri.fsPath);
      const startLine = range.start.line + 1;
      const endLine = range.end.line + 1;
      const list = byPath.get(rel) ?? [];
      for (const c of thread.comments) {
        const body = typeof c.body === 'string' ? c.body : c.body.value;
        list.push({ id: '', body, startLine, endLine });
      }
      byPath.set(rel, list);
    }

    if (byPath.size === 0) {
      vscode.window.showInformationMessage('Loupe: no comments to copy yet.');
      return;
    }

    const files: FileForExport[] = [];
    for (const [rel, comments] of byPath) {
      let content: string | undefined;
      try {
        content = await fs.readFile(path.join(this.root, rel), 'utf8');
      } catch { /* deleted/binary — export without snippet */ }
      files.push({ path: rel, comments, content });
    }

    await vscode.env.clipboard.writeText(formatForClaude(files));
    const total = files.reduce((n, f) => n + f.comments.length, 0);
    vscode.window.showInformationMessage(`Loupe: copied ${total} comment(s) for Claude.`);
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
    for (const t of this.threads) t.dispose();
    this.threads = [];
    this.overlay?.dispose();
    this.emitter.dispose();
  }
}
