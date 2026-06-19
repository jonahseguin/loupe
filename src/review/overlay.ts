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
