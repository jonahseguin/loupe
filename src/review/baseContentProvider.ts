import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
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
    const fsPath = fs.realpathSync(uri.with({ scheme: 'file', query: '' }).fsPath);
    const root = await repoRoot(path.dirname(fsPath));
    const rel = path.relative(root, fsPath);
    return showFile(root, uri.query, rel);
  }
}
