import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseNameStatus } from '../review/nameStatus';
import { ChangedFile } from '../review/types';

const pexec = promisify(execFile);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function repoRoot(cwd: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
}

export async function diffNameStatus(cwd: string, baseRef: string): Promise<ChangedFile[]> {
  const out = await runGit(cwd, ['diff', '--name-status', '-M', baseRef]);
  return parseNameStatus(out);
}

export async function showFile(cwd: string, ref: string, repoRelPath: string): Promise<string> {
  try {
    return await runGit(cwd, ['show', `${ref}:${repoRelPath}`]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // git show exits 128 with these messages when the path simply isn't in the ref
    // (e.g. a newly added file); anything else is a real error worth surfacing.
    if (/does not exist in|exists on disk, but not in/.test(msg)) return '';
    throw err;
  }
}

export async function mergeBase(cwd: string, a: string, b: string): Promise<string> {
  return (await runGit(cwd, ['merge-base', a, b])).trim();
}

export async function resolveDefaultBranch(cwd: string): Promise<string> {
  try {
    const ref = (await runGit(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim();
    if (ref) return ref.replace('refs/remotes/', ''); // e.g. "origin/main"
  } catch { /* no origin/HEAD configured */ }
  for (const candidate of ['main', 'master']) {
    try {
      await runGit(cwd, ['rev-parse', '--verify', candidate]);
      return candidate;
    } catch { /* not present */ }
  }
  return 'HEAD';
}
