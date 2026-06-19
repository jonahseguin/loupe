import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ReviewSession } from './review/session';
import { DiffOverlay } from './review/overlay';
import { repoRoot, diffNameStatus, mergeBase, resolveDefaultBranch } from './git/gitCli';
import { formatForClaude, FileForExport } from './export/claudeFormatter';
import { ReviewComment } from './review/types';

/**
 * Two independent layers:
 *  - Comments: a session that always exists. Comments can be added/removed/exported at any
 *    time, regardless of review mode, and persist to workspaceState.
 *  - Review mode: an optional diff overlay (gutter change bars) + the changed-file set.
 *    Toggling review mode never touches comments.
 */
export class LoupeController implements vscode.Disposable {
  private session: ReviewSession;
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
    this.session = ReviewSession.load(ctx.workspaceState) ?? new ReviewSession('', []);
    this.updateStatus();
  }

  /** Review mode (diff overlay) is on. */
  get reviewActive(): boolean { return !!this.overlay; }
  get currentSession(): ReviewSession { return this.session; }
  get changedFiles(): string[] { return this.changedRel; }
  get repoRootPath(): string | undefined { return this.root; }
  isChanged(uri: vscode.Uri): boolean { return this.changedAbs.has(uri.fsPath); }

  /** Resolve the repo (or workspace) root once at activation and return any persisted
   *  comments so the caller can re-materialize their threads. Commenting needs the root
   *  to compute repo-relative paths; it works in any folder, git or not. */
  async init(): Promise<Array<{ uri: vscode.Uri; startLine: number; endLine: number; body: string; id: string }>> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      try {
        this.root = await repoRoot(folder.uri.fsPath);
      } catch {
        this.root = folder.uri.fsPath; // not a git repo — still allow commenting, paths relative to the folder
      }
    }
    this.updateStatus();
    this.emitter.fire();

    const out: Array<{ uri: vscode.Uri; startLine: number; endLine: number; body: string; id: string }> = [];
    if (!this.root) return out;
    for (const [rel, comments] of this.session.files) {
      const uri = vscode.Uri.file(path.join(this.root, rel));
      for (const c of comments) {
        out.push({ uri, startLine: c.startLine, endLine: c.endLine, body: c.body, id: c.id });
      }
    }
    return out;
  }

  async toggleReview(): Promise<void> {
    if (this.reviewActive) this.disableReview();
    else await this.enableReview();
  }

  private async enableReview(): Promise<void> {
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
      vscode.window.showInformationMessage('Loupe: no changes to review against that base.');
      return;
    }

    this.root = root;
    this.changedRel = files.map((f) => f.path);
    this.changedAbs = new Set(
      files.filter((f) => f.status !== 'D').map((f) => path.join(root, f.path)),
    );
    this.session.baseRef = baseRef;
    void this.persist();
    this.overlay = new DiffOverlay(baseRef, (uri) => this.isChanged(uri));
    await vscode.commands.executeCommand('setContext', 'loupe.active', true);
    this.updateStatus();
    this.emitter.fire();
  }

  private disableReview(): void {
    this.overlay?.dispose();
    this.overlay = undefined;
    this.changedRel = [];
    this.changedAbs.clear();
    void vscode.commands.executeCommand('setContext', 'loupe.active', false);
    this.updateStatus();
    this.emitter.fire();
    // Comments and their threads are intentionally left intact.
  }

  private async pickBaseRef(root: string): Promise<string | undefined> {
    const def = await resolveDefaultBranch(root);
    const items = [
      { label: `Whole branch vs ${def}`, detail: `Everything since merge-base with ${def} (committed + uncommitted)`, ref: '__merge_base__' },
      { label: 'Uncommitted changes only', detail: 'Working-tree changes vs HEAD', ref: 'HEAD' },
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Loupe: what do you want to review?',
    });
    if (!pick) return undefined;
    if (pick.ref === '__merge_base__') return mergeBase(root, 'HEAD', def);
    return pick.ref;
  }

  registerThread(thread: vscode.CommentThread): void {
    if (!this.threads.includes(thread)) this.threads.push(thread);
  }

  forgetThread(thread: vscode.CommentThread): void {
    this.threads = this.threads.filter((t) => t !== thread);
  }

  addComment(uri: vscode.Uri, startLine: number, endLine: number, body: string, id: string): void {
    if (!this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.addComment(rel, { id, body, startLine, endLine });
    void this.persist();
    this.updateStatus();
    this.emitter.fire();
  }

  removeComment(uri: vscode.Uri, id: string): void {
    if (!this.root) return;
    const rel = path.relative(this.root, uri.fsPath);
    this.session.removeComment(rel, id);
    void this.persist();
    this.updateStatus();
    this.emitter.fire();
  }

  /** Dispose every comment thread and drop all stored comments. */
  clearAllComments(): void {
    for (const t of this.threads) t.dispose();
    this.threads = [];
    this.session = new ReviewSession(this.session.baseRef, []);
    void this.persist();
    this.updateStatus();
    this.emitter.fire();
  }

  async copyForClaude(): Promise<void> {
    if (!this.root) {
      vscode.window.showInformationMessage('Loupe: open a folder to use Loupe.');
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
    vscode.window.showInformationMessage(`Loupe: copied ${total} comment(s) to the clipboard.`);
  }

  private persist(): Promise<void> {
    return Promise.resolve(this.session.save(this.ctx.workspaceState)).catch((err: unknown) => {
      console.error('Loupe: failed to persist comments:', err);
    });
  }

  private updateStatus(): void {
    const count = this.session.totalCount();
    this.status.text = `${this.reviewActive ? '$(eye)' : '$(eye-closed)'} Loupe: ${count}`;
    this.status.tooltip = `Loupe — ${count} comment(s). Click to copy for Claude.`;
    this.status.command = 'loupe.copyForClaude';
    this.status.show();
  }

  dispose(): void {
    for (const t of this.threads) t.dispose();
    this.threads = [];
    this.overlay?.dispose();
    this.emitter.dispose();
  }
}
