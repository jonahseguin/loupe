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
