import * as vscode from 'vscode';
import { LoupeController } from './loupeController';
import { BaseContentProvider, SCHEME } from './review/baseContentProvider';
import { ChangesTreeProvider } from './ui/changesTree';

class LoupeComment implements vscode.Comment {
  mode = vscode.CommentMode.Preview;
  author: vscode.CommentAuthorInformation = { name: 'You' };
  parent?: vscode.CommentThread;
  constructor(public body: vscode.MarkdownString, public id: string) {}
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const controller = new LoupeController(context, status);

  const commentCtrl = vscode.comments.createCommentController('loupe', 'Loupe Review');
  commentCtrl.options = { placeHolder: 'Add a comment', prompt: 'Add a comment' };
  commentCtrl.commentingRangeProvider = {
    // Commenting is always available on real files, independent of review mode.
    provideCommentingRanges: (document) => {
      if (document.uri.scheme !== 'file') return [];
      return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
    },
  };

  const changesTree = new ChangesTreeProvider(controller);

  context.subscriptions.push(
    status,
    controller,
    commentCtrl,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new BaseContentProvider()),

    vscode.commands.registerCommand('loupe.toggle', () => controller.toggleReview()),
    vscode.commands.registerCommand('loupe.copyForClaude', () => controller.copyForClaude()),
    vscode.commands.registerCommand('loupe.clearComments', async () => {
      const count = controller.currentSession.totalCount();
      if (count === 0) {
        vscode.window.showInformationMessage('Loupe: there are no comments to clear.');
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear all ${count} Loupe comment(s)? This cannot be undone.`,
        { modal: true },
        'Clear',
      );
      if (choice === 'Clear') controller.clearAllComments();
    }),

    vscode.commands.registerCommand('loupe.createComment', (reply: vscode.CommentReply) => {
      const range = reply.thread.range;
      if (!range) return;
      const id = newId();
      const thread = reply.thread;
      const comment = new LoupeComment(new vscode.MarkdownString(reply.text), id);
      comment.parent = thread;
      thread.comments = [...thread.comments, comment];
      controller.registerThread(thread);
      controller.addComment(thread.uri, range.start.line + 1, range.end.line + 1, reply.text, id);
    }),

    vscode.commands.registerCommand('loupe.addCommentHere', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const sel = editor.selection;
      const range = new vscode.Range(sel.start.line, 0, sel.end.line, 0);
      const thread = commentCtrl.createCommentThread(editor.document.uri, range, []);
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      // The thread is registered (and persisted) when the user submits via loupe.createComment.
    }),

    vscode.commands.registerCommand('loupe.deleteComment', (comment: LoupeComment & { parent?: vscode.CommentThread }) => {
      const thread = comment.parent;
      if (!thread) return;
      thread.comments = thread.comments.filter((c) => (c as LoupeComment).id !== comment.id);
      controller.removeComment(thread.uri, comment.id);
      if (thread.comments.length === 0) {
        controller.forgetThread(thread);
        thread.dispose();
      }
    }),

    changesTree,
    vscode.window.registerTreeDataProvider('loupe.changes', changesTree),
  );

  void controller.init().then((restored) => {
    for (const r of restored) {
      const comment = new LoupeComment(new vscode.MarkdownString(r.body), r.id);
      const thread = commentCtrl.createCommentThread(
        r.uri,
        new vscode.Range(r.startLine - 1, 0, r.endLine - 1, 0),
        [comment],
      );
      comment.parent = thread;
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
      controller.registerThread(thread);
    }
  });
}

export function deactivate(): void {}
