import { FileComments } from '../review/types';

const LANG: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
  py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
  c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
  kt: 'kotlin', sh: 'bash', json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', html: 'html', css: 'css', sql: 'sql',
};

export interface FileForExport extends FileComments {
  content?: string;
}

export function langForPath(path: string): string {
  const ext = path.includes('.') ? path.split('.').pop()! : '';
  return LANG[ext] ?? '';
}

export function extractSnippet(content: string, startLine: number, endLine: number): string {
  return content.split('\n').slice(startLine - 1, endLine).join('\n');
}

export function formatForClaude(files: FileForExport[]): string {
  const total = files.reduce((n, f) => n + f.comments.length, 0);
  const out: string[] = [`# Review comments (${total})`, ''];
  for (const file of files) {
    for (const c of file.comments) {
      const range = c.startLine === c.endLine ? `${c.startLine}` : `${c.startLine}–${c.endLine}`;
      out.push(`## ${file.path}:${range}`);
      if (file.content) {
        const snippet = extractSnippet(file.content, c.startLine, c.endLine);
        if (snippet.trim()) {
          out.push('```' + langForPath(file.path), snippet, '```');
        }
      }
      out.push(`> ${c.body.replace(/\n/g, '\n> ')}`, '');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}
