import { ChangedFile, ChangeStatus } from './types';

export function parseNameStatus(stdout: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0][0];
    if (!code) continue;
    const status = code as ChangeStatus;
    if ((status === 'R' || status === 'C') && parts.length >= 3) {
      files.push({ status, oldPath: parts[1], path: parts[2] });
    } else {
      files.push({ status, path: parts[1] });
    }
  }
  return files;
}
