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
      const range = reply.thread.range;
      if (!range) return;
      const id = newId();
      const thread = reply.thread;
      thread.comments = [...thread.comments, new LoupeComment(new vscode.MarkdownString(reply.text), id)];
      controller.registerThread(thread);
      controller.addComment(thread.uri, range.start.line + 1, range.end.line + 1, reply.text, id);
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
