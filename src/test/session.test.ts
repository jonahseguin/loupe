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
