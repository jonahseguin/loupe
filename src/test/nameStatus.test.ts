import * as assert from 'node:assert';
import { parseNameStatus } from '../review/nameStatus';

suite('parseNameStatus', () => {
  test('parses added, modified, deleted', () => {
    const out = 'A\tsrc/new.ts\nM\tsrc/changed.ts\nD\tsrc/gone.ts\n';
    assert.deepStrictEqual(parseNameStatus(out), [
      { status: 'A', path: 'src/new.ts' },
      { status: 'M', path: 'src/changed.ts' },
      { status: 'D', path: 'src/gone.ts' },
    ]);
  });

  test('parses renames with old and new path', () => {
    const out = 'R100\tsrc/old.ts\tsrc/new.ts\n';
    assert.deepStrictEqual(parseNameStatus(out), [
      { status: 'R', path: 'src/new.ts', oldPath: 'src/old.ts' },
    ]);
  });

  test('ignores blank lines', () => {
    assert.deepStrictEqual(parseNameStatus('\n\n'), []);
  });
});
