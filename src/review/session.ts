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
    this.files = new Map(files.map((f) => [f.path, [...f.comments]]));
  }

  addComment(path: string, c: ReviewComment): void {
    const list = this.files.get(path) ?? [];
    list.push(c);
    this.files.set(path, list);
  }

  removeComment(path: string, id: string): void {
    const list = this.files.get(path);
    if (!list) return;
    const updated = list.filter((c) => c.id !== id);
    if (updated.length > 0) this.files.set(path, updated);
    else this.files.delete(path);
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
    for (const [path, comments] of this.files) files.push({ path, comments: [...comments] });
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
