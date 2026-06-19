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

  test('formatForClaude prefixes every line of a multi-line body', () => {
    const md = formatForClaude([
      { path: 'a.ts', content: 'x\n', comments: [{ id: '1', body: 'line one\nline two', startLine: 1, endLine: 1 }] },
    ]);
    assert.ok(md.includes('> line one\n> line two'));
  });
});
